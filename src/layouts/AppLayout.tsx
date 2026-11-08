import { matchPath, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { BanIcon, CalendarClockIcon, FileTextIcon, ScrollTextIcon, TruckIcon, BoxesIcon, ChartColumnIcon, Building2Icon, FileCheck2Icon, HandCoinsIcon, WalletIcon, ShoppingCartIcon, ChevronsUpDownIcon, HomeIcon, KeyRoundIcon, LandmarkIcon, LogOutIcon, PackageIcon, ReceiptTextIcon, StoreIcon, UsersIcon, UsersRoundIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ModeToggle } from "@/components/shared/ModeToggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/features/auth/auth-context"

type NavItem = { to: string; label: string; icon: typeof HomeIcon; end?: boolean; permiso?: string }

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "General",
    items: [
      { to: "/", label: "Panel", icon: HomeIcon, end: true },
      { to: "/reportes", label: "Reportes", icon: ChartColumnIcon, permiso: "reportes.ver" },
    ],
  },
  {
    group: "Comercial",
    items: [
      { to: "/ventas/nueva", label: "Nueva venta", icon: ShoppingCartIcon, permiso: "comprobantes.emitir" },
      { to: "/comprobantes", label: "Comprobantes", icon: FileCheck2Icon, permiso: "comprobantes.ver" },
      { to: "/cotizaciones", label: "Cotizaciones", icon: FileTextIcon, permiso: "cotizaciones.ver" },
      { to: "/guias", label: "Guías de remisión", icon: TruckIcon, permiso: "guias.ver" },
      { to: "/retenciones", label: "Retenciones y percepciones", icon: HandCoinsIcon, permiso: "retenciones.ver" },
      { to: "/resumen-diario", label: "Resumen diario", icon: CalendarClockIcon, permiso: "comprobantes.ver" },
      { to: "/bajas", label: "Bajas SUNAT", icon: BanIcon, permiso: "comprobantes.ver" },
      { to: "/caja", label: "Caja", icon: WalletIcon, permiso: "caja.ver" },
      { to: "/cuentas-por-cobrar", label: "Cuentas por cobrar", icon: HandCoinsIcon, permiso: "ventas.ver" },
      { to: "/clientes", label: "Clientes", icon: UsersRoundIcon, permiso: "clientes.ver" },
      { to: "/productos", label: "Productos y servicios", icon: PackageIcon, permiso: "productos.ver" },
      { to: "/inventario", label: "Inventario", icon: BoxesIcon, permiso: "inventario.ver" },
    ],
  },
  {
    group: "Configuración",
    items: [
      { to: "/configuracion/empresas", label: "Empresas", icon: Building2Icon },
      { to: "/configuracion/perfil-facturacion", label: "Perfil de facturación", icon: ReceiptTextIcon, permiso: "empresas.ver" },
      { to: "/configuracion/establecimientos", label: "Establecimientos y series", icon: StoreIcon, permiso: "empresas.ver" },
      { to: "/configuracion/usuarios", label: "Usuarios y roles", icon: UsersIcon, permiso: "usuarios.ver" },
      { to: "/configuracion/tributaria", label: "Configuración tributaria", icon: LandmarkIcon, permiso: "configuracion_tributaria.ver" },
      { to: "/configuracion/credenciales-api", label: "Credenciales API", icon: KeyRoundIcon, permiso: "credenciales_api.gestionar" },
      { to: "/configuracion/auditoria", label: "Auditoría", icon: ScrollTextIcon, permiso: "auditoria.ver" },
    ],
  },
]

export function AppLayout() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <EntornoBadge />
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function EntornoBadge() {
  const { empresa } = useAuth()
  if (!empresa) return null
  return empresa.entorno_activo === "produccion" ? (
    <Badge>Producción</Badge>
  ) : (
    <Badge variant="secondary">Entorno de pruebas</Badge>
  )
}

function AppSidebar() {
  const { user, empresa, setEmpresaId, logout, puede } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (!user) return null
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip="Empresa activa">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <ReceiptTextIcon className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{empresa?.razon_social ?? "Sin empresa"}</span>
                    <span className="truncate text-xs text-muted-foreground">{empresa ? `RUC ${empresa.ruc}` : "Registra una empresa"}</span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-64" align="start">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Empresas</DropdownMenuLabel>
                {user.empresas.map((e) => (
                  <DropdownMenuItem key={e.id} onSelect={() => setEmpresaId(e.id)}>
                    <span className="truncate">{e.razon_social}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{e.ruc}</span>
                  </DropdownMenuItem>
                ))}
                {user.empresas.length === 0 && <DropdownMenuItem disabled>No hay empresas</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/configuracion/empresas")}>
                  <Building2Icon /> Administrar empresas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permiso || puede(i.permiso)) }))
          .filter((g) => g.items.length > 0)
          .map((g) => (
          <SidebarGroup key={g.group}>
            <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      isActive={!!matchPath({ path: item.to, end: item.end ?? false }, pathname)}
                    >
                      <NavLink to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={user.name}>
                  <Avatar className="size-8 rounded-md">
                    <AvatarFallback className="rounded-md">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-56" side="top" align="start">
                <DropdownMenuItem onSelect={() => { logout().catch(() => undefined).finally(() => navigate("/login", { replace: true })) }}>
                  <LogOutIcon /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
