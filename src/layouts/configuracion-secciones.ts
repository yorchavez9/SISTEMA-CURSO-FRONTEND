import { Building2Icon, DatabaseIcon, KeyRoundIcon, ScrollTextIcon, StoreIcon, UsersIcon, type LucideIcon } from "lucide-react"

interface Seccion { to: string; label: string; icon: LucideIcon; permiso?: string; soloSuperadmin?: boolean }

export const GRUPOS: { titulo: string; secciones: Seccion[] }[] = [
  {
    titulo: "Mi empresa",
    secciones: [
      { to: "/configuracion/perfil-facturacion", label: "Datos de la empresa", icon: Building2Icon, permiso: "empresas.ver" },
      { to: "/configuracion/establecimientos", label: "Locales y series", icon: StoreIcon, permiso: "empresas.ver" },
      { to: "/configuracion/usuarios", label: "Usuarios", icon: UsersIcon, permiso: "usuarios.ver" },
    ],
  },
  {
    titulo: "Avanzado",
    secciones: [
      { to: "/configuracion/credenciales-api", label: "Conexión API", icon: KeyRoundIcon, permiso: "credenciales_api.gestionar" },
      { to: "/configuracion/tributaria", label: "Catálogos SUNAT", icon: DatabaseIcon, permiso: "configuracion_tributaria.ver" },
      { to: "/configuracion/auditoria", label: "Auditoría", icon: ScrollTextIcon, permiso: "auditoria.ver" },
      { to: "/configuracion/empresas", label: "Empresas", icon: Building2Icon, soloSuperadmin: true },
    ],
  },
]

/** Permisos que dan acceso a alguna sección (el menú lateral muestra "Configuración" si hay al menos una). */
export const PERMISOS_CONFIGURACION = GRUPOS.flatMap((g) => g.secciones.flatMap((s) => (s.permiso ? [s.permiso] : [])))
