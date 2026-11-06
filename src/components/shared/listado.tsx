import { useEffect, useState } from "react"
import { SearchIcon } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"

export interface MetaPaginacion {
  pagina: number
  ultima_pagina: number
  total: number
  por_pagina: number
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function Buscador({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <InputGroup className="max-w-sm">
      <InputGroupAddon><SearchIcon /></InputGroupAddon>
      <InputGroupInput type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </InputGroup>
  )
}

export function Paginador({ meta, onPage }: { meta?: MetaPaginacion; onPage: (p: number) => void }) {
  if (!meta || meta.ultima_pagina <= 1) {
    return meta ? <p className="text-sm text-muted-foreground">{meta.total} registro{meta.total === 1 ? "" : "s"}</p> : null
  }
  return (
    <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        Página {meta.pagina} de {meta.ultima_pagina} · {meta.total} registros
      </p>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              text="Anterior"
              aria-disabled={meta.pagina <= 1}
              className={meta.pagina <= 1 ? "pointer-events-none opacity-50" : undefined}
              onClick={(e) => { e.preventDefault(); onPage(meta.pagina - 1) }}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              text="Siguiente"
              aria-disabled={meta.pagina >= meta.ultima_pagina}
              className={meta.pagina >= meta.ultima_pagina ? "pointer-events-none opacity-50" : undefined}
              onClick={(e) => { e.preventDefault(); onPage(meta.pagina + 1) }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

export const soles = (n: number, moneda = "PEN") =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: moneda, minimumFractionDigits: 2 }).format(n)
