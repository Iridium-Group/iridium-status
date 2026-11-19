import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HistoryEntry } from '../src/history.ts';
import {
  dailyBuckets,
  formatPercent,
  medianLatency,
  overallState,
  uptime,
} from '../src/summary.ts';

const entry = (t: string, s: HistoryEntry['s'], ms: number | null = 100): HistoryEntry => ({
  t,
  s,
  ms,
  c: s === 'down' ? null : 200,
});

test('overallState covers every combination', () => {
  assert.equal(overallState([]), 'unknown');
  assert.equal(overallState([undefined, undefined]), 'unknown');
  assert.equal(overallState(['up', 'up']), 'operational');
  assert.equal(overallState(['up', 'degraded']), 'degraded');
  assert.equal(overallState(['up', 'down']), 'partial');
  assert.equal(overallState(['down', 'down']), 'major');
  assert.equal(overallState(['down', undefined]), 'partial');
});

test('uptime counts degraded as available', () => {
  assert.equal(uptime([]), null);
  assert.equal(
    uptime([
      entry('2026-11-19T00:00:00Z', 'up'),
      entry('2026-11-19T00:30:00Z', 'degraded'),
      entry('2026-11-19T01:00:00Z', 'down'),
      entry('2026-11-19T01:30:00Z', 'up'),
    ]),
    0.75,
  );
});

test('dailyBuckets groups by UTC day and classifies each day', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const buckets = dailyBuckets(
    [
      entry('2026-11-10T00:00:00Z', 'up'), // outside the window
      entry('2026-11-17T01:00:00Z', 'up'),
      entry('2026-11-17T23:59:00Z', 'down'),
      entry('2026-11-17T22:00:00Z', 'up'),
      entry('2026-11-18T10:00:00Z', 'degraded'),
      entry('2026-11-19T00:00:00Z', 'down'),
      entry('2026-11-19T00:30:00Z', 'down'),
      entry('2026-11-19T01:00:00Z', 'up'),
    ],
    4,
    now,
  );
  assert.deepEqual(
    buckets.map((b) => [b.date, b.state, b.checks]),
    [
      ['2026-11-16', 'none', 0],
      ['2026-11-17', 'partial', 3],
      ['2026-11-18', 'degraded', 1],
      ['2026-11-19', 'down', 3],
    ],
  );
  assert.equal(buckets[0]?.uptime, null);
});

test('formatPercent never rounds a failure up to 100%', () => {
  assert.equal(formatPercent(1), '100%');
  assert.equal(formatPercent(0.99999), '99.99%');
  assert.equal(formatPercent(0.5), '50.00%');
  assert.equal(formatPercent(null), 'No data');
});

test('medianLatency ignores missing latencies', () => {
  assert.equal(medianLatency([]), null);
  assert.equal(
    medianLatency([
      entry('2026-11-19T00:00:00Z', 'up', 100),
      entry('2026-11-19T00:30:00Z', 'down', null),
      entry('2026-11-19T01:00:00Z', 'up', 301),
    ]),
    201,
  );
});
