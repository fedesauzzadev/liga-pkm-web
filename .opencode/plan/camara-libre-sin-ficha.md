# Cámara libre sin seguimiento de ficha + botón "Centrar en mí"

## Objetivo

La cámara explore (movible con teclado/rueda/arrastre) deja de estar anclada a la ficha: ningún evento de turno (dado, movimiento, elección de camino, propio o ajeno) la centra ni la mueve. El centrado pasa a ser una acción explícita del usuario vía botón "Centrar en mí" (reemplaza "Recentrar").

Decisiones confirmadas con el dueño: nunca centrar automáticamente (tampoco en turno propio); el botón "Centrar en mí" reemplaza al "Recentrar" actual (mismo slot, tecla C y doble click).

## Criterios de aceptación

- AC-1: En modo explore el objetivo de la cámara está anclado al tablero (no a la ficha): cuando cualquier ficha se mueve (turno propio o ajeno), la cámara no se desplaza (`explore.targetFollowsToken: false`; el ancla se unifica en `desiredExploreTarget`, `syncExplore` y `exploreKeyStep` para que el paneo WASD sea absoluto y sin saltos).
- AC-2: La tirada de dado, el movimiento y la elección de camino no cambian el modo de cámara ni fuerzan centrado (se elimina el cue `ROLL` del `dieNonce`); el dado se renderiza delante de la cámara esté donde esté (`diePosInFront` con cualquier pose).
- AC-3: El botón "Centrar en mí" (`btn-center-on-me`, tecla C, doble click) mueve el objetivo del explore a la ficha del jugador LOCAL (`myPlayerId`, no la activa), preservando la órbita/zoom actual y con transición amortiguada (damping), no snap.
- AC-4: "Centrar en mí" funciona desde explore y desde overview (desde overview transiciona a explore centrado en mi ficha).
- AC-5: Al montar el tablero, la cámara arranca encuadrando mi ficha (una sola vez; después queda libre, sin seguimiento).
- AC-6: El zoom del popup de combate (T-075/AC-4, `battleCameraCue`) se mantiene sin cambios.
- AC-7: `content/ui/camera.json` + esquema Zod actualizados sin claves rotas: `buttons.recenter` → `buttons.centerOnMe`, `keys.recenter` → `keys.centerOnMe`; texto de UI "Centrar en mí" en `es.ts`; `pnpm content:validate` verde.
- AC-8: Los modos `follow`/`fork`/`transitionIn` quedan reservados a los cues de combate; `CHOOSE_PATH`/`TURN_END` desde explore son no-ops (sin errores).

## Archivos involucrados

- `content/ui/camera.json` — `targetFollowsToken: false`, renombra `buttons.recenter`/`keys.recenter` a `centerOnMe`.
- `packages/content/src/ui.ts` — `UiCameraSchema` + `crossCheckCamera` (renombran claves; comentan/ajustan chequeos).
- `apps/web/src/board3d/rig.ts` — evento `RECENTER` → `CENTER_ON_ME` (con posición de mi ficha), `nextMode`, `dispatch`, pose inicial en mi ficha, ancla unificada.
- `apps/web/src/board3d/explore.ts` — paneo absoluto consistente con `targetFollowsToken: false`.
- `apps/web/src/board3d/CameraRig.tsx` — quita cue `ROLL` del `dieNonce`; cablea `CENTER_ON_ME` (botón/tecla/doble click) con la posición de mi ficha.
- `apps/web/src/board3d/Board3D.tsx` — botón con texto/testid nuevos; doble click; prop `myTokenId`.
- `apps/web/src/board3d/useCameraKeys.ts` — tecla C → `CENTER_ON_ME`.
- `apps/web/src/board3d/Board3D.shared.ts` — refs/props según el renombre.
- `apps/web/src/game/PlayScreen.tsx` — pasa `myTokenId={state.players[0]?.id ?? null}` a Board3D.
- `apps/web/src/i18n/es.ts` — `board3dRecenter` → `board3dCenterOnMe: 'Centrar en mí'`.
- Tests: `apps/web/src/board3d/rig.test.ts`, `camera.test.ts`, `camara-libre-3d.test.ts`, `labels.test.ts`, tests de contenido en `packages/content`.

## Plan de pasos

1. Content + esquema: `camera.json` (`targetFollowsToken: false`, renombres), `ui.ts`, tests de contenido y `content:validate`.
2. Motor de cámara (rig/explore): renombrar evento a `CENTER_ON_ME` con payload de posición; paneo/ancla absolutos; pose inicial en mi ficha; tests por AC-1..AC-5 y AC-8.
3. Cableado UI: quitar cue `ROLL` del `dieNonce` en `CameraRig.tsx`; `Board3D.tsx` + `PlayScreen.tsx` + `useCameraKeys.ts` + `es.ts`; mantener `battleCameraCue` intacto.
4. `pnpm verify` verde + reporte `tasks/reports/T-xxx.md`.

## Comandos de verificación

- `pnpm verify` (typecheck + lint + test + content:validate + build)
- `pnpm --filter @liga/web test -- rig` / `pnpm --filter @liga/web test -- camara-libre-3d` (feedback rápido durante desarrollo)

## Notas / dudas a registrar

- Registrar en `docs/OPEN-QUESTIONS.md`: con cámara libre permanente, el modo `fork` (vista elevada para elegir camino) deja de dispararse jamás; la elección queda solo en los `DecisionPanels`. Si el jefe quiere conservar el fork como vista opcional, es otra tarea.
