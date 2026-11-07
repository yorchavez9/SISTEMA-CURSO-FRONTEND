import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Navigate, useLocation, useNavigate } from "react-router"
import { ReceiptTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { API_ORIGIN, applyServerErrors, toApiError } from "@/lib/api"
import { useAuth } from "./auth-context"
import { useSetupEstado } from "./setup.api"

const schema = z.object({
  email: z.string().trim().min(1, "Ingresa tu correo.").email("Correo no válido."),
  password: z.string().min(1, "Ingresa tu contraseña."),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } })
  const setup = useSetupEstado()

  if (user) return <Navigate to="/" replace />
  // Primera ejecución: sin usuarios no hay a quién autenticar → registrar el superadministrador.
  if (setup.data === true) return <Navigate to="/configuracion-inicial" replace />
  if (setup.isLoading) {
    return <div className="flex min-h-svh items-center justify-center"><Spinner /></div>
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password, true)
      const to = (location.state as { from?: string } | null)?.from ?? "/"
      navigate(to, { replace: true })
    } catch (e) {
      const err = toApiError(e)
      if (Object.keys(err.errors).length) applyServerErrors(err, form.setError)
      else setFormError(err.message)
    }
  })

  const { errors, isSubmitting } = form.formState

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ReceiptTextIcon className="size-4" />
          </div>
          Sistema de Ventas SUNAT
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Iniciar sesión</CardTitle>
            <CardDescription>Ingresa con tu cuenta para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} noValidate>
              <FieldGroup>
                {setup.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      No se pudo conectar con el servidor ({API_ORIGIN || window.location.origin}/api/v1).
                      {!API_ORIGIN && " Si el backend está en otro dominio, define VITE_API_URL al compilar el frontend."}
                    </AlertDescription>
                  </Alert>
                )}
                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
                  <Input id="email" type="email" autoComplete="username" autoFocus aria-invalid={!!errors.email} {...form.register("email")} />
                  <FieldError errors={[errors.email]} />
                </Field>
                <Field data-invalid={!!errors.password}>
                  <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                  <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
                  <FieldError errors={[errors.password]} />
                </Field>
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting && <Spinner />}
                  Ingresar
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
