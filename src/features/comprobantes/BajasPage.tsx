import { useState } from "react"
import { Link } from "react-router"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BanIcon, RotateCwIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Paginador, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"

export interface Baja {
  id: number; tipo: "RA" | "RC"; accion: "anulacion" | "envio"; documentos_externos: number; tipo_label: string; fecha_documentos: string; motivo: string
  estado: "por_enviar" | "enviado" | "aceptado" | "rechazado" | "error"
  identifier: string | null; sunat_codigo: string | null; sunat_descripcion: string | null; ultimo_error: string | null; usuario: string | null; creado: string
  comprobantes: { id: number; numero: string; total: number; estado: string }[]
}

export function EstadoBaja({ estado }: { estado: Baja["estado"] }) {
  const m = { por_enviar: ["Por enviar", "outline"], enviado: ["En SUNAT", "secondary"], aceptado: ["Aceptada", "default"], rechazado: ["Rechazada", "destructive"], error: ["Error de envío", "destructive"] } as const
  return <Badge variant={m[estado][1]}>{m[estado][0]}</Badge>
}

export function BajaDialog({ comprobante, onClose, onDone }: { comprobante: { id: number; numero: string; tipo_documento: string; plazo: string }; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState("")
  const m = useMutation({
    mutationFn: async () => (await api.post<{ message: string }>("/bajas", { comprobante_ids: [comprobante.id], motivo })).data,
    onSuccess: (r) => { toast.success(r.message); onDone(); onClose() },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })
  const esBoleta = comprobante.tipo_documento === "03"
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dar de baja {comprobante.numero}</DialogTitle>
          <DialogDescription>
            Se enviará {esBoleta ? "un resumen diario de anulación (RC)" : "una comunicación de baja (RA)"} a SUNAT. Plazo hasta el {comprobante.plazo}.
            Al ser aceptada, el comprobante y la venta quedan anulados y la mercadería vuelve al almacén.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="motivo-baja">Motivo</FieldLabel>
            <Input id="motivo-baja" maxLength={100} placeholder="Ej. Error en los datos del cliente" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <FieldDescription>Si el cliente ya pagó, considera una nota de crédito 01 con reembolso en lugar de la baja.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={motivo.trim().length < 5 || m.isPending} onClick={() => m.mutate()}>{m.isPending && <Spinner />} Dar de baja</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BajasPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ["bajas", empresa?.id, pagina],
    enabled: !!empresa,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: Baja[]; meta: MetaPaginacion }>("/bajas", { params: { page: pagina } })).data,
    refetchInterval: (query) => (query.state.data?.data.some((b) => b.estado === "por_enviar" || b.estado === "enviado") ? 5000 : false),
  })
  const reintentar = useMutation({
    mutationFn: async (id: number) => (await api.post<{ message: string }>(`/bajas/${id}/reintentar`)).data,
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["bajas"] }) },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title="Bajas ante SUNAT" description="Comunicaciones de baja (facturas y sus notas) y resúmenes diarios de anulación (boletas). Se solicitan desde el detalle de cada comprobante." />
      <Card>
        <CardContent className="flex flex-col gap-4">
          {q.isLoading ? <Skeleton className="h-32" /> : q.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(q.error).message}</AlertDescription></Alert>
          ) : q.data?.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><BanIcon className="size-8" /> Aún no hay bajas. <Link className="underline" to="/comprobantes">Ir a comprobantes</Link></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Comunicación</TableHead><TableHead>Comprobantes</TableHead><TableHead>Motivo</TableHead><TableHead>Estado</TableHead><TableHead className="w-12" /></TableRow>
              </TableHeader>
              <TableBody>
                {q.data?.data.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell><div className="font-mono">{b.identifier ?? "—"}</div><div className="text-xs text-muted-foreground">{b.tipo_label} · {b.usuario}</div></TableCell>
                    <TableCell className="font-mono text-sm">{b.comprobantes.map((c) => c.numero).join(", ")}</TableCell>
                    <TableCell className="max-w-56 truncate text-sm">{b.motivo}</TableCell>
                    <TableCell>
                      <EstadoBaja estado={b.estado} />
                      {(b.sunat_descripcion || b.ultimo_error) && <div className="mt-1 max-w-72 text-xs text-muted-foreground">{b.ultimo_error ?? `${b.sunat_codigo} ${b.sunat_descripcion}`}</div>}
                    </TableCell>
                    <TableCell>
                      {puede("comprobantes.anular") && (b.estado === "error" || b.estado === "enviado") && (
                        <Button variant="ghost" size="icon" aria-label="Reintentar" disabled={reintentar.isPending} onClick={() => reintentar.mutate(b.id)}><RotateCwIcon /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Paginador meta={q.data?.meta} onPage={setPagina} />
        </CardContent>
      </Card>
    </div>
  )
}
