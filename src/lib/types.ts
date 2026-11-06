export type Entorno = "pruebas" | "produccion"

export interface Empresa {
  id: number
  ruc: string
  razon_social: string
  nombre_comercial: string | null
  direccion: string | null
  ubigeo: string | null
  departamento: string | null
  provincia: string | null
  distrito: string | null
  email: string | null
  telefono: string | null
  entorno_activo: Entorno
  activo: boolean
  permitir_stock_negativo: boolean
  envio_boletas: "individual" | "resumen"
  mis_roles: string[]
  mis_permisos: string[]
  created_at: string
}

export interface Usuario {
  id: number
  name: string
  email: string
  is_superadmin: boolean
  empresas: Empresa[]
}

export interface CredencialRemota {
  ruc?: string | null
  razon_social?: string | null
  entorno?: string | null
  tax_regime?: string | null
  tasa_igv_vigente?: number | string | null
  plan?: string | null
  uso?: Record<string, unknown> | null
}

export interface CredencialApiEstado {
  entorno: Entorno
  configurada: boolean
  api_key_mascara: string | null
  api_secret_configurado: boolean
  verificado_at: string | null
  verificacion_ok: boolean | null
  verificacion_mensaje: string | null
  remoto: CredencialRemota | null
  updated_at: string | null
}

export interface CredencialesApiResumen {
  entorno_activo: Entorno
  base_url: string
  entornos: CredencialApiEstado[]
}

export interface UsuarioEmpresa {
  id: number
  name: string
  email: string
  activo_global: boolean
  activo: boolean
  roles: string[]
}

export interface RolDef {
  nombre: string
  label: string
  permisos: string[]
}

export interface ModuloPermisos {
  modulo: string
  label: string
  acciones: Record<string, string>
}

export interface CatalogoItem {
  codigo: string
  descripcion: string
  validado_api: boolean
  meta: Record<string, unknown> | null
}

export interface AfectacionIgv {
  codigo: string
  descripcion: string
  grupo: "gravado" | "exonerado" | "inafecto" | "exportacion" | "ivap"
  es_gratuito: boolean
  tributo: { codigo: string; nombre: string; tipo: string }
  calcula_igv: boolean
  validado_api: boolean
  activo: boolean
  evidencia: string | null
  observacion: string | null
}

export interface CatalogosSunat {
  catalogos: Record<string, CatalogoItem[]>
  afectaciones_igv: AfectacionIgv[]
}
