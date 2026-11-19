import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ConfigError, DEFAULTS, loadConfig, parseConfig } from '../src/config.ts';

const minimal = { services: [{ id: 'web', name: 'Web', url: 'https://example.test/' }] };

test('parseConfig fills in defaults', () => {
  const config = parseConfig(minimal);
  assert.equal(config.title, DEFAULTS.title);
  assert.equal(config.historyLimit, DEFAULTS.historyLimit);
  assert.equal(config.days, DEFAULTS.days);
  const [svc] = config.services;
  assert.equal(svc?.method, 'GET');
  assert.deepEqual(svc?.expectStatus, [200]);
  assert.equal(svc?.timeoutMs, DEFAULTS.timeoutMs);
  assert.equal(svc?.retries, 1);
});

test('service fields override the defaults block', () => {
  const config = parseConfig({
    defaults: { timeoutMs: 5000, expectStatus: [200, 204] },
    services: [
      { id: 'a', name: 'A', url: 'https://a.test/' },
      { id: 'b', name: 'B', url: 'https://b.test/', timeoutMs: 100, expectStatus: 301 },
    ],
  });
  assert.equal(config.services[0]?.timeoutMs, 5000);
  assert.deepEqual(config.services[0]?.expectStatus, [200, 204]);
  assert.equal(config.services[1]?.timeoutMs, 100);
  assert.deepEqual(config.services[1]?.expectStatus, [301]);
});

test('parseConfig rejects bad services', () => {
  const bad: [unknown, RegExp][] = [
    [{}, /services must be a non-empty array/],
    [{ services: [] }, /non-empty array/],
    [{ services: [{ id: 'Bad ID', name: 'x', url: 'https://x.test' }] }, /id must be/],
    [{ services: [{ id: 'x', name: 'x', url: 'ftp://x.test' }] }, /http or https/],
    [{ services: [{ id: 'x', name: 'x', url: 'not a url' }] }, /valid URL/],
    [{ services: [{ id: 'x', url: 'https://x.test' }] }, /name is required/],
    [{ services: [{ id: 'x', name: 'x', url: 'https://x.test', timeoutMs: 0 }] }, /positive/],
    [{ services: [{ id: 'x', name: 'x', url: 'https://x.test', expectStatus: 99 }] }, /status/],
    [{ services: [{ id: 'x', name: 'x', url: 'https://x.test', method: 'POST' }] }, /GET or HEAD/],
  ];
  for (const [input, message] of bad) {
    assert.throws(
      () => parseConfig(input),
      (e: unknown) => e instanceof ConfigError && message.test(e.message),
    );
  }
});

test('parseConfig rejects duplicate ids', () => {
  const svc = { id: 'x', name: 'X', url: 'https://x.test/' };
  assert.throws(() => parseConfig({ services: [svc, svc] }), /duplicate service id "x"/);
});

test('expectText requires GET', () => {
  assert.throws(
    () =>
      parseConfig({
        services: [
          { id: 'x', name: 'X', url: 'https://x.test/', method: 'HEAD', expectText: 'hi' },
        ],
      }),
    /needs method GET/,
  );
});

test('loadConfig reads a file and reports invalid JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'status-config-'));
  const good = join(dir, 'good.json');
  const bad = join(dir, 'bad.json');
  await writeFile(good, JSON.stringify(minimal));
  await writeFile(bad, '{ nope');
  assert.equal((await loadConfig(good)).services.length, 1);
  await assert.rejects(loadConfig(bad), /not valid JSON/);
  await assert.rejects(loadConfig(join(dir, 'missing.json')), /cannot read/);
});

test('the repository services.json is valid', async () => {
  const config = await loadConfig(new URL('../services.json', import.meta.url).pathname);
  assert.deepEqual(
    config.services.map((s) => s.id),
    ['website', 'docs', 'github'],
  );
});
