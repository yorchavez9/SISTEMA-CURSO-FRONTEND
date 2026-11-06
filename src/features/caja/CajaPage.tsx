import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowDownCircleIcon, ArrowUpCircleIcon, LockIcon, VaultIcon, WalletIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { soles } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { CONCEPTOS, useEstadoCaja, type Sesion } from "./caja.api"

const hora = (iso: string) => new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })
const errorMsg = (e: unknown) => Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message

export function CajaPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const estado = useEstadoCaja()
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["caja"] })
    qc.invalidateQueries({ queryKey: ["caja-sesiones"] })
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title="Caja" description="Apertura, movimientos, arqueo y cierre. Cada cobro registrado en una venta entra a tu caja abierta." />
      {!puede("caja.operar") ? (
        <Alert><LockIcon /><AlertTitle>Tu rol puede consultar el historial pero no operar la caja.</AlertTitle></Alert>
      ) : estado.isLoading ? (
        <Skeleton className="h-64" />
      ) : estado.isError ? (
        <Alert variant="destructive"><AlertDescription>{toApiError(estado.error).message}</AlertDescription></Alert>
      ) : estado.data?.sesion ? (
        <SesionAbierta sesion={estado.data.sesion} metodos={estado.data.metodos} onCambio={invalidar} />
      ) : (
        <AbrirCaja cajas={estado.data?.cajas ?? []} onAbierta={invalidar} />
      )}
      {empresa && puede("caja.ver") && <Historial />}
    </div>
  )
}

