import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Navigate, useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { EyeIcon, EyeOffIcon, ReceiptTextIcon, ShieldCheckIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { api, applyServerErrors, csrf, toApiError } from "@/lib/api"
import type { Usuario } from "@/lib/types"
import { useAuth } from "./auth-context"
import { SETUP_KEY, useSetupEstado } from "./setup.api"

const schema = z
  .object({
    name: z.string().trim().min(3, "Ingresa tu nombre completo.").max(120),
    email: z.string().trim().min(1, "Ingresa tu correo.").email("Correo no válido."),
    password: z
      .string()
      .min(10, "Mínimo 10 caracteres.")
      .regex(/[a-z]/, "Incluye al menos una minúscula.")
      .regex(/[A-Z]/, "Incluye al menos una mayúscula.")
      .regex(/\d/, "Incluye al menos un número."),
    password_confirmation: z.string().min(1, "Repite la contraseña."),
  })
  .refine((v) => v.password === v.password_confirmation, {
    path: ["password_confirmation"],
    message: "Las contraseñas no coinciden.",
  })
type Values = z.infer<typeof schema>

export function SetupPage() {
  const { user } = useAuth()
  const estado = useSetupEstado()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [verClave, setVerClave] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", password_confirmation: "" },
  })

  if (user) return <Navigate to="/" replace />
  if (estado.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-96 w-full max-w-md" />
      </div>
    )
  }
  if (estado.data === false) return <Navigate to="/login" replace />

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await csrf()
      const { data } = await api.post<{ data: Usuario }>("/setup/superadmin", values)
      qc.setQueryData(SETUP_KEY, false)
      qc.setQueryData(["auth", "me"], data.data)
      toast.success("Superadministrador creado. ¡Bienvenido!")
      navigate("/", { replace: true })
    } catch (e) {
      const err = toApiError(e)
      if (err.status === 403) {
        qc.setQueryData(SETUP_KEY, false)
        toast.info(err.message)
        navigate("/login", { replace: true })
        return
      }
      if (Object.keys(err.errors).length) applyServerErrors(err, form.setError)
      else setFormError(err.message)
    }
  })

  const { errors, isSubmitting } = form.formState

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ReceiptTextIcon className="size-4" />
          </div>
          Sistema de Ventas SUNAT
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-1 flex size-10 items-center justify-center rounded-full bg-muted">
              <ShieldCheckIcon className="size-5" />
            </div>
            <CardTitle className="text-xl">Configuración inicial</CardTitle>
            <CardDescription>
              El sistema aún no tiene usuarios. Registra al superadministrador: tendrá acceso total y podrá crear empresas y usuarios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} noValidate>
              <FieldGroup>
                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="name">Nombre completo</FieldLabel>
                  <Input id="name" autoComplete="name" autoFocus aria-invalid={!!errors.name} {...form.register("name")} />
                  <FieldError errors={[errors.name]} />
                </Field>
                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
                  <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...form.register("email")} />
                  <FieldDescription>Lo usarás para iniciar sesión.</FieldDescription>
                  <FieldError errors={[errors.email]} />
                </Field>
                <Field data-invalid={!!errors.password}>
                  <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="password"
                      type={verClave ? "text" : "password"}
                      autoComplete="new-password"
                      aria-invalid={!!errors.password}
                      {...form.register("password")}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                        onClick={() => setVerClave((v) => !v)}
                      >
                        {verClave ? <EyeOffIcon /> : <EyeIcon />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>Mínimo 10 caracteres, con mayúsculas, minúsculas y números.</FieldDescription>
                  <FieldError errors={[errors.password]} />
                </Field>
                <Field data-invalid={!!errors.password_confirmation}>
                  <FieldLabel htmlFor="password_confirmation">Confirmar contraseña</FieldLabel>
                  <Input
                    id="password_confirmation"
                    type={verClave ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={!!errors.password_confirmation}
                    {...form.register("password_confirmation")}
                  />
                  <FieldError errors={[errors.password_confirmation]} />
                </Field>
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting && <Spinner />}
                  Crear superadministrador
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
