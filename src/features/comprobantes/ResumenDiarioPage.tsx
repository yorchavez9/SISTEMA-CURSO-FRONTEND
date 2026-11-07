import { useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CalendarCheckIcon, InfoIcon, RotateCwIcon, SendIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Paginador, soles, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"
import { EstadoBaja, type Baja } from "./BajasPage"

interface FechaPendiente {
  fecha: string; registradas: number; sin_registrar: number; total: number; dias: number; es_hoy: boolean
  resumen_activo: { identifier: string | null; estado: Baja["estado"] } | null
}

const errorMsg = (e: unknown) => Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message
const fechaLarga = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })

export function ResumenDiarioPage() {
  const { empresa, puede, refresh } = useAuth()
  const qc = useQueryClient()
  const [pagina, setPagina] = useState(1)
  const [confirmar, setConfirmar] = useState<FechaPendiente | null>(null)

  const pendientes = useQuery({
    queryKey: ["resumenes-pendientes", empresa?.id],
    enabled: !!empresa,
    queryFn: async () => (await api.get<{ data: { modo: "individual" | "resumen"; fechas: FechaPendiente[] } }>("/resumenes/pendientes")).data.data,
  })
  const historial = useQuery({
    queryKey: ["resumenes", empresa?.id, pagina],
    enabled: !!empresa,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: Baja[]; meta: MetaPaginacion }>("/bajas", { params: { accion: "envio", page: pagina } })).data,
    refetchInterval: (query) => (query.state.data?.data.some((b) => b.estado === "por_enviar" || b.estado === "enviado") ? 5000 : false),
  })
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["resumenes"] })
    qc.invalidateQueries({ queryKey: ["resumenes-pendientes"] })
  }

  const modo = useMutation({
    mutationFn: async (v: string) => (await api.put<{ message: string }>(`/empresas/${empresa!.id}`, { envio_boletas: v })).data,
    onSuccess: async () => { await refresh(); invalidar(); toast.success("Modo de envío de boletas actualizado.") },
    onError: (e) => toast.error(errorMsg(e)),
  })
  const enviar = useMutation({
    mutationFn: async (fecha: string) => (await api.post<{ message: string }>("/resumenes", { fecha })).data,
    onSuccess: (r) => { toast.success(r.message); setConfirmar(null); invalidar() },
    onError: (e) => { toast.error(errorMsg(e)); setConfirmar(null) },
  })
  const reintentar = useMutation({
    mutationFn: async (id: number) => (await api.post<{ message: string }>(`/resumenes/${id}/reintentar`)).data,
    onSuccess: (r) => { toast.success(r.message); invalidar() },
    onError: (e) => toast.error(errorMsg(e)),
  })

  const fechas = pendientes.data?.fechas ?? []
  const atrasadas = fechas.filter((f) => !f.es_hoy && !f.resumen_activo).length

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Resumen diario de boletas"
        description="En modo resumen, las boletas se registran en la API al venderse y se informan a SUNAT juntas, en un resumen diario por fecha de emisión."
      />

      {puede("empresas.editar") && empresa && (
        <Card>
          <CardContent>
            <Field orientation="horizontal" className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <FieldLabel htmlFor="modo-boletas" className="flex-col items-start">
                Modo de envío de boletas
                <FieldDescription>Se aplica a las boletas que se emitan desde ahora. Las facturas y las notas siempre se envían una por una.</FieldDescription>
              </FieldLabel>
              <Select value={empresa.envio_boletas} disabled={modo.isPending} onValueChange={(v) => modo.mutate(v)}>
                <SelectTrigger id="modo-boletas" className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual (al emitirse)</SelectItem>
                  <SelectItem value="resumen">Por resumen diario</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
      )}

      {atrasadas > 0 && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{atrasadas === 1 ? "Hay 1 fecha" : `Hay ${atrasadas} fechas`} con boletas sin informar a SUNAT</AlertTitle>
          <AlertDescription>El sistema intenta enviarlas cada hora si el programador de tareas está activo. También puedes enviarlas ahora.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Boletas pendientes de resumen</CardTitle>
          <CardDescription>Solo se resumen fechas anteriores a hoy: SUNAT admite un único resumen de envío por fecha.</CardDescription>
        </CardHeader>
        <CardContent>
          {pendientes.isLoading ? <Skeleton className="h-24" /> : pendientes.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(pendientes.error).message}</AlertDescription></Alert>
          ) : fechas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <CalendarCheckIcon className="size-8" />
              {pendientes.data?.modo === "individual" ? "Las boletas se envían una por una al emitirse. No hay boletas pendientes de resumen." : "No hay boletas pendientes de resumen."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha de emisión</TableHead><TableHead className="text-right">Boletas</TableHead><TableHead className="text-right">Importe</TableHead>
                  <TableHead>Situación</TableHead><TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fechas.map((f) => (
                  <TableRow key={f.fecha}>
                    <TableCell>
                      <div className="capitalize">{fechaLarga(f.fecha)}</div>
                      <div className="text-xs text-muted-foreground">{f.es_hoy ? "Hoy" : f.dias === 1 ? "Hace 1 día" : `Hace ${f.dias} días`}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.registradas}
                      {f.sin_registrar > 0 && <div className="text-xs text-muted-foreground">+{f.sin_registrar} sin registrar</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{soles(f.total)}</TableCell>
                    <TableCell>
                      {f.resumen_activo ? (
                        <div className="flex flex-col items-start gap-1"><EstadoBaja estado={f.resumen_activo.estado} /><span className="tabular-nums text-xs text-muted-foreground">{f.resumen_activo.identifier ?? "Creando…"}</span></div>
                      ) : f.es_hoy ? <Badge variant="outline">Se envía desde mañana</Badge>
                        : f.sin_registrar > 0 ? <Badge variant="outline">Esperando registro en la API</Badge>
                        : <Badge variant="secondary">Lista para enviar</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {puede("comprobantes.emitir") && !f.es_hoy && !f.resumen_activo && (
                        <Button size="sm" disabled={f.sin_registrar > 0 || f.registradas === 0 || enviar.isPending} onClick={() => setConfirmar(f)}><SendIcon /> Enviar resumen</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resúmenes enviados</CardTitle>
          <CardDescription>Estado ante SUNAT de cada resumen diario de envío.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {historial.isLoading ? <Skeleton className="h-24" /> : historial.data?.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aún no se ha enviado ningún resumen.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Resumen</TableHead><TableHead>Fecha de boletas</TableHead><TableHead>Boletas</TableHead><TableHead>Estado</TableHead><TableHead className="w-12" /></TableRow>
              </TableHeader>
              <TableBody>
                {historial.data?.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><div className="tabular-nums">{r.identifier ?? "—"}</div><div className="text-xs text-muted-foreground">{r.usuario}</div></TableCell>
                    <TableCell>{r.fecha_documentos}</TableCell>
                    <TableCell className="max-w-72">
                      <div className="truncate tabular-nums text-sm">{r.comprobantes.map((c) => c.numero).join(", ") || "—"}</div>
                      {r.documentos_externos > 0 && <div className="text-xs text-muted-foreground">+{r.documentos_externos} de otro sistema con la misma cuenta</div>}
                    </TableCell>
                    <TableCell>
                      <EstadoBaja estado={r.estado} />
                      {(r.sunat_descripcion || r.ultimo_error) && <div className="mt-1 max-w-72 text-xs text-muted-foreground">{r.ultimo_error ?? `${r.sunat_codigo} ${r.sunat_descripcion}`}</div>}
                    </TableCell>
                    <TableCell>
                      {puede("comprobantes.emitir") && (r.estado === "enviado" || (r.estado === "por_enviar" && r.identifier)) && (
                        <Button variant="ghost" size="icon" aria-label="Reintentar" disabled={reintentar.isPending} onClick={() => reintentar.mutate(r.id)}><RotateCwIcon /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Paginador meta={historial.data?.meta} onPage={setPagina} />
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar el resumen del {confirmar && fechaLarga(confirmar.fecha)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se informarán a SUNAT {confirmar?.registradas} boleta(s) por {confirmar && soles(confirmar.total)}. Solo se admite un resumen de envío por fecha.
              La API incluye todas las boletas pendientes de esa fecha en la cuenta, también las emitidas por otro sistema que use las mismas credenciales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={enviar.isPending} onClick={(e) => { e.preventDefault(); if (confirmar) enviar.mutate(confirmar.fecha) }}>Enviar resumen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
