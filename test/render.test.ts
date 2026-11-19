import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CheckResult } from '../src/check.ts';
import { escapeHtml, normalizeBasePath, renderPage, type RenderModel } from '../src/render.ts';
import { service } from './helpers.ts';

const now = new Date('2026-11-19T12:00:00Z');

function latest(state: CheckResult['state'], extra: Partial<CheckResult> = {}): CheckResult {
  return {
    id: 'svc',
    state,
    checkedAt: '2026-11-19T11:30:00.000Z',
    status: 200,
    latencyMs: 87,
    attempts: 1,
    ...extra,
  };
}

function model(overrides: Partial<RenderModel> = {}): RenderModel {
  return {
    title: 'Iridium Status',
    basePath: '/iridium-status/',
    days: 30,
    now,
    css: '/* css */',
    lastChecked: '2026-11-19T11:30:00.000Z',
    services: [
      {
        config: service({
          url: 'https://example.test/',
          name: 'Website',
          description: 'The site.',
        }),
        latest: latest('up'),
        entries: [{ t: '2026-11-19T11:30:00.000Z', s: 'up', ms: 87, c: 200 }],
      },
    ],
    ...overrides,
  };
}

test('renders the overall state, service, and last checked time', () => {
  const html = renderPage(model());
  assert.match(html, /<h2 id="overall-heading">All systems operational<\/h2>/);
  assert.match(html, /<title>All systems operational · Iridium Status<\/title>/);
  assert.match(html, /<a href="https:\/\/example.test\/">Website<\/a>/);
  assert.match(html, /<time datetime="2026-11-19T11:30:00.000Z">2026-11-19 11:30 UTC<\/time>/);
  assert.match(html, /<dd>87 ms<\/dd>/);
});

test('the page has no scripts and is accessible without JavaScript', () => {
  const html = renderPage(model());
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<a class="ir-skip-link" href="#main">/);
  assert.match(html, /<main id="main"/);
  assert.match(
    html,
    /class="st-bar" role="img" aria-label="Uptime over the last 30 days: 100%\. 29 days without data\."/,
  );
  assert.equal((html.match(/class="st-day st-day--/g) ?? []).length, 30 + 5); // bar days + legend swatches
});

test('assets and data links use the base path', () => {
  const html = renderPage(model({ basePath: 'iridium-status' }));
  assert.match(html, /href="\/iridium-status\/iridium-mark.svg"/);
  assert.match(html, /href="\/iridium-status\/status.json"/);
  assert.equal(normalizeBasePath(''), '/');
  assert.equal(normalizeBasePath('/a/b/'), '/a/b/');
});

test('a down service shows a partial outage and its error', () => {
  const html = renderPage(
    model({
      services: [
        model().services[0]!,
        {
          config: { ...service({ url: 'https://docs.test/', name: 'Docs' }), id: 'docs' },
          latest: latest('down', {
            id: 'docs',
            status: null,
            latencyMs: null,
            error: 'timed out after 10000 ms',
          }),
          entries: [],
        },
      ],
    }),
  );
  assert.match(html, /Partial outage/);
  assert.match(html, /st-state--down/);
  assert.match(html, /Last error: <\/span>timed out after 10000 ms/);
});

test('an unchecked page says no checks have run', () => {
  const base = model();
  const html = renderPage({
    ...base,
    services: base.services.map(({ config }) => ({ config, entries: [] })),
    lastChecked: undefined,
  });
  assert.match(html, /No checks yet/);
  assert.match(html, /No checks have run yet\./);
  assert.match(html, /st-state--unknown/);
});

test('user-provided text is escaped', () => {
  assert.equal(
    escapeHtml(`<a href="x">'&'</a>`),
    '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
  );
  const html = renderPage(
    model({
      title: '<Status>',
      services: [
        { config: service({ url: 'https://x.test/?a=1&b=2', name: '<b>bold</b>' }), entries: [] },
      ],
    }),
  );
  assert.match(html, /<h1>&lt;Status&gt;<\/h1>/);
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /href="https:\/\/x.test\/\?a=1&amp;b=2"/);
});
