import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { CredencialApiEstado, CredencialesApiResumen, Empresa, Entorno } from "@/lib/types"

const key = (empresaId: number) => ["empresas", empresaId, "credenciales-api"]

export function useCredencialesApi(empresaId: number | undefined) {
  return useQuery({
    queryKey: key(empresaId ?? 0),
    enabled: !!empresaId,
    queryFn: async () => (await api.get<{ data: CredencialesApiResumen }>(`/empresas/${empresaId}/credenciales-api`)).data.data,
    retry: false,
  })
}

function useInvalidate(empresaId: number) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: key(empresaId) })
}

export function useGuardarCredenciales(empresaId: number, entorno: Entorno) {
  const invalidate = useInvalidate(empresaId)
  return useMutation({
    mutationFn: async (body: { api_key: string; api_secret?: string }) =>
      (await api.put<{ data: CredencialApiEstado; message: string }>(`/empresas/${empresaId}/credenciales-api/${entorno}`, body)).data,
    onSuccess: invalidate,
  })
}

export function useVerificarCredenciales(empresaId: number, entorno: Entorno) {
  const invalidate = useInvalidate(empresaId)
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ data: CredencialApiEstado; message: string }>(`/empresas/${empresaId}/credenciales-api/${entorno}/verificar`)).data,
    onSuccess: invalidate,
  })
}

export function useEliminarCredenciales(empresaId: number, entorno: Entorno) {
  const invalidate = useInvalidate(empresaId)
  return useMutation({
    mutationFn: async () => (await api.delete<{ message: string }>(`/empresas/${empresaId}/credenciales-api/${entorno}`)).data,
    onSuccess: invalidate,
  })
}

export function useCambiarEntornoActivo(empresaId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entorno_activo: Entorno) =>
      (await api.put<{ data: Empresa; message: string }>(`/empresas/${empresaId}`, { entorno_activo })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(empresaId) })
      qc.invalidateQueries({ queryKey: ["auth", "me"] })
      qc.invalidateQueries({ queryKey: ["empresas"] })
    },
  })
}
