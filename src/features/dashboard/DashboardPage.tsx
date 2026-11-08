import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { AlertTriangleIcon, ArrowDownRightIcon, ArrowUpRightIcon, CircleAlertIcon, MinusIcon, PlusIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { soles } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { EstadoBadge } from "@/features/comprobantes/ComprobantesPage"
import { InicioPage } from "@/features/inicio/InicioPage"
import { useCredencialesApi } from "@/features/empresas/credenciales-api.api"
import { api, toApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

interface Dashboard {
  kpis: { ventas_hoy: number; ventas_mes: number; ventas_mes_anterior_a_la_fecha: number; comprobantes_mes: number; por_cobrar: number; saldos_a_favor: number }
  por_tipo: { tipo: string; cantidad: number; total: number }[]
  por_estado: { estado: string; cantidad: number }[]
  ventas_por_dia: { fecha: string; total: number; comprobantes: number }[]
  top_productos: { codigo: string; descripcion: string; cantidad: number; total: number }[]
  top_clientes: { documento: string; nombre: string; total: number; compras: number }[]
  recientes: { id: number; numero: string; tipo_documento: string; cliente: string; total: number; moneda: string; estado: string; fecha: string }[]
  alertas: { nivel: "warning" | "critical"; texto: string; link: string }[]
}

const TIPO: Record<string, string> = { "01": "Facturas", "03": "Boletas", "07": "Notas de crédito", "08": "Notas de débito" }
// Una sola serie por gráfico: un tono validado (contraste ≥3:1 en claro y oscuro), sin leyenda; el título la nombra.
const serie: ChartConfig = { total: { label: "Venta neta", color: "var(--series-1)" } }
const serieOnda: ChartConfig = { comprobantes: { label: "Comprobantes", color: "var(--series-1)" } }
// Cada tipo y cada estado conservan siempre su color; el orden evita vecinos confundibles con daltonismo.
const COLOR_TIPO: Record<string, string> = { "01": "var(--tipo-factura)", "03": "var(--tipo-boleta)", "07": "var(--tipo-nc)", "08": "var(--tipo-nd)" }
const GRUPOS_ESTADO = [
  { nombre: "Aceptados", color: "var(--estado-ok)", estados: ["aceptado"] },
  { nombre: "Observados", color: "var(--estado-aviso)", estados: ["observado"] },
  { nombre: "En proceso", color: "var(--estado-proceso)", estados: ["enviado", "pendiente_resumen", "por_enviar"] },
  { nombre: "Rechazados o con error", color: "var(--estado-mal)", estados: ["rechazado", "error"] },
  { nombre: "Anulados", color: "var(--estado-anulado)", estados: ["anulado"] },
]
const corto = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" })
const compacto = (n: number) => new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 }).format(n)

