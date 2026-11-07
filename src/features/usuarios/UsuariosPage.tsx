import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontalIcon, ShieldIcon, UserMinusIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { applyServerErrors, toApiError } from "@/lib/api"
import type { RolDef, UsuarioEmpresa } from "@/lib/types"
import { useActualizarUsuario, useCrearUsuario, useRetirarUsuario, useRoles, useUsuariosEmpresa } from "./usuarios.api"

export function UsuariosPage() {
  const { empresa, user, puede } = useAuth()
  const usuarios = useUsuariosEmpresa(empresa?.id)
  const roles = useRoles()
  const gestionar = puede("usuarios.gestionar")

  if (!empresa) return <PageHeader title="Usuarios y roles" description="Selecciona una empresa." />

  const labelRol = (r: string) => roles.data?.roles.find((x) => x.nombre === r)?.label ?? r

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Usuarios y roles"
        description={<>Usuarios de <span className="font-medium text-foreground">{empresa.razon_social}</span>. Cada usuario tiene un rol por empresa.</>}
        actions={gestionar && roles.data && <NuevoUsuarioDialog empresaId={empresa.id} roles={roles.data.roles} />}
      />
      <Card>
        <CardContent>
          {usuarios.isLoading ? (
            <div className="flex flex-col gap-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : usuarios.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(usuarios.error).message}</AlertDescription></Alert>
          ) : usuarios.data?.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <UsersIcon className="size-8" /> Aún no hay usuarios asignados a esta empresa.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  {gestionar && <TableHead className="w-12"><span className="sr-only">Acciones</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.data?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.name}{u.id === user?.id && <span className="text-muted-foreground"> (tú)</span>}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>{u.roles.length ? u.roles.map((r) => <Badge key={r} variant="secondary">{labelRol(r)}</Badge>) : "—"}</TableCell>
                    <TableCell>
                      {u.activo ? <Badge variant="outline">Activo</Badge> : <Badge variant="destructive">Inactivo</Badge>}
                    </TableCell>
                    {gestionar && (
                      <TableCell>
                        {roles.data && <AccionesUsuario empresaId={empresa.id} usuario={u} roles={roles.data.roles} esYo={u.id === user?.id} />}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {roles.data && <MatrizPermisos roles={roles.data.roles} modulos={roles.data.modulos} />}
    </div>
  )
}

function AccionesUsuario({ empresaId, usuario, roles, esYo }: { empresaId: number; usuario: UsuarioEmpresa; roles: RolDef[]; esYo: boolean }) {
  const actualizar = useActualizarUsuario(empresaId)
  const retirar = useRetirarUsuario(empresaId)
  const [confirmar, setConfirmar] = useState(false)

  const ejecutar = async (fn: () => Promise<{ message: string }>) => {
    try {
      toast.success((await fn()).message)
    } catch (e) {
      const err = toApiError(e)
      toast.error(Object.values(err.errors)[0]?.[0] ?? err.message)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="info" size="icon" aria-label={`Acciones para ${usuario.name}`} disabled={actualizar.isPending || retirar.isPending}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Rol en la empresa</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={usuario.roles[0] ?? ""}
            onValueChange={(rol) => ejecutar(() => actualizar.mutateAsync({ id: usuario.id, rol }))}
          >
            {roles.map((r) => (
              <DropdownMenuRadioItem key={r.nombre} value={r.nombre}>{r.label}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild disabled={esYo}>
            <label className="flex w-full items-center justify-between">
              Activo en la empresa
              <Switch
                checked={usuario.activo}
                disabled={esYo}
                onCheckedChange={(activo) => ejecutar(() => actualizar.mutateAsync({ id: usuario.id, activo }))}
              />
            </label>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={esYo} onSelect={() => setConfirmar(true)}>
            <UserMinusIcon /> Retirar de la empresa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar a {usuario.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Perderá el acceso a esta empresa. Su cuenta y su acceso a otras empresas se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => ejecutar(() => retirar.mutateAsync(usuario.id))}>Retirar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const schema = z
  .object({
    email: z.string().trim().min(1, "Ingresa el correo.").email("Correo no válido."),
    rol: z.string().min(1, "Selecciona un rol."),
    nuevo: z.boolean(),
    name: z.string().trim().optional(),
    password: z.string().optional(),
    password_confirmation: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.nuevo) return
    if (!v.name || v.name.length < 3) ctx.addIssue({ code: "custom", path: ["name"], message: "Ingresa el nombre completo." })
    const p = v.password ?? ""
    if (p.length < 10 || !/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p))
      ctx.addIssue({ code: "custom", path: ["password"], message: "Mínimo 10 caracteres con mayúsculas, minúsculas y números." })
    if (p !== v.password_confirmation) ctx.addIssue({ code: "custom", path: ["password_confirmation"], message: "Las contraseñas no coinciden." })
  })
type Values = z.infer<typeof schema>

function NuevoUsuarioDialog({ empresaId, roles }: { empresaId: number; roles: RolDef[] }) {
  const [open, setOpen] = useState(false)
  const crear = useCrearUsuario(empresaId)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", rol: "vendedor", nuevo: true, name: "", password: "", password_confirmation: "" },
  })
  const nuevo = form.watch("nuevo")
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ nuevo, ...v }) => {
    try {
      const body = nuevo ? v : { email: v.email, rol: v.rol }
      const res = await crear.mutateAsync(body)
      toast.success(res.message)
      form.reset()
      setOpen(false)
    } catch (e) {
      const err = toApiError(e)
      applyServerErrors(err, form.setError)
      if (!Object.keys(err.errors).length) toast.error(err.message)
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlusIcon /> Agregar usuario</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar usuario</DialogTitle>
          <DialogDescription>Crea una cuenta nueva o agrega a la empresa un usuario que ya existe.</DialogDescription>
        </DialogHeader>
        <form id="form-usuario" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch id="nuevo" checked={nuevo} onCheckedChange={(c) => form.setValue("nuevo", c)} />
              <FieldLabel htmlFor="nuevo">Crear cuenta nueva</FieldLabel>
            </Field>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="u-email">Correo</FieldLabel>
              <Input id="u-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...form.register("email")} />
              {!nuevo && <FieldDescription>El usuario conservará su contraseña actual.</FieldDescription>}
              <FieldError errors={[errors.email]} />
            </Field>
            {nuevo && (
              <>
                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="u-name">Nombre completo</FieldLabel>
                  <Input id="u-name" aria-invalid={!!errors.name} {...form.register("name")} />
                  <FieldError errors={[errors.name]} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!errors.password}>
                    <FieldLabel htmlFor="u-pass">Contraseña</FieldLabel>
                    <Input id="u-pass" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
                    <FieldError errors={[errors.password]} />
                  </Field>
                  <Field data-invalid={!!errors.password_confirmation}>
                    <FieldLabel htmlFor="u-pass2">Confirmar</FieldLabel>
                    <Input id="u-pass2" type="password" autoComplete="new-password" aria-invalid={!!errors.password_confirmation} {...form.register("password_confirmation")} />
                    <FieldError errors={[errors.password_confirmation]} />
                  </Field>
                </div>
              </>
            )}
            <Field data-invalid={!!errors.rol}>
              <FieldLabel>Rol en la empresa</FieldLabel>
              <Select value={form.watch("rol")} onValueChange={(v) => form.setValue("rol", v)}>
                <SelectTrigger aria-label="Rol"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.nombre} value={r.nombre}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError errors={[errors.rol]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" form="form-usuario" disabled={isSubmitting}>{isSubmitting && <Spinner />} Agregar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MatrizPermisos({ roles, modulos }: { roles: RolDef[]; modulos: { modulo: string; label: string; acciones: Record<string, string> }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldIcon className="size-4" />Permisos por rol</CardTitle>
        <CardDescription>Qué puede hacer cada rol. El superadministrador tiene acceso total.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo / acción</TableHead>
              {roles.map((r) => <TableHead key={r.nombre} className="text-center">{r.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulos.flatMap((m) =>
              Object.entries(m.acciones).map(([acc, label], i) => (
                <TableRow key={`${m.modulo}.${acc}`}>
                  <TableCell>
                    {i === 0 && <div className="font-medium">{m.label}</div>}
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </TableCell>
                  {roles.map((r) => (
                    <TableCell key={r.nombre} className="text-center">
                      {r.permisos.includes(`${m.modulo}.${acc}`) ? <span aria-label="Permitido">✓</span> : <span className="text-muted-foreground" aria-label="No permitido">—</span>}
                    </TableCell>
                  ))}
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
