import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { CircleAlertIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { soles } from "@/components/shared/listado"
import { useEstadoCaja } from "@/features/caja/caja.api"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"

type Modo = "total" | "item" | "monto"
interface Opciones {
  comprobante: { id: number; numero: string; tipo_documento: string; total: number; moneda: string; cliente: string }
  credito_disponible: number
  tiene_notas_credito: boolean
  venta: { pagado: number; saldo: number; estado: string }
  lineas: { venta_detalle_id: number; descripcion: string; unidad: string; cantidad: number; devuelto: number; disponible: number; precio_efectivo: number; tip_afe_igv: string; gratuito: boolean; producto_id: number | null }[]
  series: { id: number; tipo_documento: string; serie: string; siguiente: string }[]
  motivos: { nc: { codigo: string; descripcion: string; validado_api: boolean; modo: Modo }[]; nd: { codigo: string; descripcion: string; validado_api: boolean; modo: Modo }[] }
}

export function NotaDialog({ comprobanteId, tipo, onClose, onCreada }: { comprobanteId: number; tipo: "07" | "08"; onClose: () => void; onCreada: (id: number) => void }) {
  const { puede } = useAuth()
  const caja = useEstadoCaja()
  const esNC = tipo === "07"
  const op = useQuery({
    queryKey: ["nota-opciones", comprobanteId],
    queryFn: async () => (await api.get<{ data: Opciones }>(`/comprobantes/${comprobanteId}/notas/opciones`)).data.data,
  })
  const d = op.data
  const motivos = useMemo(() => (esNC ? d?.motivos.nc : d?.motivos.nd) ?? [], [d, esNC])
  const series = (d?.series ?? []).filter((s) => s.tipo_documento === tipo)
  const [motivo, setMotivo] = useState("")
  const [desMotivo, setDesMotivo] = useState("")
  const [serieId, setSerieId] = useState("")
  const [cantidades, setCantidades] = useState<Record<number, string>>({})
  const [montos, setMontos] = useState<{ descripcion: string; importe: string }[]>([{ descripcion: "", importe: "" }])
  const [devolver, setDevolver] = useState(true)
  const [reembolsar, setReembolsar] = useState(false)
  const [metodo, setMetodo] = useState("efectivo")
  const idem = useRef(crypto.randomUUID())

  useEffect(() => {
    if (!motivo && motivos[0]) {
      const m = motivos.find((x) => x.codigo === (esNC ? (d?.tiene_notas_credito ? "07" : "01") : "01")) ?? motivos[0]
      setMotivo(m.codigo)
      setDesMotivo(m.descripcion)
    }
    if (!serieId && series[0]) setSerieId(String(series[0].id))
  }, [motivos, series, motivo, serieId, esNC, d?.tiene_notas_credito])

  const m = motivos.find((x) => x.codigo === motivo)
  const modo: Modo = m?.modo ?? "monto"
  const lineasValidas = (d?.lineas ?? []).filter((l) => !l.gratuito)
  const estimado =
    modo === "total" ? d?.comprobante.total ?? 0
    : modo === "item" ? lineasValidas.reduce((s, l) => s + Number(cantidades[l.venta_detalle_id] || 0) * l.precio_efectivo, 0)
    : montos.reduce((s, x) => s + Number(x.importe || 0), 0)

  const emitir = useMutation({
    mutationFn: async () => (await api.post<{ data: { id: number }; message: string }>("/notas", {
      idempotency_key: idem.current, tipo_documento: tipo, comprobante_id: comprobanteId, serie_id: Number(serieId),
      cod_motivo: motivo, des_motivo: desMotivo,
      items: modo === "item"
        ? lineasValidas.filter((l) => Number(cantidades[l.venta_detalle_id]) > 0).map((l) => ({ venta_detalle_id: l.venta_detalle_id, cantidad: Number(cantidades[l.venta_detalle_id]) }))
        : modo === "monto" ? montos.filter((x) => Number(x.importe) > 0).map((x) => ({ descripcion: x.descripcion, precio_unitario: Number(x.importe) }))
        : undefined,
      devolver_stock: esNC && (modo === "total" || modo === "item") ? devolver : undefined,
      reembolso: esNC && reembolsar ? { metodo } : undefined,
    })).data,
    onSuccess: (r) => { toast.success(r.message); onCreada(r.data.id) },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })

  const bloqueo =
    !serieId ? `No hay series de ${esNC ? "nota de crédito" : "nota de débito"} para ${d?.comprobante.numero.slice(0, 1) === "F" ? "facturas (FC__/FD__)" : "boletas (BC__/BD__)"}.`
    : desMotivo.trim().length < 5 ? "Describe el sustento del motivo."
    : estimado <= 0 ? "Indica lo que comprende la nota."
    : esNC && estimado > (d?.credito_disponible ?? 0) + 0.005 ? `Supera el crédito disponible (${soles(d?.credito_disponible ?? 0)}).`
    : esNC && reembolsar && !caja.data?.sesion ? "Abre tu caja para registrar el reembolso."
    : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{esNC ? "Nota de crédito" : "Nota de débito"} sobre {d?.comprobante.numero ?? "…"}</DialogTitle>
          <DialogDescription>{d ? `${d.comprobante.cliente} · total ${soles(d.comprobante.total)}${esNC ? ` · crédito disponible ${soles(d.credito_disponible)}` : ""}` : "Cargando…"}</DialogDescription>
        </DialogHeader>
        {op.isLoading ? <Skeleton className="h-48" /> : op.isError ? (
          <Alert variant="destructive"><AlertDescription>{toApiError(op.error).message}</AlertDescription></Alert>
        ) : d && (
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <Field>
                <FieldLabel>Motivo ({esNC ? "catálogo 09" : "catálogo 10"})</FieldLabel>
                <Select value={motivo} onValueChange={(v) => { setMotivo(v); setDesMotivo(motivos.find((x) => x.codigo === v)?.descripcion ?? "") }}>
                  <SelectTrigger aria-label="Motivo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {motivos.map((x) => (
                      <SelectItem key={x.codigo} value={x.codigo} disabled={esNC && x.modo === "total" && d.tiene_notas_credito}>
                        {x.codigo} · {x.descripcion}{!x.validado_api && " (sin validar en beta)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {m && !m.validado_api && <FieldDescription>Este motivo aún no se probó contra SUNAT beta; revisa el resultado del envío.</FieldDescription>}
              </Field>
              <Field>
                <FieldLabel>Serie</FieldLabel>
                <Select value={serieId} onValueChange={setSerieId}>
                  <SelectTrigger aria-label="Serie"><SelectValue placeholder="Sin series" /></SelectTrigger>
                  <SelectContent>{series.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.serie}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="des-motivo">Sustento</FieldLabel>
              <Input id="des-motivo" value={desMotivo} onChange={(e) => setDesMotivo(e.target.value)} />
            </Field>

            {modo === "total" && (
              <Table>
                <TableBody>
                  {d.lineas.map((l) => (
                    <TableRow key={l.venta_detalle_id}><TableCell>{l.descripcion}</TableCell><TableCell className="text-right tabular-nums">{l.cantidad} {l.unidad}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {modo === "item" && (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Línea</TableHead><TableHead className="text-right">Disponible</TableHead><TableHead className="w-28">Devolver</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {lineasValidas.map((l) => (
                    <TableRow key={l.venta_detalle_id}>
                      <TableCell>{l.descripcion}<div className="tabular-nums text-xs text-muted-foreground">{soles(l.precio_efectivo)} c/u{l.devuelto > 0 && ` · ya devuelto ${l.devuelto}`}</div></TableCell>
                      <TableCell className="text-right tabular-nums">{l.disponible}</TableCell>
                      <TableCell>
                        <Input inputMode="decimal" className="tabular-nums" aria-label={`Cantidad a devolver de ${l.descripcion}`} disabled={l.disponible <= 0}
                          value={cantidades[l.venta_detalle_id] ?? ""} onChange={(e) => setCantidades((c) => ({ ...c, [l.venta_detalle_id]: e.target.value }))} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {modo === "monto" && (
              <div className="flex flex-col gap-2">
                {montos.map((x, i) => (
                  <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2">
                    <Input placeholder={esNC ? "Concepto (p. ej. Descuento por volumen)" : "Concepto (p. ej. Interés por mora)"} aria-label="Concepto" value={x.descripcion}
                      onChange={(e) => setMontos((ms) => ms.map((y, j) => (j === i ? { ...y, descripcion: e.target.value } : y)))} />
                    <Input inputMode="decimal" className="tabular-nums" placeholder="Importe" aria-label="Importe con impuestos" value={x.importe}
                      onChange={(e) => setMontos((ms) => ms.map((y, j) => (j === i ? { ...y, importe: e.target.value } : y)))} />
                    <Button variant="ghost" size="icon" aria-label="Quitar concepto" disabled={montos.length === 1} onClick={() => setMontos((ms) => ms.filter((_, j) => j !== i))}><Trash2Icon /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="self-start" onClick={() => setMontos((ms) => [...ms, { descripcion: "", importe: "" }])}><PlusIcon /> Concepto</Button>
                <FieldDescription>Importes con impuestos incluidos; se aplica la afectación de la venta original.</FieldDescription>
              </div>
            )}

            {esNC && (modo === "total" || modo === "item") && d.lineas.some((l) => l.producto_id) && (
              <Field orientation="horizontal">
                <Switch id="devolver" checked={devolver} onCheckedChange={setDevolver} />
                <FieldLabel htmlFor="devolver">Reingresar la mercadería al almacén</FieldLabel>
              </Field>
            )}
            {esNC && d.venta.pagado > 0 && puede("caja.operar") && (
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <Field orientation="horizontal">
                  <Switch id="reembolso" checked={reembolsar} onCheckedChange={setReembolsar} />
                  <FieldLabel htmlFor="reembolso">Devolver dinero al cliente (pagó {soles(d.venta.pagado)})</FieldLabel>
                </Field>
                {reembolsar && (
                  caja.data?.sesion ? (
                    <Select value={metodo} onValueChange={setMetodo}>
                      <SelectTrigger aria-label="Método de reembolso" className="sm:w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>{caja.data.metodos.map((x) => <SelectItem key={x.metodo} value={x.metodo}>{x.label}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <p className="text-sm text-destructive">Abre tu caja para reembolsar.</p>
                )}
              </div>
            )}

            <div className="flex items-baseline justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm text-muted-foreground">Importe estimado {m && <Badge variant="outline" className="ml-1">{m.modo === "total" ? "total" : m.modo === "item" ? "por ítem" : "por monto"}</Badge>}</span>
              <span className="tabular-nums text-xl font-semibold">{soles(estimado, d.comprobante.moneda)}</span>
            </div>
            {bloqueo && <Alert variant="destructive"><CircleAlertIcon /><AlertDescription>{bloqueo}</AlertDescription></Alert>}
          </FieldGroup>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!!bloqueo || !d || emitir.isPending} onClick={() => emitir.mutate()}>{emitir.isPending && <Spinner />} Emitir {esNC ? "nota de crédito" : "nota de débito"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
