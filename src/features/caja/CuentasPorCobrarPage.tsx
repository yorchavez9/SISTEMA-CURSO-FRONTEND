import { useState } from "react"
import { SeccionesModal } from "@/components/shared/SeccionesModal"
import { Link } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BanknoteIcon, CircleAlertIcon, HandCoinsIcon, Undo2Icon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Buscador, soles, useDebounced } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useEstadoCaja } from "./caja.api"
import { PagosEditor, pagoInicial, pagosParaApi, type PagoForm } from "./PagosEditor"

interface AFavor { venta_id: number; fecha: string; comprobante: string | null; comprobante_estado: string | null; cliente: string | null; cliente_doc: string | null; pagado: number; a_favor: number }
interface Fila { venta_id: number; fecha: string; comprobante: string | null; cliente: string | null; cliente_doc: string | null; forma_pago: string; total: number; pagado: number; saldo: number; proximo_vencimiento: string | null; dias_vencido: number; tramo: string }
interface VentaPagos {
  venta_id: number; comprobante: string | null; cliente: string | null; total: number; pagado: number; saldo: number; estado_pago: string
  cuotas: { numero: number; monto: number; pagado: number; fecha_vencimiento: string }[]
  pagos: { id: number; metodo: string; monto: number; vuelto: number; referencia: string | null; estado: string; usuario: string | null; fecha: string; motivo_anulacion: string | null }[]
}
const TRAMOS: [string, string][] = [["al_dia", "Al día"], ["1_30", "1–30 días"], ["31_60", "31–60 días"], ["61_90", "61–90 días"], ["mas_90", "Más de 90"]]

