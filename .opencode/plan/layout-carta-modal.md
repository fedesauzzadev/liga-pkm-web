# Layout de la carta grande del modal "Carta del Pokémon" (sin huecos ni desbordes)

## Objetivo

Corregir el diseño interno de `card-face` (lado izquierdo del modal): encabezado → recuadro de imagen → ataques → pie consecutivos, SIN huecos; el pie queda dentro de la carta y la carta dentro de la ventana. Solo layout y estilos: no se cambian datos, lógica ni el panel derecho (`SidePanel`).

Causa raíz (verificada en el código):
- `.art` tiene `margin-block: auto` (CardModal.module.css:176): reparte el sobrante arriba/abajo del recuadro → huecos enormes entre título/imagen y entre imagen/ataques.
- `content/ui/card-art.json` `modal.boxHeightPx: 220` topea el arte por inline style (CardFace.tsx:114-121) aunque haya lugar.
- `cardH = h - gap*2` (model.ts:271) no descuenta header ni padding de la ventana → la carta es más alta que la zona de contenido → el pie se corta (`.card { overflow: hidden }`) y la carta se sale del modal.

## Criterios de aceptación

Diseño (verificable en CSS/DOM):
1. `.card` (card-face) es columna flex `justify-content: flex-start; gap: 10px; padding: 14px; overflow: hidden;` con el border-radius actual y todos los hijos con `min-height: 0`.
2. `card-header`: alto según contenido, flex `0 0 auto`.
3. `card-art`: único elemento que crece (`flex: 1 1 auto; min-height: 140px`), sin márgenes automáticos; imagen centrada con `object-fit: contain`. Con 3-4 ataques se achica hasta su mínimo.
4. `card-attacks`: altura natural debajo del arte, separación solo por `gap`, mensajes "Falta…" dentro de la fila del ataque.
5. `card-footer`: debajo de los ataques; chips con `flex-wrap`; barra de XP DEBAJO del texto de evolución; nombre de evolución capitalizado ("Evoluciona a Charizard (3 XP)").
6. La carta entra en la ventana: `max-height: 100%` de la zona de contenido del modal; si el contenido no entra, se achica `card-art` (nunca desborda ni se recorta el pie).
7. Tamaños de letra proporcionales al ancho de la carta (container queries, `container-type: inline-size` en `.card`) con mínimo 13 px (`max(13px, …cqw)`); sin alturas fijas en px para las secciones.
8. Bloque `specialties` (hoy entre header y arte) pasa a DENTRO de `card-header` (segunda fila) para que se cumpla AC-a; mismo contenido y orden visual. Registrar la decisión en el reporte.

Pruebas e2e por data-testid (`card-face`, `card-header`, `card-art`, `card-attacks`, `card-footer`; sin mirar imágenes) a 1024×600, 1366×768 y 1920×1080, con 1, 2, 3 y 4 ataques, y con nombre largo + descripción de ataque larga (se logra mutando el DOM del modal: quitar/duplicar filas `card-attack-*`, alargar `h3` y `.rawText` — toca solo el layout, no los datos):
- a) `card-header.bottom` → `card-art.top` ≤ 12 px.
- b) `card-art.bottom` → `card-attacks.top` ≤ 12 px.
- c) `card-attacks.bottom` → `card-footer.top` ≤ 12 px.
- d) `card-footer.bottom` ≤ `card-face.bottom` − 8 px (nada se sale de la carta).
- e) `card-face.scrollHeight ≤ card-face.clientHeight`.
- f) `card-face.bottom` ≤ borde inferior de la zona de contenido del modal (`.body`) − 12 px.
- g) `card-art` ≥ 140 px de alto.

Regresión:
- `pnpm verify` verde (incluye tests de CardModal, PkmCard, card-art y content:validate).
- e2e existente `e2e/t103-card-modal.mjs` sigue verde (aspecto 0,63±0,03, 70-86 % del alto de la ventana, texto ≥ 13 px, sin recortes del nombre).
- Sin cambios en `SidePanel`, datos de cartas ni lógica del motor.

## Archivos involucrados

- `apps/web/src/cardmodal/CardModal.module.css` — fix principal: `.card` (flex-start, gap, padding, container query), `.art` (sin `margin-block: auto`, `min-height: 140px`), `.attacks` (altura natural), `.cardFooter`/`.evolve` (XP debajo del texto), tipografía en `cqw`.
- `apps/web/src/cardmodal/CardFace.tsx` — agregar `data-testid` (`card-header`, `card-art`, `card-attacks`, `card-footer`); mover `specialties` dentro del `<header>`; capitalizar el nombre de la evolución (fallback `entry.id` hoy minúscula); sin tope inline de alto del arte cuando el config no lo trae.
- `apps/web/src/cardmodal/CardModal.tsx` — `faceStyle`: alto como tope (`max-height: 100%` dentro de `.body`), no altura fija desbordante.
- `apps/web/src/cardmodal/model.ts` — solo si hace falta: `cardModalGeometry` para que la carta no exceda la zona de contenido de la ventana.
- `content/ui/card-art.json` — quitar `modal.boxHeightPx` (el schema ya lo permite opcional) para que el arte absorba el sobrante.
- `packages/content/src/card-art.test.ts` — actualizar expectativa del config modal sin `boxHeightPx`.
- `e2e/t103-card-layout.mjs` — NUEVO: matriz de ACs a-g (3 viewports × 1-4 ataques × nombre/desc largos, por mutación de DOM).
- `package.json` — sumar `node e2e/t103-card-layout.mjs` al script `e2e`.
- `docs/OPEN-QUESTIONS.md` — solo si queda duda (p. ej. ubicación de `specialties`).

Fuera de alcance: `SidePanel.tsx`, `content/pokemon/*`, `packages/engine`.

## Plan de pasos

1. CSS de la columna: `.card` flex-start + `gap: 10px` + `padding: 14px` + `min-height: 0` en los hijos + `container-type: inline-size`; quitar `margin-block: auto` de `.art` y darle `flex: 1 1 auto; min-height: 140px`.
2. Footer: `.evolve` en columna (texto arriba, `.xpBar` abajo, full width) y chips con wrap ya existente.
3. `CardFace.tsx`: data-testids, specialties dentro del header, capitalización del nombre de evolución, quitar el tope inline si `boxHeightPx` no existe en el config.
4. `content/ui/card-art.json` sin `modal.boxHeightPx` + ajustar `card-art.test.ts`.
5. Ajuste de encaje en la ventana: `max-height: 100%` de la zona de contenido (CSS y/o geometría de `model.ts`), manteniendo el aspecto dentro de la tolerancia del e2e existente.
6. Tipografía proporcional: reemplazar px fijos por `max(13px, Ncqw)` (mínimo `--card-font-min`).
7. Tests primero para el e2e nuevo (ACs a-g con la matriz), después iterar CSS/TS hasta verde; correr `t103-card-modal.mjs` para regresión.
8. `pnpm verify` verde + reporte en `tasks/reports/` según el backlog; dudas a `docs/OPEN-QUESTIONS.md`.

## Comandos de verificación

```
pnpm verify
pnpm e2e            # incluye t103-card-modal.mjs y t103-card-layout.mjs
node e2e/t103-card-layout.mjs   # solo el layout de la carta
```
