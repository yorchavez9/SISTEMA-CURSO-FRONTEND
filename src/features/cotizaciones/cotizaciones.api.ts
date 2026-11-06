import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/auth-context"
import { api } from "@/lib/api"

export type EstadoCotizacion = "borrador" | "enviada" | "aceptada" | "rechazada" | "convertida" | "vencida"

export interface Cotizacion {
  id: number; codigo: string; fecha_emision: string; fecha_validez: string
  cliente: { id: number | null; tipo_doc: string | null; num_doc: string | null; razon_social: string; email: string | null }
  moneda: string; total: number; estado: EstadoCotizacion; convertible: boolean
  venta: { id: number; comprobante_id: number | null; numero: string | null } | null
}

export interface CotizacionDetalle extends Cotizacion {
  tasa_igv: number; observacion: string | null; usuario: string | null
  totales: Record<"gravadas" | "exoneradas" | "inafectas" | "exportacion" | "igv" | "isc" | "icbper" | "descuentos" | "total", number>
  items: { producto_id: number | null; codigo: string | null; descripcion: string; unidad: string; cantidad: number; precio_unitario: number; tip_afe_igv: string; descuento: number; base: number; igv: number; total: number }[]
}

export const ESTADOS: Record<EstadoCotizacion, { label: string; v: "default" | "secondary" | "destructive" | "outline" }> = {
  borrador: { label: "Borrador", v: "outline" },
  enviada: { label: "Enviada", v: "secondary" },
  aceptada: { label: "Aceptada", v: "default" },
  rechazada: { label: "Rechazada", v: "destructive" },
  convertida: { label: "Convertida en venta", v: "default" },
  vencida: { label: "Vencida", v: "outline" },
}

export function useCotizacion(id: number | null) {
  const { empresa } = useAuth()
  return useQuery({
    queryKey: ["cotizacion", empresa?.id, id],
    enabled: !!empresa && id !== null,
    queryFn: async () => (await api.get<{ data: CotizacionDetalle }>(`/cotizaciones/${id}`)).data.data,
  })
}
