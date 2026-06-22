# METADRAMA

Sitio de **METADRAMA** (Universidad de Barcelona) migrado de WordPress a
**Astro + Decap CMS**, desplegado en **Cloudflare Pages**.

## Estructura

```
.
├── astro.config.mjs        # Configuración Astro
├── package.json
├── public/
│   ├── uploads/            # 131 imágenes/PDFs migrados de WordPress
│   ├── admin/              # Decap CMS
│   │   ├── index.html
│   │   └── config.yml      # Configuración del CMS (colección "pages")
│   └── _redirects          # Reglas de Cloudflare Pages
├── src/
│   ├── content/
│   │   ├── config.ts       # Schema de la colección "pages"
│   │   └── pages/          # 25 páginas en Markdown
│   ├── components/         # Header, Nav, Footer
│   ├── layouts/            # Base.astro, Page.astro
│   ├── pages/              # index.astro (home), [slug].astro (resto)
│   └── styles/global.css   # Tema (port del Twenty Seventeen)
└── worker/                 # Cloudflare Worker para OAuth de Decap
    ├── index.js
    ├── wrangler.toml
    └── README.md
```

## Desarrollo local

```bash
npm install
npm run dev      # http://localhost:4321
```

### Editar con Decap CMS en local

```bash
npm run build
npx decap-server       # en otra terminal
# abre http://localhost:4321/admin/
```

## Build

```bash
npm run build     # genera dist/
npm run preview   # previsualiza el build
```

## Despliegue en Cloudflare Pages

1. Conecta este repo en <https://dash.cloudflare.com/?to=/:account/pages>
2. Configuración del proyecto:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** 20 (o superior)
3. Cada push a `main` desplegará automáticamente.

## Configurar el CMS (Decap)

1. Despliega el **Worker de OAuth** siguiendo `worker/README.md`.
2. Crea una **GitHub OAuth App** con callback URL
   `https://auth.metadrama.workers.dev/callback`.
3. Define los secrets del worker:
   ```bash
   cd worker
   wrangler secret put OAUTH_CLIENT_ID
   wrangler secret put OAUTH_CLIENT_SECRET
   wrangler secret put ALLOWED_ORIGIN   # https://metadrama.pages.dev
   ```
4. Visita `https://metadrama.pages.dev/admin/` e inicia sesión con GitHub.

## Migración desde WordPress

El contenido se extrajo vía WP REST API de
`https://www.ub.edu/metadrama` (25 páginas + 131 medios).

- Páginas convertidas a Markdown en `src/content/pages/`.
- Imágenes y PDFs en `public/uploads/`.
- Enlaces internos reescritos a URLs planas (`/slug/`).
- Prefijo `/es/` de Polylang eliminado.

Los scripts de extracción están en `wordpress-export/` (no se commitean).
