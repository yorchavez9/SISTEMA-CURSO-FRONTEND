import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { DownloadIcon, FileSpreadsheetIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { soles } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import { api, toApiError } from "@/lib/api"
import { descargarArchivo } from "@/lib/descargas"
import { cn } from "@/lib/utils"

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date())
const inicioMes = () => hoy().slice(0, 8) + "01"
const TIPO: Record<string, string> = { "01": "Factura", "03": "Boleta", "07": "Nota de crédito", "08": "Nota de débito" }
const AGRUPAR: Record<string, string> = { dia: "Día", producto: "Producto", cliente: "Cliente", usuario: "Usuario", tipo: "Tipo de comprobante" }

/** CSV con separador ";" y BOM UTF-8 para que Excel en español lo abra con tildes y columnas correctas. */
function descargarCsv(nombre: string, cabeceras: string[], filas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : typeof v === "number" ? v.toFixed(2).replace(".", ",") : v
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = "﻿" + [cabeceras, ...filas].map((f) => f.map(esc).join(";")).join("\r\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportesPage() {
  const { empresa, puede } = useAuth()
  const [desde, setDesde] = useState(inicioMes())
  const [hasta, setHasta] = useState(hoy())
  const [agrupar, setAgrupar] = useState("dia")
  const rangoOk = desde <= hasta

  const ventas = useQuery({
    queryKey: ["rep-ventas", empresa?.id, desde, hasta, agrupar],
    enabled: !!empresa && rangoOk && puede("reportes.ver"),
    queryFn: async () => (await api.get<{ data: { filas: { clave: string; etiqueta: string; cantidad: number; base: number; igv: number; total: number }[]; totales: { base: number; igv: number; total: number } } }>(
      "/reportes/ventas", { params: { desde, hasta, agrupar } })).data.data,
  })
  const registro = useQuery({
    queryKey: ["rep-registro", empresa?.id, desde, hasta],
    enabled: !!empresa && rangoOk && puede("reportes.ver"),
    queryFn: async () => (await api.get<{ data: {
      filas: { fecha: string; tipo: string; numero: string; referencia: string | null; cliente_doc: string; cliente: string; estado: string; gravadas: number; exoneradas: number; inafectas: number; exportacion: number; gratuitas: number; igv: number; isc: number; icbper: number; total: number }[]
      resumen: Record<string, number | string>[]
      totales: Record<string, number>
    } }>("/reportes/registro-ventas", { params: { desde, hasta } })).data.data,
  })

  if (!puede("reportes.ver")) return <Alert><AlertDescription>Tu rol no tiene acceso a reportes.</AlertDescription></Alert>
  const etiquetaFila = (f: { clave: string; etiqueta: string }) => (agrupar === "tipo" ? TIPO[f.clave] ?? f.clave : agrupar === "cliente" ? `${f.etiqueta} (${f.clave})` : f.etiqueta)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader title="Reportes" description="Montos en soles. Las notas de crédito restan; los comprobantes rechazados o dados de baja no suman." />
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <Field className="w-44"><FieldLabel htmlFor="desde">Desde</FieldLabel><Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
          <Field className="w-44"><FieldLabel htmlFor="hasta">Hasta</FieldLabel><Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Field>
          {!rangoOk && <p className="text-sm text-destructive">La fecha inicial debe ser anterior a la final.</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="ventas">
        <TabsList>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="registro">Registro de ventas e impuestos</TabsTrigger>
        </TabsList>

        <TabsContent value="ventas">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2">
              <div>
                <CardTitle>Ventas por {AGRUPAR[agrupar].toLowerCase()}</CardTitle>
                <CardDescription>{agrupar === "producto" ? "Unidades e importes vendidos en facturas y boletas vigentes." : "Venta neta por grupo."}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Select value={agrupar} onValueChange={setAgrupar}>
                  <SelectTrigger className="w-52" aria-label="Agrupar por"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(AGRUPAR).map(([k, v]) => <SelectItem key={k} value={k}>Por {v.toLowerCase()}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" disabled={!ventas.data?.filas.length} onClick={() => ventas.data && descargarCsv(`ventas_por_${agrupar}_${desde}_${hasta}.csv`,
                  [AGRUPAR[agrupar], agrupar === "producto" ? "Unidades" : "Comprobantes", "Valor de venta", "IGV", "Total"],
                  ventas.data.filas.map((f) => [etiquetaFila(f), f.cantidad, f.base, f.igv, f.total]))}>
                  <DownloadIcon /> CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {ventas.isLoading ? <Skeleton className="h-40" /> : ventas.isError ? <Alert variant="destructive"><AlertDescription>{toApiError(ventas.error).message}</AlertDescription></Alert>
                : ventas.data?.filas.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Sin ventas en el periodo.</p> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{AGRUPAR[agrupar]}</TableHead>
                      <TableHead className="text-right">{agrupar === "producto" ? "Unidades" : "Comprobantes"}</TableHead>
                      <TableHead className="text-right">Valor de venta</TableHead><TableHead className="text-right">IGV</TableHead><TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ventas.data?.filas.map((f) => (
                      <TableRow key={f.clave + f.etiqueta}>
                        <TableCell className="max-w-80 truncate">{etiquetaFila(f)}</TableCell>
                        <TableCell className="text-right font-mono">{f.cantidad.toLocaleString("es-PE")}</TableCell>
                        <TableCell className="text-right font-mono">{soles(f.base)}</TableCell>
                        <TableCell className="text-right font-mono">{soles(f.igv)}</TableCell>
                        <TableCell className={cn("text-right font-mono font-medium", f.total < 0 && "text-destructive")}>{soles(f.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right font-mono">{soles(ventas.data?.totales.base ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono">{soles(ventas.data?.totales.igv ?? 0)}</TableCell>
                      <TableCell className="text-right font-mono">{soles(ventas.data?.totales.total ?? 0)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registro" className="flex flex-col gap-4">
          {registro.isLoading ? <Skeleton className="h-60" /> : registro.isError ? <Alert variant="destructive"><AlertDescription>{toApiError(registro.error).message}</AlertDescription></Alert> : registro.data && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {([["gravadas", "Op. gravadas"], ["exoneradas", "Op. exoneradas"], ["inafectas", "Op. inafectas"], ["igv", "IGV"], ["total", "Importe total"]] as const).map(([k, l]) => (
                  <Card key={k}><CardHeader><CardDescription>{l}</CardDescription><CardTitle className="font-mono text-xl">{soles(registro.data.totales[k] ?? 0)}</CardTitle></CardHeader></Card>
                ))}
              </div>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2"><FileSpreadsheetIcon className="size-4" />Registro de ventas</CardTitle>
                    <CardDescription>{registro.data.filas.length} comprobantes. Los anulados o rechazados figuran con importes en cero.</CardDescription>
                  </div>
                  <div className="flex gap-2">
                  <Button variant="outline" disabled={!registro.data.filas.length}
                    onClick={() => descargarArchivo(`/reportes/registro-ventas/excel?desde=${desde}&hasta=${hasta}`, `registro_ventas_${desde}_${hasta}.xlsx`)}>
                    <FileSpreadsheetIcon /> Excel
                  </Button>
                  <Button variant="outline" disabled={!registro.data.filas.length} onClick={() => descargarCsv(`registro_ventas_${desde}_${hasta}.csv`,
                    ["Fecha", "Tipo", "Número", "Doc. referencia", "Doc. cliente", "Cliente", "Estado", "Gravadas", "Exoneradas", "Inafectas", "Exportación", "Gratuitas", "IGV", "ISC", "ICBPER", "Total"],
                    registro.data.filas.map((f) => [f.fecha, TIPO[f.tipo], f.numero, f.referencia, f.cliente_doc, f.cliente, f.estado, f.gravadas, f.exoneradas, f.inafectas, f.exportacion, f.gratuitas, f.igv, f.isc, f.icbper, f.total]))}>
                    <DownloadIcon /> CSV
                  </Button>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead><TableHead>Comprobante</TableHead><TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Gravadas</TableHead><TableHead className="text-right">Exon./Inaf.</TableHead>
                        <TableHead className="text-right">IGV</TableHead><TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registro.data.filas.map((f) => (
                        <TableRow key={f.tipo + f.numero} className={f.total === 0 && f.estado !== "aceptado" ? "opacity-60" : undefined}>
                          <TableCell className="whitespace-nowrap">{f.fecha}</TableCell>
                          <TableCell><div className="font-mono">{f.numero}</div><div className="text-xs text-muted-foreground">{TIPO[f.tipo]}{f.referencia && ` de ${f.referencia}`}{!["aceptado", "enviado", "por_enviar", "observado"].includes(f.estado) && ` · ${f.estado}`}</div></TableCell>
                          <TableCell className="max-w-64"><div className="truncate">{f.cliente}</div><div className="font-mono text-xs text-muted-foreground">{f.cliente_doc}</div></TableCell>
                          <TableCell className="text-right font-mono">{soles(f.gravadas)}</TableCell>
                          <TableCell className="text-right font-mono">{soles(f.exoneradas + f.inafectas)}</TableCell>
                          <TableCell className="text-right font-mono">{soles(f.igv)}</TableCell>
                          <TableCell className={cn("text-right font-mono font-medium", f.total < 0 && "text-destructive")}>{soles(f.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
