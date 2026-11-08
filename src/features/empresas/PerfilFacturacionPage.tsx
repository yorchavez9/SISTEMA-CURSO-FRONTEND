import { useRef, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  BadgeCheckIcon, Building2Icon, FileKey2Icon, ImageIcon, InfoIcon, KeyRoundIcon, LandmarkIcon, PlusIcon, ReceiptTextIcon, SaveIcon, ShieldAlertIcon, Trash2Icon, UploadIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"

interface Cuenta { banco: string; tipo_cuenta: string; moneda: "PEN" | "USD"; numero: string; cci?: string | null; titular?: string | null }
interface Billetera { tipo: "yape" | "plin" | "tunki" | "otro"; numero: string; titular?: string | null }
interface Perfil {
  entorno_sistema: string; entorno_api: string | null; ruc: string | null
  razon_social: string | null; nombre_comercial: string | null; direccion: string | null
  ubigeo: string | null; departamento: string | null; provincia: string | null; distrito: string | null
  telefonos: string[]; emails: string[]; cuentas_bancarias: Cuenta[]; billeteras_digitales: Billetera[]
  mensaje_agradecimiento: string | null; mensaje_promocional: string | null
  logo_url: string | null; tiene_certificado: boolean
  sol_user: string | null; tiene_sol_pass: boolean; client_id: string | null; tiene_client_secret: boolean
  tax_regime: "general" | "rer" | "mype" | "rus" | null; nrus_categoria: number | null; igv_rate_override: number | null; tasa_igv_vigente: number | null
  plan: string | null; documentos_este_mes: number | null; max_documentos_mes: number | null
}
type Errores = Record<string, string[]>

const REGIMENES = { general: "Régimen General", mype: "Régimen MYPE Tributario", rer: "Régimen Especial (RER)", rus: "Nuevo RUS" } as const
const BILLETERAS = { yape: "Yape", plin: "Plin", tunki: "Tunki", otro: "Otra" } as const

/** Configuración de la empresa en la API de facturación: lo que sale en el XML y en los PDF de los comprobantes. */
export function PerfilFacturacionPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const editable = puede("empresas.editar")
  const clave = ["perfil-api", empresa?.id]
  const q = useQuery({
    queryKey: clave,
    enabled: !!empresa,
    queryFn: async () => (await api.get<{ data: Perfil }>(`/empresas/${empresa!.id}/perfil-api`)).data.data,
    staleTime: 60_000,
  })
  const actualizado = (p: Perfil) => qc.setQueryData(clave, p)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Datos de la empresa"
      />
      {q.isLoading ? <Skeleton className="h-96" /> : q.isError ? (
        <Alert variant="destructive">
          <ShieldAlertIcon />
          <AlertTitle>No se pudo leer la configuración</AlertTitle>
          <AlertDescription>{toApiError(q.error).message} Revisa las credenciales en Configuración → Conexión API.</AlertDescription>
        </Alert>
      ) : q.data && empresa && (
        <>
          <Resumen p={q.data} />
          <Tabs defaultValue="datos">
            <TabsList className="flex-wrap">
              <TabsTrigger value="datos"><Building2Icon /> Datos</TabsTrigger>
              <TabsTrigger value="pdf"><ReceiptTextIcon /> Logo y PDF</TabsTrigger>
              <TabsTrigger value="certificado"><FileKey2Icon /> Certificado</TabsTrigger>
              <TabsTrigger value="sunat"><KeyRoundIcon /> Claves SUNAT</TabsTrigger>
              <TabsTrigger value="regimen"><LandmarkIcon /> Régimen</TabsTrigger>
            </TabsList>
            {/* key: cada pestaña reinicia su formulario cuando llega un perfil nuevo */}
            <TabsContent value="datos"><DatosTab key={JSON.stringify(q.data)} p={q.data} empresaId={empresa.id} editable={editable} onOk={actualizado} /></TabsContent>
            <TabsContent value="pdf"><PdfTab key={JSON.stringify(q.data)} p={q.data} empresaId={empresa.id} editable={editable} onOk={actualizado} /></TabsContent>
            <TabsContent value="certificado"><CertificadoTab p={q.data} empresaId={empresa.id} editable={editable} onOk={actualizado} /></TabsContent>
            <TabsContent value="sunat"><SunatTab key={JSON.stringify(q.data)} p={q.data} empresaId={empresa.id} editable={editable} onOk={actualizado} /></TabsContent>
            <TabsContent value="regimen"><RegimenTab key={JSON.stringify(q.data)} p={q.data} empresaId={empresa.id} editable={editable} onOk={actualizado} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

function Resumen({ p }: { p: Perfil }) {
  const uso = p.max_documentos_mes ? Math.min(100, Math.round(((p.documentos_este_mes ?? 0) / p.max_documentos_mes) * 100)) : null
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {p.logo_url ? <img src={p.logo_url} alt="Logo" className="size-full object-contain" /> : <ImageIcon className="size-8 text-muted-foreground" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="truncate text-lg font-semibold">{p.nombre_comercial || p.razon_social}</div>
          <div className="truncate text-sm text-muted-foreground">RUC <span className="tabular-nums">{p.ruc}</span> · {p.razon_social}</div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant={p.tiene_certificado ? "secondary" : "destructive"}>{p.tiene_certificado ? <><BadgeCheckIcon /> Certificado cargado</> : "Sin certificado"}</Badge>
            {p.tax_regime && <Badge variant="outline">{REGIMENES[p.tax_regime]} · IGV {p.tasa_igv_vigente ?? "—"}%</Badge>}
            {p.plan && <Badge variant="outline">Plan {p.plan}</Badge>}
          </div>
        </div>
        {uso !== null && (
          <div className="flex w-full flex-col gap-1 sm:w-48">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Documentos del mes</span><span className="tabular-nums">{p.documentos_este_mes} / {p.max_documentos_mes}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${uso}%` }} /></div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Guarda en la API los campos enviados (PUT parcial) y devuelve el perfil actualizado. */
function useGuardar(empresaId: number, onOk: (p: Perfil) => void, setErrores: (e: Errores) => void) {
  return useMutation({
    mutationFn: async (body: Partial<Record<string, unknown>>) => (await api.put<{ data: Perfil; message: string }>(`/empresas/${empresaId}/perfil-api`, body)).data,
    onMutate: () => setErrores({}),
    onSuccess: (r) => { toast.success(r.message); onOk(r.data) },
    onError: (e) => {
      const err = toApiError(e)
      setErrores(err.errors)
      toast.error(Object.values(err.errors)[0]?.[0] ?? err.message)
    },
  })
}

function Pie({ editable, pendiente, onGuardar, children }: { editable: boolean; pendiente: boolean; onGuardar: () => void; children?: ReactNode }) {
  if (!editable) return <CardFooter><p className="text-sm text-muted-foreground">Solo lectura: necesitas el permiso de editar empresas.</p></CardFooter>
  return (
    <CardFooter className="justify-between gap-2">
      <div className="text-sm text-muted-foreground">{children}</div>
      <Button onClick={onGuardar} disabled={pendiente}>{pendiente ? <Spinner data-icon="inline-start" /> : <SaveIcon />} Guardar</Button>
    </CardFooter>
  )
}

const err = (e: Errores, k: string) => (e[k] ? [{ message: e[k][0] }] : [])

// ------------------------------------------------------------------ Datos generales

interface TabProps { p: Perfil; empresaId: number; editable: boolean; onOk: (p: Perfil) => void }

function DatosTab({ p, empresaId, editable, onOk }: TabProps) {
  const [f, setF] = useState({
    razon_social: p.razon_social ?? "", nombre_comercial: p.nombre_comercial ?? "", direccion: p.direccion ?? "",
    ubigeo: p.ubigeo ?? "", departamento: p.departamento ?? "", provincia: p.provincia ?? "", distrito: p.distrito ?? "",
    telefonos: p.telefonos.length ? p.telefonos : [""], emails: p.emails.length ? p.emails : [""],
  })
  const [e, setE] = useState<Errores>({})
  const g = useGuardar(empresaId, onOk, setE)
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: ev.target.value })
  const guardar = () => g.mutate({
    razon_social: f.razon_social, nombre_comercial: f.nombre_comercial || null, direccion: f.direccion || null,
    ubigeo: f.ubigeo || null, departamento: f.departamento || null, provincia: f.provincia || null, distrito: f.distrito || null,
    telefonos: f.telefonos.map((t) => t.trim()).filter(Boolean), emails: f.emails.map((t) => t.trim()).filter(Boolean),
  })

  return (
    <Card>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!e.razon_social}>
              <FieldLabel htmlFor="pf-rs">Razón social</FieldLabel>
              <Input id="pf-rs" value={f.razon_social} onChange={set("razon_social")} disabled={!editable} aria-invalid={!!e.razon_social} />
              <FieldError errors={err(e, "razon_social")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pf-nc">Nombre comercial</FieldLabel>
              <Input id="pf-nc" value={f.nombre_comercial} onChange={set("nombre_comercial")} disabled={!editable} />
            </Field>
          </div>
          <Field data-invalid={!!e.direccion}>
            <FieldLabel htmlFor="pf-dir">Dirección fiscal</FieldLabel>
            <Input id="pf-dir" value={f.direccion} onChange={set("direccion")} disabled={!editable} />
            <FieldError errors={err(e, "direccion")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field data-invalid={!!e.ubigeo}>
              <FieldLabel htmlFor="pf-ub">Ubigeo</FieldLabel>
              <Input id="pf-ub" className="tabular-nums" inputMode="numeric" maxLength={6} value={f.ubigeo} onChange={set("ubigeo")} disabled={!editable} aria-invalid={!!e.ubigeo} />
              <FieldError errors={err(e, "ubigeo")} />
            </Field>
            <Field><FieldLabel htmlFor="pf-dep">Departamento</FieldLabel><Input id="pf-dep" value={f.departamento} onChange={set("departamento")} disabled={!editable} /></Field>
            <Field><FieldLabel htmlFor="pf-prov">Provincia</FieldLabel><Input id="pf-prov" value={f.provincia} onChange={set("provincia")} disabled={!editable} /></Field>
            <Field><FieldLabel htmlFor="pf-dis">Distrito</FieldLabel><Input id="pf-dis" value={f.distrito} onChange={set("distrito")} disabled={!editable} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ListaTexto titulo="Teléfonos" valores={f.telefonos} onChange={(v) => setF({ ...f, telefonos: v })} editable={editable} placeholder="+51 999 888 777" errores={e} campo="telefonos" />
            <ListaTexto titulo="Correos" valores={f.emails} onChange={(v) => setF({ ...f, emails: v })} editable={editable} placeholder="ventas@empresa.pe" errores={e} campo="emails" tipo="email" />
          </div>
        </FieldGroup>
      </CardContent>
      <Pie editable={editable} pendiente={g.isPending} onGuardar={guardar} />
    </Card>
  )
}

function ListaTexto({ titulo, valores, onChange, editable, placeholder, errores, campo, tipo = "text" }: {
  titulo: string; valores: string[]; onChange: (v: string[]) => void; editable: boolean; placeholder: string; errores: Errores; campo: string; tipo?: string
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{titulo}</FieldLegend>
      <div className="flex flex-col gap-2">
        {valores.map((v, i) => (
          <Field key={i} data-invalid={!!errores[`${campo}.${i}`]}>
            <div className="flex gap-2">
              <Input type={tipo} value={v} placeholder={placeholder} disabled={!editable} aria-label={`${titulo} ${i + 1}`}
                onChange={(ev) => onChange(valores.map((x, j) => (j === i ? ev.target.value : x)))} />
              {editable && valores.length > 1 && (
                <Button type="button" variant="destructive" size="icon" aria-label={`Quitar ${titulo.toLowerCase()} ${i + 1}`} onClick={() => onChange(valores.filter((_, j) => j !== i))}><Trash2Icon /></Button>
              )}
            </div>
            <FieldError errors={err(errores, `${campo}.${i}`)} />
          </Field>
        ))}
        {editable && valores.length < 5 && (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...valores, ""])}><PlusIcon /> Agregar</Button>
        )}
      </div>
    </FieldSet>
  )
}

// ------------------------------------------------------------------ Logo y PDF

function PdfTab({ p, empresaId, editable, onOk }: TabProps) {
  const [f, setF] = useState({
    mensaje_agradecimiento: p.mensaje_agradecimiento ?? "", mensaje_promocional: p.mensaje_promocional ?? "",
    cuentas_bancarias: p.cuentas_bancarias.map((c) => ({ ...c, cci: c.cci ?? "", titular: c.titular ?? "" })),
    billeteras_digitales: p.billeteras_digitales.map((b) => ({ ...b, titular: b.titular ?? "" })),
  })
  const [e, setE] = useState<Errores>({})
  const g = useGuardar(empresaId, onOk, setE)
  const guardar = () => g.mutate({
    mensaje_agradecimiento: f.mensaje_agradecimiento || null, mensaje_promocional: f.mensaje_promocional || null,
    cuentas_bancarias: f.cuentas_bancarias.map((c) => ({ ...c, cci: c.cci || null, titular: c.titular || null })),
    billeteras_digitales: f.billeteras_digitales.map((b) => ({ ...b, titular: b.titular || null })),
  })
  const setCuenta = (i: number, k: keyof Cuenta, v: string) => setF({ ...f, cuentas_bancarias: f.cuentas_bancarias.map((c, j) => (j === i ? { ...c, [k]: v } : c)) })
  const setBilletera = (i: number, k: keyof Billetera, v: string) => setF({ ...f, billeteras_digitales: f.billeteras_digitales.map((b, j) => (j === i ? { ...b, [k]: v } : b)) })

  return (
    <div className="flex flex-col gap-6">
      <LogoCard p={p} empresaId={empresaId} editable={editable} onOk={onOk} />
      <Card>
        <CardHeader>
          <CardTitle>Mensajes y medios de pago del PDF</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!e.mensaje_agradecimiento}>
                <FieldLabel htmlFor="pf-ma">Mensaje de agradecimiento</FieldLabel>
                <Textarea id="pf-ma" rows={3} maxLength={500} value={f.mensaje_agradecimiento} disabled={!editable} placeholder="Gracias por su compra"
                  onChange={(ev) => setF({ ...f, mensaje_agradecimiento: ev.target.value })} />
                <FieldDescription>{f.mensaje_agradecimiento.length}/500</FieldDescription>
              </Field>
              <Field data-invalid={!!e.mensaje_promocional}>
                <FieldLabel htmlFor="pf-mp">Mensaje promocional</FieldLabel>
                <Textarea id="pf-mp" rows={3} maxLength={500} value={f.mensaje_promocional} disabled={!editable} placeholder="Síguenos en redes · 10% de descuento en tu próxima compra"
                  onChange={(ev) => setF({ ...f, mensaje_promocional: ev.target.value })} />
                <FieldDescription>{f.mensaje_promocional.length}/500</FieldDescription>
              </Field>
            </div>

            <FieldSet>
              <FieldLegend variant="label">Cuentas bancarias (hasta 5)</FieldLegend>
              <div className="flex flex-col gap-3">
                {f.cuentas_bancarias.map((c, i) => (
                  <div key={i} className="grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_8rem_6rem_1fr_auto]">
                    <Input aria-label="Banco" placeholder="Banco (BCP, BBVA…)" value={c.banco} disabled={!editable} onChange={(ev) => setCuenta(i, "banco", ev.target.value)} aria-invalid={!!e[`cuentas_bancarias.${i}.banco`]} />
                    <Input aria-label="Tipo de cuenta" placeholder="Corriente / Ahorros" value={c.tipo_cuenta} disabled={!editable} onChange={(ev) => setCuenta(i, "tipo_cuenta", ev.target.value)} aria-invalid={!!e[`cuentas_bancarias.${i}.tipo_cuenta`]} />
                    <Select value={c.moneda} disabled={!editable} onValueChange={(v) => setCuenta(i, "moneda", v)}>
                      <SelectTrigger aria-label="Moneda"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="PEN">Soles</SelectItem><SelectItem value="USD">Dólares</SelectItem></SelectContent>
                    </Select>
                    <Input aria-label="Número de cuenta" className="tabular-nums" placeholder="Número de cuenta" value={c.numero} disabled={!editable} onChange={(ev) => setCuenta(i, "numero", ev.target.value)} aria-invalid={!!e[`cuentas_bancarias.${i}.numero`]} />
                    {editable && <Button type="button" variant="destructive" size="icon" aria-label="Quitar cuenta" onClick={() => setF({ ...f, cuentas_bancarias: f.cuentas_bancarias.filter((_, j) => j !== i) })}><Trash2Icon /></Button>}
                    <Input aria-label="CCI" className="tabular-nums sm:col-span-2" placeholder="CCI (opcional)" value={c.cci ?? ""} disabled={!editable} onChange={(ev) => setCuenta(i, "cci", ev.target.value)} />
                    <Input aria-label="Titular" className="sm:col-span-2" placeholder="Titular (opcional)" value={c.titular ?? ""} disabled={!editable} onChange={(ev) => setCuenta(i, "titular", ev.target.value)} />
                  </div>
                ))}
                {editable && f.cuentas_bancarias.length < 5 && (
                  <Button type="button" variant="outline" size="sm" className="self-start"
                    onClick={() => setF({ ...f, cuentas_bancarias: [...f.cuentas_bancarias, { banco: "", tipo_cuenta: "Corriente", moneda: "PEN", numero: "", cci: "", titular: "" }] })}>
                    <PlusIcon /> Agregar cuenta
                  </Button>
                )}
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Billeteras digitales (hasta 5)</FieldLegend>
              <div className="flex flex-col gap-2">
                {f.billeteras_digitales.map((b, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[9rem_10rem_1fr_auto]">
                    <Select value={b.tipo} disabled={!editable} onValueChange={(v) => setBilletera(i, "tipo", v)}>
                      <SelectTrigger aria-label="Billetera"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(BILLETERAS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input aria-label="Número" className="tabular-nums" placeholder="Número" value={b.numero} disabled={!editable} onChange={(ev) => setBilletera(i, "numero", ev.target.value)} aria-invalid={!!e[`billeteras_digitales.${i}.numero`]} />
                    <Input aria-label="Titular" placeholder="Titular (opcional)" value={b.titular ?? ""} disabled={!editable} onChange={(ev) => setBilletera(i, "titular", ev.target.value)} />
                    {editable && <Button type="button" variant="destructive" size="icon" aria-label="Quitar billetera" onClick={() => setF({ ...f, billeteras_digitales: f.billeteras_digitales.filter((_, j) => j !== i) })}><Trash2Icon /></Button>}
                  </div>
                ))}
                {editable && f.billeteras_digitales.length < 5 && (
                  <Button type="button" variant="outline" size="sm" className="self-start"
                    onClick={() => setF({ ...f, billeteras_digitales: [...f.billeteras_digitales, { tipo: "yape", numero: "", titular: "" }] })}>
                    <PlusIcon /> Agregar billetera
                  </Button>
                )}
              </div>
            </FieldSet>
          </FieldGroup>
        </CardContent>
        <Pie editable={editable} pendiente={g.isPending} onGuardar={guardar} />
      </Card>
    </div>
  )
}

function LogoCard({ p, empresaId, editable, onOk }: TabProps) {
  const ref = useRef<HTMLInputElement>(null)
  const subir = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData()
      fd.append("logo", f)
      return (await api.post<{ data: Perfil; message: string }>(`/empresas/${empresaId}/perfil-api/logo`, fd)).data
    },
    onSuccess: (r) => { toast.success(r.message); onOk(r.data) },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })
  const elegir = (f?: File) => {
    if (!f) return
    if (!["image/png", "image/jpeg"].includes(f.type)) return toast.error("El logo debe ser PNG o JPG.")
    if (f.size > 2 * 1024 * 1024) return toast.error("El logo no debe pasar de 2 MB.")
    subir.mutate(f)
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
        <CardDescription>PNG o JPG, hasta 2 MB.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="flex h-28 w-56 items-center justify-center overflow-hidden rounded-lg bg-white p-2 ring-1 ring-foreground/10">
          {p.logo_url ? <img src={p.logo_url} alt="Logo de la empresa" className="max-h-full max-w-full object-contain" /> : <ImageIcon className="size-8 text-muted-foreground" />}
        </div>
        {editable && (
          <>
            <Button variant="outline" disabled={subir.isPending} onClick={() => ref.current?.click()}>
              {subir.isPending ? <Spinner data-icon="inline-start" /> : <UploadIcon />} {p.logo_url ? "Cambiar logo" : "Subir logo"}
            </Button>
            <input ref={ref} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(ev) => { elegir(ev.target.files?.[0]); ev.target.value = "" }} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------------ Certificado digital

function CertificadoTab({ p, empresaId, editable, onOk }: TabProps) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [clave, setClave] = useState("")
  const [e, setE] = useState<Errores>({})
  const ref = useRef<HTMLInputElement>(null)
  const subir = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append("certificado", archivo!)
      fd.append("contrasena_certificado", clave)
      return (await api.post<{ data: Perfil; message: string }>(`/empresas/${empresaId}/perfil-api/certificado`, fd)).data
    },
    onMutate: () => setE({}),
    onSuccess: (r) => { toast.success(r.message); setArchivo(null); setClave(""); onOk(r.data) },
    onError: (er) => { const x = toApiError(er); setE(x.errors); toast.error(Object.values(x.errors)[0]?.[0] ?? x.message) },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificado digital</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Alert variant={p.tiene_certificado ? "default" : "destructive"}>
            {p.tiene_certificado ? <BadgeCheckIcon /> : <ShieldAlertIcon />}
            <AlertTitle>{p.tiene_certificado ? "Certificado cargado" : "Sin certificado"}</AlertTitle>
          </Alert>
          {editable && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!e.certificado}>
                <FieldLabel>Archivo .pfx o .p12</FieldLabel>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => ref.current?.click()}><UploadIcon /> Elegir archivo</Button>
                  <span className="truncate text-sm text-muted-foreground">{archivo?.name ?? "Ningún archivo"}</span>
                </div>
                <input ref={ref} type="file" accept=".pfx,.p12,application/x-pkcs12" className="hidden" onChange={(ev) => { setArchivo(ev.target.files?.[0] ?? null); ev.target.value = "" }} />
                <FieldError errors={err(e, "certificado")} />
              </Field>
              <Field data-invalid={!!e.contrasena_certificado}>
                <FieldLabel htmlFor="pf-cc">Contraseña del certificado</FieldLabel>
                <Input id="pf-cc" type="password" autoComplete="new-password" value={clave} onChange={(ev) => setClave(ev.target.value)} aria-invalid={!!e.contrasena_certificado} />
                <FieldError errors={err(e, "contrasena_certificado")} />
              </Field>
            </div>
          )}
        </FieldGroup>
      </CardContent>
      {editable && (
        <CardFooter className="justify-end">
          <Button disabled={!archivo || !clave || subir.isPending} onClick={() => subir.mutate()}>
            {subir.isPending ? <Spinner data-icon="inline-start" /> : <FileKey2Icon />} {p.tiene_certificado ? "Reemplazar certificado" : "Subir certificado"}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ Clave SOL y credenciales GRE

function SunatTab({ p, empresaId, editable, onOk }: TabProps) {
  const [f, setF] = useState({ sol_user: p.sol_user ?? "", sol_pass: "", client_id: p.client_id ?? "", client_secret: "" })
  const [e, setE] = useState<Errores>({})
  const g = useGuardar(empresaId, onOk, setE)
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: ev.target.value })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clave SOL y credenciales de guías (GRE)</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!e.sol_user}>
              <FieldLabel htmlFor="pf-su">Usuario SOL</FieldLabel>
              <Input id="pf-su" autoComplete="off" value={f.sol_user} onChange={set("sol_user")} disabled={!editable} />
              <FieldError errors={err(e, "sol_user")} />
            </Field>
            <Field data-invalid={!!e.sol_pass}>
              <FieldLabel htmlFor="pf-sp">Clave SOL</FieldLabel>
              <Input id="pf-sp" type="password" autoComplete="new-password" value={f.sol_pass} onChange={set("sol_pass")} disabled={!editable}
                placeholder={p.tiene_sol_pass ? "•••••••• (registrada; escribe para cambiarla)" : "Sin registrar"} />
              <FieldError errors={err(e, "sol_pass")} />
            </Field>
            <Field data-invalid={!!e.client_id}>
              <FieldLabel htmlFor="pf-ci">Client ID (GRE)</FieldLabel>
              <Input id="pf-ci" autoComplete="off" value={f.client_id} onChange={set("client_id")} disabled={!editable} />
              <FieldError errors={err(e, "client_id")} />
            </Field>
            <Field data-invalid={!!e.client_secret}>
              <FieldLabel htmlFor="pf-cs">Client secret (GRE)</FieldLabel>
              <Input id="pf-cs" type="password" autoComplete="new-password" value={f.client_secret} onChange={set("client_secret")} disabled={!editable}
                placeholder={p.tiene_client_secret ? "•••••••• (registrado; escribe para cambiarlo)" : "Sin registrar"} />
              <FieldError errors={err(e, "client_secret")} />
            </Field>
          </div>
        </FieldGroup>
      </CardContent>
      <Pie editable={editable} pendiente={g.isPending}
        onGuardar={() => g.mutate({ sol_user: f.sol_user || null, client_id: f.client_id || null, sol_pass: f.sol_pass || null, client_secret: f.client_secret || null })}>
        Vacío = conservar la actual.
      </Pie>
    </Card>
  )
}

// ------------------------------------------------------------------ Régimen tributario

function RegimenTab({ p, empresaId, editable, onOk }: TabProps) {
  const [f, setF] = useState({ tax_regime: p.tax_regime ?? "general", nrus_categoria: p.nrus_categoria ? String(p.nrus_categoria) : "1", igv: p.igv_rate_override !== null ? String(p.igv_rate_override) : "" })
  const [e, setE] = useState<Errores>({})
  const g = useGuardar(empresaId, onOk, setE)
  const cambioRegimen = f.tax_regime !== (p.tax_regime ?? "general") || (f.tax_regime === "rus" && Number(f.nrus_categoria) !== p.nrus_categoria)
  const guardar = () => g.mutate({
    tax_regime: f.tax_regime, nrus_categoria: f.tax_regime === "rus" ? Number(f.nrus_categoria) : null,
    igv_rate_override: f.igv === "" ? null : Number(f.igv),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Régimen tributario</CardTitle>
        <CardDescription>IGV vigente: <span className="tabular-nums font-medium">{p.tasa_igv_vigente ?? "—"}%</span></CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {p.igv_rate_override !== null && (
            <Alert>
              <InfoIcon />
              <AlertTitle>La cuenta tiene una tasa de IGV manual de {p.igv_rate_override}%</AlertTitle>
              <AlertDescription>Se aplica sobre cualquier régimen. Vacía el campo y guarda para quitarla.</AlertDescription>
            </Alert>
          )}
          {cambioRegimen && (
            <Alert variant="destructive">
              <ShieldAlertIcon />
              <AlertTitle>Cámbialo solo si SUNAT ya lo registró para tu RUC</AlertTitle>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={!!e.tax_regime}>
              <FieldLabel>Régimen</FieldLabel>
              <Select value={f.tax_regime} disabled={!editable} onValueChange={(v) => setF({ ...f, tax_regime: v as typeof f.tax_regime })}>
                <SelectTrigger aria-label="Régimen"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REGIMENES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <FieldError errors={err(e, "tax_regime")} />
            </Field>
            {f.tax_regime === "rus" && (
              <Field data-invalid={!!e.nrus_categoria}>
                <FieldLabel>Categoría del Nuevo RUS</FieldLabel>
                <Select value={f.nrus_categoria} disabled={!editable} onValueChange={(v) => setF({ ...f, nrus_categoria: v })}>
                  <SelectTrigger aria-label="Categoría"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Categoría 1 (cuota S/ 20)</SelectItem><SelectItem value="2">Categoría 2 (cuota S/ 50)</SelectItem></SelectContent>
                </Select>
                <FieldError errors={err(e, "nrus_categoria")} />
              </Field>
            )}
            <Field data-invalid={!!e.igv_rate_override}>
              <FieldLabel htmlFor="pf-igv">Tasa de IGV manual (avanzado)</FieldLabel>
              <Input id="pf-igv" className="tabular-nums" inputMode="decimal" placeholder="Vacío = la del régimen" value={f.igv} disabled={!editable} onChange={(ev) => setF({ ...f, igv: ev.target.value })} />
              <FieldError errors={err(e, "igv_rate_override")} />
            </Field>
          </div>
        </FieldGroup>
      </CardContent>
      <Pie editable={editable} pendiente={g.isPending} onGuardar={guardar} />
    </Card>
  )
}
