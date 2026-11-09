import { useMemo, useRef, useState } from "react"
import { SeccionesModal, usePaginaLocal } from "@/components/shared/SeccionesModal"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BanIcon, CheckCircle2Icon, ClockIcon, FileArchiveIcon, FileCodeIcon, FileTextIcon, PlusIcon, ReceiptIcon, RotateCwIcon, SearchIcon, ShoppingBasketIcon, Trash2Icon, XCircleIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Buscador, Paginador, soles, useDebounced, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { useCatalogos } from "@/features/tributos/ConfiguracionTributariaPage"
import { api, toApiError } from "@/lib/api"
import { descargarArchivo } from "@/lib/descargas"

type Estado = "por_enviar" | "enviado" | "aceptado" | "rechazado" | "error" | "revertido"
interface Liquidacion {
  id: number; numero: string; fecha_emision: string; vendedor: { tipo_doc: string; num_doc: string; nombre: string }
  valor_venta: number; igv: number; renta: number; neto_a_pagar: number; monto_pagado: number; estado_pago: string; estado: Estado
  sunat_codigo: string | null; sunat_descripcion: string | null; ultimo_error: string | null
  reversion: { estado: string; causal: string | null; motivo: string | null; identifier: string | null; error: string | null } | null
  tiene_archivos: boolean
}
interface Detalle extends Liquidacion {
  vendedor_direccion: string; lugar_direccion: string; productos_agropecuarios: boolean; porcentaje_renta: number
  items: { descripcion: string; cantidad: number; valor_unitario: number; unidad: string; tip_afe_igv: string; cod_producto_sunat?: string }[]
  observacion: string | null; sunat_notas: string[]; historial: { fecha: string; estado: string; detalle: string | null }[]; revertible: boolean
}
interface Opciones {
  series: { id: number; serie: string; siguiente: string; predeterminada: boolean; direccion: string | null; ubigeo: string | null }[]
  tasa_igv: number
  causales: { codigo: string; descripcion: string }[]
}
interface Pagos { pagos: { id: number; metodo: string; monto: number; referencia: string | null }[]; estado_pago: string; monto_pagado: number; total_documento: number }
interface Reporte { liquidaciones: { id: number; numero: string; fecha_emision: string; vendedor: { nombre: string }; igv_retenido: number; renta_retenida: number; neto_pagado_vendedor: number }[]; totales: { cantidad: number; igv_retenido: number; renta_retenida: number; neto_pagado_vendedor: number } }

const PENDIENTES: Estado[] = ["por_enviar", "enviado"]
const FINALES: Estado[] = ["aceptado", "rechazado", "revertido"]
const METODOS = ["efectivo", "transferencia", "yape", "plin", "tarjeta", "cheque", "otro"]
const AFECTACIONES = [{ c: "10", l: "Gravado" }, { c: "20", l: "Exonerado" }, { c: "30", l: "Inafecto" }]
const uid = () => crypto.randomUUID()
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const errorDe = (e: unknown) => Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message

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

const formatos = (l: Liquidacion): ("pdf" | "xml" | "cdr")[] => (!l.tiene_archivos ? [] : ["pdf", "xml", ...(FINALES.includes(l.estado) ? (["cdr"] as const) : [])])
const descargar = (l: Liquidacion, t: "pdf" | "xml" | "cdr") => descargarArchivo(`/liquidaciones/${l.id}/archivos/${t}`, `${l.numero}.${t === "cdr" ? "zip" : t}`)
const Icono = ({ t }: { t: "pdf" | "xml" | "cdr" }) => (t === "pdf" ? <FileTextIcon /> : t === "xml" ? <FileCodeIcon /> : <FileArchiveIcon />)

