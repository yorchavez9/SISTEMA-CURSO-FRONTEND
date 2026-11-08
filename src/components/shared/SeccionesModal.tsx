import { useState, type ReactNode } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

export interface Seccion { id: string; label: string; contenido: ReactNode; error?: boolean; oculta?: boolean }

/**
 * Divide el contenido de un modal en secciones para que quepa sin scroll.
 * Todas siguen montadas (solo se ocultan): los formularios conservan sus valores al cambiar de sección.
 */
export function SeccionesModal({ secciones, className }: { secciones: Seccion[]; className?: string }) {
  const visibles = secciones.filter((s) => !s.oculta)
  const [elegida, setElegida] = useState(visibles[0]?.id)
  const activa = visibles.some((s) => s.id === elegida) ? elegida : visibles[0]?.id
  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div role="tablist" className="flex flex-wrap gap-1">
        {visibles.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            data-seccion={s.id}
            aria-selected={s.id === activa}
            onClick={() => setElegida(s.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              s.id === activa ? "bg-foreground/10 font-medium" : "text-muted-foreground hover:text-foreground",
              s.error && "text-destructive",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      {visibles.map((s) => <div key={s.id} role="tabpanel" hidden={s.id !== activa} className="min-w-0">{s.contenido}</div>)}
    </div>
  )
}

/** Pagina una lista dentro de un modal para que no crezca más que la pantalla. */
export function usePaginaLocal<T>(items: T[], porPagina: number, porPaginaMovil = porPagina) {
  const movil = useIsMobile()
  const tamano = movil ? porPaginaMovil : porPagina
  const [pagina, setPagina] = useState(0)
  const paginas = Math.max(1, Math.ceil(items.length / tamano))
  const actual = Math.min(pagina, paginas - 1)
  const offset = actual * tamano
  const pager = paginas > 1 ? (
    <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Anterior" disabled={actual === 0} onClick={() => setPagina(actual - 1)}><ChevronLeftIcon /></Button>
      <span className="tabular-nums">{actual + 1} / {paginas}</span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Siguiente" disabled={actual >= paginas - 1} onClick={() => setPagina(actual + 1)}><ChevronRightIcon /></Button>
    </div>
  ) : null
  return { visibles: items.slice(offset, offset + tamano), offset, pager, irAlFinal: (total = items.length + 1) => setPagina(Math.ceil(total / tamano) - 1) }
}
