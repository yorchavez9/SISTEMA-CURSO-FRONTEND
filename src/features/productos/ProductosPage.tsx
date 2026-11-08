import { useEffect, useMemo, useRef, useState } from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckIcon, ChevronsUpDownIcon, ImageIcon, ImageOffIcon, MoreHorizontalIcon, PackageIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Buscador, Paginador, soles, useDebounced, type MetaPaginacion } from "@/components/shared/listado"
import { PageHeader } from "@/components/shared/PageHeader"
import { ProductoImagen } from "@/components/shared/ProductoImagen"
import { useAuth } from "@/features/auth/auth-context"
import { useCatalogos } from "@/features/tributos/ConfiguracionTributariaPage"
import { api, applyServerErrors, toApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

export interface ProductoDto {
  id: number
  codigo: string
  descripcion: string
  tipo: "bien" | "servicio"
  categoria: { id: number; nombre: string } | null
  codigo_barras: string | null
  cod_producto_sunat: string | null
  unidad: string
  moneda: string
  precio_venta: number
  costo: number
  tip_afe_igv: string
  porcentaje_isc: number | null
  aplica_icbper: boolean
  factor_icbper: number | null
  controla_stock: boolean
  stock_minimo: number
  activo: boolean
  /** Foto subida o ilustración generada (color e ícono de la categoría). */
  imagen_url: string | null
  imagen_generada: boolean
  presentaciones: { id: number; nombre: string; unidad: string; factor: number; precio_venta: number; codigo_barras: string | null }[]
}
interface Categoria { id: number; nombre: string }

const num = (msg: string) => z.string().trim().refine((v) => v !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0, msg)
const numOpt = z.string().trim().refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Número no válido.")

const schema = z
  .object({
    codigo: z.string().trim().min(1, "Ingresa el código.").regex(/^\S+$/, "Sin espacios."),
    descripcion: z.string().trim().min(2, "Ingresa la descripción."),
    tipo: z.enum(["bien", "servicio"]),
    categoria_id: z.string(),
    unidad: z.string().min(1, "Selecciona la unidad."),
    cod_producto_sunat: z.string().refine((v) => !v || /^\d{8}$/.test(v), "8 dígitos."),
    codigo_barras: z.string().trim(),
    precio_venta: num("Ingresa el precio."),
    costo: numOpt,
    tip_afe_igv: z.string().length(2, "Selecciona la afectación."),
    con_isc: z.boolean(),
    porcentaje_isc: numOpt,
    aplica_icbper: z.boolean(),
    factor_icbper: numOpt,
    controla_stock: z.boolean(),
    stock_minimo: numOpt,
    presentaciones: z.array(z.object({ nombre: z.string().trim().min(1, "Nombre"), unidad: z.string().min(1), factor: num("Factor"), precio_venta: num("Precio") })),
  })
  .superRefine((v, ctx) => {
    if (v.con_isc && !(Number(v.porcentaje_isc) > 0)) ctx.addIssue({ code: "custom", path: ["porcentaje_isc"], message: "Ingresa la tasa del ISC." })
    if (v.aplica_icbper && !(Number(v.factor_icbper) > 0)) ctx.addIssue({ code: "custom", path: ["factor_icbper"], message: "Ingresa el monto por unidad." })
  })
type Values = z.infer<typeof schema>

export function ProductosPage() {
  const { empresa, puede } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [pagina, setPagina] = useState(1)
  const [editando, setEditando] = useState<ProductoDto | null | undefined>(undefined)
  const [eliminar, setEliminar] = useState<ProductoDto | null>(null)
  const qd = useDebounced(q)
  const cat = useCatalogos()
  const lista = useQuery({
    queryKey: ["productos", empresa?.id, qd, pagina],
    enabled: !!empresa,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<{ data: ProductoDto[]; meta: MetaPaginacion }>("/productos", { params: { q: qd || undefined, page: pagina } })).data,
  })
  const borrar = useMutation({
    mutationFn: async (id: number) => (await api.delete<{ message: string }>(`/productos/${id}`)).data,
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["productos"] }) },
    onError: (e) => toast.error(toApiError(e).message),
  })
  const afeLabel = (c: string) => cat.data?.afectaciones_igv.find((a) => a.codigo === c)?.descripcion ?? c

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Productos y servicios"
        description="Catálogo de venta con su afectación tributaria. El precio de venta incluye impuestos."
        actions={puede("productos.crear") && <Button onClick={() => setEditando(null)} disabled={!cat.data}><PlusIcon /> Nuevo producto</Button>}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Buscador value={q} onChange={(v) => { setQ(v); setPagina(1) }} placeholder="Buscar por código, código de barras o descripción" />
          {lista.isLoading ? (
            <div className="flex flex-col gap-2"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : lista.isError ? (
            <Alert variant="destructive"><AlertDescription>{toApiError(lista.error).message}</AlertDescription></Alert>
          ) : lista.data?.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <PackageIcon className="size-8" /> {qd ? "Sin resultados para la búsqueda." : "Aún no hay productos registrados."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="hidden md:table-cell">Afectación</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="w-12"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.data?.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="tabular-nums">{p.codigo}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ProductoImagen url={p.imagen_url} alt={p.descripcion} className="size-12" />
                        <div className="min-w-0">
                          <div className="font-medium">{p.descripcion}</div>
                          <div className="flex flex-wrap gap-1 pt-1">
                            <Badge variant="outline">{p.tipo === "servicio" ? "Servicio" : "Bien"} · {p.unidad}</Badge>
                            {p.categoria && <Badge variant="secondary">{p.categoria.nombre}</Badge>}
                            {p.porcentaje_isc && <Badge variant="outline">ISC {p.porcentaje_isc}%</Badge>}
                            {p.aplica_icbper && <Badge variant="outline">ICBPER</Badge>}
                            {!p.activo && <Badge variant="destructive">Inactivo</Badge>}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-56 text-sm md:table-cell"><span className="tabular-nums">{p.tip_afe_igv}</span> · {afeLabel(p.tip_afe_igv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{soles(p.precio_venta, p.moneda)}</TableCell>
                    <TableCell>
                      {(puede("productos.editar") || puede("productos.eliminar")) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="info" size="icon" aria-label={`Acciones para ${p.descripcion}`}><MoreHorizontalIcon /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {puede("productos.editar") && <DropdownMenuItem onSelect={() => setEditando(p)}><PencilIcon /> Editar</DropdownMenuItem>}
                            {puede("productos.eliminar") && <DropdownMenuItem variant="destructive" onSelect={() => setEliminar(p)}><Trash2Icon /> Eliminar</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Paginador meta={lista.data?.meta} onPage={setPagina} />
        </CardContent>
      </Card>

      {editando !== undefined && cat.data && (
        <ProductoDialog producto={editando} onClose={() => setEditando(undefined)} onSaved={() => qc.invalidateQueries({ queryKey: ["productos"] })} />
      )}
      <AlertDialog open={!!eliminar} onOpenChange={(o) => !o && setEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {eliminar?.descripcion}?</AlertDialogTitle>
            <AlertDialogDescription>Dejará de estar disponible para vender. Las ventas y comprobantes existentes no cambian.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => eliminar && borrar.mutate(eliminar.id)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CodigoSunatCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const qd = useDebounced(q, 400)
  const res = useQuery({
    queryKey: ["codigos-sunat", qd],
    enabled: open && qd.trim().length >= 3,
    queryFn: async () => (await api.get<{ data: { codigo: string; descripcion: string }[] }>("/productos/codigos-sunat", { params: { q: qd } })).data.data,
    staleTime: 3_600_000,
  })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Buscar en el catálogo SUNAT…"}</span>
          {value ? (
            <XIcon className="opacity-60" onClick={(e) => { e.stopPropagation(); onChange("") }} aria-label="Quitar código" />
          ) : <ChevronsUpDownIcon className="opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Ej. laptop, mantenimiento, 4321…" value={q} onValueChange={setQ} />
          <CommandList>
            {res.isFetching && <div className="flex justify-center p-3"><Spinner /></div>}
            <CommandEmpty>{qd.length < 3 ? "Escribe al menos 3 caracteres." : res.isError ? toApiError(res.error).message : "Sin resultados."}</CommandEmpty>
            <CommandGroup>
              {res.data?.map((c) => (
                <CommandItem key={c.codigo} value={c.codigo} onSelect={() => { onChange(c.codigo); setOpen(false) }}>
                  <CheckIcon className={cn(value === c.codigo ? "opacity-100" : "opacity-0")} />
                  <span className="tabular-nums text-xs">{c.codigo}</span>
                  <span className="truncate">{c.descripcion}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ProductoDialog({ producto, onClose, onSaved }: { producto: ProductoDto | null; onClose: () => void; onSaved: () => void }) {
  const cat = useCatalogos()
  const { empresa, puede } = useAuth()
  // Stock inicial: solo al crear y con permiso de inventario.
  const conStockInicial = !producto && puede("inventario.movimientos")
  const almacenes = useQuery({
    queryKey: ["almacenes", empresa?.id],
    enabled: conStockInicial,
    queryFn: async () => (await api.get<{ data: { id: number; nombre: string; establecimiento: string | null }[] }>("/almacenes")).data.data,
  })
  const [stockInicial, setStockInicial] = useState("")
  const [almacenElegido, setAlmacenElegido] = useState("")
  const almacenId = almacenElegido || String(almacenes.data?.[0]?.id ?? "")
  const qc = useQueryClient()
  const categorias = useQuery({ queryKey: ["categorias"], queryFn: async () => (await api.get<{ data: Categoria[] }>("/categorias")).data.data })
  const [nuevaCat, setNuevaCat] = useState("")
  // Imagen: la foto elegida se sube después de guardar el producto (también al crearlo).
  const [foto, setFoto] = useState<File | null>(null)
  const [imagen, setImagen] = useState({ url: producto?.imagen_url ?? null, generada: producto?.imagen_generada ?? true })
  const [quitando, setQuitando] = useState(false)
  const archivoRef = useRef<HTMLInputElement>(null)
  const vistaPrevia = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto])
  useEffect(() => () => { if (vistaPrevia) URL.revokeObjectURL(vistaPrevia) }, [vistaPrevia])
  const elegirFoto = (f: File | undefined) => {
    if (!f) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { toast.error("Usa una imagen JPG, PNG o WebP."); return }
    if (f.size > 4 * 1024 * 1024) { toast.error("La imagen no debe pasar de 4 MB."); return }
    setFoto(f)
  }
  const quitarFoto = async () => {
    if (foto) { setFoto(null); return }
    if (!producto) return
    setQuitando(true)
    try {
      const r = await api.delete<{ data: ProductoDto; message: string }>(`/productos/${producto.id}/imagen`)
      setImagen({ url: r.data.data.imagen_url, generada: true })
      toast.success(r.data.message)
      onSaved()
    } catch (e) {
      toast.error(toApiError(e).message)
    } finally {
      setQuitando(false)
    }
  }
  const afectaciones = (cat.data?.afectaciones_igv ?? []).filter((a) => a.activo || a.codigo === producto?.tip_afe_igv)
  const unidades = cat.data?.catalogos["03"] ?? []

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      codigo: producto?.codigo ?? "",
      descripcion: producto?.descripcion ?? "",
      tipo: producto?.tipo ?? "bien",
      categoria_id: producto?.categoria ? String(producto.categoria.id) : "none",
      unidad: producto?.unidad ?? "NIU",
      cod_producto_sunat: producto?.cod_producto_sunat ?? "",
      codigo_barras: producto?.codigo_barras ?? "",
      precio_venta: producto ? String(producto.precio_venta) : "",
      costo: producto ? String(producto.costo) : "",
      tip_afe_igv: producto?.tip_afe_igv ?? "10",
      con_isc: !!producto?.porcentaje_isc,
      porcentaje_isc: producto?.porcentaje_isc ? String(producto.porcentaje_isc) : "",
      aplica_icbper: producto?.aplica_icbper ?? false,
      factor_icbper: producto?.factor_icbper ? String(producto.factor_icbper) : "0.50",
      controla_stock: producto?.controla_stock ?? true,
      stock_minimo: producto ? String(producto.stock_minimo) : "0",
      presentaciones: producto?.presentaciones.map((p) => ({ nombre: p.nombre, unidad: p.unidad, factor: String(p.factor), precio_venta: String(p.precio_venta) })) ?? [],
    },
  })
  const pres = useFieldArray({ control: form.control, name: "presentaciones" })
  const tipo = form.watch("tipo")
  const conIsc = form.watch("con_isc")
  const icbper = form.watch("aplica_icbper")
  const afeSel = afectaciones.find((a) => a.codigo === form.watch("tip_afe_igv"))
  const { errors, isSubmitting } = form.formState

  const crearCategoria = async () => {
    if (!nuevaCat.trim()) return
    try {
      const { data } = await api.post<{ data: Categoria }>("/categorias", { nombre: nuevaCat.trim() })
      await qc.invalidateQueries({ queryKey: ["categorias"] })
      form.setValue("categoria_id", String(data.data.id))
      setNuevaCat("")
    } catch (e) {
      toast.error(Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message)
    }
  }

  const onSubmit = form.handleSubmit(async (v) => {
    const body = {
      codigo: v.codigo, descripcion: v.descripcion, tipo: v.tipo, unidad: v.unidad,
      categoria_id: v.categoria_id === "none" ? null : Number(v.categoria_id),
      cod_producto_sunat: v.cod_producto_sunat || null, codigo_barras: v.codigo_barras || null,
      precio_venta: Number(v.precio_venta), costo: v.costo ? Number(v.costo) : 0, tip_afe_igv: v.tip_afe_igv,
      porcentaje_isc: v.con_isc ? Number(v.porcentaje_isc) : null,
      aplica_icbper: v.aplica_icbper, factor_icbper: v.aplica_icbper ? Number(v.factor_icbper) : null,
      controla_stock: v.tipo === "bien" && v.controla_stock, stock_minimo: v.stock_minimo ? Number(v.stock_minimo) : 0,
      presentaciones: v.presentaciones.map((p) => ({ ...p, factor: Number(p.factor), precio_venta: Number(p.precio_venta) })),
      ...(conStockInicial && v.tipo === "bien" && v.controla_stock && Number(stockInicial) > 0 ? { stock_inicial: Number(stockInicial), almacen_id: Number(almacenId) } : {}),
    }
    try {
      const r = producto ? await api.put<{ data: ProductoDto; message: string }>(`/productos/${producto.id}`, body) : await api.post<{ data: ProductoDto; message: string }>("/productos", body)
      if (foto) {
        const fd = new FormData()
        fd.append("imagen", foto)
        try {
          await api.post(`/productos/${r.data.data.id}/imagen`, fd)
        } catch (e) {
          toast.error(`Producto guardado, pero no se pudo subir la imagen: ${Object.values(toApiError(e).errors)[0]?.[0] ?? toApiError(e).message}`)
        }
      }
      toast.success(r.data.message)
      onSaved()
      onClose()
    } catch (e) {
      const err = toApiError(e)
      applyServerErrors(err, form.setError)
      if (!Object.keys(err.errors).length) toast.error(err.message)
      else toast.error(Object.values(err.errors)[0][0])
    }
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{producto ? "Editar producto" : "Nuevo producto o servicio"}</DialogTitle>
          <DialogDescription>El precio de venta incluye impuestos; el sistema calcula valor de venta e IGV al emitir.</DialogDescription>
        </DialogHeader>
        <form id="form-producto" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FieldSet>
            <FieldLegend>Datos generales</FieldLegend>
            <FieldGroup>
              <div className="flex items-center gap-4">
                <ProductoImagen url={vistaPrevia ?? imagen.url} alt="Imagen del producto" className="size-24 rounded-lg" />
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => archivoRef.current?.click()}>
                      <ImageIcon /> {foto || !imagen.generada ? "Cambiar foto" : "Subir foto"}
                    </Button>
                    {(foto || (producto && !imagen.generada)) && (
                      <Button type="button" variant="destructive" size="sm" disabled={quitando} onClick={quitarFoto}>
                        {quitando ? <Spinner data-icon="inline-start" /> : <ImageOffIcon />} Quitar foto
                      </Button>
                    )}
                  </div>
                  <FieldDescription>
                    {foto ? `${foto.name}: se subirá al guardar.` : imagen.generada ? "Sin foto: se muestra una ilustración con el color de la categoría." : "JPG, PNG o WebP hasta 4 MB."}
                  </FieldDescription>
                  <input ref={archivoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => { elegirFoto(e.target.files?.[0]); e.target.value = "" }} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr_9rem]">
                <Field data-invalid={!!errors.codigo}>
                  <FieldLabel htmlFor="p-cod">Código</FieldLabel>
                  <Input id="p-cod" className="tabular-nums" aria-invalid={!!errors.codigo} {...form.register("codigo")} />
                  <FieldError errors={[errors.codigo]} />
                </Field>
                <Field data-invalid={!!errors.descripcion}>
                  <FieldLabel htmlFor="p-desc">Descripción</FieldLabel>
                  <Input id="p-desc" aria-invalid={!!errors.descripcion} {...form.register("descripcion")} />
                  <FieldError errors={[errors.descripcion]} />
                </Field>
                <Field>
                  <FieldLabel>Tipo</FieldLabel>
                  <Controller control={form.control} name="tipo" render={({ field }) => (
                    <Select value={field.value} onValueChange={(t) => { field.onChange(t); form.setValue("unidad", t === "servicio" ? "ZZ" : "NIU") }}>
                      <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="bien">Bien</SelectItem><SelectItem value="servicio">Servicio</SelectItem></SelectContent>
                    </Select>
                  )} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Unidad de medida</FieldLabel>
                  <Controller control={form.control} name="unidad" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Unidad"><SelectValue /></SelectTrigger>
                      <SelectContent>{unidades.map((u) => <SelectItem key={u.codigo} value={u.codigo}>{u.codigo} · {u.descripcion}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </Field>
                <Field>
                  <FieldLabel>Categoría</FieldLabel>
                  <div className="flex gap-2">
                    <Controller control={form.control} name="categoria_id" render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-label="Categoría" className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin categoría</SelectItem>
                          {categorias.data?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )} />
                    <Popover>
                      <PopoverTrigger asChild><Button type="button" variant="success" size="icon" aria-label="Nueva categoría"><PlusIcon /></Button></PopoverTrigger>
                      <PopoverContent className="flex w-72 gap-2" align="end">
                        <Input placeholder="Nueva categoría" value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), crearCategoria())} />
                        <Button type="button" onClick={crearCategoria}>Crear</Button>
                      </PopoverContent>
                    </Popover>
                  </div>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.cod_producto_sunat}>
                  <FieldLabel>Código de producto SUNAT</FieldLabel>
                  <Controller control={form.control} name="cod_producto_sunat" render={({ field }) => <CodigoSunatCombobox value={field.value} onChange={field.onChange} />} />
                  <FieldError errors={[errors.cod_producto_sunat]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="p-bar">Código de barras</FieldLabel>
                  <Input id="p-bar" {...form.register("codigo_barras")} />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Precio e impuestos</FieldLegend>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr]">
                <Field data-invalid={!!errors.precio_venta}>
                  <FieldLabel htmlFor="p-precio">Precio de venta</FieldLabel>
                  <Input id="p-precio" inputMode="decimal" className="tabular-nums" aria-invalid={!!errors.precio_venta} {...form.register("precio_venta")} />
                  <FieldError errors={[errors.precio_venta]} />
                </Field>
                <Field data-invalid={!!errors.costo}>
                  <FieldLabel htmlFor="p-costo">Costo</FieldLabel>
                  <Input id="p-costo" inputMode="decimal" className="tabular-nums" aria-invalid={!!errors.costo} {...form.register("costo")} />
                  <FieldError errors={[errors.costo]} />
                </Field>
                <Field data-invalid={!!errors.tip_afe_igv}>
                  <FieldLabel>Afectación del IGV</FieldLabel>
                  <Controller control={form.control} name="tip_afe_igv" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Afectación del IGV"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {afectaciones.map((a) => <SelectItem key={a.codigo} value={a.codigo} disabled={!a.activo}>{a.codigo} · {a.descripcion}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                  {afeSel?.es_gratuito && <FieldDescription>Operación gratuita: en la venta se indicará el valor referencial.</FieldDescription>}
                  <FieldError errors={[errors.tip_afe_igv]} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.porcentaje_isc}>
                  <Field orientation="horizontal">
                    <Controller control={form.control} name="con_isc" render={({ field }) => <Switch id="p-isc" checked={field.value} onCheckedChange={field.onChange} />} />
                    <FieldLabel htmlFor="p-isc">Afecto al ISC (sistema al valor)</FieldLabel>
                  </Field>
                  {conIsc && <Input inputMode="decimal" placeholder="Tasa %" aria-label="Tasa ISC" aria-invalid={!!errors.porcentaje_isc} {...form.register("porcentaje_isc")} />}
                  <FieldError errors={[errors.porcentaje_isc]} />
                </Field>
                <Field data-invalid={!!errors.factor_icbper}>
                  <Field orientation="horizontal">
                    <Controller control={form.control} name="aplica_icbper" render={({ field }) => <Switch id="p-icb" checked={field.value} onCheckedChange={field.onChange} />} />
                    <FieldLabel htmlFor="p-icb">Bolsa plástica (ICBPER)</FieldLabel>
                  </Field>
                  {icbper && <Input inputMode="decimal" placeholder="S/ por unidad" aria-label="Monto ICBPER por unidad" aria-invalid={!!errors.factor_icbper} {...form.register("factor_icbper")} />}
                  {icbper && <FieldDescription>Monto vigente por bolsa; verifícalo con SUNAT.</FieldDescription>}
                  <FieldError errors={[errors.factor_icbper]} />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          {tipo === "bien" && (
            <FieldSet>
              <FieldLegend>Inventario y presentaciones</FieldLegend>
              <FieldGroup>
                <div className="grid items-end gap-4 sm:grid-cols-2">
                  <Field orientation="horizontal">
                    <Controller control={form.control} name="controla_stock" render={({ field }) => <Switch id="p-stock" checked={field.value} onCheckedChange={field.onChange} />} />
                    <FieldLabel htmlFor="p-stock">Controlar stock</FieldLabel>
                  </Field>
                  <Field data-invalid={!!errors.stock_minimo}>
                    <FieldLabel htmlFor="p-min">Stock mínimo</FieldLabel>
                    <Input id="p-min" inputMode="decimal" aria-invalid={!!errors.stock_minimo} {...form.register("stock_minimo")} />
                  </Field>
                  {conStockInicial && form.watch("controla_stock") && (
                    <>
                      <Field>
                        <FieldLabel htmlFor="p-inicial">Stock inicial</FieldLabel>
                        <Input id="p-inicial" inputMode="decimal" className="tabular-nums" value={stockInicial} onChange={(e) => setStockInicial(e.target.value)} />
                      </Field>
                      <Field>
                        <FieldLabel>Almacén</FieldLabel>
                        <Select value={almacenId} onValueChange={setAlmacenElegido}>
                          <SelectTrigger aria-label="Almacén"><SelectValue /></SelectTrigger>
                          <SelectContent>{almacenes.data?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.establecimiento ?? a.nombre}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                    </>
                  )}
                </div>
                {pres.fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-[1fr_6rem_6rem_7rem_auto] items-end gap-2">
                    <Field><FieldLabel className="sr-only" htmlFor={`pr-n-${i}`}>Nombre</FieldLabel><Input id={`pr-n-${i}`} placeholder="Caja x 12" {...form.register(`presentaciones.${i}.nombre`)} /></Field>
                    <Controller control={form.control} name={`presentaciones.${i}.unidad`} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-label="Unidad"><SelectValue /></SelectTrigger>
                        <SelectContent>{unidades.map((u) => <SelectItem key={u.codigo} value={u.codigo}>{u.codigo}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                    <Input inputMode="decimal" placeholder="Factor" aria-label="Unidades por presentación" {...form.register(`presentaciones.${i}.factor`)} />
                    <Input inputMode="decimal" placeholder="Precio" aria-label="Precio de la presentación" {...form.register(`presentaciones.${i}.precio_venta`)} />
                    <Button type="button" variant="destructive" size="icon" aria-label="Quitar presentación" onClick={() => pres.remove(i)}><Trash2Icon /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" className="self-start" onClick={() => pres.append({ nombre: "", unidad: "BX", factor: "", precio_venta: "" })}>
                  <PlusIcon /> Agregar presentación
                </Button>
              </FieldGroup>
            </FieldSet>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-producto" disabled={isSubmitting}>{isSubmitting && <Spinner />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
