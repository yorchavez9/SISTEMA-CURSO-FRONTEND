import { useRef, useState } from "react"
import { SeccionesModal, usePaginaLocal } from "@/components/shared/SeccionesModal"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { PlusIcon, SearchIcon, Trash2Icon, TruckIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useCatalogos } from "@/features/tributos/ConfiguracionTributariaPage"
import { api, toApiError } from "@/lib/api"

interface Opciones {
  series_transportista: { id: number; serie: string; siguiente: string; predeterminada: boolean }[]
  motivos: { codigo: string; label: string }[]
}
const DOCS_RELACIONADOS = [{ c: "09", l: "Guía remitente" }, { c: "01", l: "Factura" }, { c: "03", l: "Boleta" }, { c: "50", l: "DAM" }, { c: "49", l: "DUA" }, { c: "52", l: "Otro" }]
const uid = () => crypto.randomUUID()
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date())
const conductorVacio = () => ({ key: uid(), tipo_doc: "1", num_doc: "", nombres: "", apellidos: "", licencia: "" })
const itemVacio = () => ({ key: uid(), descripcion: "", unidad: "NIU", cantidad: "1" })

/** Guía de remisión transportista (31): la emite quien presta el servicio de transporte. */
export function NuevaGuiaTransportistaDialog({ onClose, onCreada }: { onClose: () => void; onCreada: (id: number) => void }) {
  const cat = useCatalogos()
  const op = useQuery({ queryKey: ["guias-opciones-grt"], queryFn: async () => (await api.get<{ data: Opciones }>("/guias/opciones")).data.data })
  const [serieId, setSerieId] = useState("")
  const [motivo, setMotivo] = useState("01")
  const [fecha, setFecha] = useState(hoy())
  const [remitente, setRemitente] = useState({ tipo_doc: "6", num_doc: "", razon_social: "" })
  const [destinatario, setDestinatario] = useState({ tipo_doc: "6", num_doc: "", razon_social: "" })
  const [doc, setDoc] = useState({ tipo_codigo: "09", numero: "" })
  const [partida, setPartida] = useState({ ubigeo: "", direccion: "" })
  const [llegada, setLlegada] = useState({ ubigeo: "", direccion: "" })
  const [peso, setPeso] = useState("")
  const [bultos, setBultos] = useState("")
  const [vehiculo, setVehiculo] = useState({ placa: "", nro_circulacion: "" })
  const [conductores, setConductores] = useState([conductorVacio()])
  const [items, setItems] = useState([itemVacio()])
  const [errores, setErrores] = useState<Record<string, string[]>>({})
  const [buscando, setBuscando] = useState("")
  const idem = useRef(uid())
  const condPag = usePaginaLocal(conductores, 2, 1)
  const itemsPag = usePaginaLocal(items, 4, 2)

  const series = op.data?.series_transportista ?? []
  const serie = series.find((s) => String(s.id) === serieId) ?? series.find((s) => s.predeterminada) ?? series[0]
  const unidades = cat.data?.catalogos["03"] ?? []
  const inv = (k: string) => !!errores[k]
  const err = (...ks: string[]) => ks.flatMap((k) => (errores[k] ? [{ message: errores[k][0] }] : []))

  const buscar = async (quien: "r" | "d") => {
    const t = quien === "r" ? remitente : destinatario
    const set = quien === "r" ? setRemitente : setDestinatario
    if (!t.num_doc) return
    setBuscando(quien)
    try {
      const { data } = await api.get<{ data: { cliente: { razon_social?: string } } }>("/clientes/consultar-documento", { params: { tipo: t.tipo_doc, numero: t.num_doc } })
      set({ ...t, razon_social: data.data.cliente.razon_social ?? t.razon_social })
    } catch (e) { toast.error(toApiError(e).message) } finally { setBuscando("") }
  }
  const emitir = useMutation({
    mutationFn: async () => (await api.post<{ data: { id: number }; message: string }>("/guias/transportista", {
      idempotency_key: idem.current, serie_id: serie?.id, cod_traslado: motivo, fecha_traslado: fecha, remitente, destinatario,
      doc_relacionado: { ...doc, ruc_emisor: remitente.num_doc || undefined }, partida, llegada, peso_total: Number(peso), num_bultos: bultos ? Number(bultos) : undefined,
      vehiculo: { placa: vehiculo.placa, nro_circulacion: vehiculo.nro_circulacion || undefined },
      conductores: conductores.map(({ tipo_doc, num_doc, nombres, apellidos, licencia }) => ({ tipo_doc, num_doc, nombres, apellidos, licencia })),
      items: items.map(({ descripcion, unidad, cantidad }) => ({ descripcion, unidad, cantidad: Number(cantidad) })),
    })).data,
    onMutate: () => setErrores({}),
    onSuccess: (r) => { toast.success(r.message); onCreada(r.data.id) },
    onError: (e) => { const x = toApiError(e); setErrores(x.errors); toast.error(Object.values(x.errors)[0]?.[0] ?? x.message) },
  })

  const Parte = ({ titulo, v, set, pref, q }: { titulo: string; v: typeof remitente; set: (x: typeof remitente) => void; pref: string; q: "r" | "d" }) => (
    <FieldSet>
      <FieldLegend variant="label">{titulo}</FieldLegend>
      <div className="grid gap-3 sm:grid-cols-[6rem_11rem_1fr]">
        <Select value={v.tipo_doc} disabled={q === "r"} onValueChange={(t) => set({ ...v, tipo_doc: t })}><SelectTrigger aria-label={`Tipo de documento ${titulo}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="6">RUC</SelectItem><SelectItem value="1">DNI</SelectItem></SelectContent></Select>
        <div className="flex gap-2">
          <Input aria-label={`Documento ${titulo}`} className="tabular-nums" value={v.num_doc} aria-invalid={inv(`${pref}.num_doc`)} onChange={(e) => set({ ...v, num_doc: e.target.value.trim() })} />
          <Button type="button" variant="outline" size="icon" aria-label={`Buscar ${titulo}`} disabled={buscando === q} onClick={() => buscar(q)}>{buscando === q ? <Spinner /> : <SearchIcon />}</Button>
        </div>
        <Input aria-label={`Razón social ${titulo}`} placeholder="Razón social o nombre" value={v.razon_social} aria-invalid={inv(`${pref}.razon_social`)} onChange={(e) => set({ ...v, razon_social: e.target.value })} />
      </div>
      <FieldError errors={err(`${pref}.num_doc`, `${pref}.razon_social`)} />
    </FieldSet>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader><DialogTitle>Guía de transportista</DialogTitle><DialogDescription>Para quien presta el servicio de transporte.</DialogDescription></DialogHeader>
        {op.isLoading ? <Skeleton className="h-64" /> : series.length === 0 ? (
          <Alert variant="destructive"><AlertTitle>No hay series de transportista</AlertTitle><AlertDescription>Crea una serie con prefijo V en Configuración → Locales y series.</AlertDescription></Alert>
        ) : (
          <FieldGroup>
            <SeccionesModal secciones={[
{ id: "datos", label: "Datos", contenido: (<div className="flex flex-col gap-5">
<div className="grid gap-4 sm:grid-cols-3">
              <Field><FieldLabel>Serie</FieldLabel><Select value={String(serie?.id ?? "")} onValueChange={setSerieId}><SelectTrigger aria-label="Serie"><SelectValue /></SelectTrigger><SelectContent>{series.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.serie}</SelectItem>)}</SelectContent></Select></Field>
              <Field><FieldLabel>Motivo</FieldLabel><Select value={motivo} onValueChange={setMotivo}><SelectTrigger aria-label="Motivo"><SelectValue /></SelectTrigger><SelectContent>{op.data?.motivos.map((m) => <SelectItem key={m.codigo} value={m.codigo}>{m.label}</SelectItem>)}</SelectContent></Select></Field>
              <Field data-invalid={inv("fecha_traslado")}><FieldLabel htmlFor="grt-fecha">Fecha de traslado</FieldLabel><Input id="grt-fecha" type="date" min={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} /><FieldError errors={err("fecha_traslado")} /></Field>
            </div>
<FieldSet>
              <FieldLegend variant="label">Documento relacionado</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                <Select value={doc.tipo_codigo} onValueChange={(t) => setDoc({ ...doc, tipo_codigo: t })}><SelectTrigger aria-label="Tipo de documento relacionado"><SelectValue /></SelectTrigger><SelectContent>{DOCS_RELACIONADOS.map((d) => <SelectItem key={d.c} value={d.c}>{d.l}</SelectItem>)}</SelectContent></Select>
                <Input aria-label="Número del documento relacionado" className="tabular-nums" placeholder="T001-2" value={doc.numero} aria-invalid={inv("doc_relacionado.numero")} onChange={(e) => setDoc({ ...doc, numero: e.target.value })} />
              </div>
              <FieldError errors={err("doc_relacionado.numero")} />
            </FieldSet>
</div>) },
{ id: "partes", label: "Partes", contenido: (<div className="flex flex-col gap-5">
            {Parte({ titulo: "Remitente", v: remitente, set: setRemitente, pref: "remitente", q: "r" })}
            {Parte({ titulo: "Destinatario", v: destinatario, set: setDestinatario, pref: "destinatario", q: "d" })}
            </div>) },
{ id: "ruta", label: "Ruta", contenido: (<div className="flex flex-col gap-5">
<div className="grid gap-4 sm:grid-cols-2">
              {([["Punto de partida", partida, setPartida, "partida"], ["Punto de llegada", llegada, setLlegada, "llegada"]] as const).map(([t, v, set, k]) => (
                <FieldSet key={k}>
                  <FieldLegend variant="label">{t}</FieldLegend>
                  <div className="grid gap-3 grid-cols-[6rem_1fr]">
                    <Input aria-label={`Ubigeo ${t}`} placeholder="Ubigeo" className="tabular-nums" maxLength={6} inputMode="numeric" value={v.ubigeo} aria-invalid={inv(`${k}.ubigeo`)} onChange={(e) => set({ ...v, ubigeo: e.target.value.trim() })} />
                    <Input aria-label={`Dirección ${t}`} placeholder="Dirección" value={v.direccion} aria-invalid={inv(`${k}.direccion`)} onChange={(e) => set({ ...v, direccion: e.target.value })} />
                  </div>
                  <FieldError errors={err(`${k}.ubigeo`, `${k}.direccion`)} />
                </FieldSet>
              ))}
            </div>
            </div>) },
{ id: "vehiculo", label: "Vehículo", contenido: (<div className="flex flex-col gap-5">
<div className="grid gap-4 sm:grid-cols-4">
              <Field data-invalid={inv("peso_total")}><FieldLabel htmlFor="grt-peso">Peso (kg)</FieldLabel><Input id="grt-peso" className="text-right tabular-nums" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /><FieldError errors={err("peso_total")} /></Field>
              <Field><FieldLabel htmlFor="grt-bultos">Bultos</FieldLabel><Input id="grt-bultos" className="text-right tabular-nums" inputMode="numeric" value={bultos} onChange={(e) => setBultos(e.target.value)} /></Field>
              <Field data-invalid={inv("vehiculo.placa")}><FieldLabel htmlFor="grt-placa">Placa</FieldLabel><Input id="grt-placa" className="uppercase" value={vehiculo.placa} onChange={(e) => setVehiculo({ ...vehiculo, placa: e.target.value.trim() })} /><FieldError errors={err("vehiculo.placa")} /></Field>
              <Field><FieldLabel htmlFor="grt-tuce">N.° circulación</FieldLabel><Input id="grt-tuce" className="uppercase" value={vehiculo.nro_circulacion} onChange={(e) => setVehiculo({ ...vehiculo, nro_circulacion: e.target.value.trim() })} /></Field>
            </div>
</div>) },
{ id: "conductores", label: "Conductores", contenido: (<div className="flex flex-col gap-5">
            <FieldSet>
              <FieldLegend variant="label">Conductores</FieldLegend>
              <div className="flex flex-col gap-2">
                {condPag.visibles.map((c, k) => {
                  const i = condPag.offset + k
                  const set = (k: string, v: string) => setConductores(conductores.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
                  return (
                    <div key={c.key} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_8rem_auto]">
                      <Input aria-label="DNI" placeholder="DNI" className="tabular-nums" value={c.num_doc} aria-invalid={inv(`conductores.${i}.num_doc`)} onChange={(e) => set("num_doc", e.target.value.trim())} />
                      <Input aria-label="Nombres" placeholder="Nombres" value={c.nombres} aria-invalid={inv(`conductores.${i}.nombres`)} onChange={(e) => set("nombres", e.target.value)} />
                      <Input aria-label="Apellidos" placeholder="Apellidos" value={c.apellidos} aria-invalid={inv(`conductores.${i}.apellidos`)} onChange={(e) => set("apellidos", e.target.value)} />
                      <Input aria-label="Licencia" placeholder="Licencia" className="uppercase" value={c.licencia} aria-invalid={inv(`conductores.${i}.licencia`)} onChange={(e) => set("licencia", e.target.value.trim())} />
                      {conductores.length > 1 ? <Button variant="destructive" size="icon" aria-label="Quitar conductor" onClick={() => setConductores(conductores.filter((_, j) => j !== i))}><Trash2Icon /></Button> : <span className="w-9" />}
                    </div>
                  )
                })}
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => { setConductores([...conductores, conductorVacio()]); condPag.irAlFinal() }}><PlusIcon /> Agregar</Button>
                {condPag.pager}
              </div>
            </FieldSet>
            </div>) },
{ id: "bienes", label: "Bienes", contenido: (<div className="flex flex-col gap-5">
<FieldSet>
              <FieldLegend variant="label">Bienes transportados</FieldLegend>
              <div className="flex flex-col gap-2">
                {itemsPag.visibles.map((it, k) => {
                  const i = itemsPag.offset + k
                  const set = (k: string, v: string) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
                  return (
                    <div key={it.key} className="grid gap-2 sm:grid-cols-[1fr_12rem_7rem_auto]">
                      <Input aria-label="Descripción" placeholder="Descripción" value={it.descripcion} aria-invalid={inv(`items.${i}.descripcion`)} onChange={(e) => set("descripcion", e.target.value)} />
                      <Select value={it.unidad} onValueChange={(u) => set("unidad", u)}><SelectTrigger aria-label="Unidad"><SelectValue /></SelectTrigger><SelectContent>{unidades.map((u) => <SelectItem key={u.codigo} value={u.codigo}>{u.codigo} · {u.descripcion}</SelectItem>)}</SelectContent></Select>
                      <Input aria-label="Cantidad" className="text-right tabular-nums" inputMode="decimal" value={it.cantidad} aria-invalid={inv(`items.${i}.cantidad`)} onChange={(e) => set("cantidad", e.target.value)} />
                      {items.length > 1 ? <Button variant="destructive" size="icon" aria-label="Quitar" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2Icon /></Button> : <span className="w-9" />}
                    </div>
                  )
                })}
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => { setItems([...items, itemVacio()]); itemsPag.irAlFinal() }}><PlusIcon /> Agregar</Button>
                {itemsPag.pager}
              </div>
            </FieldSet>
          </div>) },
]} />
</FieldGroup>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={emitir.isPending || !serie} onClick={() => emitir.mutate()}>{emitir.isPending ? <Spinner data-icon="inline-start" /> : <TruckIcon />} Emitir guía</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
