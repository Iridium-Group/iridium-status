/** Run every check in services.json and update data/status.json and data/history.json. */

import { join } from 'node:path';
import { ROOT, runChecks } from '../run.ts';
import { OVERALL_LABELS } from '../summary.ts';

const configPath = process.env.STATUS_CONFIG ?? join(ROOT, 'services.json');
const dataDir = process.env.STATUS_DATA_DIR ?? join(ROOT, 'data');

const snapshot = await runChecks({ configPath, dataDir });
console.log(`${OVERALL_LABELS[snapshot.overall]} (${snapshot.updatedAt})`);
for (const s of snapshot.services) {
  const latency = s.latencyMs === null ? '-' : `${s.latencyMs} ms`;
  const detail = s.error ? `  ${s.error}` : '';
  console.log(
    `  ${s.state.padEnd(8)} ${s.id.padEnd(16)} ${String(s.status ?? '-').padEnd(4)} ${latency}${detail}`,
  );
}
// A service being down is reported in the data, not as a failed run.