export function DashboardPage() {
  const { empresa, puede } = useAuth()
  const creds = useCredencialesApi(empresa?.id && puede("credenciales_api.gestionar") ? empresa.id : undefined)
  const q = useQuery({
    queryKey: ["dashboard", empresa?.id],
    enabled: !!empresa && puede("ventas.ver"),
    queryFn: async () => (await api.get<{ data: Dashboard }>("/dashboard")).data.data,
    refetchInterval: 60_000,
  })

  const sinConfigurar = !empresa || (creds.data && !creds.data.entornos.some((e) => e.verificacion_ok))
  if (sinConfigurar || !puede("ventas.ver")) return <InicioPage />

  const d = q.data
  const delta = d && d.kpis.ventas_mes_anterior_a_la_fecha > 0 ? (d.kpis.ventas_mes / d.kpis.ventas_mes_anterior_a_la_fecha - 1) * 100 : null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Panel"
        description={`${empresa?.razon_social} · montos en soles, venta neta (facturas y boletas + notas de débito − notas de crédito; sin anulados ni rechazados).`}
        actions={puede("comprobantes.emitir") && <Button asChild><Link to="/ventas/nueva"><PlusIcon /> Nueva venta</Link></Button>}
      />
      {q.isError && <Alert variant="destructive"><AlertDescription>{toApiError(q.error).message}</AlertDescription></Alert>}

      {d?.alertas.map((a, i) => (
        <Alert key={i} variant={a.nivel === "critical" ? "destructive" : "default"}>
          {a.nivel === "critical" ? <CircleAlertIcon /> : <AlertTriangleIcon />}
          <AlertDescription><p>{a.texto} <Link className="underline underline-offset-4" to={a.link}>Revisar</Link></p></AlertDescription>
        </Alert>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ventas de hoy" valor={d && soles(d.kpis.ventas_hoy)} />
        <Kpi label="Ventas del mes" valor={d && soles(d.kpis.ventas_mes)}
          extra={delta !== null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {delta > 0.05 ? <ArrowUpRightIcon className="size-3.5" /> : delta < -0.05 ? <ArrowDownRightIcon className="size-3.5" /> : <MinusIcon className="size-3.5" />}
              {`${delta > 0 ? "+" : ""}${delta.toFixed(1)}% vs. mismo periodo del mes anterior`}
            </span>
          )} />
        <Kpi label="Comprobantes del mes" valor={d && String(d.kpis.comprobantes_mes)}
          extra={d && <span className="text-xs text-muted-foreground">{d.por_tipo.filter((t) => t.cantidad).map((t) => `${t.cantidad} ${TIPO[t.tipo].toLowerCase()}`).join(" · ") || "—"}</span>} />
        <Kpi label="Por cobrar" valor={d && soles(d.kpis.por_cobrar)}
          extra={d && d.kpis.saldos_a_favor > 0 && <Link to="/cuentas-por-cobrar" className="text-xs underline underline-offset-4">{soles(d.kpis.saldos_a_favor)} a favor de clientes</Link>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Venta neta diaria</CardTitle>
            <CardDescription>Últimos 30 días</CardDescription>
          </CardHeader>
          <CardContent>
            {!d ? <Skeleton className="h-64" /> : (
              <ChartContainer config={serie} className="h-64 w-full">
                <BarChart data={d.ventas_por_dia} margin={{ left: 4, right: 4 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} strokeOpacity={0.4} />
                  <XAxis dataKey="fecha" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={corto} />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={compacto} />
                  <ChartTooltip cursor={{ fillOpacity: 0.08 }}
                    content={<ChartTooltipContent labelFormatter={(_, p) => corto(p?.[0]?.payload?.fecha ?? "")} formatter={(v) => <span className="tabular-nums">{soles(Number(v))}</span>} />} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comprobantes por día</CardTitle>
            <CardDescription>Últimos 30 días, sin anulados ni rechazados</CardDescription>
          </CardHeader>
          <CardContent>
            {!d ? <Skeleton className="h-64" /> : (
              <ChartContainer config={serieOnda} className="h-64 w-full">
                <AreaChart data={d.ventas_por_dia} margin={{ left: 4, right: 4, top: 8 }}>
                  <defs>
                    <linearGradient id="relleno-onda" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-comprobantes)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--color-comprobantes)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeOpacity={0.4} />
                  <XAxis dataKey="fecha" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={corto} />
                  <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => corto(p?.[0]?.payload?.fecha ?? "")} />} />
                  <Area type="monotone" dataKey="comprobantes" stroke="var(--color-comprobantes)" strokeWidth={2} fill="url(#relleno-onda)" activeDot={{ r: 4 }} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Comprobantes del mes por tipo</CardTitle>
            <CardDescription>Cantidad emitida, sin anulados ni rechazados</CardDescription>
          </CardHeader>
          <CardContent>
            {!d ? <Skeleton className="h-44" /> : <Dona datos={d.por_tipo.map((t) => ({ nombre: TIPO[t.tipo], valor: t.cantidad, color: COLOR_TIPO[t.tipo] }))} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comprobantes del mes por estado</CardTitle>
            <CardDescription>Estado ante SUNAT</CardDescription>
          </CardHeader>
          <CardContent>
            {!d ? <Skeleton className="h-44" /> : <Dona datos={GRUPOS_ESTADO.map((g) => ({ nombre: g.nombre, color: g.color, valor: d.por_estado.filter((e) => g.estados.includes(e.estado)).reduce((n, e) => n + e.cantidad, 0) }))} />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Productos más vendidos</CardTitle>
            <CardDescription>Importe del mes</CardDescription>
          </CardHeader>
          <CardContent>
            {!d ? <Skeleton className="h-56" /> : d.top_productos.length === 0 ? <p className="text-sm text-muted-foreground">Sin ventas este mes.</p> : (
              <ChartContainer config={serie} className="w-full" style={{ height: Math.max(120, d.top_productos.length * 36) }}>
                <BarChart data={d.top_productos} layout="vertical" margin={{ left: 0, right: 56 }} barCategoryGap={6}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="descripcion" tickLine={false} axisLine={false} width={150}
                    tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + "…" : v)} />
                  <ChartTooltip cursor={{ fillOpacity: 0.08 }}
                    content={<ChartTooltipContent formatter={(v, _n, p) => <span className="tabular-nums">{soles(Number(v))} · {p.payload.cantidad} und.</span>} />} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} maxBarSize={20}
                    label={{ position: "right", className: "fill-muted-foreground tabular-nums text-xs", formatter: (v: unknown) => compacto(Number(v)) }} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clientes principales</CardTitle>
            <CardDescription>Venta neta del mes (excluye consumidor final)</CardDescription>
          </CardHeader>
          <CardContent>
            {!d ? <Skeleton className="h-56" /> : d.top_clientes.length === 0 ? <p className="text-sm text-muted-foreground">Sin clientes identificados este mes.</p> : (
              <Table>
                <TableBody>
                  {d.top_clientes.map((c) => (
                    <TableRow key={c.documento}>
                      <TableCell className="max-w-64"><div className="truncate">{c.nombre}</div><div className="tabular-nums text-xs text-muted-foreground">{c.documento} · {c.compras} compra{c.compras === 1 ? "" : "s"}</div></TableCell>
                      <TableCell className="text-right tabular-nums">{soles(c.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Últimos comprobantes</CardTitle></CardHeader>
        <CardContent>
          {!d ? <Skeleton className="h-40" /> : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Comprobante</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {d.recientes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Link className="tabular-nums underline-offset-4 hover:underline" to={`/comprobantes?ver=${r.id}`}>{r.numero}</Link></TableCell>
                    <TableCell className="max-w-64 truncate">{r.cliente}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", r.tipo_documento === "07" && "text-destructive")}>{r.tipo_documento === "07" ? "−" : ""}{soles(r.total, r.moneda)}</TableCell>
                    <TableCell><EstadoBadge estado={r.estado as Parameters<typeof EstadoBadge>[0]["estado"]} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Dona({ datos }: { datos: { nombre: string; valor: number; color: string }[] }) {
  const visibles = datos.filter((x) => x.valor > 0)
  const total = visibles.reduce((n, x) => n + x.valor, 0)
  if (total === 0) return <p className="text-sm text-muted-foreground">Sin comprobantes este mes.</p>
  const config: ChartConfig = Object.fromEntries(visibles.map((x) => [x.nombre, { label: x.nombre, color: x.color }]))
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-44 shrink-0">
        <ChartContainer config={config} className="aspect-square size-44">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="nombre" />} />
            <Pie data={visibles} dataKey="valor" nameKey="nombre" innerRadius={60} outerRadius={84} paddingAngle={visibles.length > 1 ? 2 : 0} cornerRadius={4} stroke="none">
              {visibles.map((x) => <Cell key={x.nombre} fill={x.color} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-xs text-muted-foreground">en total</span>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2 text-sm">
        {visibles.map((x) => (
          <li key={x.nombre} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
            <span className="min-w-0 flex-1 truncate">{x.nombre}</span>
            <span className="tabular-nums">{x.valor}</span>
            <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">{Math.round((x.valor / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Kpi({ label, valor, extra }: { label: string; valor?: string | false; extra?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="tabular-nums text-2xl">{valor ?? <Skeleton className="h-8 w-32" />}</CardTitle>
        {extra}
      </CardHeader>
    </Card>
  )
}
