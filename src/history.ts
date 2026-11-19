/** Rolling check history stored in data/history.json. */

import { readFile } from 'node:fs/promises';
import type { CheckResult, ServiceState } from './check.ts';

/** One compact history entry. */
export interface HistoryEntry {
  /** ISO 8601 check time. */
  t: string;
  /** Service state. */
  s: ServiceState;
  /** Latency in milliseconds, or null without a response. */
  ms: number | null;
  /** HTTP status code, or null without a response. */
  c: number | null;
}

export interface History {
  version: 1;
  services: Record<string, HistoryEntry[]>;
}

const STATES: readonly ServiceState[] = ['up', 'degraded', 'down'];

export function emptyHistory(): History {
  return { version: 1, services: {} };
}

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.t === 'string' &&
    !Number.isNaN(Date.parse(e.t)) &&
    STATES.includes(e.s as ServiceState) &&
    (e.ms === null || typeof e.ms === 'number') &&
    (e.c === null || typeof e.c === 'number')
  );
}

/** Validate parsed history JSON, dropping malformed entries rather than failing. */
export function parseHistory(input: unknown): History {
  const history = emptyHistory();
  if (typeof input !== 'object' || input === null) return history;
  const services = (input as { services?: unknown }).services;
  if (typeof services !== 'object' || services === null || Array.isArray(services)) return history;
  for (const [id, entries] of Object.entries(services)) {
    if (Array.isArray(entries)) history.services[id] = entries.filter(isEntry);
  }
  return history;
}

/** Read history from disk. A missing file gives an empty history. */
export async function loadHistory(path: string): Promise<History> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyHistory();
    throw error;
  }
  return parseHistory(JSON.parse(text));
}

/**
 * Append results to history, keep only services in `serviceIds`, and cap each
 * service at `limit` entries (oldest dropped first). Returns a new object.
 */
export function appendHistory(
  history: History,
  results: readonly CheckResult[],
  serviceIds: readonly string[],
  limit: number,
): History {
  const next = emptyHistory();
  for (const id of serviceIds) {
    const entries = [...(history.services[id] ?? [])];
    for (const r of results) {
      if (r.id === id) entries.push({ t: r.checkedAt, s: r.state, ms: r.latencyMs, c: r.status });
    }
    entries.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
    next.services[id] = entries.slice(-limit);
  }
  return next;
}
