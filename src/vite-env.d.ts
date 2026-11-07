/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origen del backend Laravel en producción (sin "/" final). Vacío = mismo origen / proxy de Vite. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
