/** Derived figures for the status page: overall state, uptime, and daily buckets. */

import type { ServiceState } from './check.ts';
import type { HistoryEntry } from './history.ts';

export type OverallState = 'operational' | 'degraded' | 'partial' | 'major' | 'unknown';

export type DayState = 'up' | 'degraded' | 'partial' | 'down' | 'none';

export interface DayBucket {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  checks: number;
  up: number;
  degraded: number;
  down: number;
  /** Share of checks that got an accepted response, 0..1, or null without checks. */
  uptime: number | null;
  state: DayState;
}

export const OVERALL_LABELS: Record<OverallState, string> = {
  operational: 'All systems operational',
  degraded: 'Degraded performance',
  partial: 'Partial outage',
  major: 'Major outage',
  unknown: 'No checks yet',
};

export const STATE_LABELS: Record<ServiceState | 'unknown', string> = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
};

/** Overall state from the latest state of each service (`undefined` = never checked). */
export function overallState(states: readonly (ServiceState | undefined)[]): OverallState {
  const known = states.filter((s): s is ServiceState => s !== undefined);
  if (known.length === 0) return 'unknown';
  const down = known.filter((s) => s === 'down').length;
  if (down > 0) return down === states.length ? 'major' : 'partial';
  if (known.some((s) => s === 'degraded')) return 'degraded';
  return 'operational';
}

/** Share of entries that were up or degraded, or null for no entries. */
export function uptime(entries: readonly HistoryEntry[]): number | null {
  if (entries.length === 0) return null;
  return entries.filter((e) => e.s !== 'down').length / entries.length;
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Group entries into `days` UTC-day buckets ending on the day of `now`, oldest first. */
export function dailyBuckets(
  entries: readonly HistoryEntry[],
  days: number,
  now: Date,
): DayBucket[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const buckets: DayBucket[] = [];
  const index = new Map<string, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const date = utcDate(new Date(end - i * 86_400_000));
    const bucket: DayBucket = {
      date,
      checks: 0,
      up: 0,
      degraded: 0,
      down: 0,
      uptime: null,
      state: 'none',
    };
    buckets.push(bucket);
    index.set(date, bucket);
  }
  for (const entry of entries) {
    const bucket = index.get(utcDate(new Date(entry.t)));
    if (!bucket) continue;
    bucket.checks++;
    bucket[entry.s]++;
  }
  for (const b of buckets) {
    if (b.checks === 0) continue;
    b.uptime = (b.up + b.degraded) / b.checks;
    if (b.down === 0) b.state = b.degraded === 0 ? 'up' : 'degraded';
    else b.state = b.uptime < 0.5 ? 'down' : 'partial';
  }
  return buckets;
}

/** Format a 0..1 share as a percentage with up to two decimals, e.g. "99.86%". */
export function formatPercent(share: number | null): string {
  if (share === null) return 'No data';
  const pct = Math.floor(share * 10_000) / 100;
  return `${pct.toFixed(pct === 100 ? 0 : 2)}%`;
}

/** Median of the non-null latencies, rounded, or null. */
export function medianLatency(entries: readonly HistoryEntry[]): number | null {
  const values = entries
    .map((e) => e.ms)
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
  return Math.round(median);
}
