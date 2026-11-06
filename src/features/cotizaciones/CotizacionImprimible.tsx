import { useParams } from "react-router"
import { PrinterIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { soles } from "@/components/shared/listado"
import { useAuth } from "@/features/auth/auth-context"
import { toApiError } from "@/lib/api"
import { useCotizacion } from "./cotizaciones.api"

const fecha = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })

/** Cotización lista para imprimir o guardar como PDF desde el navegador (no es un comprobante de pago). */
export function CotizacionImprimible() {
  const { id } = useParams()
  const { empresa } = useAuth()
  const q = useCotizacion(id ? Number(id) : null)
  const c = q.data

  if (q.isError) return <Alert variant="destructive" className="m-8 max-w-xl"><AlertDescription>{toApiError(q.error).message}</AlertDescription></Alert>
  if (!c || !empresa) return <div className="mx-auto max-w-3xl p-8"><Skeleton className="h-96" /></div>

  return (
    // Hoja clara también en modo oscuro: es un documento para el cliente.
    <div className="min-h-screen bg-white text-neutral-900 print:min-h-0">
      <div className="mx-auto flex max-w-3xl justify-end gap-2 p-4 print:hidden">
        <Button onClick={() => window.print()}><PrinterIcon /> Imprimir o guardar PDF</Button>
      </div>
      <article className="mx-auto max-w-3xl px-8 pb-12 text-sm print:max-w-none print:px-0 print:pb-0">
        <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-4">
          <div>
            <h1 className="text-lg font-semibold">{empresa.nombre_comercial || empresa.razon_social}</h1>
            {empresa.nombre_comercial && <p>{empresa.razon_social}</p>}
            <p>RUC {empresa.ruc}</p>
            {empresa.direccion && <p className="text-neutral-600">{empresa.direccion}</p>}
            {(empresa.telefono || empresa.email) && <p className="text-neutral-600">{[empresa.telefono, empresa.email].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="rounded border border-neutral-400 px-4 py-2 text-center">
            <p className="font-semibold tracking-wide">COTIZACIÓN</p>
            <p className="font-mono text-base">{c.codigo}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 border-b border-neutral-300 py-4">
          <div>
            <p className="text-xs uppercase text-neutral-500">Cliente</p>
            <p className="font-medium">{c.cliente.razon_social}</p>
            {c.cliente.num_doc && <p>{c.cliente.tipo_doc === "6" ? "RUC" : "Doc."} {c.cliente.num_doc}</p>}
            {c.cliente.email && <p className="text-neutral-600">{c.cliente.email}</p>}
          </div>
          <div className="text-right">
            <p><span className="text-neutral-500">Fecha: </span>{fecha(c.fecha_emision)}</p>
            <p><span className="text-neutral-500">Válida hasta: </span><span className="font-medium">{fecha(c.fecha_validez)}</span></p>
            <p><span className="text-neutral-500">Moneda: </span>{c.moneda === "PEN" ? "Soles" : "Dólares"}</p>
          </div>
        </section>

        <table className="my-4 w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-400 text-left text-xs uppercase text-neutral-500">
              <th className="py-2 pr-2">#</th><th className="py-2 pr-2">Descripción</th><th className="py-2 pr-2 text-right">Cant.</th>
              <th className="py-2 pr-2 text-right">P. unit.</th><th className="py-2 pr-2 text-right">Dscto.</th><th className="py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((i, n) => (
              <tr key={n} className="border-b border-neutral-200 align-top">
                <td className="py-2 pr-2 text-neutral-500">{n + 1}</td>
                <td className="py-2 pr-2">{i.descripcion}{i.codigo && <span className="block text-xs text-neutral-500">{i.codigo}</span>}</td>
                <td className="py-2 pr-2 text-right font-mono">{i.cantidad} {i.unidad}</td>
                <td className="py-2 pr-2 text-right font-mono">{soles(i.precio_unitario, c.moneda)}</td>
                <td className="py-2 pr-2 text-right font-mono">{i.descuento > 0 ? soles(i.descuento, c.moneda) : "—"}</td>
                <td className="py-2 text-right font-mono">{soles(i.total, c.moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto flex w-72 flex-col gap-1">
          {c.totales.gravadas > 0 && <Fila k="Op. gravadas" v={soles(c.totales.gravadas, c.moneda)} />}
          {c.totales.exoneradas > 0 && <Fila k="Op. exoneradas" v={soles(c.totales.exoneradas, c.moneda)} />}
          {c.totales.inafectas > 0 && <Fila k="Op. inafectas" v={soles(c.totales.inafectas, c.moneda)} />}
          {c.totales.exportacion > 0 && <Fila k="Exportación" v={soles(c.totales.exportacion, c.moneda)} />}
          <Fila k={`IGV (${c.tasa_igv} %)`} v={soles(c.totales.igv, c.moneda)} />
          <div className="mt-1 flex justify-between border-t border-neutral-400 pt-1 text-base font-semibold"><span>Total</span><span className="font-mono">{soles(c.totales.total, c.moneda)}</span></div>
        </div>

        {c.observacion && (
          <section className="mt-6">
            <p className="text-xs uppercase text-neutral-500">Condiciones</p>
            <p className="whitespace-pre-line">{c.observacion}</p>
          </section>
        )}
        <p className="mt-10 text-center text-xs text-neutral-500">Documento informativo: esta cotización no es un comprobante de pago. Atendido por {c.usuario ?? "—"}.</p>
      </article>
    </div>
  )
}

function Fila({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-neutral-600">{k}</span><span className="font-mono">{v}</span></div>
}
