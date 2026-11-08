import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useNavigate } from "react-router"
import { ArchiveRestoreIcon, Building2Icon, KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, applyServerErrors, toApiError } from "@/lib/api"
import type { Empresa } from "@/lib/types"

const schema = z.object({
  ruc: z.string().trim().regex(/^(10|15|16|17|20)\d{9}$/, "RUC de 11 dígitos que empieza con 10, 15, 16, 17 o 20."),
  razon_social: z.string().trim().min(3, "Ingresa la razón social.").max(255),
  nombre_comercial: z.string().trim().max(255).optional(),
  direccion: z.string().trim().max(255).optional(),
  ubigeo: z.string().trim().refine((v) => v === "" || /^\d{6}$/.test(v), "Ubigeo de 6 dígitos.").optional(),
  email: z.string().trim().refine((v) => v === "" || z.string().email().safeParse(v).success, "Correo no válido.").optional(),
  telefono: z.string().trim().max(30).optional(),
})
type Values = z.infer<typeof schema>

const vacio = (o: Values) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]))

export function EmpresasPage() {
  const { user, setEmpresaId, refresh } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [vista, setVista] = useState<"activas" | "eliminadas">("activas")
  const [eliminar, setEliminar] = useState<Empresa | null>(null)
  const empresas = useQuery({
    queryKey: ["empresas", vista],
    queryFn: async () => (await api.get<{ data: (Empresa & { eliminada_at?: string | null })[] }>("/empresas", { params: { eliminadas: vista === "eliminadas" ? 1 : undefined } })).data.data,
  })
  const restaurar = useMutation({
    mutationFn: async (id: number) => (await api.post<{ message: string }>(`/empresas/${id}/restaurar`)).data,
    onSuccess: async (r) => { toast.success(r.message); await qc.invalidateQueries({ queryKey: ["empresas"] }); await refresh() },
    onError: (e) => toast.error(toApiError(e).message),
  })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Empresas"
        description="Empresas emisoras registradas en el sistema."
        actions={user?.is_superadmin && <NuevaEmpresaDialog onCreated={async (e) => { await refresh(); setEmpresaId(e.id) }} />}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          {user?.is_superadmin && (
            <Tabs value={vista} onValueChange={(v) => setVista(v as typeof vista)}>
              <TabsList><TabsTrigger value="activas">Activas</TabsTrigger><TabsTrigger value="eliminadas">Eliminadas</TabsTrigger></TabsList>
            </Tabs>
          )}
          {empresas.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : empresas.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(empresas.error).message}</AlertDescription></Alert>
          ) : empresas.data?.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <Building2Icon className="size-8" />
              <p>{vista === "eliminadas" ? "No hay empresas eliminadas." : "Aún no hay empresas registradas."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RUC</TableHead>
                  <TableHead>Razón social</TableHead>
                  <TableHead className="hidden md:table-cell">Dirección</TableHead>
                  <TableHead>Entorno</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresas.data?.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="tabular-nums">{e.ruc}</TableCell>
                    <TableCell className="font-medium">{e.razon_social}</TableCell>
                    <TableCell className="hidden max-w-64 truncate md:table-cell">{e.direccion ?? "—"}</TableCell>
                    <TableCell>
                      {e.entorno_activo === "produccion" ? <Badge>Producción</Badge> : <Badge variant="secondary">Pruebas</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {vista === "eliminadas" ? (
                        <Button size="sm" variant="success" disabled={restaurar.isPending} onClick={() => restaurar.mutate(e.id)}>
                          <ArchiveRestoreIcon /> Restaurar
                        </Button>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setEmpresaId(e.id); navigate("/configuracion/credenciales-api") }}>
                            <KeyRoundIcon /> Credenciales API
                          </Button>
                          {user?.is_superadmin && (
                            <Button size="icon" variant="destructive" aria-label={`Eliminar ${e.razon_social}`} onClick={() => setEliminar(e)}><Trash2Icon /></Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {eliminar && (
        <EliminarEmpresaDialog empresa={eliminar} onClose={() => setEliminar(null)}
          onEliminada={async () => { setEliminar(null); await qc.invalidateQueries({ queryKey: ["empresas"] }); await refresh() }} />
      )}
    </div>
  )
}

/** Eliminación lógica: se confirma escribiendo el RUC. Los comprobantes se conservan y la empresa se puede restaurar. */
function EliminarEmpresaDialog({ empresa, onClose, onEliminada }: { empresa: Empresa; onClose: () => void; onEliminada: () => void | Promise<void> }) {
  const [ruc, setRuc] = useState("")
  const borrar = useMutation({
    mutationFn: async () => (await api.delete<{ message: string }>(`/empresas/${empresa.id}`, { data: { confirmacion: ruc } })).data,
    onSuccess: async (r) => { toast.success(r.message); await onEliminada() },
    onError: (e) => toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar {empresa.razon_social}?</DialogTitle>
          <DialogDescription>La empresa dejará de aparecer en el sistema y nadie podrá vender ni emitir con ella.</DialogDescription>
        </DialogHeader>
        <Alert>
          <Building2Icon />
          <AlertTitle>Sus datos no se borran</AlertTitle>
          <AlertDescription>
            Las ventas, comprobantes, XML y CDR se conservan, porque SUNAT exige guardarlos, y la empresa se puede restaurar desde la pestaña
            “Eliminadas”. Tampoco se elimina su cuenta en la API de facturación.
          </AlertDescription>
        </Alert>
        <Field>
          <FieldLabel htmlFor="confirmar-ruc">Escribe el RUC <span className="tabular-nums font-semibold">{empresa.ruc}</span> para confirmar</FieldLabel>
          <Input id="confirmar-ruc" className="tabular-nums" inputMode="numeric" autoComplete="off" value={ruc} onChange={(e) => setRuc(e.target.value.trim())} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={ruc !== empresa.ruc || borrar.isPending} onClick={() => borrar.mutate()}>
            {borrar.isPending ? <Spinner data-icon="inline-start" /> : <Trash2Icon />} Eliminar empresa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NuevaEmpresaDialog({ onCreated }: { onCreated: (e: Empresa) => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { ruc: "", razon_social: "", nombre_comercial: "", direccion: "", ubigeo: "", email: "", telefono: "" },
  })
  const crear = useMutation({
    mutationFn: async (v: Values) => (await api.post<{ data: Empresa; message: string }>("/empresas", vacio(v))).data,
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await crear.mutateAsync(values)
      await qc.invalidateQueries({ queryKey: ["empresas"] })
      await onCreated(res.data)
      toast.success(res.message)
      form.reset()
      setOpen(false)
    } catch (e) {
      const err = toApiError(e)
      applyServerErrors(err, form.setError)
      if (!Object.keys(err.errors).length) toast.error(err.message)
    }
  })

  const campo = (name: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={`emp-${name}`}>{label}</FieldLabel>
      <Input id={`emp-${name}`} aria-invalid={!!errors[name]} {...props} {...form.register(name)} />
      <FieldError errors={[errors[name]]} />
    </Field>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><PlusIcon /> Nueva empresa</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar empresa</DialogTitle>
          <DialogDescription>Datos de la empresa emisora. Las credenciales de la API se configuran después.</DialogDescription>
        </DialogHeader>
        <form id="form-empresa" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              {campo("ruc", "RUC", { inputMode: "numeric", maxLength: 11 })}
              {campo("razon_social", "Razón social")}
            </div>
            {campo("nombre_comercial", "Nombre comercial")}
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              {campo("direccion", "Dirección fiscal")}
              {campo("ubigeo", "Ubigeo", { inputMode: "numeric", maxLength: 6 })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {campo("email", "Correo", { type: "email" })}
              {campo("telefono", "Teléfono")}
            </div>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" form="form-empresa" disabled={isSubmitting}>
            {isSubmitting && <Spinner />} Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
