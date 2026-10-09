# SPEC-E — Contenido y herramientas (T-040…T-044)
Detalle del proceso: `docs/CARD-INGESTION.md`.

## T-040 `/admin/cards`
- AC-1 Lista cartas de `content/pokemon/**` y `_staging/**`; filtros: sin verificar / con `custom` / con errores de esquema.
- AC-2 Editor con foto lado a lado (zoom), selector de íconos de elemento/costo, editor de efectos limitado a las primitivas del esquema; validación Zod en vivo.
- AC-3 Guardar escribe el JSON (dev: middleware Vite; prod: no incluido en el build). "Verificada" ⇒ `source.verified=true`.
- AC-4 Chequeos cruzados visibles (evoluciones faltantes, dex duplicados, solapamiento de `rollFaces`).
- AC-5 Navegación con teclado para revisar ≥ 30 cartas por hora.

## T-041 Extracción por visión
- AC-1 `pnpm extract <carpeta-de-fotos>` genera `_staging/*.json` con el prompt de CARD-INGESTION §3 (la clave de API del modelo se lee de variable de entorno; nunca se commitea).
- AC-2 Salida validada contra el esquema; las cartas inválidas se guardan en `_staging/_errors/` con el motivo.
- AC-3 Modo `--dry-run` que no llama a la API (para tests, usa respuestas grabadas).
- AC-4 Informe: # cartas, # con `needsReview`, # con `custom`.

## T-042 Lote piloto
- AC-1 12 cartas fotografiadas, extraídas y verificadas; el jefe revisa la tasa de error y ajusta el prompt antes de escalar.
- AC-2 Luego 40-60 cartas con al menos 1 por mazo y los 5 iniciales con sus evoluciones.

## T-043 Assets (sprites y efectos)
- AC-1 `pnpm assets` descarga a `apps/web/public/sprites/` los sprites frente/espalda (animados si existen; si no, estáticos) de los 151 y a `apps/web/public/fx/` las imágenes de efectos que pida el adaptador; genera `sprites.json {dex:{front,back}}` y `fx.json`. Reintentos, reporte de faltantes, fuente configurable.
- AC-2 Nada de lo descargado entra a git (test que falla si `git ls-files` incluye esas rutas).
- AC-3 `docs/ASSETS.md` completo con URL y licencia por fuente (si la licencia no permite uso privado, se frena y se avisa al jefe).

## T-044 Mazos de desarrollo
- AC-1 `tools/gen-dev-decks.ts` arma `content/decks.dev.json` con las cartas disponibles + elementos sintéticos por mazo + ítems (pokebolas/pociones), marcado `devOnly:true`; el juego usa `decks.json` real cuando exista y valide.

## T-045 Datos de referencia de PokeAPI
- AC-1 `pnpm pokeapi` genera (gitignored) `content/reference/pokeapi/{species,moves,evolutions}.json` para dex 1-151 y los movimientos de Gen 1: id, nombres en inglés y español, tipo, evolución.
- AC-2 `content:validate` usa esos datos para chequear dex↔nombre↔tipo y evoluciones de las cartas (errores claros si no coinciden).
- AC-3 Funciona sin red si los archivos ya existen.

## T-046 Mapeo de ataques a movimientos oficiales
- AC-1 `pnpm map-moves` propone `officialMove` (+ `fx`) para cada ataque sin mapeo, usando nombre, texto, elemento y la tabla ES↔EN de T-045; deja `officialMoveStatus:"proposed"`.
- AC-2 `/admin/cards` permite confirmar (`verified`) o cambiar el mapeo con vista previa de la animación (`playMoveFx` sobre sprites de ejemplo).
- AC-3 Informe: # verificados / propuestos / sin mapear.
