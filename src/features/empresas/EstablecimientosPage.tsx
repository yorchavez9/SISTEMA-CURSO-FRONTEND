import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CloudCheckIcon, CloudOffIcon, InfoIcon, PlusIcon, RefreshCwIcon, StoreIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { useCatalogos } from "@/features/tributos/ConfiguracionTributariaPage"
import { api, applyServerErrors, toApiError } from "@/lib/api"

interface SerieDto {
  id: number
  establecimiento_id: number | null
  tipo_documento: string
  serie: string
  correlativo_actual: number
  siguiente_numero: string
  activo: boolean
  predeterminada: boolean
  sincronizado: boolean
}
interface EstablecimientoDto {
  id: number
  nombre: string
  cod_local: string
  direccion: string | null
  es_principal: boolean
  activo: boolean
  sincronizado: boolean
  series: SerieDto[]
}
interface Datos {
  establecimientos: EstablecimientoDto[]
  series_sin_establecimiento: SerieDto[]
}

const TIPOS = ["01", "03", "07", "08", "09", "31", "20", "40"]

export function EstablecimientosPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const key = ["establecimientos", empresa?.id]
  const q = useQuery({
    queryKey: key,
    enabled: !!empresa,
    queryFn: async () => (await api.get<{ data: Datos }>("/establecimientos")).data.data,
  })
  const cat = useCatalogos()
  const tipoLabel = (c: string) => cat.data?.catalogos["01"]?.find((t) => t.codigo === c)?.descripcion ?? c
  const editar = puede("empresas.editar")

  const sincronizar = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>("/establecimientos/sincronizar")).data,
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })

  if (!empresa) return <PageHeader title="Establecimientos y series" description="Selecciona una empresa." />
  const vacio = q.data && q.data.establecimientos.length === 0 && q.data.series_sin_establecimiento.length === 0

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Establecimientos y series"
        description="Locales anexos (código SUNAT) y series de comprobantes. Se mantienen sincronizados con la API de facturación."
        actions={
          editar && (
            <>
              <Button variant="outline" onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
                {sincronizar.isPending ? <Spinner /> : <RefreshCwIcon />} Sincronizar con la API
              </Button>
              {q.data && q.data.establecimientos.length > 0 && <NuevoEstablecimiento onDone={() => qc.invalidateQueries({ queryKey: key })} />}
            </>
          )
        }
      />
      {q.isLoading && <Skeleton className="h-64" />}
      {q.isError && <Alert variant="destructive"><AlertDescription>{toApiError(q.error).message}</AlertDescription></Alert>}
      {vacio && (
        <Alert>
          <StoreIcon />
          <AlertTitle>Aún no hay establecimientos</AlertTitle>
          <AlertDescription>
            <p>Pulsa <span className="font-medium">Sincronizar con la API</span> para importar los establecimientos y las series de tu cuenta, con su último correlativo usado.</p>
          </AlertDescription>
        </Alert>
      )}
      {q.data?.establecimientos.map((e) => (
        <Card key={e.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {e.nombre}
              <Badge variant="outline" className="tabular-nums">{e.cod_local}</Badge>
              {e.es_principal && <Badge variant="secondary">Principal</Badge>}
            </CardTitle>
            <CardDescription>{e.direccion ?? "Sin dirección registrada"}</CardDescription>
            <CardAction className="flex items-center gap-2">
              <SyncBadge ok={e.sincronizado} />
              {editar && e.sincronizado && cat.data && (
                <NuevaSerie establecimiento={e} tipoLabel={tipoLabel} onDone={() => qc.invalidateQueries({ queryKey: key })} />
              )}
            </CardAction>
          </CardHeader>
          <CardContent>
            {e.series.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin series en este establecimiento.</p>
            ) : (
              <SeriesTabla series={e.series} tipoLabel={tipoLabel} editar={editar} onDone={() => qc.invalidateQueries({ queryKey: key })} />
            )}
          </CardContent>
        </Card>
      ))}
      {q.data && q.data.series_sin_establecimiento.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Series sin establecimiento</CardTitle></CardHeader>
          <CardContent>
            <SeriesTabla series={q.data.series_sin_establecimiento} tipoLabel={tipoLabel} editar={editar} onDone={() => qc.invalidateQueries({ queryKey: key })} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SyncBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge variant="outline"><CloudCheckIcon data-icon="inline-start" />En la API</Badge>
  ) : (
    <Badge variant="destructive"><CloudOffIcon data-icon="inline-start" />Solo local</Badge>
  )
}

