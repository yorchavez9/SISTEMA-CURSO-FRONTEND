import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"

export const SETUP_KEY = ["setup", "estado"]

/** Indica si el sistema aún no tiene usuarios y debe registrarse el primer superadministrador. */
export function useSetupEstado() {
  return useQuery({
    queryKey: SETUP_KEY,
    queryFn: async () =>
      (await api.get<{ data: { requiere_configuracion: boolean } }>("/setup/estado")).data.data.requiere_configuracion,
    staleTime: 30_000,
    retry: 1,
  })
}
