# Ficha del tablero siempre muestra el inicial base (aunque evolucione)

## Objetivo

Al evoluciona el PKM inicial, la ficha del tablero pasa a mostrar la evolución. La ficha debe representar SIEMPRE al inicial base elegido al empezar la partida (vale para los 5 iniciales, uno por mazo).

## Diagnóstico (causa raíz)

- `apps/web/src/game/PlayScreen.tsx:274-287` arma el spec de la ficha (`spriteUrl`, `modelSpecies`) desde `p.team[0]` y su `cardId` **actual**.
- `Evolve` reemplaza `pkm.cardId` por la evolución (`packages/engine/src/progression.ts:133`), así que el sprite/modelo 3D de la ficha cambian.
- Solución sin tocar el motor: la sesión ya guarda `starterDeck` (inmutable toda la partida) y `STARTER_BY_DECK` (export de `@liga/engine`, usado en `apps/web/src/game/content.ts:129-131`) resuelve la carta inicial base. Cubre los 5 mazos automáticamente y no depende de reordenar/intercambios de Oak.

## Criterios de aceptación

- [ ] AC-1: Tras aplicar `Evolve` al inicial (XP suficiente), el spec de la ficha sigue resolviendo `spriteUrl`/`modelSpecies` desde la carta inicial base, no desde el `cardId` evolucionado.
- [ ] AC-2: Parametrizado por los 5 mazos (`STARTER_BY_DECK`): cada inicial base se representa a sí mismo.
- [ ] AC-3: El spec de la ficha no depende del orden del equipo (reordenar o intercambio con Oak no cambia el representado).
- [ ] AC-4: Sin sprites/manifest disponible se mantiene el peón de color (fallback actual intacto).
- [ ] AC-5: `pnpm verify` verde.

## Archivos involucrados

- `apps/web/src/game/PlayScreen.tsx` — useMemo de `tokens` (líneas ~271-287): usar la carta base del mazo en vez de `p.team[0]`.
- `apps/web/src/game/content.ts` — helper puro nuevo (p. ej. `starterTokenCard(starterDeck): PokemonCard | null`) usando `STARTER_BY_DECK`.
- `apps/web/src/game/PlayScreen.test.tsx` — tests (uno por AC).
- `apps/web/src/board/Board.tsx` — consumidor 2D del spec (solo verificación, no debería cambiar).

## Plan de pasos

1. Test primero en `PlayScreen.test.tsx`: sesión con `Evolve` aplicado al inicial ⇒ spec de ficha con carta base (AC-1).
2. Helper `starterTokenCard(starterDeck)` en `content.ts` (puro, testeable).
3. Cambiar el `useMemo` de `tokens` en `PlayScreen.tsx`: `spriteUrl`/`modelSpecies` desde el helper con `session.starterDeck`.
4. Parametrizar el test por los 5 mazos (AC-2) y cubrir reorden/Oak (AC-3).
5. Correr verificación y dejar verde.

## Comandos de verificación

```
pnpm --filter @liga/web exec vitest run src/game/PlayScreen.test.tsx
pnpm verify
```
