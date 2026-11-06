import { useState } from "react"
import { Link, useSearchParams } from "react-router"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2Icon, CircleAlertIcon, ClockIcon, FileArchiveIcon, FileCodeIcon, FileTextIcon, PlusIcon, RotateCwIcon, TruckIcon, XCircleIcon } from "lucide-react"
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
import { Buscador, Paginador, useDebounced, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"
import { descargarArchivo } from "@/lib/descargas"

type EstadoGuia = "por_enviar" | "enviado" | "aceptado" | "rechazado" | "error"

export interface Guia {
  id: number; numero: string; fecha_emision: string; fecha_traslado: string
  cod_traslado: string; motivo: string; mod_traslado: string; modalidad: string
  destinatario: { tipo_doc: string; num_doc: string; razon_social: string }
  llegada: { ubigeo: string; direccion: string }
  estado: EstadoGuia; sunat_codigo: string | null; sunat_descripcion: string | null; ultimo_error: string | null
  comprobante: { id: number; numero: string } | null
}
interface GuiaDetalle extends Guia {
  partida: { ubigeo: string; direccion: string }
  peso_total: number; und_peso_total: string; num_bultos: number | null
  transportista: { num_doc: string; razon_social: string; nro_mtc?: string } | null
  vehiculo: { placa: string; secundarios?: { placa: string }[] } | null
  conductores: { tipo?: string; tipo_doc: string; num_doc: string; nombres: string; apellidos: string; licencia: string }[]
  vehiculo_m1l: boolean
  items: { codigo?: string; descripcion: string; unidad: string; cantidad: number }[]
  historial: { fecha: string; estado: EstadoGuia; detalle: string | null }[]
  ticket: string | null; archivos: string[]; usuario: string | null; intentos: number
}

export function EstadoGuiaBadge({ estado }: { estado: EstadoGuia }) {
  const m: Record<EstadoGuia, { label: string; v: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    por_enviar: { label: "Por enviar", v: "outline", icon: <ClockIcon data-icon="inline-start" /> },
    enviado: { label: "En SUNAT", v: "secondary", icon: <Spinner data-icon="inline-start" /> },
    aceptado: { label: "Aceptada", v: "default", icon: <CheckCircle2Icon data-icon="inline-start" /> },
    rechazado: { label: "Rechazada", v: "destructive", icon: <XCircleIcon data-icon="inline-start" /> },
    error: { label: "Error de envío", v: "destructive", icon: <CircleAlertIcon data-icon="inline-start" /> },
  }
  const x = m[estado]
  return <Badge variant={x.v}>{x.icon}{x.label}</Badge>
}

const errorMsg = (e: unknown) => Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message
const descargar = (g: { id: number; numero: string }, t: "pdf" | "xml" | "cdr") =>
  descargarArchivo(`/guias/${g.id}/archivos/${t}`, `${g.numero}.${t === "cdr" ? "zip" : t}`)

export function GuiasPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState("")
  const [estado, setEstado] = useState("todos")
  const [pagina, setPagina] = useState(1)
  const qd = useDebounced(q)
  const verId = params.get("ver")

  const lista = useQuery({
    queryKey: ["guias", empresa?.id, qd, estado, pagina],
    enabled: !!empresa,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: Guia[]; meta: MetaPaginacion }>("/guias", {
      params: { q: qd || undefined, estado: estado === "todos" ? undefined : estado, page: pagina },
    })).data,
    refetchInterval: (query) => (query.state.data?.data.some((g) => g.estado === "por_enviar" || g.estado === "enviado") ? 4000 : false),
  })
  const reintentar = useMutation({
    mutationFn: async (id: number) => (await api.post<{ message: string }>(`/guias/${id}/reintentar`)).data,
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["guias"] }); qc.invalidateQueries({ queryKey: ["guia"] }) },
    onError: (e) => toast.error(errorMsg(e)),
  })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Guías de remisión"
        description="Guías de remisión remitente electrónicas (tipo 09) para sustentar el traslado de bienes."
        actions={puede("guias.emitir") && <Button asChild><Link to="/guias/nueva"><PlusIcon /> Nueva guía</Link></Button>}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1"><Buscador value={q} onChange={(v) => { setQ(v); setPagina(1) }} placeholder="T001-15, RUC/DNI o nombre del destinatario" /></div>
            <Select value={estado} onValueChange={(v) => { setEstado(v); setPagina(1) }}>
              <SelectTrigger className="sm:w-44" aria-label="Estado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="por_enviar">Por enviar</SelectItem>
                <SelectItem value="enviado">En SUNAT</SelectItem>
                <SelectItem value="aceptado">Aceptadas</SelectItem>
                <SelectItem value="rechazado">Rechazadas</SelectItem>
                <SelectItem value="error">Error de envío</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {lista.isLoading ? <Skeleton className="h-40" /> : lista.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(lista.error).message}</AlertDescription></Alert>
          ) : lista.data?.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <TruckIcon className="size-8" />
              {qd || estado !== "todos" ? "Ninguna guía coincide con la búsqueda." : "Aún no hay guías de remisión."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guía</TableHead><TableHead>Traslado</TableHead><TableHead>Destinatario</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Archivos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.data?.data.map((g) => (
                  <TableRow key={g.id} className="cursor-pointer" onClick={() => setParams({ ver: String(g.id) })}>
                    <TableCell>
                      <div className="font-mono">{g.numero}</div>
                      <div className="text-xs text-muted-foreground">{g.comprobante ? `Sustenta ${g.comprobante.numero}` : g.fecha_emision}</div>
                    </TableCell>
                    <TableCell>
                      <div>{g.fecha_traslado}</div>
                      <div className="text-xs text-muted-foreground">{g.motivo} · {g.modalidad.replace("Transporte ", "")}</div>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate">{g.destinatario.razon_social}</div>
                      <div className="font-mono text-xs text-muted-foreground">{g.destinatario.num_doc}</div>
                    </TableCell>
                    <TableCell><EstadoGuiaBadge estado={g.estado} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {g.estado === "aceptado" && (["pdf", "xml", "cdr"] as const).map((t) => (
                        <Button key={t} variant="ghost" size="icon" aria-label={`${t.toUpperCase()} de ${g.numero}`} onClick={() => descargar(g, t)}>
                          {t === "pdf" ? <FileTextIcon /> : t === "xml" ? <FileCodeIcon /> : <FileArchiveIcon />}
                        </Button>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Paginador meta={lista.data?.meta} onPage={setPagina} />
        </CardContent>
      </Card>
      <DetalleGuia id={verId ? Number(verId) : null} onClose={() => setParams({})} onReintentar={(id) => reintentar.mutate(id)} reintentando={reintentar.isPending} />
    </div>
  )
}

function DetalleGuia({ id, onClose, onReintentar, reintentando }: { id: number | null; onClose: () => void; onReintentar: (id: number) => void; reintentando: boolean }) {
  const { empresa, puede } = useAuth()
  const q = useQuery({
    queryKey: ["guia", empresa?.id, id],
    enabled: id !== null,
    queryFn: async () => (await api.get<{ data: GuiaDetalle }>(`/guias/${id}`)).data.data,
    refetchInterval: (query) => (query.state.data && ["por_enviar", "enviado"].includes(query.state.data.estado) ? 3000 : false),
  })
  const g = q.data
  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-mono">{g?.numero ?? "Guía de remisión"}</SheetTitle>
          <SheetDescription>{g ? `${g.motivo} · ${g.modalidad}` : "Cargando…"}</SheetDescription>
        </SheetHeader>
        {!g ? <div className="px-4"><Skeleton className="h-64" /></div> : (
          <div className="flex flex-col gap-5 px-4 pb-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <EstadoGuiaBadge estado={g.estado} />
              {g.sunat_codigo && <span className="text-muted-foreground">{g.sunat_codigo} {g.sunat_descripcion}</span>}
            </div>
            {g.estado === "error" && g.ultimo_error && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>No se completó el envío</AlertTitle>
                <AlertDescription>{g.ultimo_error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {(g.estado === "aceptado" ? (["pdf", "xml", "cdr"] as const) : g.estado !== "por_enviar" ? (["pdf"] as const) : []).map((t) => (
                <Button key={t} variant="outline" size="sm" onClick={() => descargar(g, t)}>
                  {t === "pdf" ? <FileTextIcon /> : t === "xml" ? <FileCodeIcon /> : <FileArchiveIcon />}{t === "pdf" && g.estado !== "aceptado" ? "Vista previa PDF" : t.toUpperCase()}
                </Button>
              ))}
              {puede("guias.emitir") && (g.estado === "error" || g.estado === "enviado") && (
                <Button size="sm" disabled={reintentando} onClick={() => onReintentar(g.id)}><RotateCwIcon /> {g.estado === "error" ? "Reenviar" : "Consultar estado"}</Button>
              )}
            </div>

            <Seccion titulo="Destinatario">
              <p>{g.destinatario.razon_social}</p>
              <p className="font-mono text-muted-foreground">{g.destinatario.num_doc}</p>
              {g.comprobante && <p className="text-muted-foreground">Sustenta el comprobante <span className="font-mono">{g.comprobante.numero}</span></p>}
            </Seccion>
            <Seccion titulo="Traslado">
              <Dato k="Fecha de traslado" v={g.fecha_traslado} />
              <Dato k="Peso bruto" v={`${g.peso_total} ${g.und_peso_total}`} />
              {g.num_bultos && <Dato k="Bultos" v={String(g.num_bultos)} />}
              <Dato k="Partida" v={`${g.partida.direccion} (${g.partida.ubigeo})`} />
              <Dato k="Llegada" v={`${g.llegada.direccion} (${g.llegada.ubigeo})`} />
            </Seccion>
            <Seccion titulo="Transporte">
              {g.transportista && <Dato k="Transportista" v={`${g.transportista.razon_social} · RUC ${g.transportista.num_doc}${g.transportista.nro_mtc ? ` · MTC ${g.transportista.nro_mtc}` : ""}`} />}
              {g.vehiculo_m1l && <p>Vehículo de categoría M1 o L</p>}
              {g.vehiculo && <Dato k="Vehículo" v={[g.vehiculo.placa, ...(g.vehiculo.secundarios ?? []).map((s) => s.placa)].join(", ")} />}
              {g.conductores.map((c) => <Dato key={c.num_doc} k={c.tipo ?? "Conductor"} v={`${c.nombres} ${c.apellidos} · ${c.num_doc} · Lic. ${c.licencia}`} />)}
            </Seccion>
            <Seccion titulo="Bienes">
              <Table>
                <TableHeader><TableRow><TableHead>Descripción</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow></TableHeader>
                <TableBody>
                  {g.items.map((i, n) => (
                    <TableRow key={n}>
                      <TableCell>{i.descripcion}{i.codigo && <div className="font-mono text-xs text-muted-foreground">{i.codigo}</div>}</TableCell>
                      <TableCell className="text-right font-mono">{i.cantidad} {i.unidad}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Seccion>
            <Separator />
            <Seccion titulo="Historial">
              <ol className="flex flex-col gap-2">
                {g.historial.map((h, n) => (
                  <li key={n} className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{new Date(h.fecha).toLocaleString("es-PE")}</span>
                    <span>{h.detalle ?? h.estado}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">Emitida por {g.usuario ?? "—"}{g.ticket && ` · ticket ${g.ticket}`}</p>
            </Seccion>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-1"><h3 className="font-medium">{titulo}</h3>{children}</section>
}

function Dato({ k, v }: { k: string; v: string }) {
  return <p><span className="text-muted-foreground">{k}: </span>{v}</p>
}
