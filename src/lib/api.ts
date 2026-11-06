import axios, { AxiosError } from "axios"

/**
 * Cliente HTTP del SPA. La sesión viaja en cookie httpOnly (Laravel Sanctum);
 * axios reenvía automáticamente el token CSRF desde la cookie XSRF-TOKEN.
 * El frontend NUNCA recibe ni maneja credenciales de la API de facturación.
 */
export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
})

// Empresa activa: viaja en cada solicitud como X-Empresa-Id (el backend valida la pertenencia).
let empresaActivaId: number | null = null
export function setEmpresaActivaApi(id: number | null) {
  empresaActivaId = id
}
api.interceptors.request.use((config) => {
  if (empresaActivaId) config.headers.set("X-Empresa-Id", String(empresaActivaId))
  return config
})

export async function csrf() {
  await axios.get("/sanctum/csrf-cookie", { withCredentials: true })
}

export type ApiValidationErrors = Record<string, string[]>

export class ApiError extends Error {
  status: number
  errors: ApiValidationErrors

  constructor(message: string, status: number, errors: ApiValidationErrors = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  if (e instanceof AxiosError) {
    const status = e.response?.status ?? 0
    const data = e.response?.data as { message?: string; errors?: ApiValidationErrors } | undefined
    const fallback =
      status === 0
        ? "No se pudo conectar con el servidor."
        : status === 403
          ? "No tienes permiso para realizar esta acción."
          : status === 419
            ? "La sesión expiró. Recarga la página."
            : status === 429
              ? "Demasiados intentos. Espera un momento."
              : "Ocurrió un error inesperado."
    return new ApiError(data?.message || fallback, status, data?.errors ?? {})
  }
  return new ApiError("Ocurrió un error inesperado.", 0)
}

/** Copia los errores de validación de Laravel a un formulario de react-hook-form. */
export function applyServerErrors<T extends string>(
  error: ApiError,
  setError: (name: T, e: { type: string; message: string }) => void,
) {
  for (const [field, messages] of Object.entries(error.errors)) {
    setError(field as T, { type: "server", message: messages[0] })
  }
}
