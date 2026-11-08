import { Link } from "react-router"
import { Building2Icon, CheckCircle2Icon, CircleDashedIcon, KeyRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { useCredencialesApi } from "@/features/empresas/credenciales-api.api"

/** Inicio provisional: guía de configuración inicial (el dashboard comercial llega en la Etapa 7). */
export function InicioPage() {
  const { user, empresa } = useAuth()
  const creds = useCredencialesApi(empresa?.id)
  const pruebasOk = creds.data?.entornos.find((e) => e.entorno === "pruebas")?.verificacion_ok === true

  const pasos = [
    { ok: !!empresa, titulo: "Registrar la empresa emisora", to: "/configuracion/empresas", icon: Building2Icon },
    { ok: pruebasOk, titulo: "Configurar y verificar las credenciales API de pruebas", to: "/configuracion/credenciales-api", icon: KeyRoundIcon },
  ]

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={`Hola, ${user?.name.split(" ")[0] ?? ""}`} description="Configuración inicial del sistema." />
      <Card>
        <CardHeader>
          <CardTitle>Primeros pasos</CardTitle>
          <CardDescription>Completa estos pasos para habilitar la facturación electrónica.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {pasos.map((p) => (
            <div key={p.to} className="flex items-center gap-3 rounded-lg bg-foreground/5 p-3">
              {p.ok ? <CheckCircle2Icon className="size-5 text-primary" /> : <CircleDashedIcon className="size-5 text-muted-foreground" />}
              <span className={p.ok ? "text-muted-foreground line-through" : "font-medium"}>{p.titulo}</span>
              {!p.ok && (
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <Link to={p.to}><p.icon /> Ir</Link>
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
