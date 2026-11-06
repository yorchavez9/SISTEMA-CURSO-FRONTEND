import { useTheme } from "next-themes"
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const OPCIONES = [
  { valor: "light", label: "Claro", icon: SunIcon },
  { valor: "dark", label: "Oscuro", icon: MoonIcon },
  { valor: "system", label: "Sistema", icon: MonitorIcon },
] as const

/** Selector de tema (patrón "Mode Toggle" de shadcn/ui). La elección la guarda next-themes en el navegador. */
export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Cambiar tema">
          <SunIcon className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <MoonIcon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPCIONES.map(({ valor, label, icon: Icon }) => (
          <DropdownMenuItem key={valor} onClick={() => setTheme(valor)}>
            <Icon /> {label}
            {theme === valor && <CheckIcon className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
