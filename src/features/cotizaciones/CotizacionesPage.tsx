import { useState } from "react"
import { SeccionesModal, usePaginaLocal } from "@/components/shared/SeccionesModal"
import { Link, useNavigate, useSearchParams } from "react-router"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckIcon, FileTextIcon, PlusIcon, PrinterIcon, SendIcon, ShoppingCartIcon, XIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Buscador, Paginador, soles, useDebounced, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"
import { ESTADOS, useCotizacion, type Cotizacion, type EstadoCotizacion } from "./cotizaciones.api"

const errorMsg = (e: unknown) => Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message
const fecha = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-PE")

export function EstadoCotizacionBadge({ estado }: { estado: EstadoCotizacion }) {
  return <Badge variant={ESTADOS[estado].v}>{ESTADOS[estado].label}</Badge>
}

export function CotizacionesPage() {
  const { empresa, puede } = useAuth()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState("")
  const [estado, setEstado] = useState("todos")
  const [pagina, setPagina] = useState(1)
  const qd = useDebounced(q)
  const verId = params.get("ver")

  const lista = useQuery({
    queryKey: ["cotizaciones", empresa?.id, qd, estado, pagina],
    enabled: !!empresa,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: Cotizacion[]; meta: MetaPaginacion }>("/cotizaciones", {
      params: { q: qd || undefined, estado: estado === "todos" ? undefined : estado, page: pagina },
    })).data,
  })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Cotizaciones"
        description="Propuestas de precio para tus clientes. No se envían a SUNAT; al aceptarse se convierten en venta con un clic."
        actions={puede("cotizaciones.gestionar") && <Button asChild><Link to="/cotizaciones/nueva"><PlusIcon /> Nueva cotización</Link></Button>}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1"><Buscador value={q} onChange={(v) => { setQ(v); setPagina(1) }} placeholder="COT-12, RUC/DNI o nombre del cliente" /></div>
            <Select value={estado} onValueChange={(v) => { setEstado(v); setPagina(1) }}>
              <SelectTrigger className="sm:w-48" aria-label="Estado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {(Object.keys(ESTADOS) as EstadoCotizacion[]).map((e) => <SelectItem key={e} value={e}>{ESTADOS[e].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {lista.isLoading ? <Skeleton className="h-40" /> : lista.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(lista.error).message}</AlertDescription></Alert>
          ) : lista.data?.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <FileTextIcon className="size-8" /> {qd || estado !== "todos" ? "Ninguna cotización coincide con la búsqueda." : "Aún no hay cotizaciones."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Cotización</TableHead><TableHead>Cliente</TableHead><TableHead>Válida hasta</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {lista.data?.data.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setParams({ ver: String(c.id) })}>
                    <TableCell><div className="tabular-nums">{c.codigo}</div><div className="text-xs text-muted-foreground">{fecha(c.fecha_emision)}</div></TableCell>
                    <TableCell className="max-w-64"><div className="truncate">{c.cliente.razon_social}</div>{c.cliente.num_doc && <div className="tabular-nums text-xs text-muted-foreground">{c.cliente.num_doc}</div>}</TableCell>
                    <TableCell>{fecha(c.fecha_validez)}</TableCell>
                    <TableCell className="text-right tabular-nums">{soles(c.total, c.moneda)}</TableCell>
                    <TableCell>
                      <EstadoCotizacionBadge estado={c.estado} />
                      {c.venta?.numero && <div className="mt-1 tabular-nums text-xs text-muted-foreground">{c.venta.numero}</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Paginador meta={lista.data?.meta} onPage={setPagina} />
        </CardContent>
      </Card>
      <DetalleCotizacion id={verId ? Number(verId) : null} onClose={() => setParams({})} />
    </div>
  )
}

