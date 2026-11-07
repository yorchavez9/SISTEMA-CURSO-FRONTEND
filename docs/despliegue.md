# Despliegue del frontend

El frontend es una SPA (React + Vite): se **compila** a archivos estáticos (`dist/`) y se sirven desde cualquier hosting web. No necesita Node.js en el servidor, solo para compilar.

La guía completa del sistema (backend incluido) está en el repositorio del backend:
[docs/despliegue-hostinger.md](https://github.com/yorchavez9/SISTEMAS-CURSO-BACKEND/blob/main/docs/despliegue-hostinger.md) (hosting compartido) y
[docs/despliegue.md](https://github.com/yorchavez9/SISTEMAS-CURSO-BACKEND/blob/main/docs/despliegue.md) (VPS).

## Antes de empezar: ¿dónde estará el backend?

| Caso | `VITE_API_URL` | Ejemplo |
|---|---|---|
| **Backend en otro subdominio** (recomendado en hosting compartido) | Dirección del backend | `https://cursoapi.kodevo.es` |
| **Mismo dominio** (Nginx sirve `/api` y `/sanctum` hacia Laravel) | Vacía | — |

Frontend y backend deben compartir el dominio principal (`app.midominio.pe` + `api.midominio.pe`). Con dominios distintos la sesión por cookie no funciona.

## La variable `VITE_API_URL`

Le indica al frontend dónde está la API. **Se incrusta al compilar** (Vite reemplaza `import.meta.env.VITE_API_URL` en el código), por eso:

- Cambiarla exige **volver a compilar** (`npm run build` / redistribuir en el hosting).
- No es un secreto: es una dirección pública. No pongas nunca claves ni credenciales en variables `VITE_*`: terminan dentro del JavaScript que descarga cualquier visitante.

Se lee, en este orden de prioridad:

1. Variable de entorno del sistema al compilar (`VITE_API_URL=https://... npm run build`, o *Variables de entorno* del panel del hosting).
2. Archivo `.env.production` del repositorio (lo usa `npm run build`).

El repositorio trae `.env.production` con la instalación de demostración:

```dotenv
VITE_API_URL=https://cursoapi.kodevo.es
```

**Si despliegas tu propia instalación, edita este archivo con la dirección de tu backend** (sin `/` final, con `https://`), haz commit y push. En desarrollo (`npm run dev`) no se usa: ahí el proxy de Vite envía `/api` y `/sanctum` a `http://127.0.0.1:8000`.

## Opción 1: Hostinger (despliegue automático desde GitHub)

1. hPanel → *Sitios web → Añadir sitio web* → conectar el repositorio de GitHub (aplicación Node.js / Vite).
2. Configuración:

   | Campo | Valor |
   |---|---|
   | Repositorio / rama | `SISTEMA-CURSO-FRONTEND` / `main` |
   | Estructura | Vite |
   | Directorio raíz | `./` |
   | Comando de compilación | `npm run build` |
   | Directorio de salida | `dist` |
   | Node.js | 22.x |

3. Asigna el dominio (p. ej. `sistemacurso.kodevo.es`) y activa SSL.
4. Verifica `.env.production` (sección anterior). Cada push a `main` vuelve a compilar y publicar.

## Opción 2: compilar en tu PC y subir los archivos

Sirve para cualquier hosting (cPanel, FTP, etc.):

```bash
npm ci
npm run build          # usa .env.production; o: VITE_API_URL=https://api.midominio.pe npm run build
```

Sube **el contenido** de `dist/` (no la carpeta) a la raíz pública del subdominio (`public_html`), **incluido el archivo oculto `.htaccess`**.

## Opción 3: VPS con Nginx (mismo dominio que la API)

Compila con `VITE_API_URL` vacía (vacía o borra la línea de `.env.production`) y sigue la configuración de Nginx de [docs/despliegue.md](https://github.com/yorchavez9/SISTEMAS-CURSO-BACKEND/blob/main/docs/despliegue.md#5-nginx) del backend. Nginx ya incluye la regla `try_files $uri /index.html` para las rutas del SPA; el `.htaccess` no se usa.

## Rutas del SPA (`.htaccess`)

`public/.htaccess` se copia a `dist/` al compilar. En servidores Apache/LiteSpeed (Hostinger, cPanel) hace que `/login`, `/comprobantes`, etc. respondan con `index.html`. Sin él, **recargar cualquier página que no sea la portada da 404**.

## Lo que debe tener el backend

Con frontend y backend en subdominios, el `.env` del backend necesita (ejemplo con `kodevo.es`):

```dotenv
FRONTEND_URL=https://sistemacurso.kodevo.es
SANCTUM_STATEFUL_DOMAINS=sistemacurso.kodevo.es
SESSION_DOMAIN=.kodevo.es
SESSION_SECURE_COOKIE=true
```

y luego `php artisan config:cache`. Detalle de cada variable en la guía de Hostinger del backend.

## Verificación

```bash
# Las rutas del SPA no dan 404
curl -s -o /dev/null -w "%{http_code}\n" https://sistemacurso.kodevo.es/login        # 200

# El JavaScript publicado contiene la dirección del backend
curl -s https://sistemacurso.kodevo.es/ | grep -o 'assets/index-[^"]*\.js'
curl -s https://sistemacurso.kodevo.es/assets/<archivo>.js | grep -c cursoapi.kodevo.es   # 1 o más
```

En el navegador: la primera vez debe aparecer **Configuración inicial** (registro del superadministrador). Si el login muestra *"No se pudo conectar con el servidor (…)"*, la dirección entre paréntesis es la que el frontend está usando: si es la del propio frontend, falta `VITE_API_URL`.

## Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| 404 al recargar `/login` u otra página | Falta `.htaccess` en la raíz publicada | Comprueba `public/.htaccess` en el repositorio, o súbelo junto con `dist/` |
| "No se pudo conectar con el servidor (https://*frontend*/api/v1)" | Compilado sin `VITE_API_URL` | Revisa `.env.production` y vuelve a compilar / redistribuir |
| "No se pudo conectar…" con la dirección correcta del backend | Backend caído o CORS mal configurado | Abre `https://<backend>/api/v1/setup/estado`; revisa `FRONTEND_URL` en el backend |
| Error 419 al registrar o iniciar sesión | `SESSION_DOMAIN` del backend | `SESSION_DOMAIN=.midominio.pe` + `php artisan config:cache` |
| "CSRF token mismatch" aunque `SESSION_DOMAIN` ya es correcto | Cookies viejas del backend con el mismo nombre en el navegador | En el backend `SESSION_COOKIE=sistemacurso_session` + `php artisan config:cache`, o borrar las cookies del dominio en el navegador |
| Tras iniciar sesión todo da 401 | `SANCTUM_STATEFUL_DOMAINS` del backend | Debe contener el dominio del frontend sin `https://` |
| Cambios publicados pero el navegador muestra la versión anterior | Caché del navegador | Ctrl+F5 (los archivos de `assets/` cambian de nombre en cada compilación) |
