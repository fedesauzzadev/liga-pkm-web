# Arreglar sprites de Pokémon Showdown que no se ven

## Objetivo
Los sprites de Pokémon Showdown no aparecen en la UI. Diagnosticar la causa raíz (runtime, pipeline de assets o render) y corregirla para que frente/espalda de los 151 PKM y los 8 líderes se vean en combate, tablero y cartas.

Estado inicial relevado (2026-10-28): `apps/web/public/sprites/` EXISTE (312 archivos, descargados hoy 14:00), `sprites.json` tiene 151 entradas sin nulls apuntando a `/sprites/N.gif` y `trainers.json` a `/sprites/<lider>-front.gif`. O sea: los archivos están; la falla es de serving/render (o de un entorno sin assets). Paso 1 = diagnosticar antes de tocar.

## Criterios de aceptación
- [ ] AC-1: Reproducido y documentado el síntoma: se identifica la causa raíz (404 de `/sprites/*.json|*.gif`, manifiesto inválido, `<img>` sin `src`, sprite con tamaño 0/oculto, u otra) con evidencia (URL + status de red o HTML renderizado).
- [ ] AC-2: En `pnpm dev` (y en `pnpm build && pnpm preview`), combate muestra sprite rival (front) y propio (back); el tablero/cartas (`PlayScreen`, `TeamStrip`, `EvolveOverlay`, `CardsAdmin`) muestra el arte frente. Sin `null` en `spriteUrl` para los 151 dex.
- [ ] AC-3: Los 8 líderes de `content/gyms.json` renderizan su sprite de entrenador (clave `sdId` consistente entre `gyms.json`, `tools/assets.config.json` y `trainers.json`; ojo `ltsurge` vs `surge`).
- [ ] AC-4: Camino from-scratch verificado: en un checkout limpio, `pnpm assets` baja los sprites y la UI los muestra sin pasos manuales extra (documentar en `docs/ASSETS.md` si falta algo).
- [ ] AC-5: Test de regresión: un test/e2e verifica que cada URL de `sprites.json` y `trainers.json` responde 200 contra el server de dev/preview (o que el archivo existe en `public/sprites/` si es test de node), y falla si el manifiesto tiene nulls.
- [ ] AC-6: `pnpm verify` verde; sin cambios fuera del alcance (no tocar motor ni reglas).

## Archivos involucrados
- `tools/assets.ts` y `tools/assets.config.json` (pipeline de descarga, `pnpm assets`)
- `apps/web/public/sprites/` (generado, gitignored: `sprites.json`, `trainers.json`, `*.gif`)
- `apps/web/src/battle/sprites.ts` (`useSprites`, `spriteUrl`, `trainerUrl`, guards de manifiesto)
- Consumidores: `apps/web/src/battle/BattleScene.tsx`, `apps/web/src/battle/PkmCard.tsx`, `apps/web/src/game/PlayScreen.tsx`, `apps/web/src/hud/TeamStrip.tsx`, `apps/web/src/events/EvolveOverlay.tsx`, `apps/web/src/admin/CardsAdmin.tsx`
- `content/gyms.json` (ids de líderes) — solo lectura para consistencia
- Test de regresión nuevo: `e2e/sprites-serve.mjs` (o test vitest sobre el manifiesto) + agregarlo a `pnpm e2e` en `package.json`
- `docs/ASSETS.md` (si hay que documentar el paso faltante)

## Plan de pasos
1. Diagnosticar: correr `pnpm dev`, abrir combate y tablero, inspeccionar red/consola (¿`/sprites/sprites.json` da 404? ¿las `<img>` tienen `src` y tamaño > 0?). Repetir con `pnpm build && pnpm preview`. Anotar la causa raíz (cumple AC-1).
2. Corregir la causa raíz en el/los archivo(s) involucrado(s) (serving, fetch, manifiesto, render o pipeline `pnpm assets`).
3. Verificar consistencia de ids de entrenadores (`gyms.json` ↔ `assets.config.json` ↔ `trainers.json`) y corregir si difieren (AC-3).
4. Escribir el test de regresión (AC-5) y sumarlo al script `e2e` de `package.json`.
5. Correr `pnpm assets`, `pnpm e2e` y `pnpm verify`; actualizar `docs/ASSETS.md` si corresponde.

## Comandos de verificación
- `pnpm assets` (baja/regenera sprites + manifiestos; debe terminar con 0 faltantes)
- `pnpm dev` → inspección manual: sprites en combate, tablero, cartas y líderes (AC-2/AC-3)
- `pnpm build && pnpm preview` → ídem contra el build (AC-2)
- `pnpm e2e` (incluye el nuevo check de sprites, AC-5)
- `pnpm verify` (typecheck + lint + test + content:validate + build + deps + size + bench, AC-6)
