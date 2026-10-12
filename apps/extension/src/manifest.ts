export interface ManifestOptions {
  version: string;
  /** Web app URL; its origin is where the "connect extension" content script runs. */
  webUrl: string;
  /** Additional web app origins (e.g. local dev servers). */
  extraWebOrigins?: string[];
}

const toMatchPattern = (url: string) => `${new URL(url).origin}/*`;

/** Builds manifest.json. Kept as a pure function so its permissions are unit-tested. */
export function buildManifest({ version, webUrl, extraWebOrigins = [] }: ManifestOptions) {
  const matches = [...new Set([webUrl, ...extraWebOrigins].map(toMatchPattern))];
  return {
    manifest_version: 3,
    name: 'LinkVault — save & search pages',
    short_name: 'LinkVault',
    description:
      'Save the current tab to LinkVault with one click. Full-text search, tags, collections and offline reading.',
    version,
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    action: {
      default_title: 'Save to LinkVault',
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
    },
    options_page: 'options.html',
    background: { service_worker: 'background.js', type: 'module' },
    // activeTab: access to the current tab only after the user clicks the icon,
    // a context menu item or the shortcut. No broad host permissions.
    permissions: ['activeTab', 'storage', 'contextMenus', 'scripting'],
    content_scripts: [{ matches, js: ['content.js'], run_at: 'document_start' }],
    commands: {
      'save-page': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Save the current page to LinkVault',
      },
    },
  };
}
