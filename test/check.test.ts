import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { checkAll, checkService, USER_AGENT } from '../src/check.ts';
import { closedPortUrl, startFixture, type Fixture } from './fixtures/server.ts';
import { service } from './helpers.ts';

let fx: Fixture;
before(async () => {
  fx = await startFixture();
});
after(async () => {
  await fx.close();
});

test('a 200 response is up with status and latency', async () => {
  const result = await checkService(service({ url: fx.url('/ok') }));
  assert.equal(result.state, 'up');
  assert.equal(result.status, 200);
  assert.equal(typeof result.latencyMs, 'number');
  assert.equal(result.attempts, 1);
  assert.equal(result.error, undefined);
  assert.ok(!Number.isNaN(Date.parse(result.checkedAt)));
});

test('an unexpected status is down', async () => {
  const result = await checkService(service({ url: fx.url('/status/500') }));
  assert.equal(result.state, 'down');
  assert.equal(result.status, 500);
  assert.match(result.error ?? '', /expected status 200, got 500/);
});

test('expectStatus accepts any listed code', async () => {
  const result = await checkService(
    service({ url: fx.url('/status/204'), expectStatus: [200, 204] }),
  );
  assert.equal(result.state, 'up');
});

test('a timeout is down with a timeout error', async () => {
  const result = await checkService(service({ url: fx.url('/hang'), timeoutMs: 150 }));
  assert.equal(result.state, 'down');
  assert.equal(result.status, null);
  assert.equal(result.latencyMs, null);
  assert.match(result.error ?? '', /timed out after 150 ms/);
});

test('a slow response is degraded', async () => {
  const result = await checkService(service({ url: fx.url('/slow/120'), degradedAfterMs: 50 }));
  assert.equal(result.state, 'degraded');
  assert.ok((result.latencyMs ?? 0) >= 100);
  assert.match(result.error ?? '', /slow response/);
});

test('a refused connection is down', async () => {
  const result = await checkService(service({ url: await closedPortUrl() }));
  assert.equal(result.state, 'down');
  assert.match(result.error ?? '', /ECONNREFUSED/);
});

test('expectText passes when the body contains it and fails otherwise', async () => {
  const ok = await checkService(service({ url: fx.url('/ok'), expectText: 'iridium' }));
  const missing = await checkService(service({ url: fx.url('/ok'), expectText: 'osmium' }));
  assert.equal(ok.state, 'up');
  assert.equal(missing.state, 'down');
  assert.match(missing.error ?? '', /did not contain "osmium"/);
});

test('retries turn a transient failure into up', async () => {
  const result = await checkService(service({ url: fx.url('/flaky'), retries: 2 }));
  assert.equal(result.state, 'up');
  assert.equal(result.attempts, 2);
});

test('redirects are followed and HEAD is sent when configured', async () => {
  const redirected = await checkService(service({ url: fx.url('/redirect') }));
  assert.equal(redirected.state, 'up');
  fx.requests.length = 0;
  await checkService(service({ url: fx.url('/ok'), method: 'HEAD' }));
  assert.deepEqual(fx.requests, ['HEAD /ok']);
});

test('requests carry the iridium-status user agent', async () => {
  let seen: string | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    seen = new Headers(init?.headers).get('user-agent') ?? undefined;
    return new Response('ok');
  };
  await checkService(service({ url: 'https://example.test/' }), { fetch: fakeFetch });
  assert.equal(seen, USER_AGENT);
});

test('checkAll keeps service order', async () => {
  const results = await checkAll([
    { ...service({ url: fx.url('/slow/60') }), id: 'slow' },
    { ...service({ url: fx.url('/ok') }), id: 'fast' },
  ]);
  assert.deepEqual(
    results.map((r) => r.id),
    ['slow', 'fast'],
  );
});
