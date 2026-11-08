import { useMemo, useRef, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  BanIcon, CheckCircle2Icon, ClockIcon, FileArchiveIcon, FileCodeIcon, FileTextIcon, HandCoinsIcon, PlusIcon, ReceiptIcon, RotateCwIcon, SearchIcon, Trash2Icon, XCircleIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Buscador, Paginador, soles, useDebounced, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"
import { descargarArchivo } from "@/lib/descargas"

type Tipo = "20" | "40"
type Estado = "por_enviar" | "enviado" | "aceptado" | "rechazado" | "error" | "revertido"
interface Retencion {
  id: number; tipo_documento: Tipo; tipo_label: string; numero: string; fecha_emision: string; regimen: string; regimen_label: string; tasa: number
  tercero: { tipo_doc: string; num_doc: string; razon_social: string; direccion: string | null }
  importe_documentos: number; importe: number; importe_neto: number; estado: Estado
  sunat_codigo: string | null; sunat_descripcion: string | null; ultimo_error: string | null
  reversion: { estado: string; motivo: string | null; identifier: string | null; ticket: string | null; error: string | null } | null
  tiene_archivos: boolean
}
interface Detalle extends Retencion {
  documentos: { tipo_doc: string; num_doc: string; fecha_emision: string; imp_total: number; fecha_pago: string; importe: number; neto: number }[]
  observacion: string | null; usuario: string | null; intentos: number; historial: { fecha: string; estado: string; detalle: string | null }[]; revertible: boolean
}
interface Opciones {
  series: { id: number; serie: string; siguiente: string; predeterminada: boolean; establecimiento: string | null }[]
  regimenes: { codigo: string; descripcion: string; tasa: number }[]
  documentos: { codigo: string; descripcion: string }[]
}

const PENDIENTES: Estado[] = ["por_enviar", "enviado"]
const nombre = (t: Tipo) => (t === "20" ? "retención" : "percepción")
const uid = () => crypto.randomUUID()
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date())

function EstadoBadge({ estado }: { estado: Estado }) {
  const m: Record<Estado, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; Icono: typeof ClockIcon }> = {
    por_enviar: { label: "Por enviar", variant: "outline", Icono: ClockIcon },
    enviado: { label: "En SUNAT", variant: "secondary", Icono: ClockIcon },
    aceptado: { label: "Aceptado", variant: "default", Icono: CheckCircle2Icon },
    rechazado: { label: "Rechazado", variant: "destructive", Icono: XCircleIcon },
    error: { label: "Error de envío", variant: "destructive", Icono: XCircleIcon },
    revertido: { label: "Revertido", variant: "outline", Icono: BanIcon },
  }
  const { label, variant, Icono } = m[estado] ?? m.por_enviar
  return <Badge variant={variant}>{estado === "enviado" ? <Spinner data-icon="inline-start" /> : <Icono data-icon="inline-start" />}{label}</Badge>
}

/** La API no ofrece PDF de percepciones (H-16): solo XML y CDR. */
const formatos = (r: Retencion): ("pdf" | "xml" | "cdr")[] =>
  !r.tiene_archivos ? [] : [...(r.tipo_documento === "20" ? (["pdf"] as const) : []), "xml", ...(["aceptado", "rechazado", "revertido"].includes(r.estado) ? (["cdr"] as const) : [])]
const descargar = (r: Retencion, t: "pdf" | "xml" | "cdr") =>
  descargarArchivo(`/retenciones/${r.id}/archivos/${t}`, `${r.numero}.${t === "cdr" ? "zip" : t}`)

