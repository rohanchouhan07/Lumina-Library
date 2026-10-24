/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUTER?: 'hash' | 'browser'
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_TIMEOUT_MS?: string
  readonly VITE_SHOW_DEMO_HINTS?: string
}

declare module '*?raw' {
  const source: string
  export default source
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
