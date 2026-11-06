import { useState } from "react"
import { Link, useSearchParams } from "react-router"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  AlertTriangleIcon, CalendarClockIcon, CheckCircle2Icon, CircleAlertIcon, ClockIcon, DownloadIcon, FileCodeIcon, FileTextIcon, FileArchiveIcon, FileMinusIcon, FilePlusIcon, BanIcon,
  PlusIcon, ReceiptTextIcon, RotateCwIcon, TruckIcon, XCircleIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Buscador, Paginador, soles, useDebounced, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"
import { descargarArchivo } from "@/lib/descargas"
import { ImprimirBoton } from "./ImprimirBoton"
import { NotaDialog } from "./NotaDialog"
import { BajaDialog, EstadoBaja, type Baja } from "./BajasPage"

type Estado = "por_enviar" | "pendiente_resumen" | "enviado" | "aceptado" | "observado" | "rechazado" | "error" | "anulado"
interface ComprobanteResumen {
  id: number
  tipo_documento: string
  numero: string
  serie: string
  fecha_emision: string
  moneda: string
  total: number
  cliente: { tipo_doc: string; num_doc: string; razon_social: string }
  estado: Estado
  sunat_codigo: string | null
  sunat_descripcion: string | null
  diferencia_totales: boolean
  ultimo_error: string | null
  imprimible: boolean
  archivos?: string[]
}
interface ComprobanteDetalle extends ComprobanteResumen {
  forma_pago: string
  fecha_vencimiento: string | null
  tipo_operacion: string
  cliente_direccion: string | null
  hash_cpe: string | null
  sunat_notas: string[] | null
  totales: Record<string, number>
  totales_api: Record<string, number> | null
  intentos: number
  items: { descripcion: string; unidad: string; cantidad: string; precio_unitario: string; tip_afe_igv: string; descuento: string; base: string; igv: string; total: string }[]
  cuotas: { numero: number; monto: number; fecha_vencimiento: string }[]
  archivos: { tipo: string; size: number }[] & string[]
  historial: { de: string | null; a: string; detalle: string | null; fecha: string }[]
  solicitudes: { operacion: string; metodo: string; endpoint: string; http_status: number | null; duracion_ms: number | null; error: string | null; fecha: string }[]
  motivo: { codigo: string; descripcion: string } | null
  referencia: { id: number; numero: string; tipo_documento: string } | null
  notas: { id: number; numero: string; tipo_documento: string; total: number; estado: Estado }[]
  venta: { id: number; estado: string; pagado: number; saldo: number } | null
  bajas: { id: number; tipo: string; identifier: string | null; estado: Baja["estado"]; motivo: string; sunat_codigo: string | null; sunat_descripcion: string | null; ultimo_error: string | null }[]
  plazo_baja: string
}

const TIPO: Record<string, string> = { "01": "Factura", "03": "Boleta", "07": "Nota de crédito", "08": "Nota de débito" }
const PENDIENTES: Estado[] = ["por_enviar", "enviado"]

export function EstadoBadge({ estado }: { estado: Estado }) {
  const m: Record<Estado, { label: string; v: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    por_enviar: { label: "Por enviar", v: "outline", icon: <ClockIcon data-icon="inline-start" /> },
    pendiente_resumen: { label: "Pendiente de resumen", v: "outline", icon: <CalendarClockIcon data-icon="inline-start" /> },
    enviado: { label: "En SUNAT", v: "secondary", icon: <Spinner data-icon="inline-start" /> },
    aceptado: { label: "Aceptado", v: "default", icon: <CheckCircle2Icon data-icon="inline-start" /> },
    observado: { label: "Observado", v: "secondary", icon: <AlertTriangleIcon data-icon="inline-start" /> },
    rechazado: { label: "Rechazado", v: "destructive", icon: <XCircleIcon data-icon="inline-start" /> },
    error: { label: "Error de envío", v: "destructive", icon: <CircleAlertIcon data-icon="inline-start" /> },
    anulado: { label: "Anulado", v: "outline", icon: <XCircleIcon data-icon="inline-start" /> },
  }
  const x = m[estado]
  return <Badge variant={x.v}>{x.icon}{x.label}</Badge>
}

function descargar(id: number, tipo: "pdf" | "xml" | "cdr", numero: string) {
  return descargarArchivo(`/comprobantes/${id}/archivos/${tipo}`, `${numero}.${tipo === "cdr" ? "zip" : tipo}`)
}

