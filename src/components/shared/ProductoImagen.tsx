import { useState } from "react"
import { PackageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** Miniatura del producto (foto o ilustración). Si no hay imagen o no carga, muestra un ícono. */
export function ProductoImagen({ url, alt, className }: { url: string | null | undefined; alt: string; className?: string }) {
  const [fallo, setFallo] = useState<string | null>(null)
  const visible = url && fallo !== url
  return (
    <div className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground", className)}>
      {visible ? (
        <img src={url} alt={alt} loading="lazy" className="size-full object-cover" onError={() => setFallo(url)} />
      ) : (
        <PackageIcon className="size-1/2" aria-hidden />
      )}
    </div>
  )
}
