# Cargar Charmeleon y animar la evolución

## Objetivo
Diagnóstico confirmado: la funcionalidad de evolución YA existe (comando `Evolve` en el motor, botón `btn-evolve` en el modal), pero el botón no aparece porque `charmeleon` no está cargado en la base de cartas: `content/pokemon/_samples.json` lo lista en `pending` y `packages/engine/src/legal.ts:148` descarta `Evolve` si la carta destino no existe. Este plan: (1) carga la carta charmeleon para habilitar la evolución de charmander, y (2) agrega la animación clásica de evolución (silueta blanca que pulsa + destello + revelación) fuera de combate, mejorando la existente en combate.

## Criterios de aceptación
- [ ] AC-1: `content/pokemon/_samples.json` tiene la carta `charmeleon` completa (HP, elemento fuego, ataques, `evolvesTo` a charizard si el manual lo indica), transcripta de `docs/reference/manual.pdf` (charmander salió de pág. 67) o de las fotos en `content/photos/crops/evolucion/`, con `source.manualPage` (o `source.photo`) y `verified: true`; se quita de la lista `pending`; `pnpm content:validate` y los cross-checks del admin quedan en verde.
- [ ] AC-2: con charmander en equipo y XP ≥ 2, en fase `organize` o `tileResolution` (D-06; en batalla el modal es solo lectura), el modal de carta ofrece el botón `btn-evolve` "Evolucionar Charmeleon (2 XP)"; al ejecutarlo el estado queda evolucionado (cardId charmeleon, XP 0, daño acotado al HP nuevo — D-04/D-05, ya lo hace el motor) y el evento `PkmEvolved` entra al historial.
- [ ] AC-3: al ejecutar `Evolve` fuera de combate se reproduce la animación clásica: silueta blanca del sprite actual que pulsa (3 pulsos crecientes), destello y revelación de la nueva forma; es puramente cosmética (el estado ya cambió; ningún resultado depende de ella — "animación ≠ lógica") y se omite con `reducedMotion` activo o velocidad `skip`.
- [ ] AC-4: la coreografía de combate `playPkmEvolved` usa la misma secuencia clásica (pulsos de silueta + destello antes del cambio de sprite), manteniendo el presupuesto de turno de SPEC-D/T-032d (≤ 3,5 s a 1×).
- [ ] AC-5: tras evolucionar, la ficha del tablero 3D re-resuelve la especie desde la carta actual (`PlayScreen.tsx` ya deriva `modelSpecies` del cardId): modelo HGSS si hay entrada en el manifiesto, si no el fallback sprite/peón existente — nunca queda mostrando charmander.
- [ ] AC-6: los timings nuevos viven en `apps/web/src/events/anim.config.ts`; textos nuevos (si hacen falta) en `apps/web/src/i18n/es.ts`; sin dependencias ni assets nuevos.

## Archivos involucrados
- `content/pokemon/_samples.json` — carta charmeleon nueva + quitar de `pending`.
- `apps/web/src/events/anim.config.ts` — timings: `evolvePulseMs`, `evolvePulses`, `evolveRevealMs`.
- Nuevo `apps/web/src/events/EvolveOverlay.tsx` (+ `EvolveOverlay.module.css`) — overlay de la animación clásica (AC-3), disparado por el evento, sin tocar estado.
- `apps/web/src/game/PlayScreen.tsx` — detecta `PkmEvolved` en el batch de eventos del comando exitoso y monta el overlay (respeta `reducedMotion`/velocidad).
- `apps/web/src/battle/choreo/registry.ts` — `playPkmEvolved` con pulsos (AC-4).
- Tests: nuevo `apps/web/src/events/EvolveOverlay.test.tsx` (un test por AC-3/AC-6); ajustar `apps/web/src/battle/choreo/choreography-attack.test.ts` (AC-4) y `apps/web/src/cardmodal/model.test.ts` + `CardModal.test.tsx`, que hoy asumen que el contenido de desarrollo no tiene evoluciones disponibles (AC-1/AC-2).

## Plan de pasos
1. Transcribir charmeleon desde manual.pdf (o foto de `content/photos/crops/evolucion/`), agregarlo a `_samples.json`, quitarlo de `pending`; correr `pnpm content:validate`.
2. Actualizar los tests que asumen "ninguna evolución disponible" (`model.test.ts`, `CardModal.test.tsx`) y agregar cobertura de AC-2 con la carta real.
3. Agregar timings a `anim.config.ts`; escribir primero `EvolveOverlay.test.tsx`; implementar `EvolveOverlay` (silueta pulsante + destello + revelación).
4. Cablear el overlay en `PlayScreen.tsx` a partir del evento `PkmEvolved` del comando.
5. `registry.ts`: actualizar `playPkmEvolved` a la secuencia clásica y ajustar su test.
6. Verificar la ficha 3D post-evolución (AC-5, check manual o e2e existente) y correr `pnpm verify` completo.

## Comandos de verificación
- `pnpm content:validate`
- `pnpm test -- EvolveOverlay` · `pnpm test -- choreography` · `pnpm test -- cardmodal`
- `pnpm verify`
