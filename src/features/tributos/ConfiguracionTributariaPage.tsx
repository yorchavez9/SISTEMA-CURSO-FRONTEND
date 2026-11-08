import { useQuery } from "@tanstack/react-query"
import { CheckCircle2Icon, CircleAlertIcon, CircleDashedIcon, InfoIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/PageHeader"
import { api, toApiError } from "@/lib/api"
import type { AfectacionIgv, CatalogoItem, CatalogosSunat } from "@/lib/types"

const NOMBRES: Record<string, string> = {
  "01": "Tipos de comprobante", "02": "Monedas", "03": "Unidades de medida", "06": "Documentos de identidad",
  "08": "Sistemas de cálculo ISC", "09": "Motivos de nota de crédito", "10": "Motivos de nota de débito",
  "12": "Documentos relacionados (anticipos)", "20": "Motivos de traslado", "22": "Régimen de percepción",
  "51": "Tipos de operación", "53": "Descuentos", "54": "Bienes y servicios sujetos a detracción", "59": "Medios de pago (detracción)",
}

const GRUPO: Record<AfectacionIgv["grupo"], string> = {
  gravado: "Gravado", exonerado: "Exonerado", inafecto: "Inafecto", exportacion: "Exportación", ivap: "IVAP",
}

export function useCatalogos() {
  return useQuery({
    queryKey: ["catalogos"],
    queryFn: async () => (await api.get<{ data: CatalogosSunat }>("/catalogos")).data.data,
    staleTime: 10 * 60_000,
  })
}

export function ConfiguracionTributariaPage() {
  const q = useCatalogos()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Catálogos SUNAT"
      />
      {q.isLoading && <Skeleton className="h-96" />}
      {q.isError && <Alert variant="destructive"><AlertDescription>{toApiError(q.error).message}</AlertDescription></Alert>}
      {q.data && (
        <Tabs defaultValue="afectaciones">
          <TabsList>
            <TabsTrigger value="afectaciones">Afectación del IGV</TabsTrigger>
            <TabsTrigger value="catalogos">Otros catálogos</TabsTrigger>
          </TabsList>
          <TabsContent value="afectaciones" className="flex flex-col gap-4">
            <Afectaciones items={q.data.afectaciones_igv} />
          </TabsContent>
          <TabsContent value="catalogos" className="grid gap-4 lg:grid-cols-2">
            {Object.entries(q.data.catalogos).map(([cat, items]) => <CatalogoCard key={cat} catalogo={cat} items={items} />)}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function EstadoValidacion({ validado, activo, evidencia, observacion }: { validado: boolean; activo?: boolean; evidencia?: string | null; observacion?: string | null }) {
  const badge = validado ? (
    <Badge><CheckCircle2Icon data-icon="inline-start" />Validado</Badge>
  ) : activo === false ? (
    <Badge variant="destructive"><CircleAlertIcon data-icon="inline-start" />No disponible</Badge>
  ) : (
    <Badge variant="outline"><CircleDashedIcon data-icon="inline-start" />Sin validar</Badge>
  )
  if (!evidencia && !observacion) return badge
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button type="button" className="cursor-help">{badge}</button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 text-sm">
        {evidencia && <p><span className="font-medium">Evidencia:</span> {evidencia}</p>}
        {observacion && <p className="mt-2 text-muted-foreground">{observacion}</p>}
      </HoverCardContent>
    </HoverCard>
  )
}

function Afectaciones({ items }: { items: AfectacionIgv[] }) {
  const noDisponibles = items.filter((a) => !a.activo)
  return (
    <>
      {noDisponibles.length > 0 && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{noDisponibles.length === 1 ? "1 código no disponible" : `${noDisponibles.length} códigos no disponibles`}</AlertTitle>
          <AlertDescription>
            {noDisponibles.map((a) => <p key={a.codigo}><span className="font-medium">{a.codigo}</span> — {a.observacion}</p>)}
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Catálogo 07 · Tipos de afectación del IGV</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Tributo</TableHead>
                <TableHead>Operación</TableHead>
                <TableHead>IGV</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.codigo} className={a.activo ? undefined : "opacity-60"}>
                  <TableCell className="tabular-nums font-medium">{a.codigo}</TableCell>
                  <TableCell>{a.descripcion}</TableCell>
                  <TableCell>{GRUPO[a.grupo]}</TableCell>
                  <TableCell className="tabular-nums text-xs">{a.tributo.codigo} {a.tributo.nombre}</TableCell>
                  <TableCell>{a.es_gratuito ? <Badge variant="secondary">Gratuita</Badge> : "Onerosa"}</TableCell>
                  <TableCell className="text-xs">
                    {a.calcula_igv ? (a.es_gratuito ? "Se calcula, no se cobra" : "Se calcula y se cobra") : "No aplica"}
                  </TableCell>
                  <TableCell>
                    <EstadoValidacion validado={a.validado_api} activo={a.activo} evidencia={a.evidencia} observacion={a.observacion} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function CatalogoCard({ catalogo, items }: { catalogo: string; items: CatalogoItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Catálogo {catalogo} · {NOMBRES[catalogo] ?? ""}</CardTitle>
        <CardDescription>{items.filter((i) => i.validado_api).length} de {items.length} validados con la API</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {items.map((i) => {
              const nota = (i.meta?.nota as string | undefined) ?? (i.meta?.verificar_con_anexo_vigente ? "Verificar descripción y tasa con el anexo vigente de SUNAT." : null)
              return (
                <TableRow key={i.codigo}>
                  <TableCell className="w-16 tabular-nums">{i.codigo}</TableCell>
                  <TableCell>
                    {i.descripcion}
                    {typeof i.meta?.tasa === "number" && <span className="text-muted-foreground"> · {i.meta.tasa}%</span>}
                  </TableCell>
                  <TableCell className="w-32 text-right">
                    <EstadoValidacion validado={i.validado_api} observacion={nota} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
