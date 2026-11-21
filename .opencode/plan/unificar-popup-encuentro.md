# Unificar el encuentro con un Pokémon salvaje en un solo popup

## Objetivo

Reemplazar los dos avisos duplicados de un encuentro salvaje (título+botones en `tile-panel` y `popup-card` con `btn-card-fight`/`btn-card-release`) por UN solo `<EncounterPopup data-testid="popup-encounter">`: carta grande del Pokémon a la izquierda (con sprite) y decisión (pelear/dejar ir) a la derecha. Solo UI + un test de regresión del motor (el motor ya termina el turno al soltar).

## Nombres reales (verificados en el código)

- Decisión del motor: `FightOrRelease` con `{ card, deck }` (`packages/engine/src/state.ts:21`, visible en `state.pending`).
- Comandos existentes: `{ type: 'FightEncounter', pkmUid }` y `{ type: 'ReleaseWild' }` (`packages/engine/src/commands.ts:19-35`). NO se crean comandos nuevos.
- Motor: `releaseWild` (`packages/engine/src/tiles.ts:249`) YA hace `turn += 1` + `phase = 'organize'` (fin de turno). Punto 6 ⇒ solo falta test de regresión (hoy no hay ningún test de `ReleaseWild`).
- Causa real de la imagen faltante: `CardPopup.tsx:82` y `DrawnCard.tsx:113` pasan `artUrl={null}` (variante mini sin sprite). El arte real se obtiene con `spriteUrl(sprites, card.dex, 'front')` de `apps/web/src/battle/sprites.ts` (manifest `sprites.json`).
- La "carta grande" de la ventana T-101 es `<CardFace>` (`apps/web/src/cardmodal/CardFace.tsx`), con `data-testid="card-face"` (de `content/ui/card-modal.json`), arte en `card-art` y fit `cardArtConfig.modal`. (La tarea menciona `<PkmCard>`, pero el componente con testid `card-face` que usa esa ventana es `CardFace`; se reusa `CardFace`. `PkmCard` es la carta chica del combate/robo.)
- HUD y safeArea: `content/ui/layout.json` (`safeArea` x 0–0.83, y 0–0.79; paneles `panel-history`, `panel-backpack`, `btn-oak`, `btn-menu`, `panel-turn`, `panel-dice`, `panel-players`, `panel-team`).
- Historial: `historyCardDrawn` ya registra "Sacaste una carta de {deck}: {card}."; `CardToBottom` pasa por `apps/web/src/i18n/event-log.ts`.

## Criterios de aceptación

Un test por criterio, con comentario `// AC: unificar-popup-encuentro/AC-n`.

