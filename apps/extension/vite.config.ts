import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { PRODUCTION_WEB_URL } from './src/defaults';
import { buildManifest } from './src/manifest';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function manifestPlugin(webUrl: string, extraWebOrigins: string[]): Plugin {
  return {
    name: 'linkvault-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(buildManifest({ version: pkg.version, webUrl, extraWebOrigins }), null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const webUrl = env.VITE_WEB_URL || PRODUCTION_WEB_URL;
  const extra = (env.VITE_EXTRA_WEB_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Development builds also connect to the local web app servers.
  if (mode === 'development') extra.push('http://localhost:5173', 'http://localhost:4173', 'http://localhost:8080');

  return {
    plugins: [react(), tailwindcss(), manifestPlugin(webUrl, extra)],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: mode === 'development' ? 'inline' : false,
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: {
          popup: 'popup.html',
          options: 'options.html',
          background: 'src/background.ts',
          content: 'src/content.ts',
        },
        output: {
          // The manifest references these two by fixed name.
          entryFileNames: (chunk) =>
            ['background', 'content'].includes(chunk.name) ? '[name].js' : 'assets/[name]-[hash].js',
          manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
        },
      },
    },
  };
});
