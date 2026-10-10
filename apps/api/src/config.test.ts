import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('defaults to the memory backend with a dev secret outside production', () => {
    const config = loadConfig({});
    expect(config.backend).toBe('memory');
    expect(config.port).toBe(4000);
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'http://localhost:4173']);
    expect(config.warnings.length).toBeGreaterThan(0);
  });

  it('selects OpenSearch when a URL is configured', () => {
    const config = loadConfig({ OPENSEARCH_URL: 'https://u:p@search.example.com', OPENSEARCH_INDEX_PREFIX: 'lv-test' });
    expect(config.backend).toBe('opensearch');
    expect(config.opensearch).toEqual({ url: 'https://u:p@search.example.com', indexPrefix: 'lv-test', replicas: 0 });
  });

  it('requires a strong JWT secret in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(/32 characters/);
  });

  it('parses CORS origins and strips trailing slashes', () => {
    const config = loadConfig({ CORS_ORIGINS: 'https://a.example.com/, https://b.example.com' });
    expect(config.corsOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('rejects an explicit OpenSearch backend without a URL', () => {
    expect(() => loadConfig({ SEARCH_BACKEND: 'opensearch' })).toThrow(/OPENSEARCH_URL/);
  });
});
