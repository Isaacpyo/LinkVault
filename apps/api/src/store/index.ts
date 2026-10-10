import type { Config } from '../config.js';
import { MemoryStore } from './memory.js';
import { OpenSearchStore } from './opensearch.js';
import type { Store } from './types.js';

export function createStore(config: Config): Store {
  if (config.backend === 'opensearch' && config.opensearch) return new OpenSearchStore(config.opensearch);
  return new MemoryStore();
}

export type { Store } from './types.js';
