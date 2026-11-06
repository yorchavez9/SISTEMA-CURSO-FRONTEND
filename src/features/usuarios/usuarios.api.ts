import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { ModuloPermisos, RolDef, UsuarioEmpresa } from "@/lib/types"

const key = (empresaId: number) => ["empresas", empresaId, "usuarios"]

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: async () => (await api.get<{ data: { roles: RolDef[]; modulos: ModuloPermisos[] } }>("/roles")).data.data,
    staleTime: Infinity,
  })
}

export function useUsuariosEmpresa(empresaId: number | undefined) {
  return useQuery({
    queryKey: key(empresaId ?? 0),
    enabled: !!empresaId,
    queryFn: async () => (await api.get<{ data: UsuarioEmpresa[] }>(`/empresas/${empresaId}/usuarios`)).data.data,
  })
}

export interface NuevoUsuario {
  email: string
  rol: string
  name?: string
  password?: string
  password_confirmation?: string
}

export function useCrearUsuario(empresaId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: NuevoUsuario) =>
      (await api.post<{ data: UsuarioEmpresa; message: string }>(`/empresas/${empresaId}/usuarios`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key(empresaId) }),
  })
}

export function useActualizarUsuario(empresaId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; rol?: string; activo?: boolean }) =>
      (await api.put<{ data: UsuarioEmpresa; message: string }>(`/empresas/${empresaId}/usuarios/${id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(empresaId) })
      qc.invalidateQueries({ queryKey: ["auth", "me"] })
    },
  })
}

export function useRetirarUsuario(empresaId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => (await api.delete<{ message: string }>(`/empresas/${empresaId}/usuarios/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key(empresaId) }),
  })
}
