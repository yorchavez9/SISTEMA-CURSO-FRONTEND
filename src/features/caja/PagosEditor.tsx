import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { soles } from "@/components/shared/listado"
import { cn } from "@/lib/utils"
import type { MetodoPago } from "./caja.api"

export interface PagoForm { metodo: string; monto: string; recibido: string; referencia: string }

export const pagoInicial = (monto: number): PagoForm => ({ metodo: "efectivo", monto: monto.toFixed(2), recibido: "", referencia: "" })

/** Convierte las filas del formulario al cuerpo que espera la API. */
export const pagosParaApi = (ps: PagoForm[]) =>
  ps.filter((p) => Number(p.monto) > 0).map((p) => ({
    metodo: p.metodo,
    monto: Number(p.monto),
    monto_recibido: p.metodo === "efectivo" && Number(p.recibido) > 0 ? Number(p.recibido) : undefined,
    referencia: p.referencia || undefined,
  }))

export function PagosEditor({ pagos, onChange, metodos, objetivo, exacto }: {
  pagos: PagoForm[]
  onChange: (p: PagoForm[]) => void
  metodos: MetodoPago[]
  objetivo: number
  /** true: la suma debe ser igual al objetivo (contado); false: hasta el objetivo (cobranza) */
  exacto: boolean
}) {
  const suma = pagos.reduce((s, p) => s + Number(p.monto || 0), 0)
  const dif = Math.round((objetivo - suma) * 100) / 100
  const set = (i: number, patch: Partial<PagoForm>) => onChange(pagos.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  return (
    <div className="flex flex-col gap-2">
      {pagos.map((p, i) => {
        const vuelto = p.metodo === "efectivo" && Number(p.recibido) > Number(p.monto) ? Number(p.recibido) - Number(p.monto) : 0
        return (
          <div key={i} className="grid grid-cols-[9rem_1fr_1fr_auto] items-start gap-2">
            <Select value={p.metodo} onValueChange={(v) => set(i, { metodo: v, recibido: "" })}>
              <SelectTrigger aria-label="Método de pago"><SelectValue /></SelectTrigger>
              <SelectContent>{metodos.map((m) => <SelectItem key={m.metodo} value={m.metodo}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input inputMode="decimal" className="font-mono" aria-label="Monto" placeholder="Monto" value={p.monto} onChange={(e) => set(i, { monto: e.target.value })} />
            {p.metodo === "efectivo" ? (
              <div>
                <Input inputMode="decimal" className="font-mono" aria-label="Efectivo recibido" placeholder="Recibido" value={p.recibido} onChange={(e) => set(i, { recibido: e.target.value })} />
                {vuelto > 0 && <p className="mt-1 text-xs font-medium">Vuelto: {soles(vuelto)}</p>}
              </div>
            ) : (
              <Input aria-label="Referencia de la operación" placeholder="N.º operación" value={p.referencia} onChange={(e) => set(i, { referencia: e.target.value })} />
            )}
            <Button type="button" variant="ghost" size="icon" aria-label="Quitar pago" disabled={pagos.length === 1} onClick={() => onChange(pagos.filter((_, j) => j !== i))}><XIcon /></Button>
          </div>
        )
      })}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...pagos, { metodo: "yape", monto: dif > 0 ? dif.toFixed(2) : "", recibido: "", referencia: "" }])}>
          <PlusIcon /> Otro método
        </Button>
        <span className={cn("font-mono text-sm", (exacto ? dif !== 0 : dif < 0) && "text-destructive")}>
          {soles(suma)} / {soles(objetivo)}
        </span>
      </div>
    </div>
  )
}
