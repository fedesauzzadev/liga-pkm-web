# Ayudas en `/admin/cards`: explicar cada campo y de dónde sacar los ataques oficiales

## Objetivo
Que la dueña entienda qué significa cada campo del formulario de `/admin/cards` sin pedir ayuda, sobre todo los efectos (ops y sus campos), y sepa de dónde sacar el `officialMove` (ataque original en inglés de Showdown/PokeAPI). Solo textos de ayuda + estilos: sin cambios de lógica ni de esquema.

## Criterios de aceptación
- AC-1 Todos los campos visibles de la carta tienen una ayuda breve en español (texto chico debajo de la etiqueta, siempre visible): id, dex, nombre, etapa, mazo, HP, oportunidad, líder, slot, pág. manual, foto, verificada y evoluciones (evoluciona a / XP).
- AC-2 Todos los campos del ataque tienen ayuda: id, nombre, tipo (ataque/habilidad), elemento, caras del dado, costo, daño base, ifRoll (+ caras y daño), texto original.
- AC-3 Efectos: al elegir una op se muestra su descripción en español (parafraseada de `docs/EFFECTS.md` §1, con un ejemplo del manual cuando exista). Un test verifica que **cada** op de `EFFECT_OPS` tiene descripción (el listado no puede quedar desincronizado del esquema).
- AC-4 Efectos: los campos genéricos de cada op (faces, amount, duration, target, max, etc.) tienen ayuda corta; la op `custom` muestra la regla: no inventar primitivas → crear `docs/effect-requests/ER-xxx.md`.
- AC-5 El bloque de mapeo oficial explica: `officialMove` = id en inglés en kebab-case del movimiento (ej. `thunderbolt`); estado (`proposed` = sugerido por `pnpm map-moves`, `verified` = confirmado por el humano, `unmapped` = sin mapeo ⇒ cae al arquetipo); FX = arquetipo de animación de repuesto. Incluye de dónde sacar el id: buscar el movimiento en el buscador de `play.pokemonshowdown.com` (o `data/moves.js` del repo de Showdown), en PokéAPI, o localmente en `content/reference/pokeapi/moves.json` (se baja con `pnpm pokeapi`; NO se commitea).
- AC-6 No cambia ningún comportamiento de guardado/validación/atajos; solo se agregan textos (todas las claves nuevas en `apps/web/src/i18n/es.ts`), estilos y su render.

## Archivos involucrados
- `apps/web/src/i18n/es.ts` — claves nuevas: `adminHelp*` por campo, `adminEffectHelp` (por op), `adminEffectFieldHelp` (por campo genérico), `adminOfficialMoveHelp*`.
- `apps/web/src/admin/CardEditor.tsx` — render de la ayuda bajo cada etiqueta.
- `apps/web/src/admin/AttackEditor.tsx` — ídem campos de ataque + bloque officialMove/estado/FX.
- `apps/web/src/admin/EffectsEditor.tsx` — descripción por op seleccionada + ayuda de campos + warning en `custom`.
- `apps/web/src/admin/cards-admin.module.css` — estilo `.hint` (texto chico, color secundario, sin ocupar más de 1-2 líneas).
- `apps/web/src/admin/AttackEditor.test.tsx` (o test nuevo al lado) — test AC-3: cobertura op→texto; tests de render AC-1/2/4/5.
- Referencia (solo lectura): `docs/EFFECTS.md` §1 y `docs/FX-ADAPTER.md` §Mapeo.

## Plan de pasos
1. Escribir en `es.ts` las claves de ayuda de campos de carta y ataque (AC-1, AC-2), parafraseando `docs/EFFECTS.md` y el manual.
2. Agregar `adminEffectHelp` con una entrada por op de `EffectSchema` y `adminEffectFieldHelp` para los campos genéricos (AC-3, AC-4).
3. Renderizar las ayudas en `CardEditor`, `AttackEditor` y `EffectsEditor` con la clase `.hint` (AC-1..4); en `custom`, warning con la regla del ER.
4. Agregar el bloque de ayuda de `officialMove` con las fuentes (Showdown / PokéAPI / `pnpm pokeapi` local) y el significado de `proposed`/`verified`/`unmapped` y FX (AC-5).
5. Tests: uno por AC (AC-3 itera `EFFECT_OPS` contra las claves de `es.ts`).
6. `pnpm verify` verde.

## Comandos de verificación
- `pnpm verify`
- Manual: `pnpm dev` → `/admin/cards` → abrir una carta con efectos y verificar que cada campo muestra su ayuda.
