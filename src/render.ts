/** Static HTML for the status page. No client-side JavaScript. */

import type { CheckResult, ServiceState } from './check.ts';
import type { ServiceConfig } from './config.ts';
import type { HistoryEntry } from './history.ts';
import {
  OVERALL_LABELS,
  STATE_LABELS,
  dailyBuckets,
  formatPercent,
  medianLatency,
  overallState,
  uptime,
  type DayBucket,
  type DayState,
} from './summary.ts';

export interface RenderService {
  config: ServiceConfig;
  /** Latest check, if the service has been checked. */
  latest?: CheckResult;
  entries: readonly HistoryEntry[];
}

export interface RenderModel {
  title: string;
  /** Site base path, with leading and trailing slash, e.g. "/iridium-status/". */
  basePath: string;
  /** Number of days in each uptime bar. */
  days: number;
  /** Time the page was built; the bars end on this UTC day. */
  now: Date;
  /** Time of the most recent check, if any. */
  lastChecked?: string;
  services: RenderService[];
  /** Inline stylesheet. */
  css: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);
}

/** Normalize a base path to "/segment/" form ("" and "/" become "/"). */
export function normalizeBasePath(path: string): string {
  const trimmed = path.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

const DAY_LABELS: Record<DayState, string> = {
  up: 'no issues',
  degraded: 'slow responses',
  partial: 'some failed checks',
  down: 'mostly down',
  none: 'no data',
};

/** "2026-11-19 03:30 UTC" */
export function formatUtc(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function barLabel(buckets: readonly DayBucket[], share: number | null): string {
  const count = (state: DayState) => buckets.filter((b) => b.state === state).length;
  const parts = [`Uptime over the last ${plural(buckets.length, 'day')}: ${formatPercent(share)}.`];
  const outages = count('down') + count('partial');
  const slow = count('degraded');
  const none = count('none');
  if (outages) parts.push(`${plural(outages, 'day')} with failed checks.`);
  if (slow) parts.push(`${plural(slow, 'day')} with slow responses.`);
  if (none) parts.push(`${plural(none, 'day')} without data.`);
  return parts.join(' ');
}

function renderBar(service: RenderService, model: RenderModel): string {
  const buckets = dailyBuckets(service.entries, model.days, model.now);
  const inWindow = service.entries.filter((e) => {
    const first = buckets[0];
    return first !== undefined && e.t.slice(0, 10) >= first.date;
  });
  const share = uptime(inWindow);
  const days = buckets
    .map((b) => {
      const detail =
        b.checks === 0
          ? 'no data'
          : `${formatPercent(b.uptime)} of ${plural(b.checks, 'check')}, ${DAY_LABELS[b.state]}`;
      return `<span class="st-day st-day--${b.state}" title="${b.date}: ${escapeHtml(detail)}"></span>`;
    })
    .join('');
  return `<div class="st-bar" role="img" aria-label="${escapeHtml(barLabel(buckets, share))}">${days}</div>
          <div class="st-bar-scale" aria-hidden="true"><span>${plural(model.days, 'day')} ago</span><span>${formatPercent(share)} uptime</span><span>Today</span></div>`;
}

function stateBadge(state: ServiceState | 'unknown'): string {
  return `<span class="st-state st-state--${state}"><span class="st-dot" aria-hidden="true"></span>${STATE_LABELS[state]}</span>`;
}

function renderService(service: RenderService, model: RenderModel): string {
  const { config, latest } = service;
  const state = latest?.state ?? 'unknown';
  const href = escapeHtml(config.link ?? config.url);
  const facts: string[] = [];
  if (latest?.latencyMs != null)
    facts.push(`<div><dt>Response</dt><dd>${latest.latencyMs} ms</dd></div>`);
  const median = medianLatency(service.entries);
  if (median !== null) facts.push(`<div><dt>Median</dt><dd>${median} ms</dd></div>`);
  if (latest?.status != null) facts.push(`<div><dt>HTTP</dt><dd>${latest.status}</dd></div>`);
  if (latest) {
    facts.push(
      `<div><dt>Checked</dt><dd><time datetime="${escapeHtml(latest.checkedAt)}">${formatUtc(latest.checkedAt)}</time></dd></div>`,
    );
  }
  return `<li class="st-service">
        <div class="st-service__head">
          <h3 id="svc-${config.id}"><a href="${href}">${escapeHtml(config.name)}</a></h3>
          ${stateBadge(state)}
        </div>
        ${config.description ? `<p class="st-service__desc">${escapeHtml(config.description)}</p>` : ''}
        ${facts.length ? `<dl class="st-facts">${facts.join('')}</dl>` : ''}
        ${latest?.error ? `<p class="st-error"><span class="ir-visually-hidden">Last error: </span>${escapeHtml(latest.error)}</p>` : ''}
        ${renderBar(service, model)}
      </li>`;
}

const LEGEND: [DayState, string][] = [
  ['up', 'Every check passed'],
  ['degraded', 'Responses slower than the limit'],
  ['partial', 'Some checks failed'],
  ['down', 'Most checks failed'],
  ['none', 'No data'],
];

export function renderPage(model: RenderModel): string {
  const base = normalizeBasePath(model.basePath);
  const overall = overallState(model.services.map((s) => s.latest?.state));
  const headline = OVERALL_LABELS[overall];
  const checked = model.lastChecked
    ? `Last checked <time datetime="${escapeHtml(model.lastChecked)}">${formatUtc(model.lastChecked)}</time>.`
    : 'No checks have run yet.';
  const title = escapeHtml(model.title);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="description" content="Current status and uptime of Iridium Group services." />
    <title>${headline} · ${title}</title>
    <link rel="icon" href="${base}iridium-mark.svg" type="image/svg+xml" />
    <link rel="alternate" type="application/json" href="${base}status.json" title="Status JSON" />
    <style>
${model.css}
    </style>
  </head>
  <body>
    <a class="ir-skip-link" href="#main">Skip to content</a>
    <header class="st-header">
      <div class="ir-container st-header__inner">
        <a class="st-brand" href="https://iridium-group.github.io/iridium/">
          <img src="${base}iridium-mark.svg" alt="" width="36" height="20" />
          Iridium Group
        </a>
        <nav aria-label="Iridium">
          <ul class="st-nav">
            <li><a href="https://iridium-group.github.io/iridium/">Website</a></li>
            <li><a href="https://iridium-group.github.io/iridium-docs/">Docs</a></li>
            <li><a href="https://github.com/Iridium-Group">GitHub</a></li>
          </ul>
        </nav>
      </div>
    </header>
    <main id="main" class="ir-container">
      <p class="ir-eyebrow">Status</p>
      <h1>${title}</h1>
      <section class="st-overall st-overall--${overall}" aria-labelledby="overall-heading">
        <span class="st-dot st-dot--lg" aria-hidden="true"></span>
        <div>
          <h2 id="overall-heading">${headline}</h2>
          <p>${checked} Checks run every 30 minutes from GitHub Actions. Times are in UTC.</p>
        </div>
      </section>
      <section aria-labelledby="services-heading">
        <h2 id="services-heading" class="st-section-title">Services</h2>
        <ul class="st-services" role="list">
      ${model.services.map((s) => renderService(s, model)).join('\n      ')}
        </ul>
      </section>
      <section aria-labelledby="legend-heading" class="st-legend">
        <h2 id="legend-heading" class="ir-eyebrow">Uptime bars</h2>
        <p>Each bar is one UTC day, oldest on the left. Hover a day for its figures.</p>
        <ul role="list">
          ${LEGEND.map(([state, label]) => `<li><span class="st-day st-day--${state}" aria-hidden="true"></span>${label}</li>`).join('\n          ')}
        </ul>
      </section>
    </main>
    <footer class="st-footer">
      <div class="ir-container">
        <p>
          Raw data: <a href="${base}status.json">status.json</a> and
          <a href="${base}history.json">history.json</a>. Source and check configuration on
          <a href="https://github.com/Iridium-Group/iridium-status">GitHub</a>.
        </p>
      </div>
    </footer>
  </body>
</html>
`;
}
