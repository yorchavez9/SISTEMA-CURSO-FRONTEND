import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/features/auth/auth-context"

export interface MetodoPago { metodo: string; label: string }
export interface ResumenMetodo { metodo: string; label: string; ingresos: string; egresos: string; neto: string }
export interface Sesion {
  id: number
  estado: "abierta" | "cerrada"
  caja: { id: number; nombre: string; establecimiento: string | null; establecimiento_id: number }
  usuario: string | null
  apertura_at: string
  cierre_at: string | null
  monto_apertura: number
  resumen: { por_metodo: ResumenMetodo[]; efectivo_esperado: string; pagos_registrados: number }
  efectivo_contado: number | null
  diferencia: number | null
  movimientos: { id: number; tipo: "ingreso" | "egreso"; concepto: string; metodo: string; monto: number; descripcion: string | null; fecha: string }[]
}
export interface EstadoCaja {
  metodos: MetodoPago[]
  cajas: { id: number; nombre: string; establecimiento: string | null; establecimiento_id: number; abierta_por: string | null }[]
  sesion: Sesion | null
}

export function useEstadoCaja() {
  const { empresa, puede } = useAuth()
  return useQuery({
    queryKey: ["caja", empresa?.id],
    enabled: !!empresa && puede("caja.operar"),
    queryFn: async () => (await api.get<{ data: EstadoCaja }>("/caja/estado")).data.data,
  })
}

export const CONCEPTOS: Record<string, string> = {
  apertura: "Apertura", venta: "Venta", cobranza: "Cobranza", anulacion_pago: "Anulación de pago",
  ingreso_manual: "Ingreso", gasto: "Gasto", retiro: "Retiro",
}
