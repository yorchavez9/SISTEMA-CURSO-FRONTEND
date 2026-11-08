import { useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ScrollTextIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Paginador, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"

interface Registro {
  id: number; fecha: string; evento: string; descripcion: string; usuario: string | null; objeto: string | null
  antes: Record<string, unknown> | null; despues: Record<string, unknown> | null; ip: string | null
}

const MODULOS: Record<string, string> = {
  auth: "Accesos", baja: "Bajas", caja: "Caja", cliente: "Clientes", comprobante: "Comprobantes", cotizacion: "Cotizaciones", credenciales_api: "Credenciales API",
  empresa: "Empresa", guia: "Guías de remisión", inventario: "Inventario", nota_credito: "Notas de crédito", nota_debito: "Notas de débito",
  pago: "Pagos", pagos: "Cobros", producto: "Productos", resumen: "Resúmenes diarios", serie: "Series", sincronizacion_api: "Sincronización con la API",
  usuario: "Usuarios", venta: "Ventas",
}

const valor = (v: unknown): string => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v))

function Cambios({ antes, despues }: { antes: Registro["antes"]; despues: Registro["despues"] }) {
  const claves = Array.from(new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]))
  if (claves.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {claves.slice(0, 8).map((k) => (
        <li key={k} className="break-words">
          <span className="text-muted-foreground">{k}: </span>
          {antes && k in antes && <><span className="line-through decoration-muted-foreground">{valor(antes[k])}</span>{" → "}</>}
          <span className="tabular-nums">{despues && k in despues ? valor(despues[k]) : "—"}</span>
        </li>
      ))}
      {claves.length > 8 && <li className="text-muted-foreground">y {claves.length - 8} campos más</li>}
    </ul>
  )
}

export function AuditoriaPage() {
  const { empresa } = useAuth()
  const [modulo, setModulo] = useState("todos")
  const [usuario, setUsuario] = useState("todos")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [pagina, setPagina] = useState(1)

  const filtros = useQuery({
    queryKey: ["auditoria-filtros", empresa?.id],
    enabled: !!empresa,
    queryFn: async () => (await api.get<{ data: { modulos: string[]; usuarios: { id: number; name: string }[] } }>("/auditoria/filtros")).data.data,
  })
  const q = useQuery({
    queryKey: ["auditoria", empresa?.id, modulo, usuario, desde, hasta, pagina],
    enabled: !!empresa,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: Registro[]; meta: MetaPaginacion }>("/auditoria", {
      params: {
        modulo: modulo === "todos" ? undefined : modulo, user_id: usuario === "todos" ? undefined : usuario,
        desde: desde || undefined, hasta: hasta || undefined, page: pagina,
      },
    })).data,
  })
  const filtrar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPagina(1) }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title="Auditoría" />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="f-modulo">Módulo</FieldLabel>
              <Select value={modulo} onValueChange={filtrar(setModulo)}>
                <SelectTrigger id="f-modulo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {filtros.data?.modulos.map((m) => <SelectItem key={m} value={m}>{MODULOS[m] ?? m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="f-usuario">Usuario</FieldLabel>
              <Select value={usuario} onValueChange={filtrar(setUsuario)}>
                <SelectTrigger id="f-usuario"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {filtros.data?.usuarios.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="f-desde">Desde</FieldLabel>
              <Input id="f-desde" type="date" value={desde} onChange={(e) => filtrar(setDesde)(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="f-hasta">Hasta</FieldLabel>
              <Input id="f-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => filtrar(setHasta)(e.target.value)} />
            </Field>
          </div>

          {q.isLoading ? <Skeleton className="h-64" /> : q.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(q.error).message}</AlertDescription></Alert>
          ) : q.data?.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><ScrollTextIcon className="size-8" /> No hay registros con estos filtros.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead className="w-44">Fecha</TableHead><TableHead>Acción</TableHead><TableHead>Usuario</TableHead><TableHead>Detalle</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {q.data?.data.map((r) => (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="whitespace-nowrap">
                      {new Date(r.fecha).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "medium" })}
                      {r.ip && <div className="tabular-nums text-xs text-muted-foreground">{r.ip}</div>}
                    </TableCell>
                    <TableCell>
                      <div>{r.descripcion}</div>
                      {r.objeto && <div className="tabular-nums text-xs text-muted-foreground">{r.objeto}</div>}
                    </TableCell>
                    <TableCell>{r.usuario ?? <span className="text-muted-foreground">Proceso automático</span>}</TableCell>
                    <TableCell className="max-w-md whitespace-normal"><Cambios antes={r.antes} despues={r.despues} /></TableCell>
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
