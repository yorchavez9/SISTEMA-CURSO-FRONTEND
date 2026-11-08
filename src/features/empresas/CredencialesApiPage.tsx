import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Link } from "react-router"
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  PlugZapIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { PageHeader } from "@/components/shared/PageHeader"
import { ConsultaDocumentosCard } from "./ConsultaDocumentosCard"
import { useAuth } from "@/features/auth/auth-context"
import { applyServerErrors, toApiError } from "@/lib/api"
import type { CredencialApiEstado, Entorno } from "@/lib/types"
import {
  useCambiarEntornoActivo,
  useCredencialesApi,
  useEliminarCredenciales,
  useGuardarCredenciales,
  useVerificarCredenciales,
} from "./credenciales-api.api"

const ENTORNO_INFO: Record<Entorno, { titulo: string; descripcion: string }> = {
  pruebas: {
    titulo: "Pruebas",
    descripcion: "Credenciales de una empresa en entorno beta de SUNAT. Los comprobantes no tienen validez tributaria.",
  },
  produccion: {
    titulo: "Producción",
    descripcion: "Credenciales de la empresa en entorno de producción. Los comprobantes se informan a SUNAT con validez legal.",
  },
}

const fecha = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—"

export function CredencialesApiPage() {
  const { empresa } = useAuth()
  const query = useCredencialesApi(empresa?.id)

  if (!empresa) {
    return (
      <>
        <PageHeader title="Credenciales API" />
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>No hay empresa seleccionada</AlertTitle>
          <AlertDescription>
            <p>
              Primero <Link className="underline underline-offset-4" to="/configuracion/empresas">registra una empresa</Link>.
            </p>
          </AlertDescription>
        </Alert>
      </>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Credenciales API de facturación"
        description={
          <>
            API Key y API Secret de <span className="font-medium text-foreground">{empresa.razon_social}</span> (RUC {empresa.ruc}). Se
            guardan cifrados en el servidor y nunca se vuelven a mostrar.
          </>
        }
      />

      {query.isLoading && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>No se pudieron cargar las credenciales</AlertTitle>
          <AlertDescription>{toApiError(query.error).message}</AlertDescription>
        </Alert>
      )}

      {query.data && (
        <>
          <EntornoActivoCard empresaId={empresa.id} actual={query.data.entorno_activo} estados={query.data.entornos} />
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {query.data.entornos.map((estado) => (
              <CredencialCard
                key={estado.entorno}
                empresaId={empresa.id}
                estado={estado}
                urlDefecto={query.data.base_url}
                enUso={estado.entorno === query.data.entorno_activo}
              />
            ))}
          </div>
          <ConsultaDocumentosCard empresaId={empresa.id} />
          <p className="text-xs text-muted-foreground">
            Servidor de la API: <code className="rounded bg-muted px-1 py-0.5">{query.data.base_url}</code>
          </p>
        </>
      )}
    </div>
  )
}

function EstadoBadge({ estado }: { estado: CredencialApiEstado }) {
  if (!estado.configurada) return <Badge variant="outline">No configurada</Badge>
  if (estado.verificacion_ok === true) return <Badge><CheckCircle2Icon data-icon="inline-start" />Verificada</Badge>
  if (estado.verificacion_ok === false) return <Badge variant="destructive"><CircleAlertIcon data-icon="inline-start" />Error</Badge>
  return <Badge variant="secondary">Sin verificar</Badge>
}

