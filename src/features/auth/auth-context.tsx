import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, csrf, setEmpresaActivaApi, toApiError } from "@/lib/api"
import type { Empresa, Usuario } from "@/lib/types"

const EMPRESA_KEY = "empresa_activa_id"

interface AuthState {
  user: Usuario | null
  loading: boolean
  empresa: Empresa | null
  setEmpresaId: (id: number) => void
  /** Permiso en la empresa activa (el superadministrador tiene todos). La autorización real la hace el backend. */
  puede: (permiso: string) => boolean
  login: (email: string, password: string, recordar: boolean) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<unknown>
}

const AuthContext = createContext<AuthState | null>(null)

function readStoredEmpresa(): number | null {
  try {
    const v = localStorage.getItem(EMPRESA_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [empresaId, setEmpresaIdState] = useState<number | null>(readStoredEmpresa)

  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ data: Usuario }>("/auth/me")
        return data.data
      } catch (e) {
        if (toApiError(e).status === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
    retry: false,
  })

  const user = me.data ?? null
  const empresa = useMemo(() => {
    if (!user?.empresas.length) return null
    return user.empresas.find((e) => e.id === empresaId) ?? user.empresas[0]
  }, [user, empresaId])

  const setEmpresaId = useCallback((id: number) => {
    setEmpresaIdState(id)
    try {
      localStorage.setItem(EMPRESA_KEY, String(id))
    } catch {
      /* almacenamiento no disponible: se mantiene solo en memoria */
    }
  }, [])

  useEffect(() => {
    if (empresa && empresa.id !== empresaId) setEmpresaIdState(empresa.id)
  }, [empresa, empresaId])

  // Se fija de forma síncrona en el render para que las consultas hijas ya lleven el header.
  setEmpresaActivaApi(empresa?.id ?? null)

  const login = useCallback(
    async (email: string, password: string, recordar: boolean) => {
      await csrf()
      const { data } = await api.post<{ data: Usuario }>("/auth/login", { email, password, recordar })
      qc.setQueryData(["auth", "me"], data.data)
    },
    [qc],
  )

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout")
    } finally {
      qc.clear()
      qc.setQueryData(["auth", "me"], null)
    }
  }, [qc])

  const puede = useCallback(
    (permiso: string) => !!user?.is_superadmin || !!empresa?.mis_permisos.includes(permiso),
    [user, empresa],
  )

  const value: AuthState = {
    user,
    loading: me.isLoading,
    empresa,
    setEmpresaId,
    puede,
    login,
    logout,
    refresh: me.refetch,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider")
  return ctx
}