function SeriesTabla({ series, tipoLabel, editar, onDone }: { series: SerieDto[]; tipoLabel: (c: string) => string; editar: boolean; onDone: () => void }) {
  const cambiar = useMutation({
    mutationFn: async ({ id, ...cambio }: { id: number; activo?: boolean; predeterminada?: boolean }) => (await api.put<{ message: string }>(`/series/${id}`, cambio)).data,
    onSuccess: (r) => {
      toast.success(r.message)
      onDone()
    },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Comprobante</TableHead>
          <TableHead>Serie</TableHead>
          <TableHead className="text-right">Último usado</TableHead>
          <TableHead>Siguiente</TableHead>
          <TableHead>Activa</TableHead>
          <TableHead>
            <span className="flex items-center gap-1">
              Predeterminada
              <Tooltip>
                <TooltipTrigger asChild><InfoIcon className="size-3.5 text-muted-foreground" aria-label="Qué es la serie predeterminada" /></TooltipTrigger>
                <TooltipContent className="max-w-64">La que se preselecciona al emitir. Una por tipo de comprobante (y por familia F/B en notas). Es una preferencia de este sistema: no cambia nada en la API.</TooltipContent>
              </Tooltip>
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {series.map((s) => (
          <TableRow key={s.id} className={s.activo ? undefined : "opacity-60"}>
            <TableCell>{tipoLabel(s.tipo_documento)}</TableCell>
            <TableCell className="tabular-nums font-medium">{s.serie}</TableCell>
            <TableCell className="text-right tabular-nums">{s.correlativo_actual}</TableCell>
            <TableCell className="tabular-nums">{s.siguiente_numero}</TableCell>
            <TableCell>
              <Switch
                checked={s.activo}
                disabled={!editar || cambiar.isPending}
                aria-label={`Serie ${s.serie} activa`}
                onCheckedChange={(activo) => cambiar.mutate({ id: s.id, activo })}
              />
            </TableCell>
            <TableCell>
              <Switch
                checked={s.predeterminada}
                disabled={!editar || cambiar.isPending || (!s.predeterminada && (!s.activo || !s.sincronizado))}
                aria-label={`Serie ${s.serie} predeterminada`}
                onCheckedChange={(predeterminada) => cambiar.mutate({ id: s.id, predeterminada })}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const estSchema = z.object({
  nombre: z.string().trim().min(2, "Ingresa el nombre."),
  cod_local: z.string().regex(/^\d{4}$/, "4 dígitos (\"0000\" = domicilio fiscal)."),
  direccion: z.string().trim().optional(),
  ubigeo: z.string().trim().refine((v) => !v || /^\d{6}$/.test(v), "6 dígitos.").optional(),
})

function NuevoEstablecimiento({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const form = useForm<z.infer<typeof estSchema>>({ resolver: zodResolver(estSchema), defaultValues: { nombre: "", cod_local: "", direccion: "", ubigeo: "" } })
  const { errors, isSubmitting } = form.formState
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const r = (await api.post<{ message: string }>("/establecimientos", { ...v, direccion: v.direccion || null, ubigeo: v.ubigeo || null })).data
      toast.success(r.message)
      onDone()
      form.reset()
      setOpen(false)
    } catch (e) {
      const err = toApiError(e)
      applyServerErrors(err, form.setError)
      if (err.errors.api) toast.error(err.errors.api[0])
      else if (!Object.keys(err.errors).length) toast.error(err.message)
    }
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><PlusIcon /> Establecimiento</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo establecimiento</DialogTitle>
          <DialogDescription>Se registra también en la API de facturación.</DialogDescription>
        </DialogHeader>
        <form id="form-est" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <Field data-invalid={!!errors.nombre}>
                <FieldLabel htmlFor="e-nombre">Nombre</FieldLabel>
                <Input id="e-nombre" aria-invalid={!!errors.nombre} {...form.register("nombre")} />
                <FieldError errors={[errors.nombre]} />
              </Field>
              <Field data-invalid={!!errors.cod_local}>
                <FieldLabel htmlFor="e-cod">Código</FieldLabel>
                <Input id="e-cod" inputMode="numeric" maxLength={4} aria-invalid={!!errors.cod_local} {...form.register("cod_local")} />
                <FieldError errors={[errors.cod_local]} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <Field>
                <FieldLabel htmlFor="e-dir">Dirección</FieldLabel>
                <Input id="e-dir" {...form.register("direccion")} />
              </Field>
              <Field data-invalid={!!errors.ubigeo}>
                <FieldLabel htmlFor="e-ubi">Ubigeo</FieldLabel>
                <Input id="e-ubi" inputMode="numeric" maxLength={6} aria-invalid={!!errors.ubigeo} {...form.register("ubigeo")} />
                <FieldError errors={[errors.ubigeo]} />
              </Field>
            </div>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" form="form-est" disabled={isSubmitting}>{isSubmitting && <Spinner />} Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const PREFIJO: Record<string, string> = { "01": "F001", "03": "B001", "07": "FC01", "08": "FD01", "09": "T001", "31": "V001", "20": "R001", "40": "P001" }

function NuevaSerie({ establecimiento, tipoLabel, onDone }: { establecimiento: EstablecimientoDto; tipoLabel: (c: string) => string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState("01")
  const [serie, setSerie] = useState("")
  const [error, setError] = useState<string | null>(null)
  const crear = useMutation({
    mutationFn: async () =>
      (await api.post<{ message: string }>("/series", { establecimiento_id: establecimiento.id, tipo_documento: tipo, serie: serie.toUpperCase() })).data,
  })
  const enviar = async () => {
    setError(null)
    try {
      toast.success((await crear.mutateAsync()).message)
      onDone()
      setSerie("")
      setOpen(false)
    } catch (e) {
      const err = toApiError(e)
      setError(Object.values(err.errors)[0]?.[0] ?? err.message)
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><PlusIcon /> Serie</Button></DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva serie</DialogTitle>
          <DialogDescription>{establecimiento.nombre} ({establecimiento.cod_local})</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Tipo de comprobante</FieldLabel>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger aria-label="Tipo de comprobante"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{tipoLabel(t)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="s-serie">Serie</FieldLabel>
            <Input id="s-serie" maxLength={4} placeholder={PREFIJO[tipo]} className="tabular-nums uppercase" value={serie} onChange={(e) => setSerie(e.target.value)} aria-invalid={!!error} />
            <FieldDescription>4 caracteres. Facturas empiezan con F, boletas con B; las notas con F o B según el documento que modifican.</FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={enviar} disabled={crear.isPending || serie.length !== 4}>{crear.isPending && <Spinner />} Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