export function ComprobantesPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState("")
  const [tipo, setTipo] = useState("todos")
  const [estado, setEstado] = useState("todos")
  const [pagina, setPagina] = useState(1)
  const qd = useDebounced(q)
  const verId = params.get("ver")

  const lista = useQuery({
    queryKey: ["comprobantes", empresa?.id, qd, tipo, estado, pagina],
    enabled: !!empresa,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: ComprobanteResumen[]; meta: MetaPaginacion }>("/comprobantes", {
      params: { q: qd || undefined, tipo_documento: tipo === "todos" ? undefined : tipo, estado: estado === "todos" ? undefined : estado, page: pagina },
    })).data,
    // Mientras haya comprobantes en camino a SUNAT, se actualiza solo.
    refetchInterval: (query) => (query.state.data?.data.some((c) => PENDIENTES.includes(c.estado)) ? 4000 : false),
  })

  const reintentar = useMutation({
    mutationFn: async (id: number) => (await api.post<{ message: string }>(`/comprobantes/${id}/reintentar`)).data,
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["comprobantes"] }); qc.invalidateQueries({ queryKey: ["comprobante"] }) },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Comprobantes electrónicos"
        description="Estado en SUNAT, descargas y trazabilidad de cada envío."
        actions={puede("comprobantes.emitir") && <Button asChild><Link to="/ventas/nueva"><PlusIcon /> Nueva venta</Link></Button>}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Buscador value={q} onChange={(v) => { setQ(v); setPagina(1) }} placeholder="F001-963, RUC/DNI o nombre del cliente" />
            <Select value={tipo} onValueChange={(v) => { setTipo(v); setPagina(1) }}>
              <SelectTrigger className="sm:w-40" aria-label="Tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                {Object.entries(TIPO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={estado} onValueChange={(v) => { setEstado(v); setPagina(1) }}>
              <SelectTrigger className="sm:w-44" aria-label="Estado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {(["por_enviar", "pendiente_resumen", "enviado", "aceptado", "observado", "rechazado", "error", "anulado"] as Estado[]).map((e) => <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {lista.isLoading ? (
            <div className="flex flex-col gap-2"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : lista.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(lista.error).message}</AlertDescription></Alert>
          ) : lista.data?.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><ReceiptTextIcon className="size-8" /> No hay comprobantes con esos filtros.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Archivos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.data?.data.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setParams({ ver: String(c.id) })}>
                    <TableCell>
                      <div className="font-mono font-medium">{c.numero}</div>
                      <div className="text-xs text-muted-foreground">{TIPO[c.tipo_documento]}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.fecha_emision}</TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate">{c.cliente.razon_social}</div>
                      <div className="font-mono text-xs text-muted-foreground">{c.cliente.num_doc}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{soles(c.total, c.moneda)}</TableCell>
                    <TableCell>
                      <EstadoBadge estado={c.estado} />
                      {c.diferencia_totales && <Badge variant="destructive" className="ml-1" title="El total de la API difiere del calculado">Δ total</Badge>}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {puede("comprobantes.descargar") && c.archivos?.includes("pdf") && <Button variant="ghost" size="icon" aria-label={`PDF de ${c.numero}`} onClick={() => descargar(c.id, "pdf", c.numero)}><FileTextIcon /></Button>}
                        {puede("comprobantes.descargar") && c.archivos?.includes("xml") && <Button variant="ghost" size="icon" aria-label={`XML de ${c.numero}`} onClick={() => descargar(c.id, "xml", c.numero)}><FileCodeIcon /></Button>}
                        {puede("comprobantes.descargar") && c.archivos?.includes("cdr") && <Button variant="ghost" size="icon" aria-label={`CDR de ${c.numero}`} onClick={() => descargar(c.id, "cdr", c.numero)}><FileArchiveIcon /></Button>}
                        {puede("comprobantes.emitir") && (c.estado === "error" || c.estado === "enviado") && (
                          <Button variant="ghost" size="icon" aria-label={`Reintentar ${c.numero}`} disabled={reintentar.isPending} onClick={() => reintentar.mutate(c.id)}><RotateCwIcon /></Button>
                        )}
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
      <DetalleSheet id={verId ? Number(verId) : null} onClose={() => setParams({})} onReintentar={(id) => reintentar.mutate(id)} onVer={(id) => setParams({ ver: String(id) })} />
    </div>
  )
}

