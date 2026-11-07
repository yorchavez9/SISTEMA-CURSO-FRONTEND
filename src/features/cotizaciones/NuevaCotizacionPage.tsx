import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeftIcon, FileTextIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { soles, useDebounced } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import type { ClienteDto } from "@/features/clientes/ClientesPage"
import type { ProductoDto } from "@/features/productos/ProductosPage"
import { useCatalogos } from "@/features/tributos/ConfiguracionTributariaPage"
import { ClienteCombobox, ProductoCombobox } from "@/features/ventas/NuevaVentaPage"
import { api, toApiError } from "@/lib/api"

interface Linea { key: string; producto_id: number | null; descripcion: string; unidad: string; cantidad: string; precio: string; tip_afe_igv: string; descuento: string }

const uid = () => crypto.randomUUID()
const enDias = (n: number) => {
  const d = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date()) + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function NuevaCotizacionPage() {
  const { empresa, puede } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const cat = useCatalogos()
  const [cliente, setCliente] = useState<ClienteDto | null>(null)
  const [prospecto, setProspecto] = useState({ nombre: "", email: "" })
  const [validez, setValidez] = useState(enDias(15))
  const [observacion, setObservacion] = useState("Precios incluyen IGV.")
  const [lineas, setLineas] = useState<Linea[]>([])
  const [errores, setErrores] = useState<Record<string, string[]>>({})

  // Sin gratuitas: una cotización no las admite (el backend también lo valida).
  const afectaciones = (cat.data?.afectaciones_igv ?? []).filter((a) => a.activo && !a.es_gratuito)

  const cuerpo = lineas
    .filter((l) => Number(l.cantidad) > 0 && (l.producto_id || l.descripcion.trim()))
    .map((l) => ({
      producto_id: l.producto_id ?? undefined, descripcion: l.descripcion || undefined, unidad: l.unidad, cantidad: Number(l.cantidad),
      precio_unitario: Number(l.precio || 0), tip_afe_igv: l.tip_afe_igv, descuento: Number(l.descuento) > 0 ? Number(l.descuento) : undefined,
    }))
  const cuerpoPreview = useDebounced(JSON.stringify({ items: cuerpo }), 350)
  const preview = useQuery({
    queryKey: ["preview-cotizacion", empresa?.id, cuerpoPreview],
    enabled: cuerpo.length > 0 && !!empresa,
    retry: false,
    queryFn: async () => (await api.post<{ data: { totales: Record<string, string>; tasa_igv: number } }>("/ventas/preview", JSON.parse(cuerpoPreview))).data.data,
  })

  const guardar = useMutation({
    mutationFn: async () => (await api.post<{ data: { id: number }; message: string }>("/cotizaciones", {
      cliente_id: cliente?.id ?? null,
      cliente_nombre: cliente ? undefined : prospecto.nombre || undefined,
      cliente_email: cliente ? undefined : prospecto.email || undefined,
      fecha_validez: validez, moneda: "PEN", observacion: observacion || undefined, items: cuerpo,
    })).data,
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: ["cotizaciones"] })
      navigate(`/cotizaciones?ver=${r.data.id}`)
    },
    onError: (e) => {
      const ae = toApiError(e)
      setErrores(ae.errors)
      toast.error(Object.values(ae.errors)[0]?.[0] ?? ae.message)
    },
  })

  const agregarProducto = (p: ProductoDto) => setLineas((ls) => [...ls, {
    key: uid(), producto_id: p.id, descripcion: p.descripcion, unidad: p.unidad, cantidad: "1", precio: String(p.precio_venta), tip_afe_igv: p.tip_afe_igv, descuento: "",
  }])
  const agregarLibre = () => setLineas((ls) => [...ls, { key: uid(), producto_id: null, descripcion: "", unidad: "NIU", cantidad: "1", precio: "", tip_afe_igv: "10", descuento: "" }])
  const cambiar = (key: string, patch: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const resumenErrores = useMemo(() => Object.values(errores).flat(), [errores])

  if (!puede("cotizaciones.gestionar")) {
    return <Alert className="mx-auto max-w-3xl"><AlertTitle>Sin permiso para crear cotizaciones</AlertTitle></Alert>
  }
  const t = preview.data?.totales
  const bloqueo = cuerpo.length === 0 ? "Agrega al menos un ítem." : !cliente && !prospecto.nombre.trim() ? "Elige un cliente o escribe el nombre del prospecto." : null

  return (
    <form className="mx-auto flex w-full max-w-6xl flex-col gap-6" onSubmit={(e) => { e.preventDefault(); setErrores({}); guardar.mutate() }}>
      <PageHeader title="Nueva cotización" description="Precios con IGV incluido; los totales se calculan con el mismo motor que las ventas."
        actions={<Button type="button" variant="outline" asChild><Link to="/cotizaciones"><ArrowLeftIcon /> Volver</Link></Button>} />
      {resumenErrores.length > 0 && (
        <Alert variant="destructive"><AlertTitle>Revisa la cotización</AlertTitle><AlertDescription><ul className="list-disc pl-4">{resumenErrores.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}</ul></AlertDescription></Alert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>Cliente y validez</CardTitle></CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel>Cliente registrado</FieldLabel>
                  <ClienteCombobox value={cliente} onChange={setCliente} placeholder="Buscar cliente (opcional si es un prospecto)…" />
                  {cliente && <FieldDescription>{cliente.numero_documento}{cliente.email ? ` · ${cliente.email}` : ""}</FieldDescription>}
                  <FieldError>{errores.cliente_id?.[0]}</FieldError>
                </Field>
                {!cliente && (
                  <>
                    <Field>
                      <FieldLabel htmlFor="pnombre">o nombre del prospecto</FieldLabel>
                      <Input id="pnombre" value={prospecto.nombre} onChange={(e) => setProspecto({ ...prospecto, nombre: e.target.value })} placeholder="Ej. Bodega Don Lucho" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="pemail">Correo <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
                      <Input id="pemail" type="email" value={prospecto.email} onChange={(e) => setProspecto({ ...prospecto, email: e.target.value })} />
                    </Field>
                  </>
                )}
                <Field>
                  <FieldLabel htmlFor="validez">Válida hasta</FieldLabel>
                  <Input id="validez" type="date" min={enDias(0)} value={validez} onChange={(e) => setValidez(e.target.value)} required />
                  <FieldError>{errores.fecha_validez?.[0]}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ítems</CardTitle>
              <CardDescription>Precio unitario con IGV incluido.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {lineas.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Descripción</TableHead><TableHead className="w-24">Cant.</TableHead><TableHead className="w-28">P. unit.</TableHead><TableHead className="w-44">Afectación</TableHead><TableHead className="w-24">Dscto.</TableHead><TableHead className="w-10" /></TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineas.map((l) => (
                      <TableRow key={l.key}>
                        <TableCell><Input aria-label="Descripción" value={l.descripcion} onChange={(e) => cambiar(l.key, { descripcion: e.target.value })} required /></TableCell>
                        <TableCell><Input aria-label="Cantidad" type="number" min="0.0001" step="any" className="text-right tabular-nums" value={l.cantidad} onChange={(e) => cambiar(l.key, { cantidad: e.target.value })} /></TableCell>
                        <TableCell><Input aria-label="Precio unitario" type="number" min="0" step="any" className="text-right tabular-nums" value={l.precio} onChange={(e) => cambiar(l.key, { precio: e.target.value })} /></TableCell>
                        <TableCell>
                          <Select value={l.tip_afe_igv} onValueChange={(v) => cambiar(l.key, { tip_afe_igv: v })} disabled={!!l.producto_id}>
                            <SelectTrigger aria-label="Afectación IGV"><SelectValue /></SelectTrigger>
                            <SelectContent>{afectaciones.map((a) => <SelectItem key={a.codigo} value={a.codigo}>{a.codigo} · {a.descripcion}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input aria-label="Descuento" type="number" min="0" step="0.01" className="text-right tabular-nums" value={l.descuento} onChange={(e) => cambiar(l.key, { descuento: e.target.value })} /></TableCell>
                        <TableCell><Button type="button" variant="ghost" size="icon" aria-label="Quitar ítem" onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}><Trash2Icon /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="flex flex-wrap gap-2">
                <ProductoCombobox onSelect={agregarProducto} />
                <Button type="button" variant="outline" onClick={agregarLibre}><PlusIcon /> Ítem libre</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Observaciones</CardTitle></CardHeader>
            <CardContent>
              <Textarea aria-label="Observaciones" rows={3} maxLength={1000} value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Condiciones, plazos de entrega, forma de pago…" />
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-4">
          <CardHeader><CardTitle>Resumen</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {preview.isFetching && !t ? <Skeleton className="h-24" /> : !t ? <p className="text-muted-foreground">Agrega ítems para ver los totales.</p> : (
              <>
                {[["gravadas", "Op. gravadas"], ["exoneradas", "Op. exoneradas"], ["inafectas", "Op. inafectas"], ["exportacion", "Exportación"]].filter(([k]) => Number(t[k]) > 0).map(([k, label]) => (
                  <div key={k} className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{soles(Number(t[k]))}</span></div>
                ))}
                <div className="flex justify-between"><span className="text-muted-foreground">IGV ({preview.data?.tasa_igv} %)</span><span className="tabular-nums">{soles(Number(t.igv))}</span></div>
                <Separator />
                <div className="flex justify-between text-base font-medium"><span>Total</span><span className="tabular-nums">{soles(Number(t.total))}</span></div>
              </>
            )}
            {preview.isError && <p className="text-destructive">{toApiError(preview.error).message}</p>}
            {bloqueo && <p className="text-muted-foreground">{bloqueo}</p>}
            <Button type="submit" className="mt-2" disabled={!!bloqueo || guardar.isPending}>{guardar.isPending ? <Spinner /> : <FileTextIcon />} Guardar cotización</Button>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
