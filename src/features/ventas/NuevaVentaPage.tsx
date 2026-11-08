import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CheckIcon, ChevronsUpDownIcon, CircleAlertIcon, FileTextIcon, PackagePlusIcon, PlusIcon, ReceiptTextIcon, SendIcon, Trash2Icon, UserPlusIcon, XIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { soles, useDebounced } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { ProductoImagen } from "@/components/shared/ProductoImagen"
import { useAuth } from "@/features/auth/auth-context"
import { ClienteDialog, type ClienteDto } from "@/features/clientes/ClientesPage"
import type { ProductoDto } from "@/features/productos/ProductosPage"
import { useCatalogos } from "@/features/tributos/ConfiguracionTributariaPage"
import { useEstadoCaja } from "@/features/caja/caja.api"
import { PagosEditor, pagoInicial, pagosParaApi, type PagoForm } from "@/features/caja/PagosEditor"
import { api, toApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

interface SerieDto { id: number; tipo_documento: string; serie: string; siguiente_numero: string; activo: boolean; predeterminada: boolean; sincronizado: boolean }
/** Serie con el establecimiento al que pertenece (la venta debe salir del local de la caja abierta). */
interface SerieLocal extends SerieDto { establecimiento_id: number; local: string }
interface Linea {
  key: string
  producto_id: number | null
  codigo: string | null
  descripcion: string
  unidad: string
  cantidad: string
  precio: string
  valor_referencial: string
  tip_afe_igv: string
  descuento: string
}
interface Cuota { monto: string; fecha: string }
interface CotizacionParaVenta {
  id: number; codigo: string; estado: string; convertible: boolean; total: number; observacion: string | null
  cliente: { id: number | null }
  items: { producto_id: number | null; codigo: string | null; descripcion: string; unidad: string; cantidad: number; precio_unitario: number; tip_afe_igv: string; descuento: number }[]
}
interface Preview {
  items: { total: string; igv: string; base: string; gratuito: boolean }[]
  totales: Record<string, string>
  tasa_igv: number
}

const uid = () => crypto.randomUUID()
const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date())
const sumarMeses = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00")
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

const ETIQUETAS: [string, string][] = [
  ["gravadas", "Op. gravadas"], ["exoneradas", "Op. exoneradas"], ["inafectas", "Op. inafectas"], ["exportacion", "Exportación"],
  ["gratuitas", "Op. gratuitas"], ["descuentos_globales", "Descuento global"], ["igv", "IGV"], ["isc", "ISC"], ["icbper", "ICBPER"],
]

