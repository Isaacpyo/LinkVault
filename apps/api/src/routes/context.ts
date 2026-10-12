import type { TokenService } from '../auth/tokens.js';
import type { Config } from '../config.js';
import type { IngestService } from '../ingest/service.js';
import type { Store } from '../store/types.js';

/** Dependencies handed to every route module. */
export interface RouteContext {
  config: Config;
  store: Store;
  tokens: TokenService;
  ingest: IngestService;
  startedAt: number;
}