export function LiquidacionesPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const [vista, setVista] = useState<"lista" | "reporte">("lista")
  const [q, setQ] = useState("")
  const [pagina, setPagina] = useState(1)
  const [nueva, setNueva] = useState(false)
  const [verId, setVerId] = useState<number | null>(null)
  const qd = useDebounced(q)
  const lista = useQuery({
    queryKey: ["liquidaciones", empresa?.id, qd, pagina],
    enabled: !!empresa && vista === "lista",
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: Liquidacion[]; meta: MetaPaginacion }>("/liquidaciones", { params: { q: qd || undefined, page: pagina } })).data,
    refetchInterval: (query) => (query.state.data?.data.some((l) => PENDIENTES.includes(l.estado) || l.reversion?.estado === "enviado") ? 4000 : false),
  })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title="Liquidaciones de compra" actions={puede("liquidaciones.emitir") && <Button onClick={() => setNueva(true)}><PlusIcon /> Nueva liquidación</Button>} />
      <Tabs value={vista} onValueChange={(v) => setVista(v as typeof vista)}>
        <TabsList><TabsTrigger value="lista">Liquidaciones</TabsTrigger><TabsTrigger value="reporte">Retenciones del mes</TabsTrigger></TabsList>
      </Tabs>
      {vista === "reporte" ? <ReporteCard /> : (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Buscador value={q} onChange={(v) => { setQ(v); setPagina(1) }} placeholder="Número, DNI o nombre del vendedor" />
            {lista.isLoading ? <Skeleton className="h-40" /> : lista.isError ? (
              <Alert variant="destructive"><AlertDescription>{toApiError(lista.error).message}</AlertDescription></Alert>
            ) : lista.data?.data.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><ShoppingBasketIcon className="size-8" /> Aún no hay liquidaciones.</div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Neto a pagar</TableHead><TableHead>Estado</TableHead><TableHead className="w-32" /></TableRow></TableHeader>
                <TableBody>
                  {lista.data?.data.map((l) => (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => setVerId(l.id)}>
                      <TableCell><div className="tabular-nums font-medium">{l.numero}</div><div className="text-xs text-muted-foreground">{l.fecha_emision}</div></TableCell>
                      <TableCell className="max-w-64"><div className="truncate">{l.vendedor.nombre}</div><div className="tabular-nums text-xs text-muted-foreground">{l.vendedor.num_doc}</div></TableCell>
                      <TableCell className="text-right tabular-nums">{soles(l.valor_venta)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{soles(l.neto_a_pagar)}</TableCell>
                      <TableCell><EstadoBadge estado={l.estado} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {puede("comprobantes.descargar") && formatos(l).map((t) => <Button key={t} variant="info" size="icon" aria-label={`${t.toUpperCase()} de ${l.numero}`} onClick={() => descargar(l, t)}><Icono t={t} /></Button>)}
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
      )}
      {nueva && <NuevaDialog onClose={() => setNueva(false)} onCreada={(id) => { setNueva(false); qc.invalidateQueries({ queryKey: ["liquidaciones"] }); setVerId(id) }} />}
      <DetalleDialog id={verId} onClose={() => setVerId(null)} />
    </div>
  )
}

function ReporteCard() {
  const { empresa } = useAuth()
  const [periodo, setPeriodo] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date()).slice(0, 7))
  const r = useQuery({
    queryKey: ["liquidaciones-reporte", empresa?.id, periodo],
    enabled: !!empresa && /^\d{4}-\d{2}$/.test(periodo),
    queryFn: async () => (await api.get<{ data: Reporte }>("/liquidaciones/reporte-retenciones", { params: { periodo } })).data.data,
  })
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <Field className="sm:max-w-48"><FieldLabel htmlFor="liq-periodo">Periodo</FieldLabel><Input id="liq-periodo" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></Field>
        {r.isLoading ? <Skeleton className="h-32" /> : r.isError ? <Alert variant="destructive"><AlertDescription>{errorDe(r.error)}</AlertDescription></Alert> : r.data && (
          <Table>
            <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">IGV retenido</TableHead><TableHead className="text-right">Renta retenida</TableHead><TableHead className="text-right">Neto</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.data.liquidaciones.map((l) => (
                <TableRow key={l.id}><TableCell className="tabular-nums">{l.numero}</TableCell><TableCell>{l.vendedor.nombre}</TableCell><TableCell className="text-right tabular-nums">{soles(l.igv_retenido)}</TableCell><TableCell className="text-right tabular-nums">{soles(l.renta_retenida)}</TableCell><TableCell className="text-right tabular-nums">{soles(l.neto_pagado_vendedor)}</TableCell></TableRow>
              ))}
              <TableRow className="font-medium"><TableCell colSpan={2}>Total ({r.data.totales.cantidad})</TableCell><TableCell className="text-right tabular-nums">{soles(r.data.totales.igv_retenido)}</TableCell><TableCell className="text-right tabular-nums">{soles(r.data.totales.renta_retenida)}</TableCell><TableCell className="text-right tabular-nums">{soles(r.data.totales.neto_pagado_vendedor)}</TableCell></TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

