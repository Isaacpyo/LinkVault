/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the LinkVault API, e.g. https://linkvault-api.onrender.com */
  readonly VITE_API_URL?: string;
  /** Where the extension zip can be downloaded (GitHub Releases). */
  readonly VITE_EXTENSION_DOWNLOAD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
