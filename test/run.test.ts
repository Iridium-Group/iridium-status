import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { buildSite, runChecks } from '../src/run.ts';
import { startFixture, type Fixture } from './fixtures/server.ts';

let fx: Fixture;
let dir: string;
before(async () => {
  fx = await startFixture();
  dir = await mkdtemp(join(tmpdir(), 'status-run-'));
  await writeFile(
    join(dir, 'services.json'),
    JSON.stringify({
      historyLimit: 3,
      defaults: { timeoutMs: 1000, retries: 0 },
      services: [
        { id: 'ok', name: 'OK', url: fx.url('/ok') },
        { id: 'broken', name: 'Broken', url: fx.url('/status/502') },
      ],
    }),
  );
});
after(async () => {
  await fx.close();
});

test('runChecks writes status.json and a capped history.json', async () => {
  const configPath = join(dir, 'services.json');
  const dataDir = join(dir, 'data');
  let snapshot;
  for (let i = 0; i < 4; i++) {
    const at = new Date(Date.UTC(2026, 10, 19, i));
    snapshot = await runChecks({ configPath, dataDir, now: () => at });
  }
  assert.equal(snapshot?.overall, 'partial');
  const status = JSON.parse(await readFile(join(dataDir, 'status.json'), 'utf8'));
  assert.deepEqual(
    status.services.map((s: { id: string; state: string }) => [s.id, s.state]),
    [
      ['ok', 'up'],
      ['broken', 'down'],
    ],
  );
  assert.equal(status.services[0].uptime, 1);
  const history = JSON.parse(await readFile(join(dataDir, 'history.json'), 'utf8'));
  assert.equal(history.services.ok.length, 3);
  assert.equal(history.services.broken[0].t, '2026-11-19T01:00:00.000Z');
});

test('buildSite writes index.html, data files, and assets to the output folder', async () => {
  const outDir = join(dir, 'dist');
  await buildSite({
    configPath: join(dir, 'services.json'),
    dataDir: join(dir, 'data'),
    outDir,
    basePath: '/iridium-status/',
    now: new Date('2026-11-19T12:00:00Z'),
  });
  const html = await readFile(join(outDir, 'index.html'), 'utf8');
  assert.match(html, /Partial outage/);
  assert.match(html, /--ir-accent: #8b5cf6/); // Iridium tokens are inlined
  assert.match(html, /expected status 200, got 502/);
  for (const file of ['status.json', 'history.json', 'iridium-mark.svg', '.nojekyll']) {
    await stat(join(outDir, file));
  }
});

test('buildSite works before any checks have run', async () => {
  const outDir = join(dir, 'empty-dist');
  await buildSite({
    configPath: join(dir, 'services.json'),
    dataDir: join(dir, 'no-data'),
    outDir,
    basePath: '/',
  });
  const html = await readFile(join(outDir, 'index.html'), 'utf8');
  assert.match(html, /No checks yet/);
});
