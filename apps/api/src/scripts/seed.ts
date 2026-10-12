/**
 * Seeds the local demo account (demo@linkvault.local / linkvault-demo) into the
 * configured store. Usage: `npm run seed` (reads ../../.env when present).
 */
import { loadConfig } from '../config.js';
import { ensureLocalDemoAccount, LOCAL_DEMO_EMAIL, LOCAL_DEMO_PASSWORD } from '../demo/demo.js';
import { createStore } from '../store/index.js';

const config = loadConfig();
if (config.backend === 'memory') {
  console.error('SEARCH_BACKEND is memory; seeding would be lost immediately. Set OPENSEARCH_URL first.');
  process.exit(1);
}
const store = createStore(config);
await store.init();
const { created } = await ensureLocalDemoAccount(store);
console.log(created ? `Seeded ${LOCAL_DEMO_EMAIL} / ${LOCAL_DEMO_PASSWORD}` : `${LOCAL_DEMO_EMAIL} already exists`);
await store.close();
