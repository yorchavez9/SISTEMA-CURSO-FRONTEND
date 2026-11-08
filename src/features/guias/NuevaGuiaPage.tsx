import { useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeftIcon, PlusIcon, Trash2Icon, TruckIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"

interface Opciones {
  series: { id: number; serie: string; establecimiento_id: number; establecimiento: string | null }[]
  establecimientos: { id: number; nombre: string; cod_local: string; ubigeo: string | null; direccion: string | null }[]
  motivos: { codigo: string; label: string }[]
  modalidades: { codigo: string; label: string }[]
  prefill: null | {
    comprobante: { id: number; numero: string }
    destinatario: { tipo_doc: string; num_doc: string; razon_social: string }
    llegada: { ubigeo: string; direccion: string }
    items: Item[]
  }
}
interface Item { codigo: string | null; descripcion: string; unidad: string; cantidad: number }
interface Conductor { tipo_doc: string; num_doc: string; nombres: string; apellidos: string; licencia: string }

const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date())
const conductorVacio = (): Conductor => ({ tipo_doc: "1", num_doc: "", nombres: "", apellidos: "", licencia: "" })
const UNIDADES = [["NIU", "Unidad"], ["KGM", "Kilogramo"], ["BX", "Caja"], ["PK", "Paquete"], ["MTR", "Metro"], ["LTR", "Litro"], ["ZZ", "Otros"]] as const
const DOCS = [["6", "RUC"], ["1", "DNI"], ["4", "Carné de extranjería"], ["7", "Pasaporte"]] as const

export function NuevaGuiaPage() {
  const { empresa } = useAuth()
  const [params] = useSearchParams()
  const comprobanteId = params.get("comprobante")
  const opciones = useQuery({
    queryKey: ["guias-opciones", empresa?.id, comprobanteId],
    enabled: !!empresa,
    queryFn: async () => (await api.get<{ data: Opciones }>("/guias/opciones", { params: { comprobante_id: comprobanteId ?? undefined } })).data.data,
  })

  if (opciones.isLoading || !opciones.data) {
    return opciones.isError
      ? <Alert variant="destructive" className="mx-auto max-w-5xl"><AlertDescription>{toApiError(opciones.error).message}</AlertDescription></Alert>
      : <div className="mx-auto w-full max-w-5xl"><Skeleton className="h-96" /></div>
  }
  if (opciones.data.series.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <PageHeader title="Nueva guía de remisión" />
        <Alert>
          <TruckIcon />
          <AlertTitle>No hay series de guía de remisión</AlertTitle>
          <AlertDescription>Sincroniza los establecimientos y series con la API en <Link className="underline" to="/configuracion/establecimientos">Establecimientos y series</Link>. Se necesita una serie de tipo 09 (por ejemplo T001).</AlertDescription>
        </Alert>
      </div>
    )
  }
  return <FormularioGuia o={opciones.data} />
}

