# Fix galería de modelos: assets por path + MTL/texturas HGSS

## Objetivo
Que `/dev/models` cargue los modelos (hoy todas las tarjetas muestran "No se pudo
cargar"): el dev server del dueño no tenía el middleware (arrancó antes del cambio
de vite.config.ts) y encima `loadObjWithMtl` arma mal la URL hermana del MTL con
las URLs de query de la galería. Sirviendo los assets por **path** en vez de
query, el `dirUrl` clásico funciona igual para galería y runtime.

## Criterios de aceptación
- AC-1 `GET /dev-models/file/kenney/…|hgss/…` sirve el archivo con el content-type
  correcto (misma validación `modelsAssetPath`: prefijos kenney/|hgss/, sin
  traversal, extensiones permitidas); la ruta query `/asset` se mantiene intacta.
- AC-2 `modelsAssetUrl` genera URLs path-style (`/dev-models/file/<segmentos
  encodeados>`) y la galería renderiza GLB y OBJ: 0 overlays de error (probe
  playwright sobre el server reiniciado).
- AC-3 `loadObjWithMtl` pide el `.mtl` como `dirUrl + encodeURIComponent(mtllib)`
  y las texturas HGSS resuelven vía `setResourcePath(dirUrl)` con URL path-style;
  helper puro `siblingModelUrl(url, name)` exportado y testeado para URLs
  path-style y query-style.
- AC-4 `GalleryModel` loguea `console.error('[dev-models]', file, err)` antes del
  overlay (solo dev): ningún fallo de carga vuelve a quedar mudo.
- AC-5 `pnpm verify` verde y `tasks/reports/T-070.md` actualizado con el fix
  (causa raíz: server sin middleware + dirUrl de query).

## Archivos involucrados
- `apps/web/src/dev/models-server.ts` — ruta `/dev-models/file/<path>` (decode antes de validar).
- `apps/web/src/dev/ModelsDemo.tsx` — `modelsAssetUrl` path-style + `console.error` en `GalleryModel`.
- `apps/web/src/board3d/ModelDecor.tsx` — `loadObjWithMtl`: mtllib encodeado + export `siblingModelUrl`.
- `apps/web/src/board3d/ModelDecor.test.tsx` — tests de `siblingModelUrl` (path-style y query-style).
- `tasks/reports/T-070.md` — nota del fix.

## Plan de pasos
1. (Dueño) Reiniciar `pnpm dev` — el server actual (pid 25072, 01:42) no tiene el middleware.
2. `models-server.ts`: montar `use('/dev-models/file', …)` que decodifica `req.url`
   y sirve con `modelsAssetPath` + `CONTENT_TYPES`; 404 JSON si no vale.
3. `ModelsDemo.tsx`: `modelsAssetUrl` → path-style; `.catch` de `GalleryModel`
   con `console.error('[dev-models]', file, err)` (eslint-disable no-console si pide).
4. `ModelDecor.tsx`: `siblingModelUrl(url, name)` puro (dir clásica si hay `/`
   después del host; query-param si `?path=`) + mtllib encodeado; tests nuevos.
5. Verificación (abajo) + actualizar `tasks/reports/T-070.md`.

## Comandos de verificación
- `npx vitest run apps/web/src/board3d/ModelDecor.test.tsx apps/web/src/dev/ModelsDemo.test.tsx`
- Probe playwright (server dev reiniciado): abrir `/dev/models`, esperar 9 s y
  verificar `count('[data-testid="model-card"]') == count(text="No se pudo cargar") == 0`
  y tarjetas con canvas WebGL pintado; sin respuestas >=400 en `/dev-models/`.
- `pnpm verify`
