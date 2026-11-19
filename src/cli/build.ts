/** Build the static status page into dist/. */

import { join } from 'node:path';
import { ROOT, buildSite } from '../run.ts';

const indexPath = await buildSite({
  configPath: process.env.STATUS_CONFIG ?? join(ROOT, 'services.json'),
  dataDir: process.env.STATUS_DATA_DIR ?? join(ROOT, 'data'),
  outDir: process.env.STATUS_OUT_DIR ?? join(ROOT, 'dist'),
  basePath: process.env.STATUS_BASE_PATH ?? '/iridium-status/',
});
console.log(`Wrote ${indexPath}`);