export function NuevaVentaPage() {
  const { empresa, puede } = useAuth()
  const navigate = useNavigate()
  const cat = useCatalogos()
  const [params] = useSearchParams()
  const cotizacionId = params.get("cotizacion")
  const [tipo, setTipo] = useState<"01" | "03">("01")
  const [serieId, setSerieId] = useState<string>("")
  const [cliente, setCliente] = useState<ClienteDto | null>(null)
  const [nuevoCliente, setNuevoCliente] = useState(false)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [descuentoGlobal, setDescuentoGlobal] = useState("")
  const [formaPago, setFormaPago] = useState<"contado" | "credito">("contado")
  // Envío de la boleta: null = el modo por defecto configurado en la empresa (Resumen diario).
  const [envioElegido, setEnvioElegido] = useState<"individual" | "resumen" | null>(null)
  const envioBoleta = envioElegido ?? empresa?.envio_boletas ?? "individual"
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [observacion, setObservacion] = useState("")
  const [pagos, setPagos] = useState<PagoForm[] | null>(null) // null = un pago en efectivo por el total

  // ---- Venta desde una cotización: precarga cliente, ítems (con el precio cotizado) y observación ----
  const desdeCotizacion = useQuery({
    queryKey: ["cotizacion-para-venta", empresa?.id, cotizacionId],
    enabled: !!empresa && !!cotizacionId,
    queryFn: async () => {
      const c = (await api.get<{ data: CotizacionParaVenta }>(`/cotizaciones/${cotizacionId}`)).data.data
      const cli = c.cliente.id ? (await api.get<{ data: ClienteDto }>(`/clientes/${c.cliente.id}`)).data.data : null
      return { c, cli }
    },
  })
  // Se aplica una sola vez por cotización, durante el render (patrón de React para derivar estado de datos recibidos).
  const [precargada, setPrecargada] = useState<string | null>(null)
  const d = desdeCotizacion.data
  if (d && cotizacionId && precargada !== cotizacionId) {
    setPrecargada(cotizacionId)
    setCliente(d.cli)
    setTipo(d.cli?.tipo_documento === "6" ? "01" : "03")
    setLineas(d.c.items.map((i) => ({
      key: uid(), producto_id: i.producto_id, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, cantidad: String(i.cantidad),
      precio: String(i.precio_unitario), valor_referencial: String(i.precio_unitario), tip_afe_igv: i.tip_afe_igv, descuento: i.descuento > 0 ? String(i.descuento) : "",
    })))
    if (d.c.observacion) setObservacion(d.c.observacion)
  }
  const caja = useEstadoCaja()
  const operaCaja = puede("caja.operar")
  const sesion = caja.data?.sesion ?? null
  const idempotency = useRef(uid())

  const series = useQuery({
    queryKey: ["establecimientos", empresa?.id],
    enabled: !!empresa,
    queryFn: async () => (await api.get<{ data: { establecimientos: { id: number; nombre: string; cod_local: string; series: SerieDto[] }[] } }>("/establecimientos")).data.data,
    select: (d) => d.establecimientos.flatMap((e) => e.series.map((s): SerieLocal => ({ ...s, establecimiento_id: e.id, local: `${e.cod_local} · ${e.nombre}` })))
      .filter((s) => s.activo && s.sincronizado),
  })
  // Con caja abierta solo se ofrecen las series del establecimiento de esa caja (el backend lo exige al cobrar).
  const estCaja = sesion?.caja.establecimiento_id ?? null
  const seriesTipo = useMemo(
    () => (series.data ?? []).filter((s) => s.tipo_documento === tipo && (estCaja === null || s.establecimiento_id === estCaja)),
    [series.data, tipo, estCaja],
  )
  const otrasSeries = !!estCaja && seriesTipo.length === 0 && (series.data ?? []).some((s) => s.tipo_documento === tipo)
  useEffect(() => {
    if (!seriesTipo.some((s) => String(s.id) === serieId)) {
      const elegida = seriesTipo.find((s) => s.predeterminada) ?? seriesTipo[0]
      setSerieId(elegida ? String(elegida.id) : "")
    }
  }, [seriesTipo, serieId])
  useEffect(() => {
    if (tipo === "03") setFormaPago("contado")
  }, [tipo])

  const afectaciones = (cat.data?.afectaciones_igv ?? []).filter((a) => a.activo)
  const esGratuita = (c: string) => !!afectaciones.find((a) => a.codigo === c)?.es_gratuito

  // ---- Vista previa calculada por el backend (motor validado) ----
  const validas = lineas.filter((l) => Number(l.cantidad) > 0 && (l.producto_id || l.descripcion.trim()))
  const posicion = new Map(validas.map((l, j) => [l.key, j]))
  const cuerpoItems = validas
    .map((l) => ({
      producto_id: l.producto_id ?? undefined,
      descripcion: l.producto_id ? undefined : l.descripcion,
      cantidad: Number(l.cantidad),
      precio_unitario: esGratuita(l.tip_afe_igv) ? 0 : Number(l.precio || 0),
      mto_valor_unitario: esGratuita(l.tip_afe_igv) ? Number(l.valor_referencial || 0) || undefined : undefined,
      tip_afe_igv: l.tip_afe_igv,
      descuento: Number(l.descuento) > 0 ? Number(l.descuento) : undefined,
    }))
  const cuerpoPreview = useDebounced(JSON.stringify({ items: cuerpoItems, descuento_global: Number(descuentoGlobal) > 0 ? Number(descuentoGlobal) : undefined }), 350)
  const preview = useQuery({
    queryKey: ["preview", empresa?.id, cuerpoPreview],
    enabled: cuerpoItems.length > 0 && !!empresa,
    retry: false,
    queryFn: async () => (await api.post<{ data: Preview }>("/ventas/preview", JSON.parse(cuerpoPreview))).data.data,
  })
  const total = preview.data?.totales.total ?? "0.00"
  const filasPago = pagos ?? [pagoInicial(Number(total))]
  const cobrarAhora = formaPago === "contado" && operaCaja && !!sesion

  const emitir = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: { comprobante: { id: number; numero: string } }; message: string }>("/ventas", {
        idempotency_key: idempotency.current,
        tipo_documento: tipo,
        envio_boleta: tipo === "03" ? envioBoleta : undefined,
        serie_id: Number(serieId),
        cliente_id: cliente?.id ?? null,
        cotizacion_id: desdeCotizacion.data?.c.convertible ? desdeCotizacion.data.c.id : undefined,
        moneda: "PEN",
        forma_pago: formaPago,
        cuotas: formaPago === "credito" ? cuotas.map((c) => ({ monto: Number(c.monto), fecha_vencimiento: c.fecha })) : undefined,
        descuento_global: Number(descuentoGlobal) > 0 ? Number(descuentoGlobal) : undefined,
        observacion: observacion || undefined,
        pagos: cobrarAhora ? pagosParaApi(filasPago) : undefined,
        items: cuerpoItems,
      })).data,
    onSuccess: (r) => {
      toast.success(r.message)
      idempotency.current = uid()
      setPagos(null)
      navigate(`/comprobantes?ver=${r.data.comprobante.id}`)
    },
    onError: (e) => {
      const err = toApiError(e)
      toast.error(Object.values(err.errors)[0]?.[0] ?? err.message)
    },
  })

  if (!puede("comprobantes.emitir")) {
    return <Alert><CircleAlertIcon /><AlertTitle>Sin permiso para emitir comprobantes</AlertTitle></Alert>
  }

  const agregarProducto = (p: ProductoDto) => {
    setLineas((ls) => {
      const existe = ls.find((l) => l.producto_id === p.id && !esGratuita(l.tip_afe_igv))
      if (existe) return ls.map((l) => (l === existe ? { ...l, cantidad: String(Number(l.cantidad) + 1) } : l))
      return [...ls, {
        key: uid(), producto_id: p.id, codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad, cantidad: "1",
        precio: String(p.precio_venta), valor_referencial: String(p.precio_venta), tip_afe_igv: p.tip_afe_igv, descuento: "",
      }]
    })
  }
  const agregarLibre = () =>
    setLineas((ls) => [...ls, { key: uid(), producto_id: null, codigo: null, descripcion: "", unidad: "NIU", cantidad: "1", precio: "", valor_referencial: "", tip_afe_igv: "10", descuento: "" }])
  const cambiar = (key: string, patch: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const quitar = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key))

  const repartirCuotas = (n: number) => {
    const t = Number(total)
    const base = Math.floor((t / n) * 100) / 100
    const hoy = hoyLima()
    setCuotas(Array.from({ length: n }, (_, i) => ({
      monto: (i === n - 1 ? t - base * (n - 1) : base).toFixed(2),
      fecha: sumarMeses(hoy, i + 1),
    })))
  }
  const sumaCuotas = cuotas.reduce((s, c) => s + Number(c.monto || 0), 0)

  const bloqueos: string[] = []
  if (!serieId) bloqueos.push(otrasSeries
    ? `El establecimiento de tu caja (${sesion?.caja.establecimiento ?? sesion?.caja.nombre}) no tiene series de ${tipo === "01" ? "factura" : "boleta"}. Créala en Configuración → Locales y series, o abre una caja de otro local.`
    : `No hay series de ${tipo === "01" ? "factura" : "boleta"} activas y sincronizadas.`)
  if (tipo === "01" && !cliente) bloqueos.push("La factura requiere un cliente con RUC.")
  if (tipo === "01" && cliente && cliente.tipo_documento !== "6" && !lineas.every((l) => l.tip_afe_igv === "40")) bloqueos.push("La factura requiere un cliente con RUC; para DNI emite una boleta.")
  if (tipo === "03" && (!cliente || cliente.tipo_documento === "0") && Number(total) >= 700) bloqueos.push("Las boletas desde S/ 700 deben identificar al comprador.")
  if (cuerpoItems.length === 0) bloqueos.push("Agrega al menos un ítem.")
  if (preview.isError) bloqueos.push(Object.values(toApiError(preview.error).errors)[0]?.[0] ?? toApiError(preview.error).message)
  if (formaPago === "credito" && (cuotas.length === 0 || Math.abs(sumaCuotas - Number(total)) > 0.001)) bloqueos.push("La suma de las cuotas debe ser igual al total.")
  if (formaPago === "contado" && operaCaja && !caja.isLoading && !sesion) bloqueos.push("Abre tu caja para cobrar la venta.")
  if (cobrarAhora && Math.abs(filasPago.reduce((s, p) => s + Number(p.monto || 0), 0) - Number(total)) > 0.001) bloqueos.push("Los pagos deben cubrir exactamente el total.")

  const serieSel = seriesTipo.find((s) => String(s.id) === serieId)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader title="Nueva venta" description="Los impuestos los calcula el servidor con el motor validado contra SUNAT; el comprobante se envía automáticamente." />
      {desdeCotizacion.data && (
        <Alert variant={desdeCotizacion.data.c.convertible ? "default" : "destructive"}>
          <FileTextIcon />
          <AlertTitle>Venta desde la cotización {desdeCotizacion.data.c.codigo}</AlertTitle>
          <AlertDescription>
            {desdeCotizacion.data.c.convertible
              ? `Se cargaron el cliente y los ${desdeCotizacion.data.c.items.length} ítems con los precios cotizados (total cotizado ${soles(desdeCotizacion.data.c.total)}). Al emitir, la cotización quedará como convertida.`
              : `La cotización está ${desdeCotizacion.data.c.estado}: puedes vender con estos datos, pero no quedará vinculada.`}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Comprobante y cliente</CardTitle>
              <CardAction>
                <Tabs value={tipo} onValueChange={(v) => setTipo(v as "01" | "03")}>
                  <TabsList>
                    <TabsTrigger value="01">Factura</TabsTrigger>
                    <TabsTrigger value="03">Boleta</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
                  <Field>
                    <FieldLabel>Serie</FieldLabel>
                    {series.isLoading ? <Skeleton className="h-9" /> : (
                      <Select value={serieId} onValueChange={setSerieId} disabled={seriesTipo.length === 0}>
                        <SelectTrigger aria-label="Serie"><SelectValue placeholder="Sin series" /></SelectTrigger>
                        <SelectContent>{seriesTipo.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.serie}{!estCaja && <span className="text-muted-foreground"> · {s.local}</span>}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                    {serieSel && (
                      <FieldDescription>
                        Siguiente: <span className="tabular-nums">{serieSel.siguiente_numero}</span>
                        {estCaja ? <> · local de tu caja ({serieSel.local})</> : <> · {serieSel.local}</>}
                      </FieldDescription>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel>Cliente</FieldLabel>
                    <div className="flex gap-2">
                      <ClienteCombobox value={cliente} onChange={setCliente} placeholder={tipo === "03" ? "Consumidor final (opcional)" : "Buscar cliente con RUC…"} />
                      {puede("clientes.crear") && (
                        <Button type="button" variant="success" size="icon" aria-label="Registrar cliente" onClick={() => setNuevoCliente(true)}><UserPlusIcon /></Button>
                      )}
                    </div>
                    {cliente && <FieldDescription className="truncate">{cliente.tipo_documento === "6" ? "RUC" : "Doc."} {cliente.numero_documento}{cliente.direccion ? ` · ${cliente.direccion}` : ""}</FieldDescription>}
                    {!cliente && tipo === "03" && <FieldDescription>Sin cliente se emite a “CONSUMIDOR FINAL” (solo menos de S/ 700).</FieldDescription>}
                  </Field>
                </div>
                {tipo === "03" && (
                  <Field>
                    <FieldLabel>Envío a SUNAT</FieldLabel>
                    <Tabs value={envioBoleta} onValueChange={(v) => setEnvioElegido(v as "individual" | "resumen")}>
                      <TabsList>
                        <TabsTrigger value="individual">Individual</TabsTrigger>
                        <TabsTrigger value="resumen">Resumen diario</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <FieldDescription>
                      {envioBoleta === "individual"
                        ? "La boleta se envía a SUNAT al emitirse y queda aceptada en segundos."
                        : "La boleta se registra ahora y se informa a SUNAT en el resumen diario del día siguiente (envío automático a las 00:15)."}
                    </FieldDescription>
                  </Field>
                )}
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ítems</CardTitle>
              <CardDescription>Precios con impuestos incluidos. La afectación se toma del producto y puede cambiarse por ítem.</CardDescription>
              <CardAction className="flex gap-2">
                <ProductoCombobox onSelect={agregarProducto} />
                <Button variant="outline" onClick={agregarLibre}><PlusIcon /> Ítem libre</Button>
              </CardAction>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {lineas.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                  <PackagePlusIcon className="size-8" /> Busca un producto o agrega un ítem libre.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-56">Descripción</TableHead>
                      <TableHead className="w-24">Cant.</TableHead>
                      <TableHead className="w-28">Precio</TableHead>
                      <TableHead className="w-44">Afectación</TableHead>
                      <TableHead className="w-24">Dscto.</TableHead>
                      <TableHead className="w-28 text-right">Importe</TableHead>
                      <TableHead className="w-10"><span className="sr-only">Quitar</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineas.map((l) => {
                      const grat = esGratuita(l.tip_afe_igv)
                      const pos = posicion.get(l.key)
                      const calc = pos !== undefined ? preview.data?.items[pos] : undefined
                      return (
                        <TableRow key={l.key}>
                          <TableCell>
                            {l.producto_id ? (
                              <div><div className="font-medium">{l.descripcion}</div><div className="tabular-nums text-xs text-muted-foreground">{l.codigo} · {l.unidad}</div></div>
                            ) : (
                              <Input value={l.descripcion} placeholder="Descripción" aria-label="Descripción del ítem" onChange={(e) => cambiar(l.key, { descripcion: e.target.value })} />
                            )}
                          </TableCell>
                          <TableCell><Input inputMode="decimal" className="tabular-nums" aria-label="Cantidad" value={l.cantidad} onChange={(e) => cambiar(l.key, { cantidad: e.target.value })} /></TableCell>
                          <TableCell>
                            {grat ? (
                              <Input inputMode="decimal" className="tabular-nums" aria-label="Valor referencial" title="Valor referencial (operación gratuita)" placeholder="Valor ref." value={l.valor_referencial} onChange={(e) => cambiar(l.key, { valor_referencial: e.target.value })} />
                            ) : (
                              <Input inputMode="decimal" className="tabular-nums" aria-label="Precio unitario" value={l.precio} onChange={(e) => cambiar(l.key, { precio: e.target.value })} />
                            )}
                          </TableCell>
                          <TableCell>
                            <Select value={l.tip_afe_igv} onValueChange={(v) => cambiar(l.key, { tip_afe_igv: v })}>
                              <SelectTrigger aria-label="Afectación del IGV" className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>{afectaciones.map((a) => <SelectItem key={a.codigo} value={a.codigo}>{a.codigo} · {a.descripcion}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Input inputMode="decimal" className="tabular-nums" aria-label="Descuento" disabled={grat} value={l.descuento} onChange={(e) => cambiar(l.key, { descuento: e.target.value })} /></TableCell>
                          <TableCell className="text-right tabular-nums">
                            {calc ? (calc.gratuito ? <Badge variant="secondary">Gratuito</Badge> : soles(Number(calc.total))) : "—"}
                          </TableCell>
                          <TableCell><Button variant="destructive" size="icon" aria-label="Quitar ítem" onClick={() => quitar(l.key)}><Trash2Icon /></Button></TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pago</CardTitle></CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>Forma de pago</FieldLabel>
                    <Select value={formaPago} onValueChange={(v) => { setFormaPago(v as "contado" | "credito"); if (v === "credito" && cuotas.length === 0) repartirCuotas(1) }}>
                      <SelectTrigger aria-label="Forma de pago"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contado">Contado</SelectItem>
                        <SelectItem value="credito" disabled={tipo !== "01"}>Crédito con cuotas{tipo !== "01" && " (solo factura)"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="dg">Descuento global (afecta la base)</FieldLabel>
                    <Input id="dg" inputMode="decimal" className="tabular-nums" placeholder="0.00" value={descuentoGlobal} onChange={(e) => setDescuentoGlobal(e.target.value)} />
                    <FieldDescription>Monto sin IGV, como en el ejemplo “Factura descuento global”.</FieldDescription>
                  </Field>
                </div>
                {formaPago === "contado" && operaCaja && (
                  sesion ? (
                    <Field>
                      <FieldLabel>Cobro ({sesion.caja.nombre})</FieldLabel>
                      <PagosEditor pagos={filasPago} onChange={setPagos} metodos={caja.data?.metodos ?? []} objetivo={Number(total)} exacto />
                    </Field>
                  ) : !caja.isLoading && (
                    <Alert><CircleAlertIcon /><AlertTitle>No tienes una caja abierta</AlertTitle><AlertDescription><p>Para cobrar la venta <Link className="underline underline-offset-4" to="/caja">abre tu caja</Link>.</p></AlertDescription></Alert>
                  )
                )}
                {formaPago === "contado" && !operaCaja && (
                  <FieldDescription>Tu rol no opera caja: la venta quedará pendiente de cobro en Cuentas por cobrar.</FieldDescription>
                )}
                {formaPago === "credito" && (
                  <div className="flex flex-col gap-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Cuotas</span>
                      {[1, 2, 3, 6].map((n) => <Button key={n} type="button" size="sm" variant="outline" onClick={() => repartirCuotas(n)}>{n}</Button>)}
                      <span className={cn("ml-auto tabular-nums text-sm", Math.abs(sumaCuotas - Number(total)) > 0.001 && "text-destructive")}>
                        {soles(sumaCuotas)} / {soles(Number(total))}
                      </span>
                    </div>
                    {cuotas.map((c, i) => (
                      <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                        <span className="w-6 text-sm text-muted-foreground">{i + 1}</span>
                        <Input inputMode="decimal" className="tabular-nums" aria-label={`Monto cuota ${i + 1}`} value={c.monto} onChange={(e) => setCuotas((cs) => cs.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} />
                        <Input type="date" aria-label={`Vencimiento cuota ${i + 1}`} value={c.fecha} onChange={(e) => setCuotas((cs) => cs.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))} />
                        <Button type="button" variant="destructive" size="icon" aria-label="Quitar cuota" onClick={() => setCuotas((cs) => cs.filter((_, j) => j !== i))}><XIcon /></Button>
                      </div>
                    ))}
                  </div>
                )}
                <Field>
                  <FieldLabel htmlFor="obs">Observación interna</FieldLabel>
                  <Textarea id="obs" rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ReceiptTextIcon className="size-4" />Resumen</CardTitle>
            <CardDescription>
              {tipo === "01" ? "Factura" : "Boleta"} {serieSel?.siguiente_numero ?? ""}
              {preview.data && ` · IGV ${preview.data.tasa_igv}%`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {preview.isFetching && !preview.data && <Skeleton className="h-24" />}
            {ETIQUETAS.filter(([k]) => Number(preview.data?.totales[k] ?? 0) !== 0).map(([k, label]) => (
              <div key={k} className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{soles(Number(preview.data!.totales[k]))}</span></div>
            ))}
            <Separator className="my-1" />
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Total</span>
              <span className="tabular-nums text-2xl font-semibold">{soles(Number(total))}</span>
            </div>
            {bloqueos.length > 0 && cuerpoItems.length > 0 && (
              <Alert variant="destructive" className="mt-2">
                <CircleAlertIcon />
                <AlertDescription>{bloqueos.map((b) => <p key={b}>{b}</p>)}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button className="w-full" size="lg" disabled={bloqueos.length > 0 || emitir.isPending || preview.isFetching} onClick={() => emitir.mutate()}>
              {emitir.isPending ? <Spinner /> : <SendIcon />} Emitir {tipo === "01" ? "factura" : "boleta"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {nuevoCliente && <ClienteDialog cliente={null} onClose={() => setNuevoCliente(false)} onSaved={(c) => setCliente(c)} />}
    </div>
  )
}

export function ClienteCombobox({ value, onChange, placeholder }: { value: ClienteDto | null; onChange: (c: ClienteDto | null) => void; placeholder: string }) {
  const { empresa } = useAuth()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const qd = useDebounced(q)
  const res = useQuery({
    queryKey: ["clientes-buscar", empresa?.id, qd],
    enabled: open,
    queryFn: async () => (await api.get<{ data: ClienteDto[] }>("/clientes", { params: { q: qd || undefined, por_pagina: 10, activo: 1 } })).data.data,
  })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="flex-1 justify-between font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? value.razon_social : placeholder}</span>
          {value ? <XIcon className="opacity-60" aria-label="Quitar cliente" onClick={(e) => { e.stopPropagation(); onChange(null) }} /> : <ChevronsUpDownIcon className="opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="RUC, DNI o nombre…" value={q} onValueChange={setQ} />
          <CommandList>
            {res.isFetching && <div className="flex justify-center p-3"><Spinner /></div>}
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {res.data?.map((c) => (
                <CommandItem key={c.id} value={String(c.id)} onSelect={() => { onChange(c); setOpen(false) }}>
                  <CheckIcon className={cn(value?.id === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="tabular-nums text-xs">{c.numero_documento}</span>
                  <span className="truncate">{c.razon_social}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function ProductoCombobox({ onSelect }: { onSelect: (p: ProductoDto) => void }) {
  const { empresa } = useAuth()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const qd = useDebounced(q)
  const res = useQuery({
    queryKey: ["productos-buscar", empresa?.id, qd],
    enabled: open,
    queryFn: async () => (await api.get<{ data: ProductoDto[] }>("/productos", { params: { q: qd || undefined, por_pagina: 10, activo: 1 } })).data.data,
  })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button><PackagePlusIcon /> Agregar producto</Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Código, código de barras o descripción…" value={q} onValueChange={setQ} />
          <CommandList>
            {res.isFetching && <div className="flex justify-center p-3"><Spinner /></div>}
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {res.data?.map((p) => (
                <CommandItem key={p.id} value={String(p.id)} onSelect={() => { onSelect(p); setOpen(false); setQ("") }}>
                  <ProductoImagen url={p.imagen_url} alt={p.descripcion} className="size-9" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{p.descripcion}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">{p.codigo} · afect. {p.tip_afe_igv}</span>
                  </div>
                  <span className="tabular-nums text-sm">{soles(p.precio_venta)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
