import { NavLink, Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "@/features/auth/auth-context"
import { cn } from "@/lib/utils"
import { GRUPOS } from "./configuracion-secciones"

/** Sección Configuración: menú propio agrupado y, a la derecha, la pantalla elegida. */
export function ConfiguracionLayout() {
  const { user, puede } = useAuth()
  const { pathname } = useLocation()
  const grupos = GRUPOS
    .map((g) => ({ ...g, secciones: g.secciones.filter((s) => (s.soloSuperadmin ? !!user?.is_superadmin : !s.permiso || puede(s.permiso))) }))
    .filter((g) => g.secciones.length > 0)
  const visibles = grupos.flatMap((g) => g.secciones)

  if (visibles.length === 0) return <Navigate to="/" replace />
  // /configuracion, o una sección a la que este usuario no tiene acceso: va a la primera disponible.
  if (!visibles.some((s) => pathname.startsWith(s.to))) return <Navigate to={visibles[0].to} replace />

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:flex-row">
      <nav aria-label="Configuración" className="flex shrink-0 gap-4 overflow-x-auto lg:w-52 lg:flex-col lg:overflow-visible">
        {grupos.map((g) => (
          <div key={g.titulo} className="flex shrink-0 gap-1 lg:flex-col">
            <p className="hidden px-3 pb-1 text-xs font-medium text-muted-foreground lg:block">{g.titulo}</p>
            {g.secciones.map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                className={({ isActive }) => cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-foreground/10 font-medium" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <s.icon className="size-4" /> {s.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1"><Outlet /></div>
    </div>
  )
}