export function RetencionesPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<"todos" | Tipo>("todos")
  const [q, setQ] = useState("")
  const [pagina, setPagina] = useState(1)
  const [nuevo, setNuevo] = useState<Tipo | null>(null)
  const [verId, setVerId] = useState<number | null>(null)
  const qd = useDebounced(q)
  const lista = useQuery({
    queryKey: ["retenciones", empresa?.id, tipo, qd, pagina],
    enabled: !!empresa,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: Retencion[]; meta: MetaPaginacion }>("/retenciones", {
      params: { tipo_documento: tipo === "todos" ? undefined : tipo, q: qd || undefined, page: pagina },
    })).data,
    refetchInterval: (query) => (query.state.data?.data.some((r) => PENDIENTES.includes(r.estado) || r.reversion?.estado === "enviado") ? 4000 : false),
  })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Retenciones y percepciones"
        description="Comprobantes de retención (20) para agentes de retención y de percepción (40) para agentes de percepción, con su reversión ante SUNAT."
        actions={puede("retenciones.emitir") && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setNuevo("40")}><PlusIcon /> Nueva percepción</Button>
            <Button onClick={() => setNuevo("20")}><PlusIcon /> Nueva retención</Button>
          </div>
        )}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Tabs value={tipo} onValueChange={(v) => { setTipo(v as typeof tipo); setPagina(1) }}>
              <TabsList><TabsTrigger value="todos">Todos</TabsTrigger><TabsTrigger value="20">Retenciones</TabsTrigger><TabsTrigger value="40">Percepciones</TabsTrigger></TabsList>
            </Tabs>
            <div className="flex-1"><Buscador value={q} onChange={(v) => { setQ(v); setPagina(1) }} placeholder="Número (R002-1), RUC o razón social" /></div>
          </div>
          {lista.isLoading ? <Skeleton className="h-40" /> : lista.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(lista.error).message}</AlertDescription></Alert>
          ) : lista.data?.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><HandCoinsIcon className="size-8" /> Aún no hay comprobantes de retención o percepción.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comprobante</TableHead><TableHead>Proveedor / cliente</TableHead><TableHead className="text-right">Documentos</TableHead>
                  <TableHead className="text-right">Retenido / percibido</TableHead><TableHead>Estado</TableHead><TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.data?.data.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setVerId(r.id)}>
                    <TableCell>
                      <div className="tabular-nums font-medium">{r.numero}</div>
                      <div className="text-xs text-muted-foreground">{r.tipo_label} · {r.fecha_emision} · {r.tasa}%</div>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate">{r.tercero.razon_social}</div>
                      <div className="tabular-nums text-xs text-muted-foreground">{r.tercero.num_doc}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{soles(r.importe_documentos)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{soles(r.importe)}</TableCell>
                    <TableCell>
                      <EstadoBadge estado={r.estado} />
                      {r.reversion && r.estado !== "revertido" && <div className="mt-1 text-xs text-muted-foreground">Reversión: {r.reversion.estado}</div>}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {puede("comprobantes.descargar") && formatos(r).map((t) => (
                          <Button key={t} variant="info" size="icon" aria-label={`${t.toUpperCase()} de ${r.numero}`} onClick={() => descargar(r, t)}>
                            {t === "pdf" ? <FileTextIcon /> : t === "xml" ? <FileCodeIcon /> : <FileArchiveIcon />}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Paginador meta={lista.data?.meta} onPage={setPagina} />
        </CardContent>
      </Card>
      {nuevo && <NuevoDialog tipo={nuevo} onClose={() => setNuevo(null)} onCreado={(id) => { setNuevo(null); qc.invalidateQueries({ queryKey: ["retenciones"] }); setVerId(id) }} />}
      <DetalleDialog id={verId} onClose={() => setVerId(null)} />
    </div>
  )
}

// ------------------------------------------------------------------ Emisión

interface DocForm { key: string; tipo_doc: string; num_doc: string; fecha_emision: string; imp_total: string; fecha_pago: string }
const docVacio = (): DocForm => ({ key: uid(), tipo_doc: "01", num_doc: "", fecha_emision: hoy(), imp_total: "", fecha_pago: hoy() })

function NuevoDialog({ tipo, onClose, onCreado }: { tipo: Tipo; onClose: () => void; onCreado: (id: number) => void }) {
  const esRet = tipo === "20"
  const op = useQuery({
    queryKey: ["retenciones-opciones", tipo],
    queryFn: async () => (await api.get<{ data: Opciones }>("/retenciones/opciones", { params: { tipo_documento: tipo } })).data.data,
  })
  const [serieId, setSerieId] = useState("")
  const [regimen, setRegimen] = useState("01")
  const [tercero, setTercero] = useState({ tipo_doc: "6", num_doc: "", razon_social: "", direccion: "" })
  const [docs, setDocs] = useState<DocForm[]>([docVacio()])
  const [observacion, setObservacion] = useState("")
  const [errores, setErrores] = useState<Record<string, string[]>>({})
  const [buscando, setBuscando] = useState(false)
  const idem = useRef(uid())

  // Serie por defecto: la predeterminada o la primera (derivada; el usuario puede cambiarla).
  const serie = serieId || String(op.data?.series.find((s) => s.predeterminada)?.id ?? op.data?.series[0]?.id ?? "")
  const tasa = op.data?.regimenes.find((r) => r.codigo === regimen)?.tasa ?? 0
  const calc = useMemo(() => docs.map((d) => {
    const total = Number(d.imp_total) || 0
    const imp = r2((total * tasa) / 100)
    return { total, imp, neto: r2(esRet ? total - imp : total + imp) }
  }), [docs, tasa, esRet])
  const tot = calc.reduce((s, c) => ({ total: s.total + c.total, imp: s.imp + c.imp, neto: s.neto + c.neto }), { total: 0, imp: 0, neto: 0 })

  const buscar = async () => {
    if (!tercero.num_doc) return
    setBuscando(true)
    try {
      const { data } = await api.get<{ data: { cliente: { razon_social?: string; direccion?: string | null } } }>("/clientes/consultar-documento", { params: { tipo: tercero.tipo_doc, numero: tercero.num_doc } })
      setTercero((t) => ({ ...t, razon_social: data.data.cliente.razon_social ?? t.razon_social, direccion: data.data.cliente.direccion ?? t.direccion }))
    } catch (e) {
      toast.error(toApiError(e).message)
    } finally {
      setBuscando(false)
    }
  }
  const setDoc = (i: number, k: keyof DocForm, v: string) => setDocs(docs.map((d, j) => (j === i ? { ...d, [k]: v } : d)))
  const emitir = useMutation({
    mutationFn: async () => (await api.post<{ data: Detalle; message: string }>("/retenciones", {
      idempotency_key: idem.current, tipo_documento: tipo, serie_id: Number(serie), regimen,
      tercero: { ...tercero, direccion: tercero.direccion || null }, observacion: observacion || null,
      documentos: docs.map((d) => ({ tipo_doc: d.tipo_doc, num_doc: d.num_doc.trim().toUpperCase(), fecha_emision: d.fecha_emision, imp_total: Number(d.imp_total), fecha_pago: d.fecha_pago })),
    })).data,
    onMutate: () => setErrores({}),
    onSuccess: (r) => { toast.success(r.message); onCreado(r.data.id) },
    onError: (e) => { const x = toApiError(e); setErrores(x.errors); toast.error(Object.values(x.errors)[0]?.[0] ?? x.message) },
  })
  const err = (k: string) => (errores[k] ? [{ message: errores[k][0] }] : [])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva {nombre(tipo)}</DialogTitle>
          <DialogDescription>
            {esRet ? "Se emite al pagar a un proveedor: se retiene un porcentaje del importe de sus comprobantes." : "Se emite al cobrar a un cliente: se cobra un porcentaje adicional sobre sus comprobantes."}
          </DialogDescription>
        </DialogHeader>
        {op.isLoading ? <Skeleton className="h-64" /> : op.data && op.data.series.length === 0 ? (
          <Alert variant="destructive"><AlertTitle>No hay series de {nombre(tipo)}</AlertTitle><AlertDescription>Crea una serie que empiece con {esRet ? "R" : "P"} en Configuración → Establecimientos y series.</AlertDescription></Alert>
        ) : op.data && (
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field>
                <FieldLabel>Serie</FieldLabel>
                <Select value={serie} onValueChange={setSerieId}>
                  <SelectTrigger aria-label="Serie"><SelectValue /></SelectTrigger>
                  <SelectContent>{op.data.series.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.serie}</SelectItem>)}</SelectContent>
                </Select>
                <FieldDescription className="tabular-nums">Siguiente: {op.data.series.find((s) => String(s.id) === serie)?.siguiente}</FieldDescription>
              </Field>
              <Field data-invalid={!!errores.regimen}>
                <FieldLabel>Régimen</FieldLabel>
                <Select value={regimen} onValueChange={setRegimen}>
                  <SelectTrigger aria-label="Régimen"><SelectValue /></SelectTrigger>
                  <SelectContent>{op.data.regimenes.map((r) => <SelectItem key={r.codigo} value={r.codigo}>{r.codigo} · {r.descripcion}</SelectItem>)}</SelectContent>
                </Select>
                <FieldError errors={err("regimen")} />
              </Field>
            </div>

            <FieldSet>
              <FieldLegend variant="label">{esRet ? "Proveedor" : "Cliente"}</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-[8rem_12rem_1fr]">
                <Select value={tercero.tipo_doc} disabled={esRet} onValueChange={(v) => setTercero({ ...tercero, tipo_doc: v })}>
                  <SelectTrigger aria-label="Tipo de documento"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="6">RUC</SelectItem><SelectItem value="1">DNI</SelectItem></SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input aria-label="Número de documento" className="tabular-nums" inputMode="numeric" value={tercero.num_doc} aria-invalid={!!errores["tercero.num_doc"]}
                    onChange={(e) => setTercero({ ...tercero, num_doc: e.target.value.trim() })} onKeyDown={(e) => e.key === "Enter" && buscar()} />
                  <Button type="button" variant="outline" size="icon" aria-label="Buscar en SUNAT/RENIEC" disabled={buscando} onClick={buscar}>{buscando ? <Spinner /> : <SearchIcon />}</Button>
                </div>
                <Input aria-label="Razón social" placeholder="Razón social o nombre" value={tercero.razon_social} aria-invalid={!!errores["tercero.razon_social"]}
                  onChange={(e) => setTercero({ ...tercero, razon_social: e.target.value })} />
              </div>
              <Input aria-label="Dirección" placeholder="Dirección (opcional)" value={tercero.direccion} onChange={(e) => setTercero({ ...tercero, direccion: e.target.value })} />
              <FieldError errors={[...err("tercero.tipo_doc"), ...err("tercero.num_doc"), ...err("tercero.razon_social")]} />
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Comprobantes {esRet ? "pagados" : "cobrados"}</FieldLegend>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Tipo</TableHead><TableHead>Número</TableHead><TableHead className="w-36">Emisión</TableHead>
                    <TableHead className="w-28 text-right">Importe total</TableHead><TableHead className="w-36">Fecha de {esRet ? "pago" : "cobro"}</TableHead>
                    <TableHead className="text-right">{esRet ? "Retenido" : "Percibido"}</TableHead><TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((d, i) => (
                    <TableRow key={d.key}>
                      <TableCell>
                        <Select value={d.tipo_doc} onValueChange={(v) => setDoc(i, "tipo_doc", v)}>
                          <SelectTrigger aria-label="Tipo de comprobante"><SelectValue /></SelectTrigger>
                          <SelectContent>{op.data!.documentos.map((x) => <SelectItem key={x.codigo} value={x.codigo}>{x.descripcion}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input aria-label="Número" className="tabular-nums" placeholder="F001-123" value={d.num_doc} aria-invalid={!!errores[`documentos.${i}.num_doc`]} onChange={(e) => setDoc(i, "num_doc", e.target.value)} /></TableCell>
                      <TableCell><Input aria-label="Fecha de emisión" type="date" value={d.fecha_emision} max={hoy()} onChange={(e) => setDoc(i, "fecha_emision", e.target.value)} /></TableCell>
                      <TableCell><Input aria-label="Importe total" className="text-right tabular-nums" inputMode="decimal" value={d.imp_total} aria-invalid={!!errores[`documentos.${i}.imp_total`]} onChange={(e) => setDoc(i, "imp_total", e.target.value)} /></TableCell>
                      <TableCell><Input aria-label="Fecha de pago" type="date" value={d.fecha_pago} max={hoy()} onChange={(e) => setDoc(i, "fecha_pago", e.target.value)} /></TableCell>
                      <TableCell className="text-right tabular-nums">{soles(calc[i].imp)}</TableCell>
                      <TableCell>{docs.length > 1 && <Button variant="destructive" size="icon" aria-label="Quitar" onClick={() => setDocs(docs.filter((_, j) => j !== i))}><Trash2Icon /></Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <FieldError errors={Object.keys(errores).filter((k) => k.startsWith("documentos")).slice(0, 1).flatMap((k) => err(k))} />
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setDocs([...docs, docVacio()])}><PlusIcon /> Agregar comprobante</Button>
            </FieldSet>

            <div className="grid gap-4 sm:grid-cols-[1fr_18rem]">
              <Field>
                <FieldLabel htmlFor="ret-obs">Observación</FieldLabel>
                <Textarea id="ret-obs" rows={2} maxLength={500} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
              </Field>
              <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Importe de los comprobantes</span><span className="tabular-nums">{soles(r2(tot.total))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{esRet ? "Retenido" : "Percibido"} ({tasa}%)</span><span className="tabular-nums">{soles(r2(tot.imp))}</span></div>
                <Separator className="my-1" />
                <div className="flex justify-between font-medium"><span>{esRet ? "Neto pagado" : "Total cobrado"}</span><span className="tabular-nums">{soles(r2(tot.neto))}</span></div>
              </div>
            </div>
          </FieldGroup>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={emitir.isPending || !serie || !op.data?.series.length || tot.total <= 0} onClick={() => emitir.mutate()}>
            {emitir.isPending ? <Spinner data-icon="inline-start" /> : <ReceiptIcon />} Emitir {nombre(tipo)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Detalle

function DetalleDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { puede } = useAuth()
  const qc = useQueryClient()
  const [revertir, setRevertir] = useState(false)
  const [motivo, setMotivo] = useState("")
  const d = useQuery({
    queryKey: ["retencion", id],
    enabled: id !== null,
    queryFn: async () => (await api.get<{ data: Detalle }>(`/retenciones/${id}`)).data.data,
    refetchInterval: (q) => (q.state.data && (PENDIENTES.includes(q.state.data.estado) || q.state.data.reversion?.estado === "enviado") ? 3000 : false),
  })
  const r = d.data
  const refrescar = (x: Detalle) => { qc.setQueryData(["retencion", id], x); qc.invalidateQueries({ queryKey: ["retenciones"] }) }
  const reintentar = useMutation({
    mutationFn: async () => (await api.post<{ data: Detalle; message: string }>(`/retenciones/${id}/reintentar`)).data,
    onSuccess: (x) => { toast.success(x.message); refrescar(x.data) },
    onError: (e) => toast.error(toApiError(e).message),
  })
  const rev = useMutation({
    mutationFn: async () => (await api.post<{ data: Detalle; message: string }>(`/retenciones/${id}/revertir`, { motivo })).data,
    onSuccess: (x) => { toast.success(x.message); refrescar(x.data); setRevertir(false); setMotivo("") },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="p-4 pr-12">
          <DialogTitle className="tabular-nums">{r?.numero ?? "Comprobante"}</DialogTitle>
          <DialogDescription>{r ? `${r.tipo_label} · ${r.fecha_emision} · ${r.regimen} ${r.regimen_label}` : "Cargando…"}</DialogDescription>
        </DialogHeader>
        {d.isLoading && <div className="p-4"><Skeleton className="h-64" /></div>}
        {r && (
          <div className="flex flex-col gap-5 px-4 pb-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <EstadoBadge estado={r.estado} />
              {r.sunat_codigo && <Badge variant="outline">SUNAT {r.sunat_codigo}</Badge>}
            </div>
            {r.ultimo_error && <Alert variant="destructive"><XCircleIcon /><AlertTitle>No se pudo completar el envío</AlertTitle><AlertDescription>{r.ultimo_error}</AlertDescription></Alert>}
            {r.reversion && (
              <Alert variant={r.reversion.estado === "error" || r.reversion.estado === "rechazado" ? "destructive" : "default"}>
                <BanIcon />
                <AlertTitle>Reversión {r.reversion.identifier ?? ""}: {r.reversion.estado}</AlertTitle>
                <AlertDescription>{r.reversion.error ?? r.reversion.motivo}{r.reversion.ticket && ` · Ticket ${r.reversion.ticket}`}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {puede("comprobantes.descargar") && formatos(r).map((t) => (
                <Button key={t} variant="outline" size="sm" onClick={() => descargar(r, t)}>
                  {t === "pdf" ? <FileTextIcon /> : t === "xml" ? <FileCodeIcon /> : <FileArchiveIcon />} {t.toUpperCase()}
                </Button>
              ))}
              {puede("retenciones.emitir") && (r.estado === "error" || r.estado === "enviado" || r.reversion?.estado === "enviado") && (
                <Button size="sm" variant="warning" disabled={reintentar.isPending} onClick={() => reintentar.mutate()}><RotateCwIcon /> {r.estado === "error" ? "Reenviar" : "Consultar estado"}</Button>
              )}
              {puede("retenciones.emitir") && r.revertible && (
                <Button size="sm" variant="destructive" onClick={() => setRevertir(true)}><BanIcon /> Revertir</Button>
              )}
            </div>

            <section>
              <h3 className="mb-1 font-medium">{r.tipo_documento === "20" ? "Proveedor" : "Cliente"}</h3>
              <p>{r.tercero.razon_social}</p>
              <p className="tabular-nums text-xs text-muted-foreground">{r.tercero.tipo_doc === "6" ? "RUC" : "Doc."} {r.tercero.num_doc}{r.tercero.direccion ? ` · ${r.tercero.direccion}` : ""}</p>
            </section>
            <section>
              <h3 className="mb-1 font-medium">Comprobantes relacionados</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Emisión</TableHead><TableHead>{r.tipo_documento === "20" ? "Pago" : "Cobro"}</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">{r.tipo_documento === "20" ? "Retenido" : "Percibido"}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {r.documentos.map((x, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular-nums">{x.num_doc}</TableCell><TableCell>{x.fecha_emision}</TableCell><TableCell>{x.fecha_pago}</TableCell>
                      <TableCell className="text-right tabular-nums">{soles(x.imp_total)}</TableCell><TableCell className="text-right tabular-nums">{soles(x.importe)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
            <section className="flex flex-col gap-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Importe de los comprobantes</span><span className="tabular-nums">{soles(r.importe_documentos)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{r.tipo_documento === "20" ? "Retenido" : "Percibido"} ({r.tasa}%)</span><span className="tabular-nums">{soles(r.importe)}</span></div>
              <div className="flex justify-between font-medium"><span>{r.tipo_documento === "20" ? "Neto pagado" : "Total cobrado"}</span><span className="tabular-nums">{soles(r.importe_neto)}</span></div>
            </section>
            {r.observacion && <p className="text-muted-foreground">{r.observacion}</p>}
            <Separator />
            <section>
              <h3 className="mb-2 font-medium">Historial</h3>
              <ol className="flex flex-col gap-2 border-l pl-4">
                {r.historial.map((h, i) => (
                  <li key={i}>
                    <div className="flex items-center gap-2"><EstadoBadge estado={h.estado as Estado} /><span className="text-xs text-muted-foreground">{new Date(h.fecha).toLocaleString("es-PE")}</span></div>
                    {h.detalle && <p className="mt-1 text-xs text-muted-foreground">{h.detalle}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
        <Dialog open={revertir} onOpenChange={(o) => !o && setRevertir(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revertir {r?.numero}</DialogTitle>
              <DialogDescription>Se envía a SUNAT un Resumen de reversiones (RR). Una vez aceptado, el comprobante queda revertido y no se puede deshacer.</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="rev-motivo">Motivo</FieldLabel>
              <Input id="rev-motivo" maxLength={255} value={motivo} placeholder="Error en los datos del proveedor" onChange={(e) => setMotivo(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevertir(false)}>Cancelar</Button>
              <Button variant="destructive" disabled={motivo.trim().length < 5 || rev.isPending} onClick={() => rev.mutate()}>
                {rev.isPending ? <Spinner data-icon="inline-start" /> : <BanIcon />} Revertir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
