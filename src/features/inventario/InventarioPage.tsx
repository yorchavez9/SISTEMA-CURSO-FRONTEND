import { useEffect, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowRightLeftIcon, BoxesIcon, ClipboardListIcon, HistoryIcon, PackagePlusIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Buscador, Paginador, soles, useDebounced, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { useAuth } from "@/features/auth/auth-context"
import type { ProductoDto } from "@/features/productos/ProductosPage"
import { api, toApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

interface Almacen { id: number; nombre: string; es_principal: boolean; establecimiento: string | null }
interface FilaStock { producto_id: number; codigo: string; descripcion: string; unidad: string; cantidad: number; stock_minimo: number; costo_promedio: number; valor: number; bajo_minimo: boolean }
interface Kardex {
  producto: { id: number; codigo: string; descripcion: string; unidad: string }
  movimientos: { id: number; fecha: string; almacen: string; tipo: string; sentido: string; cantidad: number; costo_unitario: number; valor: number; saldo_cantidad: number; saldo_costo_promedio: number; documento: string | null; observacion: string | null; usuario: string | null }[]
}
type Op = "entrada" | "salida" | "ajuste" | "transferencia"

const TIPOS: Record<string, string> = {
  entrada: "Entrada", salida: "Salida", ajuste_entrada: "Ajuste (+)", ajuste_salida: "Ajuste (−)", venta: "Venta",
  transferencia_entrada: "Transferencia (+)", transferencia_salida: "Transferencia (−)",
}
const num = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 4 })
const errorMsg = (e: unknown) => Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message

