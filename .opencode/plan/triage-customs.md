# Triage de efectos `custom` post-extracción de las 266 cartas

## Objetivo
Resolver todos los efectos que queden como `{op:'custom'}` después de extraer las 266 cartas: mapearlos a primitivas existentes cuando quepan, agrupar los repetidos y convertir los que faltan en pedidos ER para el jefe. Sin inventar comportamiento: nada se programa sin ER aprobado.

## Criterios de aceptación
- [ ] AC-1 Existe un informe (`tasks/reports/triage-customs.md`) con **todos** los customs agrupados por texto normalizado: cuántas cartas usan cada uno, en qué cartas, y a qué pila fue cada grupo (A mapea / B ER / C repetido de otro).
- [ ] AC-2 Cada grupo de custom quedó exactamente en un estado: **mapeado** a una primitiva real de `EffectSchema` (las 24 de `docs/EFFECTS.md`), **ER creado** (`docs/effect-requests/ER-xxx.md` con carta, texto literal y propuesta), o **unificado** con otro grupo idéntico (un solo ER/mapeo para todas las copias).
- [ ] AC-3 Los mapeos se aplican en los JSON de cartas (`custom` → primitiva, conservando `rawText`), las cartas quedan `source.verified:false` (o `needsReview`) para que el dueño las verifique contra la física con el filtro "Con custom" de `/admin/cards`.
- [ ] AC-4 Los ER siguen el formato existente de `docs/effect-requests/` y no se programa ningún ER en esta tarea (solo se proponen; los implementa una tarea propia tras aprobación del jefe).
- [ ] AC-5 Verificación: `content:validate` verde, el conteo de customs baja solo por mapeo/unificación (queda igual a la cantidad de ER pendientes), y `pnpm verify` verde.
- [ ] AC-6 Dudas de interpretación de texto de carta (ej. "4-5-6 cada turno…") registradas en `docs/OPEN-QUESTIONS.md` con el default aplicado; el dueño las resuelve al verificar.

## Archivos involucrados
- `content/pokemon/_staging/*.json` y `content/pokemon/*.json` (cartas: aplicar mapeos).
- `docs/effect-requests/ER-xxx.md` (nuevos pedidos, uno por grupo no mapeable).
- `docs/EFFECTS.md` (solo lectura: vocabulario de primitivas).
- `tasks/reports/triage-customs.md` (informe del triage, nuevo).
- `tasks/OWNER-REVIEW.md` (ítem de verificación física de las mapeadas).
- `docs/OPEN-QUESTIONS.md` (dudas de interpretación).
- Herramientas: `tools/pilot.ts` (`findCustoms` ya los junta) — se puede extender o script aparte para agrupar por texto.

## Plan de pasos
1. **Precondición**: extracción de las 266 corrida (Gemini sobre `content/photos/Mazos/`) y cartas en `_staging/`.
2. Generar la lista agrupada de customs (texto normalizado → cartas que lo usan).
3. Triage: pila A (primitiva existente) / pila B (no entra → ER con propuesta) / pila C (repetido de otro grupo).
4. Aplicar mapeos de la pila A en los JSON (mantener `rawText`, dejar sin verificar), crear los ER de la pila B.
5. Escribir el informe, agregar el ítem a OWNER-REVIEW, registrar dudas en OPEN-QUESTIONS, correr verificación y reportar.

## Comandos de verificación
- `pnpm verify` (typecheck + lint + test + content:validate + build + deps:check + size + bench)
- `pnpm content:validate` (imprime el conteo de customs; debe igualar los ER pendientes)
- `pnpm dev` → `/admin/cards` con filtro "Con custom" (el dueño verifica las mapeadas contra las físicas)
