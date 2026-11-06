# Sistema de ventas con facturación electrónica SUNAT — Frontend

Interfaz en React 19 + TypeScript + Vite con shadcn/ui, TanStack Query y react-hook-form + zod.
La API (Laravel) y la documentación completa están en [SISTEMAS-CURSO-BACKEND](https://github.com/yorchavez9/SISTEMAS-CURSO-BACKEND) (carpeta `docs/`).

## Desarrollo

Requisitos: Node.js 22 y el backend corriendo en `http://127.0.0.1:8000`.

```bash
npm install
npm run dev        # http://localhost:5174
```

Vite redirige `/api` y `/sanctum` al backend (cámbialo con la variable `VITE_BACKEND_URL`), así el navegador y la API comparten origen y la sesión viaja en una cookie `httpOnly`. No se guardan tokens ni credenciales en el navegador.

El puerto 5174 es fijo (`strictPort`). Si lo cambias, actualiza `FRONTEND_URL` y `SANCTUM_STATEFUL_DOMAINS` en el `.env` del backend.

## Comandos

| Comando | Uso |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npx tsc -b` | Verificación de tipos |
| `npm run lint` | Lint (oxlint) |
| `npm run build` | Compilación de producción en `dist/` |

## Estructura

```
src/
  features/<módulo>/     Páginas, diálogos y consultas de cada módulo
  components/ui/         Componentes shadcn/ui
  components/shared/     Encabezados, buscador, paginador, formato de montos
  layouts/AppLayout.tsx  Menú lateral filtrado por permisos
  lib/                   Cliente HTTP (axios + XSRF + empresa activa), descargas y tipos
```

En producción se sirve `dist/` desde el mismo dominio que la API (ver `docs/despliegue.md` en el backend).