export function CuentasPorCobrarPage() {
  const { empresa, puede } = useAuth()
  const [q, setQ] = useState("")
  const qd = useDebounced(q)
  const [ventaId, setVentaId] = useState<number | null>(null)
  const lista = useQuery({
    queryKey: ["cxc", empresa?.id, qd],
    enabled: !!empresa,
    queryFn: async () => (await api.get<{ data: { filas: Fila[]; total: number; tramos: Record<string, number>; saldos_a_favor: AFavor[] } }>("/cuentas-por-cobrar", { params: { q: qd || undefined } })).data.data,
  })
  const [reembolso, setReembolso] = useState<AFavor | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title="Cuentas por cobrar" description="Saldos pendientes de ventas al crédito o no cobradas, por antigüedad." />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="sm:col-span-3 lg:col-span-1">
          <CardHeader><CardDescription>Total por cobrar</CardDescription><CardTitle className="tabular-nums text-2xl">{lista.data ? soles(lista.data.total) : "—"}</CardTitle></CardHeader>
        </Card>
        {TRAMOS.map(([k, label]) => (
          <Card key={k}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className={cn("tabular-nums text-lg", k !== "al_dia" && (lista.data?.tramos[k] ?? 0) > 0 && "text-destructive")}>{lista.data ? soles(lista.data.tramos[k]) : "—"}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Buscador value={q} onChange={setQ} placeholder="Cliente o documento" />
          {lista.isLoading ? <Skeleton className="h-32" /> : lista.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(lista.error).message}</AlertDescription></Alert>
          ) : lista.data?.filas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><BanknoteIcon className="size-8" /> No hay saldos pendientes.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comprobante</TableHead><TableHead>Cliente</TableHead><TableHead>Próx. vencimiento</TableHead>
                  <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.data?.filas.map((f) => (
                  <TableRow key={f.venta_id}>
                    <TableCell><div className="tabular-nums">{f.comprobante ?? `Venta #${f.venta_id}`}</div><div className="text-xs text-muted-foreground">{f.fecha} · {f.forma_pago}</div></TableCell>
                    <TableCell className="max-w-56"><div className="truncate">{f.cliente}</div><div className="tabular-nums text-xs text-muted-foreground">{f.cliente_doc}</div></TableCell>
                    <TableCell>
                      {f.proximo_vencimiento ?? "—"}
                      {f.dias_vencido > 0 && <Badge variant="destructive" className="ml-2">{f.dias_vencido} d vencido</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{soles(f.total)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{soles(f.saldo)}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setVentaId(f.venta_id)}><HandCoinsIcon /> Cobrar</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {(lista.data?.saldos_a_favor.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saldos a favor de clientes</CardTitle>
            <CardDescription>Ventas pagadas que luego se dieron de baja o recibieron notas de crédito. Devuelve el dinero desde tu caja.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Comprobante</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Pagado</TableHead><TableHead className="text-right">A favor</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {lista.data?.saldos_a_favor.map((f) => (
                  <TableRow key={f.venta_id}>
                    <TableCell><div className="tabular-nums">{f.comprobante ?? `Venta #${f.venta_id}`}</div><div className="text-xs text-muted-foreground">{f.fecha}{f.comprobante_estado === "anulado" && " · dado de baja"}</div></TableCell>
                    <TableCell className="max-w-56"><div className="truncate">{f.cliente}</div><div className="tabular-nums text-xs text-muted-foreground">{f.cliente_doc}</div></TableCell>
                    <TableCell className="text-right tabular-nums">{soles(f.pagado)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{soles(f.a_favor)}</TableCell>
                    <TableCell className="text-right">
                      {puede("caja.operar") && <Button size="sm" variant="outline" onClick={() => setReembolso(f)}><Undo2Icon /> Reembolsar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {reembolso && <ReembolsoDialog saldo={reembolso} onClose={() => setReembolso(null)} />}
      {ventaId && <CobroDialog ventaId={ventaId} onClose={() => setVentaId(null)} />}
    </div>
  )
}

export function CobroDialog({ ventaId, onClose }: { ventaId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const { puede } = useAuth()
  const caja = useEstadoCaja()
  const v = useQuery({ queryKey: ["venta-pagos", ventaId], queryFn: async () => (await api.get<{ data: VentaPagos }>(`/ventas/${ventaId}/pagos`)).data.data })
  const [pagos, setPagos] = useState<PagoForm[] | null>(null)
  const [anular, setAnular] = useState<number | null>(null)
  const [motivo, setMotivo] = useState("")
  const filas = pagos ?? (v.data ? [pagoInicial(v.data.saldo)] : [])
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["venta-pagos", ventaId] })
    qc.invalidateQueries({ queryKey: ["cxc"] })
    qc.invalidateQueries({ queryKey: ["caja"] })
  }
  const cobrar = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>(`/ventas/${ventaId}/pagos`, { pagos: pagosParaApi(filas) })).data,
    onSuccess: (r) => { toast.success(r.message); setPagos(null); refrescar() },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })
  const anularM = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>(`/pagos/${anular}/anular`, { motivo })).data,
    onSuccess: (r) => { toast.success(r.message); setAnular(null); setMotivo(""); refrescar() },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })
  const d = v.data
  const suma = filas.reduce((s, p) => s + Number(p.monto || 0), 0)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Cobranza {d?.comprobante ?? ""}</DialogTitle>
          <DialogDescription>{d?.cliente}</DialogDescription>
        </DialogHeader>
        {!d ? <Skeleton className="h-40" /> : (
          <div className="flex flex-col gap-4 text-sm">
            <SeccionesModal secciones={[
{ id: "resumen", label: "Resumen", contenido: (<div className="flex flex-col gap-5">
<div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-muted-foreground">Total</div><div className="tabular-nums">{soles(d.total)}</div></div>
              <div><div className="text-muted-foreground">Pagado</div><div className="tabular-nums">{soles(d.pagado)}</div></div>
              <div><div className="text-muted-foreground">Saldo</div><div className="tabular-nums font-semibold">{soles(d.saldo)}</div></div>
            </div>
            {d.cuotas.length > 0 && (
              <Table>
                <TableBody>
                  {d.cuotas.map((c) => (
                    <TableRow key={c.numero}>
                      <TableCell>Cuota {c.numero} · {c.fecha_vencimiento}</TableCell>
                      <TableCell className="text-right tabular-nums">{soles(c.pagado)} / {soles(c.monto)}</TableCell>
                      <TableCell className="w-24 text-right">{c.pagado >= c.monto ? <Badge variant="outline">Pagada</Badge> : c.pagado > 0 ? <Badge variant="secondary">Parcial</Badge> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {d.saldo > 0 && puede("caja.operar") && (
              caja.data?.sesion ? (
                <>
                  <Separator />
                  <PagosEditor pagos={filas} onChange={setPagos} metodos={caja.data.metodos} objetivo={d.saldo} exacto={false} />
                </>
              ) : (
                <Alert><CircleAlertIcon /><AlertTitle>Abre tu caja para registrar cobros.</AlertTitle><AlertDescription><Link className="underline" to="/caja">Ir a Caja</Link></AlertDescription></Alert>
              )
            )}
            </div>) },
{ id: "pagos", label: "Pagos", oculta: d.pagos.length === 0, contenido: (<div className="flex flex-col gap-5">
{d.pagos.length > 0 && (
              <>
                <Separator />
                <h3 className="font-medium">Pagos</h3>
                <Table>
                  <TableBody>
                    {d.pagos.map((p) => (
                      <TableRow key={p.id} className={p.estado === "anulado" ? "opacity-60" : undefined}>
                        <TableCell className="text-xs">{new Date(p.fecha).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}<div>{p.usuario}</div></TableCell>
                        <TableCell>{p.metodo}{p.referencia && <div className="text-xs text-muted-foreground">{p.referencia}</div>}{p.motivo_anulacion && <div className="text-xs text-destructive">Anulado: {p.motivo_anulacion}</div>}</TableCell>
                        <TableCell className="text-right tabular-nums">{soles(p.monto)}</TableCell>
                        <TableCell className="w-10">
                          {p.estado === "registrado" && puede("caja.operar") && (
                            <Button variant="destructive" size="icon" aria-label="Anular pago" onClick={() => setAnular(p.id)}><Undo2Icon /></Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            </div>) },
]} />
{anular && (
              <div className="flex gap-2">
                <Input placeholder="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                <Button variant="destructive" disabled={motivo.trim().length < 5 || anularM.isPending} onClick={() => anularM.mutate()}>Anular</Button>
                <Button variant="ghost" onClick={() => setAnular(null)}>Cancelar</Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          {d && d.saldo > 0 && caja.data?.sesion && (
            <Button disabled={cobrar.isPending || suma <= 0 || suma > d.saldo + 0.001} onClick={() => cobrar.mutate()}>{cobrar.isPending && <Spinner />} Registrar cobro</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReembolsoDialog({ saldo, onClose }: { saldo: AFavor; onClose: () => void }) {
  const qc = useQueryClient()
  const caja = useEstadoCaja()
  const [metodo, setMetodo] = useState("efectivo")
  const [monto, setMonto] = useState(saldo.a_favor.toFixed(2))
  const [referencia, setReferencia] = useState("")
  const m = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>(`/ventas/${saldo.venta_id}/reembolso`, { metodo, monto: Number(monto), referencia: referencia || undefined })).data,
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["cxc"] }); qc.invalidateQueries({ queryKey: ["caja"] }); onClose() },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reembolsar {saldo.comprobante}</DialogTitle>
          <DialogDescription>{saldo.cliente} · saldo a favor {soles(saldo.a_favor)}</DialogDescription>
        </DialogHeader>
        {!caja.data?.sesion ? (
          <Alert><CircleAlertIcon /><AlertTitle>Abre tu caja para reembolsar.</AlertTitle><AlertDescription><Link className="underline" to="/caja">Ir a Caja</Link></AlertDescription></Alert>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger aria-label="Método"><SelectValue /></SelectTrigger>
              <SelectContent>{caja.data.metodos.map((x) => <SelectItem key={x.metodo} value={x.metodo}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input inputMode="decimal" className="tabular-nums" aria-label="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
            {metodo !== "efectivo" && <Input className="sm:col-span-2" placeholder="N.º de operación" aria-label="Referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} />}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!caja.data?.sesion || !(Number(monto) > 0) || Number(monto) > saldo.a_favor + 0.001 || m.isPending} onClick={() => m.mutate()}>{m.isPending && <Spinner />} Reembolsar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
