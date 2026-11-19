/** The data/status.json snapshot: the latest result for every service. */

import { readFile } from 'node:fs/promises';
import type { CheckResult } from './check.ts';
import type { ServiceConfig } from './config.ts';
import type { History } from './history.ts';
import { overallState, uptime, type OverallState } from './summary.ts';

export interface ServiceSnapshot extends CheckResult {
  name: string;
  url: string;
  /** Uptime over every entry kept in history, 0..1, or null. */
  uptime: number | null;
}

export interface StatusSnapshot {
  version: 1;
  /** ISO 8601 time the snapshot was written. */
  updatedAt: string;
  overall: OverallState;
  services: ServiceSnapshot[];
}

export function createSnapshot(
  services: readonly ServiceConfig[],
  results: readonly CheckResult[],
  history: History,
  now: Date,
): StatusSnapshot {
  const byId = new Map(results.map((r) => [r.id, r]));
  const entries: ServiceSnapshot[] = [];
  for (const service of services) {
    const result = byId.get(service.id);
    if (!result) continue;
    entries.push({
      ...result,
      name: service.name,
      url: service.url,
      uptime: uptime(history.services[service.id] ?? []),
    });
  }
  return {
    version: 1,
    updatedAt: now.toISOString(),
    overall: overallState(services.map((s) => byId.get(s.id)?.state)),
    services: entries,
  };
}

/** Read data/status.json, or null when it does not exist or is not a snapshot. */
export async function loadSnapshot(path: string): Promise<StatusSnapshot | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const json = JSON.parse(text) as Partial<StatusSnapshot>;
  if (json.version !== 1 || !Array.isArray(json.services)) return null;
  return json as StatusSnapshot;
}
