import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"

export const SETUP_KEY = ["setup", "estado"]

/** Indica si el sistema aún no tiene usuarios y debe registrarse el primer superadministrador. */
export function useSetupEstado() {
  return useQuery({
    queryKey: SETUP_KEY,
    queryFn: async () => {
      const r = await api.get<{ data?: { requiere_configuracion?: boolean } }>("/setup/estado")
      const v = r.data?.data?.requiere_configuracion
      // Si responde HTML (p. ej. el index.html del hosting), el frontend no está apuntando al backend.
      if (typeof v !== "boolean") throw new Error("SIN_BACKEND")
      return v
    },
    staleTime: 30_000,
    retry: 1,
  })
}
