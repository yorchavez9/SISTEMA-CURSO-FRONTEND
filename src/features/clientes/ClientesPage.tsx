import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon, UsersRoundIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Buscador, Paginador, useDebounced, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, applyServerErrors, toApiError } from "@/lib/api"

export interface ClienteDto {
  id: number
  tipo_documento: string
  numero_documento: string
  razon_social: string
  nombre_comercial: string | null
  direccion: string | null
  ubigeo: string | null
  email: string | null
  telefono: string | null
  limite_credito: number | null
  dias_credito: number | null
  activo: boolean
}

const TIPOS_DOC: Record<string, string> = { "6": "RUC", "1": "DNI", "4": "Carné de extranjería", "7": "Pasaporte", A: "Cédula diplomática", "0": "Otros / sin documento" }
const CORTO: Record<string, string> = { "6": "RUC", "1": "DNI", "4": "CE", "7": "PAS", A: "CDI", "0": "OTROS" }

function rucValido(ruc: string) {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + Number(ruc[i]) * p, 0)
  let d = 11 - (suma % 11)
  if (d === 10) d = 0
  if (d === 11) d = 1
  return d === Number(ruc[10])
}

const schema = z
  .object({
    tipo_documento: z.string(),
    numero_documento: z.string().trim().min(1, "Ingresa el número de documento."),
    razon_social: z.string().trim().min(2, "Ingresa la razón social o nombres."),
    nombre_comercial: z.string().trim().optional(),
    direccion: z.string().trim().optional(),
    email: z.string().trim().refine((v) => !v || z.string().email().safeParse(v).success, "Correo no válido.").optional(),
    telefono: z.string().trim().optional(),
    dias_credito: z.string().trim().refine((v) => !v || /^\d{1,3}$/.test(v), "Número de días.").optional(),
  })
  .superRefine((v, ctx) => {
    const n = v.numero_documento
    const err =
      v.tipo_documento === "6" ? (!rucValido(n) ? "RUC no válido (11 dígitos con dígito verificador correcto)." : null)
      : v.tipo_documento === "1" ? (!/^\d{8}$/.test(n) ? "El DNI tiene 8 dígitos." : null)
      : !/^[A-Za-z0-9-]{1,15}$/.test(n) ? "Hasta 15 caracteres alfanuméricos." : null
    if (err) ctx.addIssue({ code: "custom", path: ["numero_documento"], message: err })
  })
type Values = z.infer<typeof schema>

