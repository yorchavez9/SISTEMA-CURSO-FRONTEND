import { toast } from "sonner"
import { api, toApiError } from "@/lib/api"

/** Descarga un archivo protegido de la API (cookie de sesión) y lo guarda con el nombre que indique el servidor. */
export async function descargarArchivo(url: string, nombrePorDefecto: string) {
  try {
    const r = await api.get(url, { responseType: "blob" })
    const nombre = /filename="?([^";]+)"?/.exec(r.headers["content-disposition"] ?? "")?.[1] ?? nombrePorDefecto
    const href = URL.createObjectURL(r.data as Blob)
    const a = document.createElement("a")
    a.href = href
    a.download = nombre
    a.click()
    URL.revokeObjectURL(href)
  } catch (e) {
    // Con responseType blob el mensaje de error llega como Blob: se lee como texto.
    const blob = (e as { response?: { data?: Blob } }).response?.data
    let msg: string | undefined
    if (blob instanceof Blob) {
      try { msg = JSON.parse(await blob.text()).message as string | undefined } catch { msg = undefined }
    }
    toast.error(msg ?? toApiError(e).message)
  }
}
