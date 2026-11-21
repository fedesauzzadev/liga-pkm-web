# Achicar el recuadro de arte de la carta del modal (CardFace)

## Objetivo

El recuadro `.art` de la carta grande del modal (`data-testid="card-face"`, la que
abre al tocar un PKM de la barra de equipo) ocupa todo el alto sobrante de la carta
(~300 px) y queda mucho más grande que el sprite (tope `maxScale: 3` ⇒ ~171 px).
Capar su alto desde config para que el recuadro quede ajustado al sprite.

## Criterios de aceptación

- [ ] AC-1: `content/ui/card-art.json` gana `modal.boxHeightPx: 220` (valor inicial,
      ~-25% del alto efectivo actual) y `CardArtSchema` lo valida como int positivo
      opcional en `modal` (sin tope si falta ⇒ comportamiento actual).
- [ ] AC-2: `CardFace` aplica ese valor como `max-height` inline en `.art` (mismo
      patrón que `PkmCard` con `boxHeightPx`; sin medidas mágicas en el CSS).
- [ ] AC-3: El sprite sigue con `fitSprite` sobre la caja medida: no desborda ni se
      deforma (SPEC-U/T-105/AC-5 sigue vigente; tests existentes pasan).
- [ ] AC-4: Sin sprite, el fallback con el nombre queda idéntico (SPEC-R/T-103/AC-7).
- [ ] AC-5: La carta conserva su aspecto (`card.aspect`), header arriba y
      ataques/footer visibles; el espacio liberado se absorbe sin scroll nuevo.
- [ ] AC-6: `pnpm verify` verde.

## Archivos involucrados

- `content/ui/card-art.json` — agregar `modal.boxHeightPx: 220`.
- `packages/content/src/card-art.ts` — schema: `modal.boxHeightPx` (int positivo, opcional).
- `packages/content/src/card-art.test.ts` — tests del campo nuevo (acepta/valida).
- `apps/web/src/cardmodal/CardFace.tsx` — `maxHeight` inline en el div `.art`.
- `apps/web/src/cardmodal/CardModal.module.css` — `.art`: absorber el hueco que
  queda (centrar el bloque sin romper el flex de columna).
- `apps/web/src/cardmodal/CardModal.test.tsx` — test AC-2 (estilo presente) y
  AC-4 (fallback igual).

## Plan de pasos

1. Tests primero: `card-art.test.ts` (campo nuevo valida) y `CardModal.test.tsx`
   (max-height desde config en el HTML; fallback sin cambios).
2. Extender `CardArtSchema` (`modal.boxHeightPx` opcional, int positivo).
3. Actualizar `content/ui/card-art.json` con `"modal": { "boxHeightPx": 220, ... }`.
4. `CardFace.tsx`: aplicar `maxHeight` inline a `.art` cuando el campo existe.
5. Ajustar `.art` en `CardModal.module.css` para repartir el espacio liberado.
6. `pnpm verify` y ajuste fino del valor (220) si en revisión el jefe pide otro.

## Comandos de verificación

- `pnpm test -- card-art CardModal`
- `pnpm content:validate`
- `pnpm verify`