function DetalleCotizacion({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { puede } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const q = useCotizacion(id)
  const estado = useMutation({
    mutationFn: async (nuevo: "enviada" | "aceptada" | "rechazada") => (await api.put<{ message: string }>(`/cotizaciones/${id}/estado`, { estado: nuevo })).data,
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["cotizaciones"] }); qc.invalidateQueries({ queryKey: ["cotizacion"] }) },
    onError: (e) => toast.error(errorMsg(e)),
  })
  const c = q.data
  const itemsPag = usePaginaLocal(c?.items ?? [], 5, 2)
  const gestiona = puede("cotizaciones.gestionar")

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="p-4 pr-12">
          <DialogTitle className="tabular-nums">{c?.codigo ?? "Cotización"}</DialogTitle>
          <DialogDescription>{c ? `Emitida el ${fecha(c.fecha_emision)} · válida hasta el ${fecha(c.fecha_validez)}` : "Cargando…"}</DialogDescription>
        </DialogHeader>
        {!c ? <div className="px-4"><Skeleton className="h-64" /></div> : (
          <div className="flex flex-col gap-5 px-4 pb-6 text-sm">
            <SeccionesModal secciones={[
{ id: "resumen", label: "Resumen", contenido: (<div className="flex flex-col gap-5">
<div className="flex flex-wrap items-center gap-2">
              <EstadoCotizacionBadge estado={c.estado} />
              {c.venta?.numero && <Button variant="link" className="h-auto p-0 tabular-nums" asChild><Link to={`/comprobantes?ver=${c.venta.comprobante_id}`}>{c.venta.numero}</Link></Button>}
            </div>
            <div className="flex flex-wrap gap-2">
              {c.convertible && puede("comprobantes.emitir") && (
                <Button size="sm" onClick={() => navigate(`/ventas/nueva?cotizacion=${c.id}`)}><ShoppingCartIcon /> Convertir en venta</Button>
              )}
              <Button size="sm" variant="outline" asChild><a href={`/cotizaciones/${c.id}/imprimir`} target="_blank" rel="noreferrer"><PrinterIcon /> Imprimir</a></Button>
              {gestiona && c.estado === "borrador" && <Button size="sm" variant="outline" disabled={estado.isPending} onClick={() => estado.mutate("enviada")}><SendIcon /> Marcar enviada</Button>}
              {gestiona && (c.estado === "borrador" || c.estado === "enviada") && <Button size="sm" variant="outline" disabled={estado.isPending} onClick={() => estado.mutate("aceptada")}><CheckIcon /> Aceptada</Button>}
              {gestiona && ["borrador", "enviada", "aceptada", "vencida"].includes(c.estado) && (
                <Button size="sm" variant="outline" className="text-destructive" disabled={estado.isPending} onClick={() => estado.mutate("rechazada")}><XIcon /> Rechazada</Button>
              )}
            </div>
            <section>
              <h3 className="mb-1 font-medium">Cliente</h3>
              <p>{c.cliente.razon_social}</p>
              {c.cliente.num_doc && <p className="tabular-nums text-muted-foreground">{c.cliente.num_doc}</p>}
              {c.cliente.email && <p className="text-muted-foreground">{c.cliente.email}</p>}
            </section>
            </div>) },
{ id: "items", label: "Ítems", contenido: (<div className="flex flex-col gap-5">
<Table>
              <TableHeader>
                <TableRow><TableHead>Descripción</TableHead><TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">P. unit.</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {itemsPag.visibles.map((i, n) => (
                  <TableRow key={n}>
                    <TableCell>{i.descripcion}{i.descuento > 0 && <div className="text-xs text-muted-foreground">Descuento {soles(i.descuento, c.moneda)}</div>}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.cantidad} {i.unidad}</TableCell>
                    <TableCell className="text-right tabular-nums">{soles(i.precio_unitario, c.moneda)}</TableCell>
                    <TableCell className="text-right tabular-nums">{soles(i.total, c.moneda)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                {c.totales.gravadas > 0 && <TableRow><TableCell colSpan={3} className="text-right">Op. gravadas</TableCell><TableCell className="text-right tabular-nums">{soles(c.totales.gravadas, c.moneda)}</TableCell></TableRow>}
                {c.totales.exoneradas > 0 && <TableRow><TableCell colSpan={3} className="text-right">Op. exoneradas</TableCell><TableCell className="text-right tabular-nums">{soles(c.totales.exoneradas, c.moneda)}</TableCell></TableRow>}
                {c.totales.inafectas > 0 && <TableRow><TableCell colSpan={3} className="text-right">Op. inafectas</TableCell><TableCell className="text-right tabular-nums">{soles(c.totales.inafectas, c.moneda)}</TableCell></TableRow>}
                <TableRow><TableCell colSpan={3} className="text-right">IGV ({c.tasa_igv} %)</TableCell><TableCell className="text-right tabular-nums">{soles(c.totales.igv, c.moneda)}</TableCell></TableRow>
                <TableRow><TableCell colSpan={3} className="text-right font-medium">Total</TableCell><TableCell className="text-right tabular-nums font-medium">{soles(c.totales.total, c.moneda)}</TableCell></TableRow>
              </TableFooter>
            </Table>
            {itemsPag.pager}
            {c.observacion && <section><h3 className="mb-1 font-medium">Observaciones</h3><p className="whitespace-pre-line text-muted-foreground">{c.observacion}</p></section>}
            <Separator />
            <p className="text-xs text-muted-foreground">Registrada por {c.usuario ?? "—"}. Una cotización no es un comprobante de pago.</p>
          </div>) },
]} />
</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