/** Formulario: su estado inicial sale de las opciones ya cargadas (serie, partida y, si aplica, datos del comprobante). */
function FormularioGuia({ o }: { o: Opciones }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const idempotency = useRef(crypto.randomUUID())
  const partidaDe = (serieId: string) => {
    const s = o.series.find((x) => String(x.id) === serieId)
    const e = o.establecimientos.find((x) => x.id === s?.establecimiento_id)
    return { ubigeo: e?.ubigeo ?? "", direccion: e?.direccion ?? "" }
  }

  const [serieId, setSerieId] = useState(String(o.series[0].id))
  const [motivo, setMotivo] = useState("01")
  const [modalidad, setModalidad] = useState("02")
  const [fechaTraslado, setFechaTraslado] = useState(hoyLima())
  const [peso, setPeso] = useState("")
  const [undPeso, setUndPeso] = useState("KGM")
  const [bultos, setBultos] = useState("")
  const [dest, setDest] = useState(o.prefill?.destinatario ?? { tipo_doc: "6", num_doc: "", razon_social: "" })
  const [destinoId, setDestinoId] = useState("")
  const [partida, setPartida] = useState(() => partidaDe(String(o.series[0].id)))
  const [llegada, setLlegada] = useState(o.prefill?.llegada ?? { ubigeo: "", direccion: "" })
  const [transportista, setTransportista] = useState({ num_doc: "", razon_social: "", nro_mtc: "" })
  const [m1l, setM1l] = useState(false)
  const [placa, setPlaca] = useState("")
  const [placa2, setPlaca2] = useState("")
  const [conductores, setConductores] = useState<Conductor[]>([conductorVacio()])
  const [items, setItems] = useState<Item[]>(o.prefill?.items.length ? o.prefill.items : [{ codigo: null, descripcion: "", unidad: "NIU", cantidad: 1 }])
  const [errores, setErrores] = useState<Record<string, string[]>>({})

  const serie = o.series.find((s) => String(s.id) === serieId)
  const cambiarSerie = (v: string) => { setSerieId(v); setPartida(partidaDe(v)) }

  const entreLocales = motivo === "04"
  const publico = modalidad === "01"
  const err = (k: string) => errores[k]?.[0]
  const resumenErrores = useMemo(() => Object.values(errores).flat(), [errores])

  const emitir = useMutation({
    mutationFn: async () => (await api.post<{ data: { id: number; numero: string }; message: string }>("/guias", {
      idempotency_key: idempotency.current,
      serie_id: Number(serieId),
      comprobante_id: o.prefill?.comprobante.id ?? null,
      fecha_traslado: fechaTraslado,
      cod_traslado: motivo,
      mod_traslado: modalidad,
      peso_total: Number(peso),
      und_peso_total: undPeso,
      num_bultos: bultos ? Number(bultos) : null,
      destinatario: entreLocales ? null : dest,
      establecimiento_destino_id: entreLocales ? Number(destinoId) || null : null,
      partida,
      llegada: entreLocales ? null : llegada,
      transportista: publico ? transportista : null,
      vehiculo_m1l: !publico && m1l,
      vehiculo: !publico && !m1l ? { placa, secundarias: placa2 ? [placa2] : [] } : null,
      conductores: !publico && !m1l ? conductores : null,
      items,
    })).data,
    onSuccess: (r) => {
      toast.success(r.message)
      qc.invalidateQueries({ queryKey: ["guias"] })
      navigate(`/guias?ver=${r.data.id}`)
    },
    onError: (e) => {
      const ae = toApiError(e)
      setErrores(ae.errors)
      toast.error(Object.values(ae.errors)[0]?.[0] ?? ae.message)
    },
  })

  return (
    <form className="mx-auto flex w-full max-w-5xl flex-col gap-6" onSubmit={(e) => { e.preventDefault(); setErrores({}); emitir.mutate() }}>
      <PageHeader
        title="Nueva guía de remisión"
        description={o.prefill ? `Remitente · sustenta el comprobante ${o.prefill.comprobante.numero}` : "Guía de remisión remitente (tipo 09)"}
        actions={<Button variant="outline" asChild><Link to="/guias"><ArrowLeftIcon /> Volver</Link></Button>}
      />

      {resumenErrores.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Revisa los datos de la guía</AlertTitle>
          <AlertDescription><ul className="list-disc pl-4">{resumenErrores.slice(0, 6).map((m, i) => <li key={i}>{m}</li>)}</ul></AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle>Traslado</CardTitle></CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="serie">Serie</FieldLabel>
              <Select value={serieId} onValueChange={cambiarSerie}>
                <SelectTrigger id="serie"><SelectValue placeholder="Elige la serie" /></SelectTrigger>
                <SelectContent>{o.series.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.serie}{s.establecimiento && ` · ${s.establecimiento}`}</SelectItem>)}</SelectContent>
              </Select>
              <FieldError>{err("serie_id")}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="motivo">Motivo de traslado</FieldLabel>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger id="motivo"><SelectValue /></SelectTrigger>
                <SelectContent>{o.motivos.map((m) => <SelectItem key={m.codigo} value={m.codigo}>{m.codigo} · {m.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="modalidad">Modalidad</FieldLabel>
              <Select value={modalidad} onValueChange={setModalidad}>
                <SelectTrigger id="modalidad"><SelectValue /></SelectTrigger>
                <SelectContent>{o.modalidades.map((m) => <SelectItem key={m.codigo} value={m.codigo}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ftras">Fecha de traslado</FieldLabel>
              <Input id="ftras" type="date" min={hoyLima()} value={fechaTraslado} onChange={(e) => setFechaTraslado(e.target.value)} required />
              <FieldError>{err("fecha_traslado")}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="peso">Peso bruto total</FieldLabel>
              <div className="flex gap-2">
                <Input id="peso" type="number" inputMode="decimal" min="0.001" step="0.001" value={peso} onChange={(e) => setPeso(e.target.value)} required />
                <Select value={undPeso} onValueChange={setUndPeso}>
                  <SelectTrigger className="w-24" aria-label="Unidad de peso"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="KGM">kg</SelectItem><SelectItem value="TNE">t</SelectItem></SelectContent>
                </Select>
              </div>
              <FieldError>{err("peso_total")}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="bultos">Número de bultos <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
              <Input id="bultos" type="number" min="1" step="1" value={bultos} onChange={(e) => setBultos(e.target.value)} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Destinatario y llegada</CardTitle>
            {entreLocales && <CardDescription>En un traslado entre establecimientos propios, el destinatario es tu empresa.</CardDescription>}
          </CardHeader>
          <CardContent>
            {entreLocales ? (
              <Field>
                <FieldLabel htmlFor="destino">Establecimiento de destino</FieldLabel>
                <Select value={destinoId} onValueChange={setDestinoId}>
                  <SelectTrigger id="destino"><SelectValue placeholder="Elige el establecimiento" /></SelectTrigger>
                  <SelectContent>
                    {o.establecimientos.filter((e) => e.id !== serie?.establecimiento_id).map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.nombre} ({e.cod_local}) · {e.direccion}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{err("establecimiento_destino_id")}</FieldError>
              </Field>
            ) : (
              <FieldGroup className="gap-4">
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <Field>
                    <FieldLabel htmlFor="dtipo">Documento</FieldLabel>
                    <Select value={dest.tipo_doc} onValueChange={(v) => setDest({ ...dest, tipo_doc: v })}>
                      <SelectTrigger id="dtipo"><SelectValue /></SelectTrigger>
                      <SelectContent>{DOCS.map(([c, l]) => <SelectItem key={c} value={c}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="dnum">Número</FieldLabel>
                    <Input id="dnum" className="tabular-nums" value={dest.num_doc} onChange={(e) => setDest({ ...dest, num_doc: e.target.value.trim() })} required />
                    <FieldError>{err("destinatario.num_doc")}</FieldError>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="drs">Nombre o razón social</FieldLabel>
                  <Input id="drs" value={dest.razon_social} onChange={(e) => setDest({ ...dest, razon_social: e.target.value })} required />
                </Field>
                <UbigeoDireccion id="llegada" titulo="Punto de llegada" valor={llegada} onChange={setLlegada} errUbigeo={err("llegada.ubigeo")} errDireccion={err("llegada.direccion")} />
              </FieldGroup>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Punto de partida</CardTitle>
            <CardDescription>Por defecto, la dirección del establecimiento de la serie.</CardDescription>
          </CardHeader>
          <CardContent>
            <UbigeoDireccion id="partida" titulo="Partida" valor={partida} onChange={setPartida} errUbigeo={err("partida.ubigeo")} errDireccion={err("partida.direccion")} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{publico ? "Transportista" : "Vehículo y conductor"}</CardTitle></CardHeader>
        <CardContent>
          {publico ? (
            <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="truc">RUC del transportista</FieldLabel>
                <Input id="truc" className="tabular-nums" inputMode="numeric" maxLength={11} value={transportista.num_doc} onChange={(e) => setTransportista({ ...transportista, num_doc: e.target.value.trim() })} required />
                <FieldError>{err("transportista.num_doc")}</FieldError>
              </Field>
              <Field className="lg:col-span-2">
                <FieldLabel htmlFor="trs">Razón social</FieldLabel>
                <Input id="trs" value={transportista.razon_social} onChange={(e) => setTransportista({ ...transportista, razon_social: e.target.value })} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="tmtc">Registro MTC <span className="font-normal text-muted-foreground">(opcional)</span></FieldLabel>
                <Input id="tmtc" value={transportista.nro_mtc} onChange={(e) => setTransportista({ ...transportista, nro_mtc: e.target.value })} />
              </Field>
            </FieldGroup>
          ) : (
            <FieldGroup className="gap-4">
              <Field orientation="horizontal">
                <Switch id="m1l" checked={m1l} onCheckedChange={setM1l} />
                <FieldLabel htmlFor="m1l" className="flex-col items-start">
                  Vehículo de categoría M1 o L
                  <FieldDescription>Autos de hasta 8 asientos, motos y similares: no se registran placa ni conductor.</FieldDescription>
                </FieldLabel>
              </Field>
              {!m1l && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="placa">Placa</FieldLabel>
                      <Input id="placa" className="tabular-nums uppercase" placeholder="ABC123" value={placa} onChange={(e) => setPlaca(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))} />
                      <FieldError>{err("vehiculo.placa")}</FieldError>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="placa2">Placa secundaria <span className="font-normal text-muted-foreground">(remolque, opcional)</span></FieldLabel>
                      <Input id="placa2" className="tabular-nums uppercase" value={placa2} onChange={(e) => setPlaca2(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))} />
                    </Field>
                  </div>
                  {conductores.map((c, i) => (
                    <div key={i} className="grid gap-3 rounded-lg bg-foreground/5 p-3 sm:grid-cols-[8rem_1fr_1fr_1fr_9rem_auto] sm:items-end">
                      <Field>
                        <FieldLabel htmlFor={`ct${i}`}>{i === 0 ? "Conductor" : "Secundario"}</FieldLabel>
                        <Select value={c.tipo_doc} onValueChange={(v) => setConductores(conductores.map((x, j) => (j === i ? { ...x, tipo_doc: v } : x)))}>
                          <SelectTrigger id={`ct${i}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{DOCS.filter(([cod]) => cod !== "6").map(([cod, l]) => <SelectItem key={cod} value={cod}>{l}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`cn${i}`}>Número</FieldLabel>
                        <Input id={`cn${i}`} className="tabular-nums" value={c.num_doc} onChange={(e) => setConductores(conductores.map((x, j) => (j === i ? { ...x, num_doc: e.target.value.trim() } : x)))} />
                        <FieldError>{err(`conductores.${i}.num_doc`)}</FieldError>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`cno${i}`}>Nombres</FieldLabel>
                        <Input id={`cno${i}`} value={c.nombres} onChange={(e) => setConductores(conductores.map((x, j) => (j === i ? { ...x, nombres: e.target.value } : x)))} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`ca${i}`}>Apellidos</FieldLabel>
                        <Input id={`ca${i}`} value={c.apellidos} onChange={(e) => setConductores(conductores.map((x, j) => (j === i ? { ...x, apellidos: e.target.value } : x)))} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`cl${i}`}>Licencia</FieldLabel>
                        <Input id={`cl${i}`} className="tabular-nums uppercase" placeholder="Q12345678" value={c.licencia} onChange={(e) => setConductores(conductores.map((x, j) => (j === i ? { ...x, licencia: e.target.value.trim() } : x)))} />
                        <FieldError>{err(`conductores.${i}.licencia`)}</FieldError>
                      </Field>
                      <Button type="button" variant="destructive" size="icon" aria-label="Quitar conductor" disabled={conductores.length === 1} onClick={() => setConductores(conductores.filter((_, j) => j !== i))}><Trash2Icon /></Button>
                    </div>
                  ))}
                  {err("conductores") && <p className="text-sm text-destructive">{err("conductores")}</p>}
                  {conductores.length < 3 && (
                    <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setConductores([...conductores, conductorVacio()])}><PlusIcon /> Agregar conductor</Button>
                  )}
                </>
              )}
            </FieldGroup>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bienes trasladados</CardTitle>
          {o.prefill && <CardDescription>Se cargaron los bienes del comprobante {o.prefill.comprobante.numero} (sin servicios). Ajusta las cantidades si el traslado es parcial.</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow><TableHead className="w-36">Código</TableHead><TableHead>Descripción</TableHead><TableHead className="w-40">Unidad</TableHead><TableHead className="w-28 text-right">Cantidad</TableHead><TableHead className="w-12" /></TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell><Input aria-label="Código" className="tabular-nums" value={it.codigo ?? ""} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, codigo: e.target.value || null } : x)))} /></TableCell>
                  <TableCell><Input aria-label="Descripción" value={it.descripcion} required onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))} /></TableCell>
                  <TableCell>
                    <Select value={it.unidad} onValueChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, unidad: v } : x)))}>
                      <SelectTrigger aria-label="Unidad"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNIDADES.map(([c, l]) => <SelectItem key={c} value={c}>{c} · {l}</SelectItem>)}
                        {!UNIDADES.some(([c]) => c === it.unidad) && <SelectItem value={it.unidad}>{it.unidad}</SelectItem>}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input aria-label="Cantidad" type="number" min="0.0001" step="any" className="text-right tabular-nums" value={it.cantidad} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)))} /></TableCell>
                  <TableCell><Button type="button" variant="destructive" size="icon" aria-label="Quitar bien" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2Icon /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setItems([...items, { codigo: null, descripcion: "", unidad: "NIU", cantidad: 1 }])}><PlusIcon /> Agregar bien</Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" asChild><Link to="/guias">Cancelar</Link></Button>
        <Button type="submit" disabled={emitir.isPending || !serieId}>{emitir.isPending ? <Spinner /> : <TruckIcon />} Emitir guía</Button>
      </div>
    </form>
  )
}

function UbigeoDireccion({ id, titulo, valor, onChange, errUbigeo, errDireccion }: {
  id: string; titulo: string; valor: { ubigeo: string; direccion: string }; onChange: (v: { ubigeo: string; direccion: string }) => void; errUbigeo?: string; errDireccion?: string
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
      <Field>
        <FieldLabel htmlFor={`${id}-ub`}>Ubigeo</FieldLabel>
        <Input id={`${id}-ub`} className="tabular-nums" inputMode="numeric" maxLength={6} placeholder="150101" value={valor.ubigeo}
          onChange={(e) => onChange({ ...valor, ubigeo: e.target.value.replace(/\D/g, "") })} required />
        <FieldError>{errUbigeo}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-dir`}>{titulo}: dirección</FieldLabel>
        <Input id={`${id}-dir`} value={valor.direccion} onChange={(e) => onChange({ ...valor, direccion: e.target.value })} required />
        <FieldError>{errDireccion}</FieldError>
      </Field>
    </div>
  )
}
