# Worker de OAuth para Decap CMS

Worker de Cloudflare que actúa como proveedor de OAuth para Decap CMS
(backend `github`) cuando el sitio se publica en Cloudflare Pages.

## Despliegue

1. Instala Wrangler y entra en la carpeta del worker:

   ```bash
   npm install -g wrangler
   cd worker
   wrangler login
   ```

2. Crea una **GitHub OAuth App** en
   <https://github.com/settings/developers> con:
   - **Homepage URL:** `https://metadrama.pages.dev`
   - **Authorization callback URL:** `https://auth.metadrama.workers.dev/callback`

   Anota el **Client ID** y genera un **Client Secret**.

3. Edita `wrangler.toml` y reemplaza `REEMPLAZAR_POR_TU_ACCOUNT_ID` por tu
   Cloudflare account ID (lo ves en `wrangler whoami`).

4. Define los secrets del worker:

   ```bash
   wrangler secret put OAUTH_CLIENT_ID
   wrangler secret put OAUTH_CLIENT_SECRET
   wrangler secret put ALLOWED_ORIGIN     # https://metadrama.pages.dev
   ```

5. Despliega:

   ```bash
   wrangler deploy
   ```

El worker quedará en `https://auth.metadrama.workers.dev` y Decap CMS
llamará a `https://auth.metadrama.workers.dev/auth` (definido en
`public/admin/config.yml` → `backend.base_url`).

## Endpoints

- `GET /auth` — redirige a GitHub para autorizar.
- `GET /callback` — recibe el code de GitHub, lo intercambia por un
  `access_token` y lo envía vía `postMessage` a la ventana de Decap CMS.
