# Visibilidad de estados de combate (confusión y todas las condiciones)

## Objetivo
Que toda condición de combate aplicada por un ataque se anuncie con eventos del motor y se vea en el chat y en la placa/panel mientras esté activa. Hoy `rollGate` (Confusión de Abra, Hipno-rayo, Polvo de esporas, Impact-trueno), `skipNextAttack`, `drain`, `selfBoost`, `modifyRivalDamage` y `flatReduction` se aplican en silencio: no hay `ConditionApplied` (solo lo emiten `asleep`/`poison`), no hay ícono de "confundido" en `statusViews`, y el auto-golpe del gate no se explica (solo se ve un ataque que daña al propio PKM).

Diagnóstico (referencias):
- `packages/engine/src/battle-conditions.ts:111-117` — `rollGate` setea la condición sin evento; ídem `rivalSkipsAttack` (L90), `modifyRivalDamage` (L72), `flatReduction` (L80), `selfBoost` (L65), `drainEachTurn` (L126), `dodge` (L151).
- `packages/engine/src/events.ts:189` — `ConditionName = 'asleep' | 'poison'`: no cubre el resto.
- `packages/engine/src/battle-effects.ts:259-267` — gate `selfHit` redirige el ataque sin evento distintivo (el chat no dice "está confundido, sacó X, se auto-ataca").
- `packages/engine/src/battle.ts:82-99` — `endSideTurn` borra en silencio `rollGate`/`skipNextAttack`/`rivalDamageMod` de duración `nextTurn`.
- `apps/web/src/battle/model.ts:63-75` — `statusViews` no muestra `rollGate` con `outcome:'selfHit'` (confusión), ni `drain`, ni `selfBoost`.
- `apps/web/src/battle/choreo/registry.ts:301-324` — no existe `play` para `ConditionApplied`: ni dormido ni veneno se anuncian en el chat del combate (solo en el historial).

## Criterios de aceptación
- AC-1 Aplicación anunciada: cada efecto que setea una condición emite `ConditionApplied` con un `condition` descriptivo por slot: `confused` (rollGate selfHit), `noAttackGate` (rollGate noAttack), `skip` (skipNextAttack), `drain` (drainEachTurn), `shield` (damageModCombat), `selfBoost`, `weakened` (rivalDamageMod/combatDamageMod), `dodge`, además de `asleep`/`poison` existentes.
- AC-2 Auto-golpe explicado: al fallar la tirada de gate con `selfHit` el motor emite un evento nuevo `SelfHit { attacker }` antes de `AttackUsed`; el chat dice "¡{name} está confundido! Salió {n} y se auto-ataca." (el {n} sale del último `DieRolled` purpose 'gate').
- AC-3 No-ataque explicado: `NoAttack` con `reason:'gate'` distingue el motivo (campo `cause: 'confused' | 'paralized' | ...` según el outcome/origen del gate) y el chat explica la tirada en vez del genérico "{name} no puede atacar.".
- AC-4 Expiración anunciada: cuando `endSideTurn` consume condiciones `nextTurn` (rollGate, skipNextAttack, rivalDamageMod) emite `ConditionCleared { pkmUid, condition }`; la UI deja de mostrar el ícono (ya lo hace por estado) y el historial lo registra.
- AC-5 Íconos de estado completos: `statusViews` devuelve una vista para toda condición activa: confundido (rollGate selfHit), no atacará (ya existe), dormido, veneno, drenado, defensa (-N, ya existe), buff (+N selfBoost). Etiquetas en `es.ts` usadas por `icons.tsx` (placa) y `cardmodal/SidePanel.tsx` (ventana de carta).
- AC-6 Chat e historial: el registro de coreografía tiene `play` para `ConditionApplied`, `SelfHit` y `ConditionCleared` (mensaje por condición, p. ej. "¡{name} quedó confundido! Al atacar tirará el dado: con 1-2-3 se auto-ataca."); `event-log.ts` + `hud/history.ts` traducen y categorizan los eventos nuevos como 'status'.
- AC-7 Regresión intacta: los eventos nuevos no cambian resolución de combate (animación ≠ lógica); los tests existentes de gate/selfHit (`tests/t021-primitives.test.ts`, `tests/t021-interaction.test.ts`) siguen verdes salvo por los eventos agregados que asserted explícitamente.

## Archivos involucrados
Motor (`packages/engine/src/`):
- `events.ts` — extender `ConditionName`; agregar `SelfHit`, `ConditionCleared`; `NoAttack.cause` opcional.
- `battle-conditions.ts` — emitir `ConditionApplied` en todos los cases que setean condiciones.
- `battle-effects.ts` — emitir `SelfHit` y `NoAttack.cause` en `awaitGate`/`resolveAttack`.
- `battle.ts` — `endSideTurn` emite `ConditionCleared` (recibe `events`).
UI (`apps/web/src/`):
- `battle/model.ts` y `battle/model.test.ts` — `statusViews` completo (nuevo `StatusKind: 'confused' | 'drain' | 'boost'`).
- `battle/icons.tsx`, `battle/HpPlate.tsx` (+ `HpPlate.test.tsx`) — íconos/etiquetas nuevas.
- `cardmodal/SidePanel.tsx` — `STATUS_LABELS` con los nuevos kinds.
- `i18n/es.ts` — `battleStatus*`, `battleMsg*` (aplicada/confusión/auto-golpe/aclarada) y `history*`.
- `i18n/event-log.ts` (+ `.test.ts`) — traducción de eventos nuevos.
- `hud/history.ts` — categoría 'status' para eventos nuevos.
- `battle/choreo/registry.ts` (+ `choreography.test.ts` y `choreography-attack.test.ts`) — `playConditionApplied`, `playSelfHit`, `playConditionCleared`.
Tests de integración:
- `tests/t072-condition-applied.test.ts` (extender) o nuevo `tests/visibilidad-estados-combate.test.ts` — un test por AC con comentario `// AC: ...`.

## Plan de pasos
1. Motor de eventos: extender `events.ts` (`ConditionName`, `SelfHit`, `ConditionCleared`, `NoAttack.cause`).
2. Motor: emitir `ConditionApplied` en `battle-conditions.ts` para todos los slots silenciosos.
3. Motor: `SelfHit`/`NoAttack.cause` en `battle-effects.ts` y `ConditionCleared` en `battle.ts:endSideTurn`.
4. UI de estado: `statusViews` + `icons.tsx` + `SidePanel.tsx` + textos en `es.ts`.
5. Chat/historial: plays en `choreo/registry.ts`, traducción en `event-log.ts`, categoría en `hud/history.ts`.
6. Tests por AC (motor + UI) y `pnpm verify` verde.

## Comandos de verificación
- `pnpm verify`
- `pnpm vitest run tests/visibilidad-estados-combate.test.ts tests/t021-primitives.test.ts tests/t021-interaction.test.ts`
- `pnpm vitest run apps/web/src/battle apps/web/src/i18n`

## Notas / decisiones que valida el jefe
- Nombres propuestos de condiciones (`confused`, `noAttackGate`, `skip`, `drain`, `shield`, `selfBoost`, `weakened`) y eventos (`SelfHit`, `ConditionCleared`): no rompen consumers actuales (union types aditivos).
- `defendGate` (Confusión de Kadabra, especialidad pasiva) NO entra en este alcance: no es condición aplicada, vive en la carta. Si se quiere anunciar, va en otra tarea.
- Mensaje de confusión con `onRoll` (Abra): el texto del chat es genérico por outcome ("con 1-2-3 se auto-ataca"); parametrizarlo por `failFaces` del slot.