export function ClientesPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [pagina, setPagina] = useState(1)
  const [editando, setEditando] = useState<ClienteDto | null | undefined>(undefined) // undefined = cerrado, null = nuevo
  const [eliminar, setEliminar] = useState<ClienteDto | null>(null)
  const qd = useDebounced(q)
  const lista = useQuery({
    queryKey: ["clientes", empresa?.id, qd, pagina],
    enabled: !!empresa,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: ClienteDto[]; meta: MetaPaginacion }>("/clientes", { params: { q: qd || undefined, page: pagina } })).data,
  })
  const borrar = useMutation({
    mutationFn: async (id: number) => (await api.delete<{ message: string }>(`/clientes/${id}`)).data,
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["clientes"] }) },
    onError: (e) => toast.error(toApiError(e).message),
  })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Clientes"
        description="Personas y empresas a las que se emiten comprobantes."
        actions={puede("clientes.crear") && <Button onClick={() => setEditando(null)}><PlusIcon /> Nuevo cliente</Button>}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Buscador value={q} onChange={(v) => { setQ(v); setPagina(1) }} placeholder="Buscar por documento o nombre" />
          {lista.isLoading ? (
            <div className="flex flex-col gap-2"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : lista.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(lista.error).message}</AlertDescription></Alert>
          ) : lista.data?.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <UsersRoundIcon className="size-8" /> {qd ? "Sin resultados para la búsqueda." : "Aún no hay clientes registrados."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Razón social / nombres</TableHead>
                  <TableHead className="hidden lg:table-cell">Dirección</TableHead>
                  <TableHead className="hidden md:table-cell">Contacto</TableHead>
                  <TableHead className="w-12"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.data?.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline">{CORTO[c.tipo_documento]}</Badge> <span className="tabular-nums">{c.numero_documento}</span>
                    </TableCell>
                    <TableCell className="font-medium">{c.razon_social}{!c.activo && <Badge variant="secondary" className="ml-2">Inactivo</Badge>}</TableCell>
                    <TableCell className="hidden max-w-72 truncate lg:table-cell">{c.direccion ?? "—"}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{c.email ?? c.telefono ?? "—"}</TableCell>
                    <TableCell>
                      {(puede("clientes.editar") || puede("clientes.eliminar")) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="info" size="icon" aria-label={`Acciones para ${c.razon_social}`}><MoreHorizontalIcon /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {puede("clientes.editar") && <DropdownMenuItem onSelect={() => setEditando(c)}><PencilIcon /> Editar</DropdownMenuItem>}
                            {puede("clientes.eliminar") && <DropdownMenuItem variant="destructive" onSelect={() => setEliminar(c)}><Trash2Icon /> Eliminar</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Paginador meta={lista.data?.meta} onPage={setPagina} />
        </CardContent>
      </Card>

      {editando !== undefined && (
        <ClienteDialog cliente={editando} onClose={() => setEditando(undefined)} onSaved={() => qc.invalidateQueries({ queryKey: ["clientes"] })} />
      )}
      <AlertDialog open={!!eliminar} onOpenChange={(o) => !o && setEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {eliminar?.razon_social}?</AlertDialogTitle>
            <AlertDialogDescription>Los comprobantes ya emitidos conservan sus datos. Podrás registrarlo de nuevo solo restaurándolo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => eliminar && borrar.mutate(eliminar.id)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function ClienteDialog({ cliente, onClose, onSaved }: { cliente: ClienteDto | null; onClose: () => void; onSaved: (c: ClienteDto) => void }) {
  const [buscando, setBuscando] = useState(false)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo_documento: cliente?.tipo_documento ?? "6",
      numero_documento: cliente?.numero_documento ?? "",
      razon_social: cliente?.razon_social ?? "",
      nombre_comercial: cliente?.nombre_comercial ?? "",
      direccion: cliente?.direccion ?? "",
      email: cliente?.email ?? "",
      telefono: cliente?.telefono ?? "",
      dias_credito: cliente?.dias_credito != null ? String(cliente.dias_credito) : "",
    },
  })
  const tipo = form.watch("tipo_documento")
  const { errors, isSubmitting } = form.formState

  const consultar = async () => {
    const numero = form.getValues("numero_documento").trim()
    if (!(await form.trigger("numero_documento"))) return
    setBuscando(true)
    try {
      const { data } = await api.get<{ data: { existe: boolean; fuente: string; advertencia?: string | null; cliente: Partial<ClienteDto> } }>("/clientes/consultar-documento", { params: { tipo, numero } })
      if (data.data.existe && !cliente) {
        toast.info("Este cliente ya está registrado.")
        return
      }
      form.setValue("razon_social", data.data.cliente.razon_social ?? "", { shouldValidate: true })
      if (data.data.cliente.direccion) form.setValue("direccion", data.data.cliente.direccion)
      if (data.data.advertencia) toast.warning(data.data.advertencia)
      else toast.success(`Datos obtenidos (${data.data.fuente}).`)
    } catch (e) {
      toast.error(toApiError(e).message)
    } finally {
      setBuscando(false)
    }
  }

  const onSubmit = form.handleSubmit(async (v) => {
    const body = { ...v, nombre_comercial: v.nombre_comercial || null, direccion: v.direccion || null, email: v.email || null, telefono: v.telefono || null, dias_credito: v.dias_credito ? Number(v.dias_credito) : null }
    try {
      const r = cliente ? await api.put(`/clientes/${cliente.id}`, body) : await api.post("/clientes", body)
      toast.success(r.data.message)
      onSaved(r.data.data)
      onClose()
    } catch (e) {
      const err = toApiError(e)
      applyServerErrors(err, form.setError)
      if (!Object.keys(err.errors).length) toast.error(err.message)
    }
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cliente ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>Con RUC o DNI puedes completar los datos automáticamente desde SUNAT/RENIEC.</DialogDescription>
        </DialogHeader>
        <form id="form-cliente" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
              <Field>
                <FieldLabel>Tipo de documento</FieldLabel>
                <Controller control={form.control} name="tipo_documento" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Tipo de documento"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TIPOS_DOC).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
              <Field data-invalid={!!errors.numero_documento}>
                <FieldLabel htmlFor="c-num">Número</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="c-num" className="tabular-nums" aria-invalid={!!errors.numero_documento} {...form.register("numero_documento")} />
                  {(tipo === "6" || tipo === "1") && (
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton onClick={consultar} disabled={buscando} aria-label="Consultar en SUNAT/RENIEC">
                        {buscando ? <Spinner /> : <SearchIcon />} Consultar
                      </InputGroupButton>
                    </InputGroupAddon>
                  )}
                </InputGroup>
                <FieldError errors={[errors.numero_documento]} />
              </Field>
            </div>
            <Field data-invalid={!!errors.razon_social}>
              <FieldLabel htmlFor="c-rs">{tipo === "6" ? "Razón social" : "Nombres y apellidos"}</FieldLabel>
              <Input id="c-rs" aria-invalid={!!errors.razon_social} {...form.register("razon_social")} />
              <FieldError errors={[errors.razon_social]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="c-dir">Dirección</FieldLabel>
              <Input id="c-dir" {...form.register("direccion")} />
              {tipo === "6" && <FieldDescription>Se imprime en la factura.</FieldDescription>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="c-mail">Correo</FieldLabel>
                <Input id="c-mail" type="email" aria-invalid={!!errors.email} {...form.register("email")} />
                <FieldError errors={[errors.email]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-tel">Teléfono</FieldLabel>
                <Input id="c-tel" {...form.register("telefono")} />
              </Field>
            </div>
            <Field data-invalid={!!errors.dias_credito} className="sm:max-w-48">
              <FieldLabel htmlFor="c-dias">Días de crédito</FieldLabel>
              <Input id="c-dias" inputMode="numeric" aria-invalid={!!errors.dias_credito} {...form.register("dias_credito")} />
              <FieldError errors={[errors.dias_credito]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-cliente" disabled={isSubmitting}>{isSubmitting && <Spinner />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