function AbrirCaja({ cajas, onAbierta }: { cajas: { id: number; nombre: string; establecimiento: string | null; abierta_por: string | null }[]; onAbierta: () => void }) {
  const libres = cajas.filter((c) => !c.abierta_por)
  const [cajaId, setCajaId] = useState(libres[0] ? String(libres[0].id) : "")
  const [monto, setMonto] = useState("0.00")
  const abrir = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>("/caja/abrir", { caja_id: Number(cajaId), monto_apertura: Number(monto) })).data,
    onSuccess: (r) => { toast.success(r.message); onAbierta() },
    onError: (e) => toast.error(errorMsg(e)),
  })
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><VaultIcon className="size-4" />Abrir caja</CardTitle>
        <CardDescription>Indica el efectivo con el que inicias (fondo de cambio).</CardDescription>
      </CardHeader>
      <CardContent>
        {cajas.length === 0 ? (
          <Alert><AlertDescription>No hay establecimientos. Sincroniza en Configuración → Establecimientos y series.</AlertDescription></Alert>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>Caja</FieldLabel>
              <Select value={cajaId} onValueChange={setCajaId}>
                <SelectTrigger aria-label="Caja"><SelectValue placeholder="Selecciona una caja" /></SelectTrigger>
                <SelectContent>
                  {cajas.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)} disabled={!!c.abierta_por}>
                      {c.nombre} · {c.establecimiento}{c.abierta_por ? ` (abierta por ${c.abierta_por})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="apertura">Fondo inicial en efectivo</FieldLabel>
              <Input id="apertura" inputMode="decimal" className="font-mono" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </Field>
          </FieldGroup>
        )}
      </CardContent>
      <CardFooter>
        <Button disabled={!cajaId || abrir.isPending || Number.isNaN(Number(monto))} onClick={() => abrir.mutate()}>
          {abrir.isPending && <Spinner />} Abrir caja
        </Button>
      </CardFooter>
    </Card>
  )
}

function SesionAbierta({ sesion, metodos, onCambio }: { sesion: Sesion; metodos: { metodo: string; label: string }[]; onCambio: () => void }) {
  const [mov, setMov] = useState<"ingreso" | "egreso" | null>(null)
  const [cerrar, setCerrar] = useState(false)
  const r = sesion.resumen
  return (
    <>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><WalletIcon className="size-4" />{sesion.caja.nombre} · {sesion.caja.establecimiento}</CardTitle>
            <CardDescription>Abierta {hora(sesion.apertura_at)} por {sesion.usuario} · fondo {soles(sesion.monto_apertura)}</CardDescription>
            <CardAction className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMov("ingreso")}><ArrowDownCircleIcon /> Ingreso</Button>
              <Button variant="outline" size="sm" onClick={() => setMov("egreso")}><ArrowUpCircleIcon /> Egreso</Button>
              <Button size="sm" onClick={() => setCerrar(true)}><LockIcon /> Cerrar caja</Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Método</TableHead><TableHead className="text-right">Ingresos</TableHead><TableHead className="text-right">Egresos</TableHead><TableHead className="text-right">Neto</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {r.por_metodo.map((m) => (
                  <TableRow key={m.metodo}>
                    <TableCell>{m.label}</TableCell>
                    <TableCell className="text-right font-mono">{soles(Number(m.ingresos))}</TableCell>
                    <TableCell className="text-right font-mono">{soles(Number(m.egresos))}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{soles(Number(m.neto))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Efectivo que debe haber en caja</CardDescription>
            <CardTitle className="font-mono text-3xl">{soles(Number(r.efectivo_esperado))}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{r.pagos_registrados} cobro{r.pagos_registrados === 1 ? "" : "s"} registrados en esta sesión.</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Movimientos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Hora</TableHead><TableHead>Concepto</TableHead><TableHead>Método</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Monto</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {sesion.movimientos.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs">{hora(m.fecha)}</TableCell>
                  <TableCell><Badge variant={m.tipo === "ingreso" ? "outline" : "secondary"}>{CONCEPTOS[m.concepto] ?? m.concepto}</Badge></TableCell>
                  <TableCell>{metodos.find((x) => x.metodo === m.metodo)?.label ?? m.metodo}</TableCell>
                  <TableCell className="max-w-64 truncate text-sm text-muted-foreground">{m.descripcion ?? "—"}</TableCell>
                  <TableCell className={cn("text-right font-mono", m.tipo === "egreso" && "text-destructive")}>{m.tipo === "egreso" ? "−" : ""}{soles(m.monto)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {mov && <MovimientoDialog tipo={mov} metodos={metodos} onClose={() => setMov(null)} onDone={onCambio} />}
      {cerrar && <CerrarDialog sesion={sesion} onClose={() => setCerrar(false)} onDone={onCambio} />}
    </>
  )
}

function MovimientoDialog({ tipo, metodos, onClose, onDone }: { tipo: "ingreso" | "egreso"; metodos: { metodo: string; label: string }[]; onClose: () => void; onDone: () => void }) {
  const [concepto, setConcepto] = useState(tipo === "ingreso" ? "ingreso_manual" : "gasto")
  const [metodo, setMetodo] = useState("efectivo")
  const [monto, setMonto] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const m = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>("/caja/movimientos", { tipo, concepto, metodo, monto: Number(monto), descripcion })).data,
    onSuccess: (r) => { toast.success(r.message); onDone(); onClose() },
    onError: (e) => toast.error(errorMsg(e)),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tipo === "ingreso" ? "Registrar ingreso" : "Registrar egreso"}</DialogTitle>
          <DialogDescription>Queda en el historial de la caja y en la auditoría.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Concepto</FieldLabel>
              <Select value={concepto} onValueChange={setConcepto}>
                <SelectTrigger aria-label="Concepto"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tipo === "ingreso"
                    ? <SelectItem value="ingreso_manual">Ingreso</SelectItem>
                    : <><SelectItem value="gasto">Gasto</SelectItem><SelectItem value="retiro">Retiro</SelectItem></>}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Método</FieldLabel>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger aria-label="Método"><SelectValue /></SelectTrigger>
                <SelectContent>{metodos.map((x) => <SelectItem key={x.metodo} value={x.metodo}>{x.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="mov-monto">Monto</FieldLabel>
            <Input id="mov-monto" inputMode="decimal" className="font-mono" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mov-desc">Descripción</FieldLabel>
            <Input id="mov-desc" placeholder="Ej. compra de útiles de limpieza" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={m.isPending || !(Number(monto) > 0) || descripcion.trim().length < 3} onClick={() => m.mutate()}>{m.isPending && <Spinner />} Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CerrarDialog({ sesion, onClose, onDone }: { sesion: Sesion; onClose: () => void; onDone: () => void }) {
  const [contado, setContado] = useState("")
  const [obs, setObs] = useState("")
  const esperado = Number(sesion.resumen.efectivo_esperado)
  const dif = contado === "" ? null : Math.round((Number(contado) - esperado) * 100) / 100
  const m = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>("/caja/cerrar", { efectivo_contado: Number(contado), observacion: obs || undefined })).data,
    onSuccess: (r) => { toast.success(r.message); onDone(); onClose() },
    onError: (e) => toast.error(errorMsg(e)),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>Cuenta el efectivo físico e ingrésalo. El sistema registra la diferencia.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Efectivo esperado</span><span className="font-mono">{soles(esperado)}</span></div>
          <Field>
            <FieldLabel htmlFor="contado">Efectivo contado</FieldLabel>
            <Input id="contado" inputMode="decimal" className="font-mono" autoFocus value={contado} onChange={(e) => setContado(e.target.value)} />
            {dif !== null && !Number.isNaN(dif) && (
              <FieldDescription className={cn(dif !== 0 && "font-medium text-destructive")}>
                {dif === 0 ? "Cuadra exacto." : dif > 0 ? `Sobrante de ${soles(dif)}` : `Faltante de ${soles(-dif)}`}
              </FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="obs-cierre">Observación</FieldLabel>
            <Textarea id="obs-cierre" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={m.isPending || contado === "" || Number.isNaN(Number(contado))} onClick={() => m.mutate()}>{m.isPending && <Spinner />} Cerrar caja</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Historial() {
  const { empresa } = useAuth()
  const q = useQuery({
    queryKey: ["caja-sesiones", empresa?.id],
    queryFn: async () => (await api.get<{ data: { id: number; caja: string; usuario: string; estado: string; apertura_at: string; cierre_at: string | null; monto_apertura: number; efectivo_esperado: number | null; efectivo_contado: number | null; diferencia: number | null }[] }>("/caja/sesiones")).data.data,
  })
  return (
    <Card>
      <CardHeader><CardTitle>Historial de cajas</CardTitle></CardHeader>
      <CardContent>
        {q.isLoading ? <Skeleton className="h-24" /> : q.data?.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay sesiones de caja.</p> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Caja</TableHead><TableHead>Usuario</TableHead><TableHead>Apertura</TableHead><TableHead>Cierre</TableHead><TableHead className="text-right">Esperado</TableHead><TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Diferencia</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.caja}</TableCell>
                  <TableCell>{s.usuario}</TableCell>
                  <TableCell className="text-xs">{hora(s.apertura_at)}</TableCell>
                  <TableCell className="text-xs">{s.cierre_at ? hora(s.cierre_at) : <Badge variant="secondary">Abierta</Badge>}</TableCell>
                  <TableCell className="text-right font-mono">{s.efectivo_esperado !== null ? soles(s.efectivo_esperado) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{s.efectivo_contado !== null ? soles(s.efectivo_contado) : "—"}</TableCell>
                  <TableCell className={cn("text-right font-mono", s.diferencia && s.diferencia !== 0 && "text-destructive")}>{s.diferencia !== null ? soles(s.diferencia) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