interface ItemForm { key: string; descripcion: string; cod_producto_sunat: string; cantidad: string; valor_unitario: string; unidad: string; tip_afe_igv: string }
const itemVacio = (): ItemForm => ({ key: uid(), descripcion: "", cod_producto_sunat: "", cantidad: "1", valor_unitario: "", unidad: "NIU", tip_afe_igv: "10" })

function NuevaDialog({ onClose, onCreada }: { onClose: () => void; onCreada: (id: number) => void }) {
  const cat = useCatalogos()
  const op = useQuery({ queryKey: ["liquidaciones-opciones"], queryFn: async () => (await api.get<{ data: Opciones }>("/liquidaciones/opciones")).data.data })
  const [serieId, setSerieId] = useState("")
  const [agro, setAgro] = useState(false)
  const [v, setV] = useState({ tipo_doc: "1", num_doc: "", nombre: "", direccion: "", ubigeo: "" })
  const [lugar, setLugar] = useState<{ direccion: string; ubigeo: string } | null>(null)
  const [items, setItems] = useState<ItemForm[]>([itemVacio()])
  const [errores, setErrores] = useState<Record<string, string[]>>({})
  const [buscando, setBuscando] = useState(false)
  const idem = useRef(uid())
  const itemsPag = usePaginaLocal(items, 3, 1)
  const unidades = cat.data?.catalogos["03"] ?? []

  const serie = op.data?.series.find((s) => String(s.id) === serieId) ?? op.data?.series.find((s) => s.predeterminada) ?? op.data?.series[0]
  // Lugar de la operación: por defecto, el local de la serie (editable).
  const lug = lugar ?? { direccion: serie?.direccion ?? "", ubigeo: serie?.ubigeo ?? "" }
  const tot = useMemo(() => items.reduce((s, i) => {
    const b = r2((Number(i.cantidad) || 0) * (Number(i.valor_unitario) || 0))
    return { valor: s.valor + b, igv: s.igv + (i.tip_afe_igv === "10" ? r2((b * (op.data?.tasa_igv ?? 18)) / 100) : 0) }
  }, { valor: 0, igv: 0 }), [items, op.data?.tasa_igv])

  const buscar = async () => {
    if (v.tipo_doc !== "1" || !v.num_doc) return
    setBuscando(true)
    try {
      const { data } = await api.get<{ data: { cliente: { razon_social?: string; direccion?: string | null } } }>("/clientes/consultar-documento", { params: { tipo: "1", numero: v.num_doc } })
      setV((x) => ({ ...x, nombre: data.data.cliente.razon_social ?? x.nombre, direccion: data.data.cliente.direccion ?? x.direccion }))
    } catch (e) { toast.error(toApiError(e).message) } finally { setBuscando(false) }
  }
  const setItem = (i: number, k: keyof ItemForm, val: string) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: val } : x)))
  const emitir = useMutation({
    mutationFn: async () => (await api.post<{ data: Detalle; message: string }>("/liquidaciones", {
      idempotency_key: idem.current, serie_id: serie?.id, productos_agropecuarios: agro, vendedor: v, lugar: lug,
      items: items.map(({ descripcion, cod_producto_sunat, cantidad, valor_unitario, unidad, tip_afe_igv }) => ({ descripcion, cod_producto_sunat, cantidad: Number(cantidad), valor_unitario: Number(valor_unitario), unidad, tip_afe_igv })),
    })).data,
    onMutate: () => setErrores({}),
    onSuccess: (r) => { toast.success(r.message); onCreada(r.data.id) },
    onError: (e) => { setErrores(toApiError(e).errors); toast.error(errorDe(e)) },
  })
  const err = (k: string) => (errores[k] ? [{ message: errores[k][0] }] : [])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader><DialogTitle>Nueva liquidación de compra</DialogTitle><DialogDescription>Compra a una persona sin RUC.</DialogDescription></DialogHeader>
        {op.isLoading ? <Skeleton className="h-64" /> : op.data?.series.length === 0 ? (
          <Alert variant="destructive"><AlertTitle>No hay series de liquidación</AlertTitle><AlertDescription>Crea una serie con prefijo L en Configuración → Locales y series.</AlertDescription></Alert>
        ) : op.data && (
          <FieldGroup>
            <SeccionesModal secciones={[
{ id: "vendedor", label: "Vendedor", contenido: (<div className="flex flex-col gap-5">
<div className="flex flex-wrap items-end gap-6">
              <Field className="w-40">
                <FieldLabel>Serie</FieldLabel>
                <Select value={String(serie?.id ?? "")} onValueChange={setSerieId}><SelectTrigger aria-label="Serie"><SelectValue /></SelectTrigger><SelectContent>{op.data.series.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.serie}</SelectItem>)}</SelectContent></Select>
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={agro} onCheckedChange={setAgro} /> Productos agropecuarios</label>
            </div>
            <FieldSet>
              <FieldLegend variant="label">Vendedor</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-[7rem_11rem_1fr]">
                <Select value={v.tipo_doc} onValueChange={(t) => setV({ ...v, tipo_doc: t })}><SelectTrigger aria-label="Tipo de documento"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">DNI</SelectItem><SelectItem value="4">C. E.</SelectItem></SelectContent></Select>
                <div className="flex gap-2">
                  <Input aria-label="Número" className="tabular-nums" value={v.num_doc} aria-invalid={!!errores["vendedor.num_doc"]} onChange={(e) => setV({ ...v, num_doc: e.target.value.trim() })} onKeyDown={(e) => e.key === "Enter" && buscar()} />
                  <Button type="button" variant="outline" size="icon" aria-label="Buscar en RENIEC" disabled={buscando || v.tipo_doc !== "1"} onClick={buscar}>{buscando ? <Spinner /> : <SearchIcon />}</Button>
                </div>
                <Input aria-label="Nombre" placeholder="Nombre completo" value={v.nombre} aria-invalid={!!errores["vendedor.nombre"]} onChange={(e) => setV({ ...v, nombre: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <Input aria-label="Dirección del vendedor" placeholder="Dirección" value={v.direccion} aria-invalid={!!errores["vendedor.direccion"]} onChange={(e) => setV({ ...v, direccion: e.target.value })} />
                <Input aria-label="Ubigeo del vendedor" placeholder="Ubigeo" className="tabular-nums" maxLength={6} inputMode="numeric" value={v.ubigeo} aria-invalid={!!errores["vendedor.ubigeo"]} onChange={(e) => setV({ ...v, ubigeo: e.target.value.trim() })} />
              </div>
              <FieldError errors={[...err("vendedor.tipo_doc"), ...err("vendedor.num_doc"), ...err("vendedor.nombre"), ...err("vendedor.direccion"), ...err("vendedor.ubigeo")]} />
            </FieldSet>
</div>) },
{ id: "lugar", label: "Lugar", contenido: (<div className="flex flex-col gap-5">
            <FieldSet>
              <FieldLegend variant="label">Lugar de la operación</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <Input aria-label="Dirección de la operación" placeholder="Dirección" value={lug.direccion} aria-invalid={!!errores["lugar.direccion"]} onChange={(e) => setLugar({ ...lug, direccion: e.target.value })} />
                <Input aria-label="Ubigeo de la operación" placeholder="Ubigeo" className="tabular-nums" maxLength={6} inputMode="numeric" value={lug.ubigeo} aria-invalid={!!errores["lugar.ubigeo"]} onChange={(e) => setLugar({ ...lug, ubigeo: e.target.value.trim() })} />
              </div>
              <FieldError errors={[...err("lugar.direccion"), ...err("lugar.ubigeo")]} />
            </FieldSet>
            </div>) },
{ id: "bienes", label: "Bienes", contenido: (<div className="flex flex-col gap-5">
<FieldSet>
              <Table>
                <TableHeader><TableRow><TableHead>Descripción</TableHead><TableHead className="w-28">Cód. SUNAT</TableHead><TableHead className="w-36">Unidad</TableHead><TableHead className="w-24 text-right">Cantidad</TableHead><TableHead className="w-28 text-right">Valor unit.</TableHead><TableHead className="w-32">IGV</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                <TableBody>
                  {itemsPag.visibles.map((it, k) => { const i = itemsPag.offset + k; return (
                    <TableRow key={it.key}>
                      <TableCell><Input aria-label="Descripción" value={it.descripcion} aria-invalid={!!errores[`items.${i}.descripcion`]} onChange={(e) => setItem(i, "descripcion", e.target.value)} /></TableCell>
                      <TableCell><Input aria-label="Código SUNAT (catálogo 25)" placeholder="8 dígitos" className="tabular-nums" inputMode="numeric" maxLength={8} value={it.cod_producto_sunat} aria-invalid={!!errores[`items.${i}.cod_producto_sunat`]} onChange={(e) => setItem(i, "cod_producto_sunat", e.target.value.trim())} /></TableCell>
                      <TableCell><Select value={it.unidad} onValueChange={(u) => setItem(i, "unidad", u)}><SelectTrigger aria-label="Unidad"><SelectValue /></SelectTrigger><SelectContent>{unidades.map((u) => <SelectItem key={u.codigo} value={u.codigo}>{u.codigo} · {u.descripcion}</SelectItem>)}</SelectContent></Select></TableCell>
                      <TableCell><Input aria-label="Cantidad" className="text-right tabular-nums" inputMode="decimal" value={it.cantidad} aria-invalid={!!errores[`items.${i}.cantidad`]} onChange={(e) => setItem(i, "cantidad", e.target.value)} /></TableCell>
                      <TableCell><Input aria-label="Valor unitario" className="text-right tabular-nums" inputMode="decimal" value={it.valor_unitario} aria-invalid={!!errores[`items.${i}.valor_unitario`]} onChange={(e) => setItem(i, "valor_unitario", e.target.value)} /></TableCell>
                      <TableCell><Select value={it.tip_afe_igv} onValueChange={(a) => setItem(i, "tip_afe_igv", a)}><SelectTrigger aria-label="Afectación"><SelectValue /></SelectTrigger><SelectContent>{AFECTACIONES.map((a) => <SelectItem key={a.c} value={a.c}>{a.l}</SelectItem>)}</SelectContent></Select></TableCell>
                      <TableCell>{items.length > 1 && <Button variant="destructive" size="icon" aria-label="Quitar" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2Icon /></Button>}</TableCell>
                    </TableRow>
                  ) })}
                </TableBody>
              </Table>
              {itemsPag.pager}
              <FieldError errors={Object.keys(errores).filter((k) => k.startsWith("items")).slice(0, 1).flatMap(err)} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => { setItems([...items, itemVacio()]); itemsPag.irAlFinal() }}><PlusIcon /> Agregar</Button>
                <div className="flex w-full flex-col gap-1 rounded-lg bg-muted/40 p-3 text-sm sm:w-64">
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor de compra</span><span className="tabular-nums">{soles(r2(tot.valor))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IGV a retener</span><span className="tabular-nums">{soles(r2(tot.igv))}</span></div>
                </div>
              </div>
            </FieldSet>
          </div>) },
]} />
</FieldGroup>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={emitir.isPending || !serie || tot.valor <= 0} onClick={() => emitir.mutate()}>{emitir.isPending ? <Spinner data-icon="inline-start" /> : <ReceiptIcon />} Emitir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetalleDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { puede } = useAuth()
  const qc = useQueryClient()
  const [rev, setRev] = useState(false)
  const [causal, setCausal] = useState("producto")
  const [motivo, setMotivo] = useState("")
  const [pago, setPago] = useState({ metodo: "efectivo", monto: "", referencia: "" })
  const d = useQuery({
    queryKey: ["liquidacion", id],
    enabled: id !== null,
    queryFn: async () => (await api.get<{ data: Detalle }>(`/liquidaciones/${id}`)).data.data,
    refetchInterval: (q) => (q.state.data && (PENDIENTES.includes(q.state.data.estado) || q.state.data.reversion?.estado === "enviado") ? 3000 : false),
  })
  const l = d.data
  const bienesPag = usePaginaLocal(l?.items ?? [], 5, 2)
  const histPag = usePaginaLocal(l?.historial ?? [], 6, 5)
  const conApi = !!l?.tiene_archivos
  const faltan = l?.estado === "error" ? l.items.map((it, i) => ({ ...it, i })).filter((x) => !x.cod_producto_sunat) : []
  const faltanPag = usePaginaLocal(faltan, 2, 1)
  const [codigos, setCodigos] = useState<Record<number, string>>({})
  const codigosOk = faltan.every((x) => /^\d{8}$/.test(codigos[x.i] ?? ""))
  const pagos = useQuery({ queryKey: ["liquidacion-pagos", id], enabled: id !== null && conApi, queryFn: async () => (await api.get<{ data: Pagos }>(`/liquidaciones/${id}/pagos`)).data.data })
  const op = useQuery({ queryKey: ["liquidaciones-opciones"], enabled: rev, queryFn: async () => (await api.get<{ data: Opciones }>("/liquidaciones/opciones")).data.data })
  const puedeEmitir = puede("liquidaciones.emitir")
  const refrescar = (x?: Detalle) => { if (x) qc.setQueryData(["liquidacion", id], x); qc.invalidateQueries({ queryKey: ["liquidaciones"] }) }
  const reintentar = useMutation({ mutationFn: async () => (await api.post<{ data: Detalle; message: string }>(`/liquidaciones/${id}/reintentar`, faltan.length ? { codigos } : {})).data, onSuccess: (x) => { toast.success(x.message); refrescar(x.data) }, onError: (e) => toast.error(errorDe(e)) })
  const revertir = useMutation({ mutationFn: async () => (await api.post<{ data: Detalle; message: string }>(`/liquidaciones/${id}/revertir`, { causal, motivo })).data, onSuccess: (x) => { toast.success(x.message); refrescar(x.data); setRev(false); setMotivo("") }, onError: (e) => { toast.error(errorDe(e)); qc.invalidateQueries({ queryKey: ["liquidacion", id] }) } })
  const trasPago = (x: { data: Pagos; message: string }) => { toast.success(x.message); qc.setQueryData(["liquidacion-pagos", id], x.data); qc.invalidateQueries({ queryKey: ["liquidacion", id] }); refrescar() }
  const pagar = useMutation({ mutationFn: async () => (await api.post<{ data: Pagos; message: string }>(`/liquidaciones/${id}/pagos`, { metodo: pago.metodo, monto: Number(pago.monto), referencia: pago.referencia || null })).data, onSuccess: (x) => { trasPago(x); setPago({ metodo: "efectivo", monto: "", referencia: "" }) }, onError: (e) => toast.error(errorDe(e)) })
  const quitarPago = useMutation({ mutationFn: async (p: number) => (await api.delete<{ data: Pagos; message: string }>(`/liquidaciones/${id}/pagos/${p}`)).data, onSuccess: trasPago, onError: (e) => toast.error(errorDe(e)) })

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="p-4 pr-12"><DialogTitle className="tabular-nums">{l?.numero ?? "Liquidación"}</DialogTitle><DialogDescription>{l ? l.fecha_emision : "Cargando…"}</DialogDescription></DialogHeader>
        {d.isLoading && <div className="p-4"><Skeleton className="h-64" /></div>}
        {l && (
          <div className="flex flex-col gap-5 px-4 pb-6 text-sm">
            <SeccionesModal secciones={[
{ id: "resumen", label: "Resumen", contenido: (<div className="flex flex-col gap-5">
<div className="flex flex-wrap items-center gap-2"><EstadoBadge estado={l.estado} />{l.sunat_codigo && <Badge variant="outline">SUNAT {l.sunat_codigo}</Badge>}{l.productos_agropecuarios && <Badge variant="outline">Agropecuario</Badge>}</div>
            {l.sunat_descripcion && <p className="text-muted-foreground">{l.sunat_descripcion}</p>}
            {l.sunat_notas.map((n, i) => <Alert key={i}><AlertDescription>{n}</AlertDescription></Alert>)}
            {l.ultimo_error && <Alert variant="destructive"><XCircleIcon /><AlertDescription>{l.ultimo_error}</AlertDescription></Alert>}
            {l.reversion && <Alert variant={["error", "rechazado"].includes(l.reversion.estado) ? "destructive" : "default"}><BanIcon /><AlertTitle>Reversión {l.reversion.identifier ?? ""}: {l.reversion.estado}</AlertTitle><AlertDescription>{l.reversion.error ?? l.reversion.motivo}</AlertDescription></Alert>}
            {puedeEmitir && faltan.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Ingresa el código SUNAT (catálogo 25) de cada bien para reenviar</p>
                {faltanPag.visibles.map((x) => (
                  <div key={x.i} className="grid items-center gap-2 sm:grid-cols-[1fr_9rem]">
                    <span className="truncate text-sm">{x.descripcion}</span>
                    <Input aria-label={`Código SUNAT de ${x.descripcion}`} placeholder="8 dígitos" className="tabular-nums" inputMode="numeric" maxLength={8} value={codigos[x.i] ?? ""} onChange={(e) => setCodigos({ ...codigos, [x.i]: e.target.value.trim() })} />
                  </div>
                ))}
                {faltanPag.pager}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {puede("comprobantes.descargar") && formatos(l).map((t) => <Button key={t} variant="outline" size="sm" onClick={() => descargar(l, t)}><Icono t={t} /> {t.toUpperCase()}</Button>)}
              {puedeEmitir && (l.estado === "error" || l.estado === "enviado" || l.reversion?.estado === "enviado") && <Button size="sm" variant="warning" disabled={reintentar.isPending || !codigosOk} onClick={() => reintentar.mutate()}><RotateCwIcon /> {l.estado === "error" ? "Reenviar" : "Consultar estado"}</Button>}
              {puedeEmitir && l.revertible && <Button size="sm" variant="destructive" onClick={() => setRev(true)}><BanIcon /> Revertir</Button>}
            </div>
            <section><h3 className="mb-1 font-medium">Vendedor</h3><p>{l.vendedor.nombre}</p><p className="tabular-nums text-xs text-muted-foreground">{l.vendedor.num_doc} · {l.vendedor_direccion}</p></section>
            </div>) },
{ id: "bienes", label: "Bienes", contenido: (<div className="flex flex-col gap-5">
<Table>
              <TableHeader><TableRow><TableHead>Bien</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Valor unit.</TableHead></TableRow></TableHeader>
              <TableBody>{bienesPag.visibles.map((it, i) => <TableRow key={i}><TableCell>{it.descripcion}</TableCell><TableCell className="text-right tabular-nums">{it.cantidad} {it.unidad}</TableCell><TableCell className="text-right tabular-nums">{soles(it.valor_unitario)}</TableCell></TableRow>)}</TableBody>
            </Table>
            {bienesPag.pager}
            <section className="flex flex-col gap-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Valor de compra</span><span className="tabular-nums">{soles(l.valor_venta)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">IGV retenido</span><span className="tabular-nums">{soles(l.igv)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Renta retenida ({l.porcentaje_renta}%)</span><span className="tabular-nums">{soles(l.renta)}</span></div>
              <div className="flex justify-between font-medium"><span>Neto a pagar</span><span className="tabular-nums">{soles(l.neto_a_pagar)}</span></div>
            </section>
            </div>) },
{ id: "pagos", label: "Pagos", oculta: !conApi, contenido: (<div className="flex flex-col gap-5">
{conApi && pagos.data && (
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">Pagos al vendedor <span className="font-normal text-muted-foreground">· {pagos.data.estado_pago} · {soles(pagos.data.monto_pagado)} de {soles(pagos.data.total_documento)}</span></h3>
                {pagos.data.pagos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span className="capitalize">{p.metodo}{p.referencia ? ` · ${p.referencia}` : ""}</span>
                    <span className="flex items-center gap-2"><span className="tabular-nums">{soles(p.monto)}</span>{puedeEmitir && <Button variant="destructive" size="icon" aria-label="Eliminar pago" disabled={quitarPago.isPending} onClick={() => quitarPago.mutate(p.id)}><Trash2Icon /></Button>}</span>
                  </div>
                ))}
                {puedeEmitir && l.estado === "aceptado" && (
                  <div className="grid gap-2 sm:grid-cols-[9rem_8rem_1fr_auto]">
                    <Select value={pago.metodo} onValueChange={(m) => setPago({ ...pago, metodo: m })}><SelectTrigger aria-label="Método" className="capitalize"><SelectValue /></SelectTrigger><SelectContent>{METODOS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent></Select>
                    <Input aria-label="Monto" placeholder="Monto" className="text-right tabular-nums" inputMode="decimal" value={pago.monto} onChange={(e) => setPago({ ...pago, monto: e.target.value })} />
                    <Input aria-label="Referencia" placeholder="Referencia" value={pago.referencia} onChange={(e) => setPago({ ...pago, referencia: e.target.value })} />
                    <Button variant="success" disabled={!(Number(pago.monto) > 0) || pagar.isPending} onClick={() => pagar.mutate()}><PlusIcon /> Pagar</Button>
                  </div>
                )}
              </section>
            )}
            </div>) },
{ id: "historial", label: "Historial", contenido: (<div className="flex flex-col gap-5">
<Separator />
            <ol className="flex flex-col gap-3">
              {histPag.visibles.map((h, i) => <li key={i}><div className="flex items-center gap-2"><EstadoBadge estado={h.estado as Estado} /><span className="text-xs text-muted-foreground">{new Date(h.fecha).toLocaleString("es-PE")}</span></div>{h.detalle && <p className="mt-1 text-xs text-muted-foreground">{h.detalle}</p>}</li>)}
            </ol>
            {histPag.pager}
          </div>) },
]} />
</div>
        )}
        <Dialog open={rev} onOpenChange={(o) => !o && setRev(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Revertir {l?.numero}</DialogTitle><DialogDescription>Sin pagos registrados y dentro de los 5 días. No se puede deshacer.</DialogDescription></DialogHeader>
            <FieldGroup>
              <Field><FieldLabel>Causal</FieldLabel><Select value={causal} onValueChange={setCausal}><SelectTrigger aria-label="Causal"><SelectValue /></SelectTrigger><SelectContent>{op.data?.causales.map((c) => <SelectItem key={c.codigo} value={c.codigo}>{c.descripcion}</SelectItem>)}</SelectContent></Select></Field>
              <Field><FieldLabel htmlFor="liq-motivo">Motivo</FieldLabel><Input id="liq-motivo" maxLength={255} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
            </FieldGroup>
            <DialogFooter><Button variant="outline" onClick={() => setRev(false)}>Cancelar</Button><Button variant="destructive" disabled={motivo.trim().length < 5 || revertir.isPending} onClick={() => revertir.mutate()}>{revertir.isPending ? <Spinner data-icon="inline-start" /> : <BanIcon />} Revertir</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