- **AC-1 Un solo popup**: con `state.pending.type === 'FightOrRelease'` existe exactamente UN `[data-testid="popup-encounter"]`; NO existe `[data-testid="popup-card"]`; `tile-panel` no contiene el texto "salvaje apareció" ni botones `btn-fight`/`btn-release`. `CaptureOrRelease`, `OakSwap`, `ChallengeGym` y los popups de energía/ítem (cierre automático) quedan igual que hoy. El historial sigue registrando el robo ("Sacaste una carta de Pantano: Abra"). La animación de robo (T-064, `DrawnCard`) no cambia hasta el giro de revelado; al terminar, para PKM abre `popup-encounter` en lugar de `popup-card`.
- **AC-2 Posición/tamaño**: la caja de `popup-encounter` está centrada dentro del rectángulo safeArea (x 0–0.83, y 0–0.79) con 12 px de margen por lado, y NO se intersecta con ningún panel del HUD de `layout.json`. Alto = min(760 px, alto del rectángulo); ancho = carta (alto interno × 0,63) + 24 px + columna de botones clamp(280..340 px). Entra en 1024×600, 1366×768 y 1920×1080. El fondo atenuado (si existe) cubre solo el safeArea: el HUD queda visible. Fondo del popup rgba ≥ 0,92; estilo de panel del repositorio (borde redondeado, mismo verde y tipografía); entrada 180 ms (fundido + escala 0,96→1); con `reducedMotion`, sin animación.
- **AC-3 Columna izquierda**: se ve la MISMA carta grande de T-101 (`<CardFace>`, testid `card-face`): nombre, HP/máx, ícono de elemento, sprite de frente (precargado, máx. 600 ms; si falla o no hay manifest: recuadro con el nombre + `console.warn` con el motivo), ataques con caras/daño/costos/texto, pie con etapa y evolución. Proporción de `card-face` 0,63 ± 0,03; `img` dentro de `card-art` con `naturalWidth > 0` y visible. La carta es de SOLO LECTURA: sin clic, sin cursor de mano, sin handler que abra otra ventana (fuente de la carta: instancia sintética `{ uid: wild-<cardId>, damage: 0, xp: 0, equipped: [], multicolor: [] }`, `readOnly`, sin `onCommand`).
- **AC-4 Columna derecha**: título "¡Un {nombre} salvaje apareció!" (`es.playWildAppeared`), subtítulo "Robaste {nombre} del mazo {Mazo}." (`es.tileMsgCardDrawn` + nombres de `es.tileDeckNames`). Un `btn-fight-<uid>` por Pokémon NO debilitado del equipo en orden (activo primero y resaltado), cada uno con "HP 70/70" (actual/máx) en texto chico; al final `btn-release` (estilo secundario). Botones a todo ancho, alto ≥ 44 px, gap 8 px. Sin Pokémon sanos: aviso "No tenés Pokémon en condiciones de pelear" + solo `btn-release`. Foco inicial en el primer botón de pelea; Enter confirma; Esc NO cierra el popup.
- **AC-5 Pelear**: clic en `btn-fight-<uid>` envía `{ type: 'FightEncounter', pkmUid }` (comando existente), `popup-encounter` desaparece y aparece `popup-battle` con ese Pokémon, sin coexistir en el mismo cuadro de animación (transición ≤ 150 ms, sin parpadeo ni dos popups a la vez).
- **AC-6 Dejar ir**: clic en `btn-release` envía `{ type: 'ReleaseWild' }`; `popup-encounter` desaparece, no aparece `popup-battle`, el turno avanza exactamente en 1, la carta queda al FONDO de su mazo (evento `CardToBottom`, D-09) y el historial registra "Dejaste ir a {nombre}". No se abre ningún otro popup.
- **AC-7 Motor (regresión)**: test de motor: `ReleaseWild` con `FightOrRelease` pendiente ⇒ `turn += 1`, `phase = 'organize'`, carta al fondo de `decks[deck]`, `pending = null`. (Ya se cumple hoy: no corregir, solo cubrir.)
- **AC-8 No clic en la carta**: un clic sobre `card-face` no abre nada nuevo (no `modal-card`, no popup extra).
- **AC-9 Calidad**: sin errores en consola en los e2e; `pnpm verify` verde; TypeScript strict, sin `any`; archivos ≤ 400 líneas; textos nuevos en `apps/web/src/i18n/es.ts`; medidas en JSON de `content/ui` validado con Zod (nada hardcodeado).

## Fuera de alcance (NO HACER)

- No tocar el popup de pelea (`BattlePopup`), la ventana "Carta del Pokémon" (`CardModal`/T-101) ni los paneles del HUD.
- No cambiar reglas, datos de juego ni la cámara. No agregar dependencias.
- No modificar `CaptureOrRelease` (captura post-combate), `OakSwap` ni `ChallengeGym`.

## Archivos involucrados

Nuevos:
- `apps/web/src/popup/EncounterPopup.tsx` — componente (carta izquierda + decisión derecha).
- `apps/web/src/popup/EncounterPopup.module.css` — estilos (panel verde, rgba ≥ 0,92, animación 180 ms con `prefers-reduced-motion`).
- `apps/web/src/popup/encounter-model.ts` — geometría pura (estilo `cardModalGeometry`: safeArea − 12 px, min(760, h), ancho = carta×0,63 + 24 + clamp(280..340)) + precarga de sprite (600 ms, `console.warn` al fallar).
- `apps/web/src/popup/EncounterPopup.test.tsx` — unit tests (AC-1..AC-6, AC-8).
- `content/ui/encounter-popup.json` — medidas/constantes del popup (+ esquema Zod `EncounterPopupSchema` en `packages/content/src` exportado como `CardModalSchema`; patrón de `card-modal.json`).
- `e2e/unificar-popup-encuentro.mjs` — e2e a 1024×600, 1366×768 y 1920×1080 (usa helpers de `e2e/route.mjs` y `DebugEncounter`/`btn-dev-encounter` como `e2e/t064-draw.mjs`).
- `tasks/reports/unificar-popup-encuentro.md` — reporte (plantilla `tasks/REPORT_TEMPLATE.md`).

