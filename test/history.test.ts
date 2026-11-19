import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { CheckResult } from '../src/check.ts';
import { appendHistory, emptyHistory, loadHistory, parseHistory } from '../src/history.ts';

function result(id: string, checkedAt: string, state: CheckResult['state'] = 'up'): CheckResult {
  return { id, state, checkedAt, status: 200, latencyMs: 42, attempts: 1 };
}

test('appendHistory adds compact entries per service', () => {
  const next = appendHistory(
    emptyHistory(),
    [result('a', '2026-11-19T00:00:00.000Z'), result('b', '2026-11-19T00:00:00.000Z', 'down')],
    ['a', 'b'],
    10,
  );
  assert.deepEqual(next.services.a, [{ t: '2026-11-19T00:00:00.000Z', s: 'up', ms: 42, c: 200 }]);
  assert.equal(next.services.b?.[0]?.s, 'down');
});

test('appendHistory caps each service, dropping the oldest entries', () => {
  let history = emptyHistory();
  for (let i = 0; i < 8; i++) {
    const t = new Date(Date.UTC(2026, 10, 19, 0, i * 30)).toISOString();
    history = appendHistory(history, [result('a', t)], ['a'], 5);
  }
  const entries = history.services.a ?? [];
  assert.equal(entries.length, 5);
  assert.equal(entries[0]?.t, new Date(Date.UTC(2026, 10, 19, 0, 90)).toISOString());
  assert.equal(entries.at(-1)?.t, new Date(Date.UTC(2026, 10, 19, 0, 210)).toISOString());
});

test('appendHistory drops services that are no longer configured', () => {
  const start = appendHistory(
    emptyHistory(),
    [result('old', '2026-11-18T00:00:00.000Z')],
    ['old'],
    5,
  );
  const next = appendHistory(start, [result('new', '2026-11-19T00:00:00.000Z')], ['new'], 5);
  assert.deepEqual(Object.keys(next.services), ['new']);
});

test('parseHistory drops malformed entries and tolerates junk', () => {
  const parsed = parseHistory({
    version: 1,
    services: {
      a: [
        { t: '2026-11-19T00:00:00.000Z', s: 'up', ms: 10, c: 200 },
        { t: 'yesterday', s: 'up', ms: 10, c: 200 },
        { t: '2026-11-19T00:30:00.000Z', s: 'sideways', ms: 10, c: 200 },
      ],
      b: 'nope',
    },
  });
  assert.equal(parsed.services.a?.length, 1);
  assert.equal(parsed.services.b, undefined);
  assert.deepEqual(parseHistory(null), emptyHistory());
});

test('loadHistory returns an empty history for a missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'status-history-'));
  assert.deepEqual(await loadHistory(join(dir, 'missing.json')), emptyHistory());
  await writeFile(join(dir, 'h.json'), JSON.stringify({ version: 1, services: { a: [] } }));
  assert.deepEqual((await loadHistory(join(dir, 'h.json'))).services, { a: [] });
});
