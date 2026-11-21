# Reporte resolver-open-questions — Cerrar preguntas abiertas de OPEN-QUESTIONS.md
- Estado: REVIEW | Rama/commit: —
- Resumen (≤ 5 líneas): plan nuevo `.opencode/plan/resolver-open-questions.md` (no existía).
  15 preguntas cerradas: 3 moot (Q-051, Q-052, Q-055: presupuesto/import/e2e ya resueltos por
  decisiones posteriores citadas) y 12 ratificadas por el dueño vía question tool (Q-037, Q-038,
  Q-050, Q-054, Q-076, Q-086, Q-087, Q-092, Q-093, Q-095, Q-100, Q-102). D-32 → confirmado;
  D-34 nuevo (solo la captura registra). Deuda de splits derivada como **T-113** (TODO).
- Archivos clave tocados (rutas): `docs/OPEN-QUESTIONS.md` · `docs/RULES.md` (D-32/D-34) ·
  `tasks/BACKLOG.md` (fila T-113) · `tests/ac4-hygiene.test.ts` (comentario jsdom ratificado) ·
  `.opencode/plan/resolver-open-questions.md`.
- AC cubiertos → test: AC-1/AC-2 = estados en `docs/OPEN-QUESTIONS.md` (grep
  `resolver-open-questions` → 15 filas); AC-3 = sin cambios de motor/UI/content (diff docs+test);
  AC-5 = este reporte. AC-4 = `pnpm verify`.
- `pnpm verify`: OK (exit 0; bench 67,4/300 · 0,4/2 · 1,7/10 ms; size 35 kB y 433 kB).
- Decisiones tomadas / defaults aplicados: todas las ratificaciones son del dueño (question tool,
  2026-10-28): mapeo Bola actual; botón por candidato; CENTER_ON_ME resetea ángulos; epsilon 1e-6;
  sufijos -scan; jsdom; bench embebido queda como está (flake registrado); D-32 confirmado;
  correcciones WIP de Q-100 mantenidas; solo captura registra (D-34); una tarea T-113 de split.
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados: ninguno.
- Riesgos / deuda: las ~43 abiertas restantes requieren revisión visual del dueño (shots/boceto),
  trabajo de etiquetado OCR o cierre de tareas; fuera de alcance por el propio plan.
  Incidente ambiental (no de esta tarea): `node_modules/.cache/tsc/*.tsbuildinfo` corrupto por
  sesión concurrente rompía `pnpm typecheck` con 214 errores de lib DOM; se arregló borrando el
  cache (repro solo bajo pnpm; aislado pasaba). Si reaparece: borrar el cache y reintentar.
