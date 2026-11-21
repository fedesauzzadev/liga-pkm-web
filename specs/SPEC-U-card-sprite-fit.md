# SPEC-U — Sprite del PKM más grande y normalizado en la carta (T-105)
Origen: pedido del dueño: agrandar el sprite del PKM dentro del recuadro de arte de la carta. **Los chicos tienen que verse más grandes y los grandes no se pueden salir del recuadro.** Fuera de alcance: el sprite grande del combate (BattleScene), el tablero 3D, el equipo (TeamStrip) y los fx. Sin sprite (`artUrl = null`) el fallback no cambia.

## Problema (medido sobre los 302 sprites reales)
- `PkmCard.module.css` solo pone `max-height: 130px` a `.artImg`: un sprite chico (hay de 31×57) queda diminuto dentro del recuadro (min-height 110 px) y uno ancho puede cortarse (`overflow: hidden`).
- `CardModal` (`CardFace`) usa `max-width/max-height` + `contain`, que **nunca agranda**: los chicos se ven chicos también en la carta grande.

## T-105 Sprite normalizado (una tarea, dos frentes)

### Regla de escala (una sola para todos)
- `fitScale = min(anchoCaja/anchoNatural, altoCaja/altoNatural)`; `escala = min(fitScale · fill, maxScale)`. Resultado en px enteros, proporción conservada. Chicos ⇒ suben hasta `maxScale`; grandes ⇒ achican a `fill` de la caja: **nunca desbordan ni se deforman**.
- `fill` deja margen (el chip de aviso va abajo a la derecha y no debe tapar al PKM); `maxScale` evita pixelados extremos.

### Criterios
- **AC-1** Config `content/ui/card-art.json` + esquema Zod (`CardArtSchema`) en `@liga/content`, registrado en `content:validate` (patrón de `card-modal.json`). Valores: `pkmCard { boxHeightPx: 132, fill: 0.95, maxScale: 4 }`, `modal { fill: 0.95, maxScale: 3 }`. Cero medidas mágicas en los componentes: todo sale de este archivo.
- **AC-2** Función pura `fitSprite(natural, caja, cfg)` exportada de `apps/web/src/battle/spriteFit.ts` (sin DOM, sin estado): devuelve `{width, height}` en px enteros.
- **AC-3** Tests de propiedad (fast-check) sobre `fitSprite`: (a) el resultado entra siempre en la caja (width ≤ caja.ancho, height ≤ caja.alto); (b) la proporción se conserva (±1 px por redondeo); (c) si `fitScale > maxScale/fill` la escala queda clavada en `maxScale` (los chicos no pasan del tope); (d) sprites más grandes que la caja nunca desbordan.
- **AC-4** `PkmCard`: `.art` pasa a alto fijo `boxHeightPx` del config; al cargar el sprite (`onLoad` → `naturalWidth/naturalHeight`) se aplica `fitSprite` como `width/height` inline con `data-art-w`/`data-art-h` para tests. Antes de medir (SSR/primer paint) rige el fallback CSS `max-width: 100%; max-height: 100%; object-fit: contain`: sin salto de layout ni overflow. `image-rendering: pixelated` se conserva.
- **AC-5** `CardFace` (carta grande del modal): mismo `fitSprite` con su config; la caja `.art` se mide (ref), no se asume. Mismo fallback CSS mientras no hay medida.
- **AC-6** Reuso gratis: `CardPopup`, `DrawnCard` y el admin (`CardsAdmin` renderiza `PkmCard`) heredan el cambio sin tocarse; el fallback sin sprite queda idéntico al actual.
- **AC-7** Test por AC (comentario `// AC: SPEC-U/T-105/AC-n`). `pnpm verify` verde y reporte `tasks/reports/T-105.md` con una tabla `sprite → natural → tamaño final` para 6 casos extremos (el más chico, el más ancho, el más alto, uno mediano, front y back del mismo dex).

## Qué mirar (dueño)
- En el panel de combate y en la carta grande: el PKM llena el recuadro, parecido de tamaño entre cartas, nítido (pixelado) y sin cortarse.
- Un PKM chico (p. ej. Caterpie/Zubat) se ve claramente más grande; uno grande (Onix/dragones) no se sale del recuadro ni tapa el chip de aviso.
- El fallback sin sprite (nombre) sigue igual.