function EntornoActivoCard({ empresaId, actual, estados }: { empresaId: number; actual: Entorno; estados: CredencialApiEstado[] }) {
  const cambiar = useCambiarEntornoActivo(empresaId)
  const [pendiente, setPendiente] = useState<Entorno | null>(null)
  const prodListo = estados.find((e) => e.entorno === "produccion")?.verificacion_ok === true

  const aplicar = async (entorno: Entorno) => {
    try {
      const res = await cambiar.mutateAsync(entorno)
      toast.success(res.message ?? "Entorno actualizado.")
    } catch (e) {
      toast.error(toApiError(e).message)
    } finally {
      setPendiente(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheckIcon className="size-4" />Entorno de emisión</CardTitle>
        <CardDescription>Qué credenciales usa el sistema al emitir comprobantes para esta empresa.</CardDescription>
        <CardAction>
          <Select
            value={actual}
            disabled={cambiar.isPending}
            onValueChange={(v) => (v === "produccion" ? setPendiente("produccion") : aplicar(v as Entorno))}
          >
            <SelectTrigger className="w-44" aria-label="Entorno de emisión">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pruebas">Pruebas</SelectItem>
              <SelectItem value="produccion" disabled={!prodListo}>
                Producción{!prodListo && " (verifica primero)"}
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <AlertDialog open={pendiente !== null} onOpenChange={(o) => !o && setPendiente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Emitir en producción?</AlertDialogTitle>
            <AlertDialogDescription>
              A partir de ahora los comprobantes de esta empresa se enviarán a SUNAT con validez tributaria. Esta acción queda registrada en
              la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => aplicar("produccion")}>Cambiar a producción</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function CredencialCard({ empresaId, estado, enUso, urlDefecto }: { empresaId: number; estado: CredencialApiEstado; enUso: boolean; urlDefecto: string }) {
  const info = ENTORNO_INFO[estado.entorno]
  const guardar = useGuardarCredenciales(empresaId, estado.entorno)
  const verificar = useVerificarCredenciales(empresaId, estado.entorno)
  const eliminar = useEliminarCredenciales(empresaId, estado.entorno)
  const [verSecreto, setVerSecreto] = useState(false)

  const schema = z.object({
    // URL base de la API para este entorno; vacía = la por defecto del servidor.
    base_url: z.string().trim().refine((v) => v === "" || /^https:\/\/[^\s?#]+$/.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(v),
      "Debe empezar con https:// y no tener parámetros (?…)."),
    api_key: estado.configurada
      ? z.string().trim().refine((v) => v === "" || (v.length >= 8 && /^\S+$/.test(v)), "Mínimo 8 caracteres, sin espacios.")
      : z.string().trim().min(8, "El API Key debe tener al menos 8 caracteres.").regex(/^\S+$/, "Sin espacios."),
    api_secret: estado.configurada
      ? z.string().trim().refine((v) => v === "" || (v.length >= 8 && /^\S+$/.test(v)), "Mínimo 8 caracteres, sin espacios.")
      : z.string().trim().min(8, "Ingresa el API Secret (mínimo 8 caracteres).").regex(/^\S+$/, "Sin espacios."),
  })
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { base_url: estado.base_url ?? "", api_key: "", api_secret: "" } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await guardar.mutateAsync({ api_key: values.api_key || undefined, api_secret: values.api_secret || undefined, base_url: values.base_url || null })
      form.reset({ base_url: res.data.base_url ?? "", api_key: "", api_secret: "" })
      setVerSecreto(false)
      if (res.data.verificacion_ok) toast.success("Credenciales guardadas y verificadas.")
      else toast.warning("Credenciales guardadas, pero la verificación falló.", { description: res.data.verificacion_mensaje ?? undefined })
    } catch (e) {
      const err = toApiError(e)
      applyServerErrors(err, form.setError)
      if (!Object.keys(err.errors).length) toast.error(err.message)
    }
  })

  const probar = async () => {
    try {
      const res = await verificar.mutateAsync()
      if (res.data.verificacion_ok) toast.success(res.message)
      else toast.error("La verificación falló.", { description: res.message })
    } catch (e) {
      toast.error(toApiError(e).message)
    }
  }

  const borrar = async () => {
    try {
      const res = await eliminar.mutateAsync()
      toast.success(res.message)
    } catch (e) {
      toast.error(toApiError(e).message)
    }
  }

  const r = estado.remoto
  const idKey = `api_key_${estado.entorno}`
  const idSecret = `api_secret_${estado.entorno}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          {info.titulo}
          {enUso && <Badge variant="outline">En uso</Badge>}
        </CardTitle>
        <CardDescription>{info.descripcion}</CardDescription>
        <CardAction><EstadoBadge estado={estado} /></CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {estado.configurada && (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">API Key</dt>
              <dd className="tabular-nums">{estado.api_key_mascara}</dd>
              <dt className="text-muted-foreground">URL de la API</dt>
              <dd className="truncate"><code className="text-xs">{estado.base_url ?? urlDefecto}</code>{!estado.base_url && <span className="text-muted-foreground"> (por defecto)</span>}</dd>
              <dt className="text-muted-foreground">Verificado</dt>
              <dd>{fecha(estado.verificado_at)}</dd>
              {r && (
                <>
                  <dt className="text-muted-foreground">Empresa en la API</dt>
                  <dd className="truncate">{r.ruc} · {r.razon_social ?? "—"}</dd>
                  <dt className="text-muted-foreground">Entorno remoto</dt>
                  <dd>{r.entorno ?? "no informado"}</dd>
                  <dt className="text-muted-foreground">Régimen / IGV</dt>
                  <dd>{r.tax_regime ?? "—"} · {r.tasa_igv_vigente != null ? `${r.tasa_igv_vigente}%` : "—"}</dd>
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd>{r.plan ?? "—"}</dd>
                </>
              )}
            </dl>
            {estado.verificacion_mensaje && (
              <Alert variant={estado.verificacion_ok ? "default" : "destructive"}>
                {estado.verificacion_ok ? <CheckCircle2Icon /> : <CircleAlertIcon />}
                <AlertDescription>{estado.verificacion_mensaje}</AlertDescription>
              </Alert>
            )}
            <Separator />
          </div>
        )}

        <form id={`form-${estado.entorno}`} onSubmit={onSubmit} noValidate autoComplete="off">
          <FieldGroup>
            <Field data-invalid={!!errors.base_url}>
              <FieldLabel htmlFor={`base_url_${estado.entorno}`}>URL base de la API</FieldLabel>
              <Input
                id={`base_url_${estado.entorno}`}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={urlDefecto}
                aria-invalid={!!errors.base_url}
                {...form.register("base_url")}
              />
              <FieldDescription>Déjala vacía para usar la por defecto ({urlDefecto}). Al cambiarla se vuelve a verificar la conexión.</FieldDescription>
              <FieldError errors={[errors.base_url]} />
            </Field>
            <Field data-invalid={!!errors.api_key}>
              <FieldLabel htmlFor={idKey}>{estado.configurada ? "Nuevo API Key" : "API Key"}</FieldLabel>
              <Input
                id={idKey}
                autoComplete="off"
                spellCheck={false}
                placeholder={estado.configurada ? `${estado.api_key_mascara} · vacío = conservar` : "Pega aquí el API Key"}
                aria-invalid={!!errors.api_key}
                {...form.register("api_key")}
              />
              <FieldError errors={[errors.api_key]} />
            </Field>
            <Field data-invalid={!!errors.api_secret}>
              <FieldLabel htmlFor={idSecret}>{estado.configurada ? "Nuevo API Secret" : "API Secret"}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={idSecret}
                  type={verSecreto ? "text" : "password"}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={estado.configurada ? "Déjalo vacío para conservar el actual" : "Pega aquí el API Secret"}
                  aria-invalid={!!errors.api_secret}
                  {...form.register("api_secret")}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={verSecreto ? "Ocultar secreto" : "Mostrar secreto"}
                    onClick={() => setVerSecreto((v) => !v)}
                  >
                    {verSecreto ? <EyeOffIcon /> : <EyeIcon />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {estado.configurada && <FieldDescription>El secreto guardado nunca se muestra.</FieldDescription>}
              <FieldError errors={[errors.api_secret]} />
            </Field>
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        <Button type="submit" form={`form-${estado.entorno}`} disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Guardar y verificar
        </Button>
        {estado.configurada && (
          <>
            <Button variant="outline" onClick={probar} disabled={verificar.isPending}>
              {verificar.isPending ? <Spinner /> : <PlugZapIcon />}
              Probar conexión
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="ml-auto text-destructive" disabled={eliminar.isPending}>
                  <Trash2Icon /> Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar las credenciales de {info.titulo.toLowerCase()}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    El sistema dejará de poder emitir comprobantes en este entorno hasta que registres nuevas credenciales.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={borrar}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
