import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2Icon, IdCardIcon, PlugZapIcon, SaveIcon, XCircleIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, toApiError } from "@/lib/api"

type Proveedor = "api_facturacion" | "decolecta"
interface Config { proveedor: Proveedor; tiene_token: boolean; token_final: string | null }

const PROVEEDORES: Record<Proveedor, { nombre: string; detalle: string }> = {
  api_facturacion: { nombre: "API de facturación (incluida)", detalle: "No necesita token." },
  decolecta: { nombre: "Decolecta (token propio)", detalle: "Si falla, se usa la API de facturación." },
}

/** Proveedor para consultar RUC y DNI al registrar clientes. El token se guarda cifrado y nunca se vuelve a mostrar. */
export function ConsultaDocumentosCard({ empresaId }: { empresaId: number }) {
  const q = useQuery({
    queryKey: ["consulta-documentos", empresaId],
    queryFn: async () => (await api.get<{ data: Config }>(`/empresas/${empresaId}/consulta-documentos`)).data.data,
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><IdCardIcon className="size-5" /> Consulta de RUC y DNI</CardTitle>
      </CardHeader>
      {q.isLoading ? <CardContent><Skeleton className="h-32" /></CardContent> : q.data && <Formulario key={JSON.stringify(q.data)} empresaId={empresaId} actual={q.data} />}
    </Card>
  )
}

function Formulario({ empresaId, actual }: { empresaId: number; actual: Config }) {
  const qc = useQueryClient()
  const [proveedor, setProveedor] = useState<Proveedor>(actual.proveedor)
  const [token, setToken] = useState("")
  const [errores, setErrores] = useState<Record<string, string[]>>({})
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null)

  const guardar = useMutation({
    mutationFn: async () => (await api.put<{ data: Config; message: string }>(`/empresas/${empresaId}/consulta-documentos`, { proveedor, token: token || null })).data,
    onMutate: () => setErrores({}),
    onSuccess: (r) => { toast.success(r.message); qc.setQueryData(["consulta-documentos", empresaId], r.data) },
    onError: (e) => { const x = toApiError(e); setErrores(x.errors); toast.error(Object.values(x.errors)[0]?.[0] ?? x.message) },
  })
  const probar = useMutation({
    mutationFn: async () => (await api.post<{ data: { ok: boolean; mensaje: string } }>(`/empresas/${empresaId}/consulta-documentos/probar`, { proveedor, token: token || null })).data.data,
    onMutate: () => setPrueba(null),
    onSuccess: setPrueba,
    onError: (e) => setPrueba({ ok: false, mensaje: toApiError(e).message }),
  })

  return (
    <>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Proveedor</FieldLabel>
            <Select value={proveedor} onValueChange={(v) => { setProveedor(v as Proveedor); setPrueba(null) }}>
              <SelectTrigger aria-label="Proveedor de consulta" className="sm:max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PROVEEDORES).map(([k, p]) => <SelectItem key={k} value={k}>{p.nombre}</SelectItem>)}</SelectContent>
            </Select>
            <FieldDescription>{PROVEEDORES[proveedor].detalle}</FieldDescription>
          </Field>
          {proveedor === "decolecta" && (
            <Field data-invalid={!!errores.token}>
              <FieldLabel htmlFor="cd-token">Token de Decolecta</FieldLabel>
              <Input id="cd-token" type="password" autoComplete="new-password" className="sm:max-w-sm" value={token} onChange={(e) => setToken(e.target.value)}
                placeholder={actual.tiene_token ? `Guardado ${actual.token_final}; escribe para cambiarlo` : "Pega aquí tu token"} aria-invalid={!!errores.token} />
              <FieldDescription>
                Obtenlo en <a className="underline" href="https://decolecta.com/profile" target="_blank" rel="noreferrer">decolecta.com/profile</a>.
              </FieldDescription>
              <FieldError errors={errores.token ? [{ message: errores.token[0] }] : []} />
            </Field>
          )}
          {prueba && (
            <Alert variant={prueba.ok ? "default" : "destructive"}>
              {prueba.ok ? <CheckCircle2Icon /> : <XCircleIcon />}
              <AlertDescription>{prueba.mensaje}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" disabled={probar.isPending} onClick={() => probar.mutate()}>
          {probar.isPending ? <Spinner data-icon="inline-start" /> : <PlugZapIcon />} Probar
        </Button>
        <Button disabled={guardar.isPending} onClick={() => guardar.mutate()}>
          {guardar.isPending ? <Spinner data-icon="inline-start" /> : <SaveIcon />} Guardar
        </Button>
      </CardFooter>
    </>
  )
}
