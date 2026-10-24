/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUTER?: 'hash' | 'browser'
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Supported for existing Supabase projects whose dashboard still labels this `anon`. */
  readonly VITE_SUPABASE_ANON_KEY?: string
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
