# PRIVACY-DEPLOY — mantener el proyecto secreto
Objetivo: que solo vos y tus amigos puedan acceder, y que nada con derechos de terceros quede en un lugar público.

## Código y datos
- Repositorio **privado**. No publicar en npm ni en gists. Nunca commitear assets descargados, fotos de cartas, manual.pdf, ni claves (`.gitignore` ya lo cubre).
- Las cartas transcriptas (`content/pokemon/*.json`) son del autor del juego: tratarlas como contenido privado.

## Despliegue (elegir una)
1. **Solo local / red local** (más simple): `pnpm build && pnpm preview --host`, o un servidor estático en tu PC; amigos por LAN o por una VPN privada tipo Tailscale/ZeroTier. Nada queda en internet.
2. **Hosting estático con acceso restringido**: Cloudflare Pages + Cloudflare Access (login por email de una lista de amigos). Verificar condiciones y límites del plan gratuito vigentes. Alternativas con contraseña según el proveedor (algunas son de pago).
3. **Un servidor propio** con autenticación básica (Caddy/nginx) detrás de HTTPS.
**No** usar una "contraseña" hecha en JavaScript del lado del cliente: no es seguridad.

## Medidas obligatorias en el build (T-050)
- `<meta name="robots" content="noindex,nofollow">`, `robots.txt` con `Disallow: /`, cabecera `X-Robots-Tag: noindex, nofollow`.
- Sin analytics ni trackers; sin fuentes/CDN de terceros innecesarios (autoalojar tipografías).
- Rutas `/admin` y `/dev` excluidas del build de producción.
- URL no guardada en documentos públicos; compartir solo por mensaje directo.

## Multijugador futuro
Servidor en el mismo esquema (acceso restringido, salas por código). No mezclar con servicios públicos de matchmaking.
