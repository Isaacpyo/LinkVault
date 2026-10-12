import { defineConfig } from 'tsup';

export default defineConfig({
  // extract-worker runs in worker threads, loaded from next to the server bundle.
  entry: { server: 'src/server.ts', seed: 'src/scripts/seed.ts', 'extract-worker': 'src/ingest/extract-worker.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (shipped as TypeScript source); keep npm deps external.
  noExternal: ['@linkvault/shared'],
});
