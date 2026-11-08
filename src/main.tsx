import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { createBrowserRouter, RouterProvider } from "react-router"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/features/auth/auth-context"
import { LoginPage } from "@/features/auth/LoginPage"
import { SetupPage } from "@/features/auth/SetupPage"
import { CredencialesApiPage } from "@/features/empresas/CredencialesApiPage"
import { PerfilFacturacionPage } from "@/features/empresas/PerfilFacturacionPage"
import { ConfiguracionLayout } from "@/layouts/ConfiguracionLayout"
import { EmpresasPage } from "@/features/empresas/EmpresasPage"
import { EstablecimientosPage } from "@/features/empresas/EstablecimientosPage"
import { DashboardPage } from "@/features/dashboard/DashboardPage"
import { ReportesPage } from "@/features/reportes/ReportesPage"
import { InventarioPage } from "@/features/inventario/InventarioPage"
import { ClientesPage } from "@/features/clientes/ClientesPage"
import { CajaPage } from "@/features/caja/CajaPage"
import { CuentasPorCobrarPage } from "@/features/caja/CuentasPorCobrarPage"
import { ComprobantesPage } from "@/features/comprobantes/ComprobantesPage"
import { BajasPage } from "@/features/comprobantes/BajasPage"
import { ResumenDiarioPage } from "@/features/comprobantes/ResumenDiarioPage"
import { GuiasPage } from "@/features/guias/GuiasPage"
import { RetencionesPage } from "@/features/retenciones/RetencionesPage"
import { CotizacionesPage } from "@/features/cotizaciones/CotizacionesPage"
import { NuevaCotizacionPage } from "@/features/cotizaciones/NuevaCotizacionPage"
import { CotizacionImprimible } from "@/features/cotizaciones/CotizacionImprimible"
import { AuditoriaPage } from "@/features/auditoria/AuditoriaPage"
import { NuevaGuiaPage } from "@/features/guias/NuevaGuiaPage"
import { NuevaVentaPage } from "@/features/ventas/NuevaVentaPage"
import { ProductosPage } from "@/features/productos/ProductosPage"
import { ConfiguracionTributariaPage } from "@/features/tributos/ConfiguracionTributariaPage"
import { UsuariosPage } from "@/features/usuarios/UsuariosPage"
import { AppLayout } from "@/layouts/AppLayout"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/configuracion-inicial", element: <SetupPage /> },
  { path: "/cotizaciones/:id/imprimir", element: <CotizacionImprimible /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "reportes", element: <ReportesPage /> },
      { path: "ventas/nueva", element: <NuevaVentaPage /> },
      { path: "comprobantes", element: <ComprobantesPage /> },
      { path: "bajas", element: <BajasPage /> },
      { path: "resumen-diario", element: <ResumenDiarioPage /> },
      { path: "cotizaciones", element: <CotizacionesPage /> },
      { path: "cotizaciones/nueva", element: <NuevaCotizacionPage /> },
      { path: "guias", element: <GuiasPage /> },
      { path: "retenciones", element: <RetencionesPage /> },
      { path: "guias/nueva", element: <NuevaGuiaPage /> },
      { path: "caja", element: <CajaPage /> },
      { path: "cuentas-por-cobrar", element: <CuentasPorCobrarPage /> },
      { path: "inventario", element: <InventarioPage /> },
      { path: "clientes", element: <ClientesPage /> },
      { path: "productos", element: <ProductosPage /> },
      {
        path: "configuracion",
        element: <ConfiguracionLayout />,
        children: [
          { path: "empresas", element: <EmpresasPage /> },
          { path: "credenciales-api", element: <CredencialesApiPage /> },
          { path: "perfil-facturacion", element: <PerfilFacturacionPage /> },
          { path: "usuarios", element: <UsuariosPage /> },
          { path: "establecimientos", element: <EstablecimientosPage /> },
          { path: "tributaria", element: <ConfiguracionTributariaPage /> },
          { path: "auditoria", element: <AuditoriaPage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
