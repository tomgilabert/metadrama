// Cloudflare Worker para OAuth de GitHub usado por Decap CMS.
// Basado en https://decapcms.org/docs/github-backend/#github-oauth-app
//
// Variables de entorno (definidas con `wrangler secret put`):
//   OAUTH_CLIENT_ID     — Client ID de la GitHub OAuth App
//   OAUTH_CLIENT_SECRET — Client Secret de la GitHub OAuth App
//   ALLOWED_ORIGIN      — Origen permitido (ej: https://metadrama.pages.dev)
//
// Despliegue:  wrangler deploy
// Secretos:    wrangler secret put OAUTH_CLIENT_ID
//              wrangler secret put OAUTH_CLIENT_SECRET

const HTML = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Auth</title></head><body>${body}</body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS / preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(env),
      });
    }

    // GET /auth  -> redirige a GitHub
    if (url.pathname === "/auth") {
      const params = new URLSearchParams({
        client_id: env.OAUTH_CLIENT_ID,
        redirect_uri: `${url.origin}/callback`,
        scope: "repo,user",
        state: crypto.randomUUID(),
      });
      return Response.redirect(
        `https://github.com/login/oauth/authorize?${params}`,
        302,
      );
    }

    // GET /callback  -> intercambia code por token y lo pasa a la ventana opener
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) return errorPage(error);

      // intercambiar code por access_token
      const tokenResp = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: env.OAUTH_CLIENT_ID,
            client_secret: env.OAUTH_CLIENT_SECRET,
            code,
          }),
        },
      );
      const data = await tokenResp.json();
      if (data.error) return errorPage(data.error_description || data.error);

      const token = data.access_token;
      // devolver HTML que hace postMessage al opener (Decap CMS)
      return new Response(
        HTML(
          `<script>
            (function(){
              var opener = window.opener || (window.parent && window.parent !== window);
              var msg = { sender: 'decap-cms', event: 'login', token: ${JSON.stringify(token)} };
              if (opener) opener.postMessage(msg, '*');
              document.body.innerHTML = '<p>Cerrando ventana…</p>';
              setTimeout(function(){ window.close(); }, 500);
            })();
          </script>`,
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders(env) } },
      );
    }

    return new Response("METADRAMA Decap OAuth worker. Endpoints: /auth, /callback", {
      status: 200,
    });
  },
};

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

function errorPage(msg) {
  return new Response(
    HTML(`<h1>Error de autenticación</h1><p>${msg}</p><p><a href="/auth">Reintentar</a></p>`),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