export function InventarioPage() {
  const { empresa, puede, refresh } = useAuth()
  const qc = useQueryClient()
  const [almacenId, setAlmacenId] = useState("")
  const [q, setQ] = useState("")
  const [bajo, setBajo] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [op, setOp] = useState<Op | null>(null)
  const [kardexId, setKardexId] = useState<number | null>(null)
  const qd = useDebounced(q)

  const almacenes = useQuery({
    queryKey: ["almacenes", empresa?.id],
    enabled: !!empresa,
    queryFn: async () => (await api.get<{ data: Almacen[] }>("/almacenes")).data.data,
  })
  useEffect(() => {
    if (!almacenId && almacenes.data?.[0]) setAlmacenId(String(almacenes.data[0].id))
  }, [almacenes.data, almacenId])

  const stock = useQuery({
    queryKey: ["stock", empresa?.id, almacenId, qd, bajo, pagina],
    enabled: !!almacenId,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: FilaStock[]; meta: MetaPaginacion & { valor_total: number } }>("/inventario/stock", {
      params: { almacen_id: almacenId, q: qd || undefined, bajo_minimo: bajo ? 1 : undefined, page: pagina },
    })).data,
  })

  const negativo = useMutation({
    mutationFn: async (v: boolean) => (await api.put<{ message: string }>(`/empresas/${empresa!.id}`, { permitir_stock_negativo: v })).data,
    onSuccess: async () => { await refresh(); toast.success("Configuración actualizada.") },
    onError: (e) => toast.error(errorMsg(e)),
  })

  const mover = puede("inventario.movimientos")
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Inventario"
        description="Existencias por almacén valorizadas a costo promedio ponderado. Las ventas descuentan del almacén principal del establecimiento."
        actions={mover && (
          <>
            <Button variant="outline" onClick={() => setOp("transferencia")}><ArrowRightLeftIcon /> Transferir</Button>
            <Button variant="outline" onClick={() => setOp("ajuste")}><ClipboardListIcon /> Ajuste</Button>
            <Button variant="outline" onClick={() => setOp("salida")}>Salida</Button>
            <Button onClick={() => setOp("entrada")}><PackagePlusIcon /> Entrada</Button>
          </>
        )}
      />
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <Card>
          <CardHeader>
            <CardDescription>Valor del inventario en el almacén</CardDescription>
            <CardTitle className="tabular-nums text-2xl">{stock.data ? soles(stock.data.meta.valor_total) : "—"}</CardTitle>
          </CardHeader>
        </Card>
        {puede("empresas.editar") && empresa && (
          <Card>
            <CardContent className="flex h-full items-center">
              <Field orientation="horizontal">
                <Switch id="neg" checked={empresa.permitir_stock_negativo} disabled={negativo.isPending} onCheckedChange={(v) => negativo.mutate(v)} />
                <FieldLabel htmlFor="neg" className="flex-col items-start">
                  Permitir vender sin stock
                  <FieldDescription>El kardex quedará en negativo hasta regularizar.</FieldDescription>
                </FieldLabel>
              </Field>
            </CardContent>
          </Card>
        )}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Select value={almacenId} onValueChange={(v) => { setAlmacenId(v); setPagina(1) }}>
              <SelectTrigger className="md:w-80" aria-label="Almacén"><SelectValue placeholder="Almacén" /></SelectTrigger>
              <SelectContent>{almacenes.data?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nombre} · {a.establecimiento}</SelectItem>)}</SelectContent>
            </Select>
            <Buscador value={q} onChange={(v) => { setQ(v); setPagina(1) }} placeholder="Código o descripción" />
            <Field orientation="horizontal" className="md:ml-auto md:w-auto">
              <Switch id="bajo" checked={bajo} onCheckedChange={(v) => { setBajo(v); setPagina(1) }} />
              <FieldLabel htmlFor="bajo">Solo bajo mínimo</FieldLabel>
            </Field>
          </div>
          {almacenes.data?.length === 0 ? (
            <Alert><AlertDescription>No hay establecimientos. Sincroniza en Configuración → Locales y series.</AlertDescription></Alert>
          ) : stock.isLoading ? <Skeleton className="h-40" /> : stock.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(stock.error).message}</AlertDescription></Alert>
          ) : stock.data?.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><BoxesIcon className="size-8" /> No hay bienes con control de stock{bajo ? " bajo el mínimo" : ""}.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Costo prom.</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.data?.data.map((f) => (
                  <TableRow key={f.producto_id}>
                    <TableCell><div className="font-medium">{f.descripcion}</div><div className="tabular-nums text-xs text-muted-foreground">{f.codigo} · {f.unidad}</div></TableCell>
                    <TableCell className={cn("text-right tabular-nums", f.cantidad < 0 && "text-destructive")}>
                      {num(f.cantidad)} {f.bajo_minimo && <Badge variant="destructive" className="ml-1">Bajo mínimo</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{num(f.stock_minimo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{soles(f.costo_promedio)}</TableCell>
                    <TableCell className="text-right tabular-nums">{soles(f.valor)}</TableCell>
                    <TableCell><Button variant="info" size="icon" aria-label={`Kardex de ${f.descripcion}`} onClick={() => setKardexId(f.producto_id)}><HistoryIcon /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Paginador meta={stock.data?.meta} onPage={setPagina} />
        </CardContent>
      </Card>
      {op && almacenes.data && (
        <OperacionDialog op={op} almacenes={almacenes.data} almacenInicial={almacenId} onClose={() => setOp(null)}
          onDone={() => { qc.invalidateQueries({ queryKey: ["stock"] }); qc.invalidateQueries({ queryKey: ["kardex"] }) }} />
      )}
      <KardexSheet productoId={kardexId} almacenId={almacenId} onClose={() => setKardexId(null)} />
    </div>
  )
}

interface Linea { producto: ProductoDto; cantidad: string; costo: string }

function OperacionDialog({ op, almacenes, almacenInicial, onClose, onDone }: { op: Op; almacenes: Almacen[]; almacenInicial: string; onClose: () => void; onDone: () => void }) {
  const [almacen, setAlmacen] = useState(almacenInicial)
  const [destino, setDestino] = useState(almacenes.find((a) => String(a.id) !== almacenInicial)?.id.toString() ?? "")
  const [documento, setDocumento] = useState("")
  const [obs, setObs] = useState("")
  const [lineas, setLineas] = useState<Linea[]>([])
  const titulo = { entrada: "Entrada de mercadería", salida: "Salida de mercadería", ajuste: "Ajuste a inventario físico", transferencia: "Transferencia entre almacenes" }[op]

  const m = useMutation({
    mutationFn: async () => {
      if (op === "transferencia") {
        return (await api.post<{ message: string }>("/inventario/transferencias", {
          origen_id: Number(almacen), destino_id: Number(destino), observacion: obs || undefined,
          items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: Number(l.cantidad) })),
        })).data
      }
      return (await api.post<{ message: string }>("/inventario/movimientos", {
        tipo: op, almacen_id: Number(almacen), documento: documento || undefined, observacion: obs || undefined,
        items: lineas.map((l) => op === "ajuste"
          ? { producto_id: l.producto.id, cantidad_fisica: Number(l.cantidad) }
          : { producto_id: l.producto.id, cantidad: Number(l.cantidad), costo_unitario: op === "entrada" ? Number(l.costo) : undefined }),
      })).data
    },
    onSuccess: (r) => { toast.success(r.message); onDone(); onClose() },
    onError: (e) => toast.error(errorMsg(e)),
  })
  const valido = lineas.length > 0 && lineas.every((l) => l.cantidad !== "" && Number(l.cantidad) >= (op === "ajuste" ? 0 : 0.0001) && (op !== "entrada" || l.costo !== ""))
    && (op === "entrada" || op === "transferencia" || obs.trim().length > 0) && (op !== "transferencia" || (destino && destino !== almacen))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {op === "ajuste" ? "Ingresa la cantidad contada físicamente; el sistema registra la diferencia." : op === "entrada" ? "El costo unitario actualiza el costo promedio ponderado." : "Las salidas se valorizan al costo promedio vigente."}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{op === "transferencia" ? "Almacén de origen" : "Almacén"}</FieldLabel>
              <Select value={almacen} onValueChange={setAlmacen}>
                <SelectTrigger aria-label="Almacén"><SelectValue /></SelectTrigger>
                <SelectContent>{almacenes.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nombre} · {a.establecimiento}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {op === "transferencia" ? (
              <Field>
                <FieldLabel>Almacén de destino</FieldLabel>
                <Select value={destino} onValueChange={setDestino}>
                  <SelectTrigger aria-label="Destino"><SelectValue placeholder="Elige el destino" /></SelectTrigger>
                  <SelectContent>{almacenes.filter((a) => String(a.id) !== almacen).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nombre} · {a.establecimiento}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="doc">Documento de referencia</FieldLabel>
                <Input id="doc" placeholder={op === "entrada" ? "Factura de compra, guía…" : "Opcional"} value={documento} onChange={(e) => setDocumento(e.target.value)} />
              </Field>
            )}
          </div>
          <Field>
            <FieldLabel htmlFor="obs-inv">{op === "entrada" || op === "transferencia" ? "Observación" : "Motivo"}</FieldLabel>
            <Input id="obs-inv" placeholder={op === "salida" ? "Merma, consumo interno, donación…" : op === "ajuste" ? "Conteo físico mensual" : ""} value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Productos</span>
            <ProductoPicker onSelect={(p) => !lineas.some((l) => l.producto.id === p.id) && setLineas((ls) => [...ls, { producto: p, cantidad: "", costo: p.costo ? String(p.costo) : "" }])} />
          </div>
          {lineas.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-32">{op === "ajuste" ? "Cantidad física" : "Cantidad"}</TableHead>
                  {op === "entrada" && <TableHead className="w-32">Costo unit.</TableHead>}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l, i) => (
                  <TableRow key={l.producto.id}>
                    <TableCell>{l.producto.descripcion}<div className="tabular-nums text-xs text-muted-foreground">{l.producto.codigo}</div></TableCell>
                    <TableCell><Input inputMode="decimal" className="tabular-nums" aria-label="Cantidad" value={l.cantidad} onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} /></TableCell>
                    {op === "entrada" && <TableCell><Input inputMode="decimal" className="tabular-nums" aria-label="Costo unitario" value={l.costo} onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, costo: e.target.value } : x)))} /></TableCell>}
                    <TableCell><Button variant="destructive" size="icon" aria-label="Quitar" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}><Trash2Icon /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valido || m.isPending} onClick={() => m.mutate()}>{m.isPending && <Spinner />} Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProductoPicker({ onSelect }: { onSelect: (p: ProductoDto) => void }) {
  const { empresa } = useAuth()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const qd = useDebounced(q)
  const res = useQuery({
    queryKey: ["productos-inv", empresa?.id, qd],
    enabled: open,
    queryFn: async () => (await api.get<{ data: ProductoDto[] }>("/productos", { params: { q: qd || undefined, tipo: "bien", activo: 1, por_pagina: 10 } })).data.data.filter((p) => p.controla_stock),
  })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button size="sm" variant="outline"><PlusIcon /> Agregar producto</Button></PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Código o descripción…" value={q} onValueChange={setQ} />
          <CommandList>
            {res.isFetching && <div className="flex justify-center p-3"><Spinner /></div>}
            <CommandEmpty>Sin bienes con control de stock.</CommandEmpty>
            <CommandGroup>
              {res.data?.map((p) => (
                <CommandItem key={p.id} value={String(p.id)} onSelect={() => { onSelect(p); setOpen(false); setQ("") }}>
                  <span className="truncate">{p.descripcion}</span><span className="ml-auto tabular-nums text-xs text-muted-foreground">{p.codigo}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function KardexSheet({ productoId, almacenId, onClose }: { productoId: number | null; almacenId: string; onClose: () => void }) {
  const k = useQuery({
    queryKey: ["kardex", productoId, almacenId],
    enabled: productoId !== null,
    queryFn: async () => (await api.get<{ data: Kardex }>(`/inventario/kardex/${productoId}`, { params: { almacen_id: almacenId } })).data.data,
  })
  return (
    <Sheet open={productoId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Kardex · {k.data?.producto.descripcion ?? ""}</SheetTitle>
          <SheetDescription>Movimientos valorizados con saldo y costo promedio.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {k.isLoading ? <Skeleton className="h-40" /> : k.data?.movimientos.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos en este almacén.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Documento</TableHead>
                  <TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Saldo</TableHead><TableHead className="text-right">C. prom.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {k.data?.movimientos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(m.fecha).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}<div className="text-muted-foreground">{m.usuario}</div></TableCell>
                    <TableCell><Badge variant={m.sentido === "entrada" ? "outline" : "secondary"}>{TIPOS[m.tipo] ?? m.tipo}</Badge></TableCell>
                    <TableCell className="text-xs">{m.documento ?? "—"}{m.observacion && <div className="text-muted-foreground">{m.observacion}</div>}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", m.sentido === "salida" && "text-destructive")}>{m.sentido === "salida" ? "−" : "+"}{num(m.cantidad)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.costo_unitario.toFixed(4)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", m.saldo_cantidad < 0 && "text-destructive")}>{num(m.saldo_cantidad)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.saldo_costo_promedio.toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
