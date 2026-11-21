# Absorber con confusión: daño sí, curación no

## Objetivo

Cuando un PKM confundido se auto-ataca con un ataque de drenaje (Absorber de Tangela, `drainNow 20`), el golpe debe hacer **daño** al propio PKM pero **no curarlo**: hoy el motor aplica `applyDamage(victim)` y después `healPkm(attacker)` con el mismo uid, así que el daño se anula y el PKM queda con el HP igual. Arreglar en el motor, sin tocar el comportamiento normal (rival) del efecto.

## Criterios de aceptación

- AC-1 (motor, caso bug): en un test, un ataque con `{ op:'drainNow', amount:20 }` ejecutado bajo `gate selfHit` emite `DamageTaken` con `pkmUid` = atacante, `amount: 20`, `cause:'drainNow'`, y **no** emite `Healed`; el HP neto del atacante baja 20 (no queda en 0).
- AC-2 (regresión, camino normal): contra el rival (sin selfHit) `drainNow` sigue haciendo `DamageTaken` al rival **y** `Healed` al atacante; pasan sin cambios `tests/t021-primitives.test.ts` (AC-1), `tests/t021-interaction.test.ts` (AC-4) y `tests/t024-golden.test.ts`.
- AC-3 (flujo real): guion de batalla con Tangela confundida (`rollGate selfHit nextTurn`) que ataca con Absorber → eventos en orden `SelfHit` → `AttackUsed` (target = propio atacante) → `DamageTaken(atacante, 20, drainNow)`, sin `Healed`; el turno del rival corre igual que hoy (regresión `fix-confusion-captura/AC-1` intacta).
- AC-4 (alcance): solo se modifica `drainNow`. `healSelf`, `drainEachTurn` (drenaje por turno) y la animación FX de drenaje quedan **fuera de alcance** (registrar en el reporte si conviene seguirlas).
- AC-5 (documentación): `docs/RULES.md` registra la decisión como fila nueva `D-33` con estado "confirmado (dueño, 2026-10-26)" y `docs/EFFECTS.md` aclara en la primitiva `drainNow` que con selfHit no hay curación.
- AC-6: `pnpm verify` verde (typecheck + lint + test + content:validate + build).

## Archivos involucrados

- `packages/engine/src/battle-conditions.ts` — `applyAttackEffects` (firma, línea ~39) y `case 'drainNow'` (líneas ~144-151): acá vive el bug (`healPkm(attackerUid)` corre aunque `victimUid === attackerUid`).
- `packages/engine/src/battle-effects.ts` — `resolveAttack`/`resolveBody` (selfHit en ~283-291; llamada a `applyAttackEffects` en ~354): origen de `victimUid = attackerUid` en el auto-golpe; solo si se opta por pasar un flag explícito.
- `tests/t021-interaction.test.ts` (+ `tests/t021-helpers.ts`, `tests/t020-helpers.ts`) — tests nuevos primero (AC-1/AC-3); ya tiene el patrón `fxCard('fx-absorber2', [fx('absorber', [{ op:'drainNow', amount:20 }], …)])`.
- `tests/t021-primitives.test.ts`, `tests/t024-golden.test.ts`, `tests/t020-battle.test.ts` — regresiones a correr sin tocar (AC-2/AC-3).
- `docs/RULES.md` — fila `D-33` (tabla de decisiones, después de D-32).
- `docs/EFFECTS.md` — nota en la fila `drainNow` (línea ~27) y/o en §2.
- `apps/web/src/i18n/es.ts` — solo si se aclara el texto de ayuda `drainNow` (línea ~668); opcional, no bloquea.

## Plan de pasos

1. Tests primero: en `tests/t021-interaction.test.ts` agregar AC-1 (selfHit + `drainNow` → daño y sin `Healed`) y AC-3 (guion completo con confusión y orden de eventos). Verificar que **fallan** hoy.
2. Fix mínimo en `battle-conditions.ts` `case 'drainNow'`: aplicar el daño siempre y ejecutar `healPkm` **solo si `victimUid !== attackerUid`** (selfHit ⇒ sin curación). Sin cambiar firmas ni otros efectos.
3. Correr regresiones de drenaje y confusión (AC-2/AC-3): `tests/t021-primitives.test.ts`, `tests/t021-interaction.test.ts`, `tests/t024-golden.test.ts`, `tests/t020-battle.test.ts`, `tests/visibilidad-estados-combate.test.ts`.
4. Docs (AC-4/AC-5): fila `D-33` en `docs/RULES.md` y aclaración en `docs/EFFECTS.md`.
5. `pnpm verify` completo y reporte en `tasks/reports/` con el template (≤ 60 líneas); mover la tarea a `REVIEW`.

## Comandos de verificación

```bash
pnpm verify
npx vitest run tests/t021-interaction.test.ts tests/t021-primitives.test.ts tests/t024-golden.test.ts tests/t020-battle.test.ts tests/visibilidad-estados-combate.test.ts
```

Nota: si `manual.pdf` (docs/reference) contradice la regla "sin curación en selfHit", gana el manual → actualizar `D-33` y el test antes de cerrar.
