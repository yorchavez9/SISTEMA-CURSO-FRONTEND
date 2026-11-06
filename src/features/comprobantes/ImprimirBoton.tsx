import { useState } from "react"
import { toast } from "sonner"
import { ChevronDownIcon, PrinterIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { api, toApiError } from "@/lib/api"

const FORMATOS = { "ticket-80": "Ticket 80 mm", "ticket-58": "Ticket 58 mm", a5: "A5", a4: "A4" } as const
type Formato = keyof typeof FORMATOS
const CLAVE = "impresion.formato"

// Preferencia por navegador (cada caja puede tener su propia impresora); si el almacenamiento no está disponible, ticket 80 mm.
function leerFormato(): Formato {
  try {
    const v = localStorage.getItem(CLAVE)
    return v && v in FORMATOS ? (v as Formato) : "ticket-80"
  } catch {
    return "ticket-80"
  }
}

/** Abre el diálogo de impresión del PDF (generado por la API en el formato elegido) sin salir de la página. */
async function imprimirPdf(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  iframe.src = url
  document.body.appendChild(iframe)
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      window.open(url, "_blank") // si el navegador no permite imprimir desde el marco, se abre el PDF
    }
    setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url) }, 60_000)
  }
}

export function ImprimirBoton({ comprobanteId, numero }: { comprobanteId: number; numero: string }) {
  const [formato, setFormato] = useState<Formato>(leerFormato)
  const [cargando, setCargando] = useState(false)

  const elegir = (v: string) => {
    setFormato(v as Formato)
    try { localStorage.setItem(CLAVE, v) } catch { /* sin almacenamiento: solo para esta sesión */ }
  }
  const imprimir = async () => {
    setCargando(true)
    try {
      const r = await api.get(`/comprobantes/${comprobanteId}/imprimir/${formato}`, { responseType: "blob" })
      await imprimirPdf(r.data as Blob)
    } catch (e) {
      const blob = (e as { response?: { data?: Blob } }).response?.data
      let msg: string | undefined
      if (blob instanceof Blob) {
        try { msg = JSON.parse(await blob.text()).message as string | undefined } catch { msg = undefined }
      }
      toast.error(msg ?? toApiError(e).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <ButtonGroup>
      <Button size="sm" onClick={imprimir} disabled={cargando} aria-label={`Imprimir ${numero} en ${FORMATOS[formato]}`}>
        {cargando ? <Spinner /> : <PrinterIcon />} Imprimir · {FORMATOS[formato]}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" aria-label="Elegir formato de impresión"><ChevronDownIcon /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Formato de impresión</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={formato} onValueChange={elegir}>
            {(Object.keys(FORMATOS) as Formato[]).map((f) => <DropdownMenuRadioItem key={f} value={f}>{FORMATOS[f]}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
