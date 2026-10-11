import { describe, expect, it } from 'vitest';
import { buildManifest } from './manifest';

describe('buildManifest', () => {
  const manifest = buildManifest({
    version: '1.2.3',
    webUrl: 'https://linkvault.example.com/app',
    extraWebOrigins: ['http://localhost:5173', 'https://linkvault.example.com'],
  });

  it('is a Manifest V3 extension with a module service worker', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe('1.2.3');
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(manifest.action.default_popup).toBe('popup.html');
  });

  it('asks for activeTab instead of broad host permissions', () => {
    expect(manifest.permissions).toEqual(['activeTab', 'storage', 'contextMenus', 'scripting']);
    expect(manifest).not.toHaveProperty('host_permissions');
  });

  it('runs the connect content script only on the web app origins, de-duplicated', () => {
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://linkvault.example.com/*', 'http://localhost:5173/*'],
        js: ['content.js'],
        run_at: 'document_start',
      },
    ]);
  });

  it('registers the quick-save shortcut', () => {
    expect(manifest.commands['save-page'].suggested_key.default).toBe('Alt+Shift+S');
  });
});