function DetalleSheet({ id, onClose, onReintentar, onVer }: { id: number | null; onClose: () => void; onReintentar: (id: number) => void; onVer: (id: number) => void }) {
  const { puede } = useAuth()
  const qc = useQueryClient()
  const [nota, setNota] = useState<"07" | "08" | null>(null)
  const [baja, setBaja] = useState(false)
  const d = useQuery({
    queryKey: ["comprobante", id],
    enabled: id !== null,
    queryFn: async () => (await api.get<{ data: ComprobanteDetalle }>(`/comprobantes/${id}`)).data.data,
    refetchInterval: (q) => (q.state.data && PENDIENTES.includes(q.state.data.estado) ? 3000 : false),
  })
  const c = d.data
  const tiene = (t: string) => c?.archivos.some((a) => a.tipo === t)

  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-mono">{c?.numero ?? "Comprobante"}</SheetTitle>
          <SheetDescription>{c ? `${TIPO[c.tipo_documento]} · ${c.fecha_emision}` : "Cargando…"}</SheetDescription>
        </SheetHeader>
        {d.isLoading && <div className="p-4"><Skeleton className="h-64" /></div>}
        {d.isError && <Alert variant="destructive" className="m-4"><AlertDescription>{toApiError(d.error).message}</AlertDescription></Alert>}
        {c && (
          <div className="flex flex-col gap-5 px-4 pb-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <EstadoBadge estado={c.estado} />
              {c.sunat_codigo && <Badge variant="outline">SUNAT {c.sunat_codigo}</Badge>}
              {c.forma_pago === "credito" && <Badge variant="secondary">Crédito</Badge>}
            </div>
            {c.sunat_descripcion && <p className="text-muted-foreground">{c.sunat_descripcion}</p>}
            {c.ultimo_error && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>No se pudo completar el envío</AlertTitle>
                <AlertDescription>{c.ultimo_error}</AlertDescription>
              </Alert>
            )}
            {c.diferencia_totales && (
              <Alert variant="destructive"><AlertTriangleIcon /><AlertDescription>El total informado por la API ({c.totales_api?.total}) difiere del calculado ({c.totales.total}). Revisar.</AlertDescription></Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {puede("comprobantes.descargar") && (["pdf", "xml", "cdr"] as const).map((t) => (
                <Button key={t} variant="outline" size="sm" disabled={!tiene(t)} onClick={() => descargar(c.id, t, c.numero)}>
                  <DownloadIcon /> {t.toUpperCase()}
                </Button>
              ))}
              {puede("comprobantes.descargar") && c.imprimible && <ImprimirBoton comprobanteId={c.id} numero={c.numero} />}
              {puede("comprobantes.emitir") && (c.estado === "error" || c.estado === "enviado") && (
                <Button size="sm" onClick={() => onReintentar(c.id)}><RotateCwIcon /> Reintentar</Button>
              )}
              {puede("guias.emitir") && c.estado === "aceptado" && (c.tipo_documento === "01" || c.tipo_documento === "03") && (
                <Button size="sm" variant="outline" asChild><Link to={`/guias/nueva?comprobante=${c.id}`}><TruckIcon /> Guía de remisión</Link></Button>
              )}
              {puede("comprobantes.anular") && c.estado === "aceptado" && (c.tipo_documento === "01" || c.tipo_documento === "03") && c.venta && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setNota("07")}><FileMinusIcon /> Nota de crédito</Button>
                  <Button size="sm" variant="outline" onClick={() => setNota("08")}><FilePlusIcon /> Nota de débito</Button>
                </>
              )}
              {puede("comprobantes.anular") && c.estado === "aceptado" && (c.tipo_documento === "03" || c.serie.startsWith("F"))
                && !c.bajas.some((b) => b.estado !== "rechazado" && b.estado !== "error")
                && c.plazo_baja >= new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date()) && (
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => setBaja(true)}><BanIcon /> Dar de baja</Button>
              )}
            </div>

            {c.referencia && (
              <section>
                <h3 className="mb-1 font-medium">{c.tipo_documento === "07" ? "Nota de crédito" : "Nota de débito"} sobre</h3>
                <Button variant="link" className="h-auto p-0 font-mono" onClick={() => onVer(c.referencia!.id)}>{c.referencia.numero}</Button>
                {c.motivo && <p className="text-muted-foreground">Motivo {c.motivo.codigo}: {c.motivo.descripcion}</p>}
              </section>
            )}
            {c.notas.length > 0 && (
              <section>
                <h3 className="mb-1 font-medium">Notas emitidas</h3>
                {c.notas.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-2">
                    <Button variant="link" className="h-auto p-0 font-mono" onClick={() => onVer(n.id)}>{n.numero}</Button>
                    <span className="flex items-center gap-2"><span className="font-mono">{n.tipo_documento === "07" ? "−" : "+"}{soles(n.total, c.moneda)}</span><EstadoBadge estado={n.estado} /></span>
                  </div>
                ))}
              </section>
            )}
            {c.bajas.length > 0 && (
              <section>
                <h3 className="mb-1 font-medium">Bajas</h3>
                {c.bajas.map((b) => (
                  <div key={b.id} className="flex flex-col gap-1 rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2"><span className="font-mono">{b.identifier ?? b.tipo}</span><EstadoBaja estado={b.estado} /></div>
                    <span className="text-xs text-muted-foreground">{b.motivo}{(b.ultimo_error || b.sunat_descripcion) && ` · ${b.ultimo_error ?? `${b.sunat_codigo} ${b.sunat_descripcion}`}`}</span>
                  </div>
                ))}
              </section>
            )}
            {c.venta && (
              <p className="text-xs text-muted-foreground">Venta {c.venta.estado === "anulada" ? "anulada" : "vigente"} · pagado {soles(c.venta.pagado)} · saldo {soles(c.venta.saldo)}</p>
            )}

            <section>
              <h3 className="mb-1 font-medium">Cliente</h3>
              <p>{c.cliente.razon_social}</p>
              <p className="font-mono text-xs text-muted-foreground">{c.cliente.tipo_doc === "6" ? "RUC" : "Doc."} {c.cliente.num_doc}{c.cliente_direccion ? ` · ${c.cliente_direccion}` : ""}</p>
            </section>

            <section>
              <h3 className="mb-1 font-medium">Ítems</h3>
              <Table>
                <TableBody>
                  {c.items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {it.descripcion}
                        <div className="font-mono text-xs text-muted-foreground">{Number(it.cantidad)} {it.unidad} × {Number(it.precio_unitario).toFixed(2)} · afect. {it.tip_afe_igv}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{soles(Number(it.total), c.moneda)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            <section className="flex flex-col gap-1">
              {Object.entries(c.totales).filter(([k, v]) => v !== 0 && !["valor_venta", "sub_total", "total_impuestos"].includes(k)).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted-foreground capitalize">{k.replace("_", " ")}</span>
                  <span className="font-mono">{soles(v, c.moneda)}</span>
                </div>
              ))}
            </section>

            {c.cuotas.length > 0 && (
              <section>
                <h3 className="mb-1 font-medium">Cuotas</h3>
                {c.cuotas.map((q) => <div key={q.numero} className="flex justify-between font-mono"><span>{q.numero}. {q.fecha_vencimiento}</span><span>{soles(q.monto, c.moneda)}</span></div>)}
              </section>
            )}

            <Separator />
            <section>
              <h3 className="mb-2 font-medium">Historial</h3>
              <ol className="flex flex-col gap-2 border-l pl-4">
                {c.historial.map((h, i) => (
                  <li key={i}>
                    <div className="flex items-center gap-2"><EstadoBadge estado={h.a as Estado} /><span className="text-xs text-muted-foreground">{new Date(h.fecha).toLocaleString("es-PE")}</span></div>
                    {h.detalle && <p className="mt-1 text-xs text-muted-foreground">{h.detalle}</p>}
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h3 className="mb-2 font-medium">Llamadas a la API ({c.intentos} {c.intentos === 1 ? "envío" : "envíos"})</h3>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Operación</TableHead><TableHead>HTTP</TableHead><TableHead className="text-right">ms</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {c.solicitudes.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="font-mono text-xs">{s.metodo} {s.endpoint}</span>
                        {s.error && <div className="text-xs text-destructive">{s.error}</div>}
                      </TableCell>
                      <TableCell><Badge variant={s.http_status && s.http_status < 300 ? "outline" : "destructive"}>{s.http_status ?? "—"}</Badge></TableCell>
                      <TableCell className="text-right font-mono text-xs">{s.duracion_ms ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {c.hash_cpe && <p className="mt-2 break-all font-mono text-xs text-muted-foreground">Hash CPE: {c.hash_cpe}</p>}
            </section>
          </div>
        )}
      </SheetContent>
      {baja && c && (
        <BajaDialog comprobante={{ id: c.id, numero: c.numero, tipo_documento: c.tipo_documento, plazo: c.plazo_baja }} onClose={() => setBaja(false)}
          onDone={() => { qc.invalidateQueries({ queryKey: ["comprobante"] }); qc.invalidateQueries({ queryKey: ["bajas"] }) }} />
      )}
      {nota && c && (
        <NotaDialog comprobanteId={c.id} tipo={nota} onClose={() => setNota(null)}
          onCreada={(nid) => { setNota(null); qc.invalidateQueries({ queryKey: ["comprobantes"] }); qc.invalidateQueries({ queryKey: ["comprobante"] }); onVer(nid) }} />
      )}
    </Sheet>
  )
}