Modificados:
- `apps/web/src/game/TilePanel.tsx` — con `FightOrRelease`: no renderizar título de encuentro, mensajes de robo ni botones (dejar el resto de decisiones intacto).
- `apps/web/src/popup/CardPopup.tsx` y `apps/web/src/popup/model.ts` (`cardPopupStays`) — con carta PKM + `FightOrRelease` NO se monta (ni la caja `popup-card`); energía/ítem siguen igual (cierre automático).
- `apps/web/src/game/PlayScreen.tsx` — monta `EncounterPopup` cuando `state.pending?.type === 'FightOrRelease'`; no abre `cardPopupOpen` para ese caso; pasa `spriteUrl(sprites, card.dex, 'front')`.
- `apps/web/src/shell/GameShell.tsx` — nuevo slot `encounterPopup?: ReactNode` en la capa `.popups` (debajo de `popup-battle`, encima del HUD).
- `apps/web/src/board3d/DrawnCard.tsx` (y `apps/web/src/board3d/draw.ts` si hace falta) — el vuelo de un PKM con `FightOrRelease` apunta a `popup-encounter` (fallback: centro del safeArea) y cede al popup al terminar el revelado; energía/ítem sin cambios.
- `apps/web/src/i18n/es.ts` — claves nuevas: aviso sin sanos ("No tenés Pokémon en condiciones de pelear"), "HP {cur}/{max}", "Dejaste ir a {name}." (reusar `playWildAppeared`, `tileMsgCardDrawn`, `tileFightWith`, `playReleaseWild`).
- `apps/web/src/i18n/event-log.ts` — `CardToBottom` de carta PKM ⇒ "Dejaste ir a {name}." (ítems/energías mantienen el texto actual).
- `packages/engine/src/index.test.ts` — test de regresión AC-7 (`// AC: unificar-popup-encuentro/AC-7`).
- `package.json` — agregar `node e2e/unificar-popup-encuentro.mjs` al script `e2e`.

## Plan de pasos

1. Tests primero: `EncounterPopup.test.tsx` (AC-1..AC-6, AC-8) y test de regresión del motor (AC-7) a partir de los AC.
2. `content/ui/encounter-popup.json` + esquema Zod en `packages/content` (safeAreaMarginPx 12, maxHeightPx 760, aspect 0.63, gapPx 24, botones 280..340, minButtonPx 44, animMs 180, transitionMs 150, preloadTimeoutMs 600).
3. `encounter-model.ts`: geometría pura + precarga de sprite; unit tests de la geometría en los 3 tamaños.
4. `EncounterPopup.tsx` + CSS: columna izquierda `CardFace` (read-only, spec sintética), columna derecha título/subtítulo/botones/foco/Esc; montaje centrado en el rectángulo permitido.
5. Cableado en `PlayScreen`/`GameShell`: eliminar duplicados (TilePanel y CardPopup en `FightOrRelease`), transición 150 ms a `popup-battle`, historial "Dejaste ir a {name}.".
6. `DrawnCard`: destino del vuelo y relevo al popup para PKM (T-064 intacto hasta el giro).
7. e2e `e2e/unificar-popup-encuentro.mjs` en los 3 viewports (data-testid, sin mirar imágenes) + agregar al script `pnpm e2e`.
8. `pnpm verify` + `pnpm e2e` en verde; reporte en `tasks/reports/unificar-popup-encuentro.md` (qué se eliminó, nombres reales, comandos, resultado en los 3 tamaños).

Decisiones tomadas (no preguntar): el componente de carta es `CardFace` (es el que usa T-101 con testid `card-face`); la entrada de historial "Dejaste ir a {name}." se deriva de `CardToBottom` cuando la carta es PKM; el motor ya termina el turno ⇒ solo test. Si algo nuevo aparece, registrarlo en `docs/OPEN-QUESTIONS.md` y seguir con el default de arriba.

## Comandos de verificación

```bash
pnpm verify          # typecheck + lint + test + content:validate + build + deps:check + size + bench
pnpm e2e             # incluye e2e/unificar-popup-encuentro.mjs (1024×600, 1366×768, 1920×1080)
pnpm digest          # estado del repo antes de empezar
```
