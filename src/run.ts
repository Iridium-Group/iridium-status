/** The two jobs the CLIs and workflows run: checking services and building the site. */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAll, type CheckOptions, type CheckResult } from './check.ts';
import { loadConfig } from './config.ts';
import { appendHistory, loadHistory } from './history.ts';
import { renderPage, type RenderService } from './render.ts';
import { createSnapshot, loadSnapshot, type StatusSnapshot } from './snapshot.ts';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SITE_DIR = join(ROOT, 'site');

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export interface RunChecksOptions extends CheckOptions {
  configPath: string;
  dataDir: string;
}

/** Check every service, then write data/status.json and the capped data/history.json. */
export async function runChecks(options: RunChecksOptions): Promise<StatusSnapshot> {
  const config = await loadConfig(options.configPath);
  await mkdir(options.dataDir, { recursive: true });
  const historyPath = join(options.dataDir, 'history.json');
  const history = await loadHistory(historyPath);
  const results = await checkAll(config.services, options);
  const next = appendHistory(
    history,
    results,
    config.services.map((s) => s.id),
    config.historyLimit,
  );
  const snapshot = createSnapshot(
    config.services,
    results,
    next,
    (options.now ?? (() => new Date()))(),
  );
  await writeJson(join(options.dataDir, 'status.json'), snapshot);
  await writeJson(historyPath, next);
  return snapshot;
}

export interface BuildSiteOptions {
  configPath: string;
  dataDir: string;
  outDir: string;
  basePath: string;
  now?: Date;
}

/** Render dist/index.html and copy the data files and assets next to it. */
export async function buildSite(options: BuildSiteOptions): Promise<string> {
  const config = await loadConfig(options.configPath);
  const history = await loadHistory(join(options.dataDir, 'history.json'));
  const snapshot = await loadSnapshot(join(options.dataDir, 'status.json'));
  const latest = new Map<string, CheckResult>(snapshot?.services.map((s) => [s.id, s]) ?? []);
  const css = (
    await Promise.all(
      ['tokens.css', 'base.css', 'status.css'].map((f) => readFile(join(SITE_DIR, f), 'utf8')),
    )
  ).join('\n');

  const services = config.services.map((service): RenderService => {
    const entry: RenderService = { config: service, entries: history.services[service.id] ?? [] };
    const result = latest.get(service.id);
    if (result) entry.latest = result;
    return entry;
  });
  const lastChecked = snapshot?.services
    .map((s) => s.checkedAt)
    .sort()
    .at(-1);

  const html = renderPage({
    title: config.title,
    basePath: options.basePath,
    days: config.days,
    now: options.now ?? new Date(),
    services,
    css,
    ...(lastChecked ? { lastChecked } : {}),
  });

  await mkdir(options.outDir, { recursive: true });
  const indexPath = join(options.outDir, 'index.html');
  await writeFile(indexPath, html);
  await writeJson(join(options.outDir, 'status.json'), snapshot ?? createEmptySnapshot());
  await writeJson(join(options.outDir, 'history.json'), history);
  await copyFile(join(SITE_DIR, 'iridium-mark.svg'), join(options.outDir, 'iridium-mark.svg'));
  await writeFile(join(options.outDir, '.nojekyll'), '');
  return indexPath;
}

function createEmptySnapshot(): StatusSnapshot {
  return { version: 1, updatedAt: new Date(0).toISOString(), overall: 'unknown', services: [] };
}
