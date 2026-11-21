# Reporte arreglar-sprites-showdown — Sprites de Showdown no se veían
- Estado: REVIEW | Rama/commit: main (sin commitear)
- Resumen (≤ 5 líneas): Causa raíz (AC-1): `buildSpritesManifest` (tools/assets.ts) inyectaba una
  clave `trainers` dentro de `sprites.json`; la guarda `isSpritesManifest` de la UI
  (apps/web/src/battle/sprites.ts) exige {front,back} string|null en TODAS las entradas ⇒
  rechazaba el manifiesto entero y `sprites` quedaba null (ningún sprite de PKM en la UI;
  los archivos y trainers.json estaban bien). Fix: el generador escribe solo especies
  (los líderes ya viven en trainers.json); manifiestos regenerados con `pnpm assets`.
- Archivos clave tocados (rutas):
  - tools/assets.ts (buildSpritesManifest sin clave anidada)
  - tests/t043-assets.test.ts (test de regresión del generador)
  - e2e/sprites-serve.mjs (NUEVO: manifiestos válidos + archivos existentes + consistencia gyms↔config↔trainers)
  - package.json (e2e suma sprites-serve)
  - e2e/t103-card-modal.mjs (expectativa desactualizada vs rediseno-combate-max/AC-3, ver Q-101)
  - docs/OPEN-QUESTIONS.md (Q-101)
- AC cubiertos → test:
  - AC-1 → diagnóstico reproducido: sprites.json tenía 152 claves (trainers anidada) ⇒ isSpritesManifest false (evidencia dev server: manifest 151/151 válido tras fix, GET /sprites/* → 200)
  - AC-2 → e2e/sprites-serve.mjs (151 dex sin nulls) + chequeo HTTP dev:4173 y preview:4455 (200 en sprites/trainers.json, front/back gifs)
  - AC-3 → e2e/sprites-serve.mjs (gyms.json leaders ↔ assets.config sdId ↔ trainers.json; surge consistente, sin ltsurge) + trainer-sprites.test.ts preexistente
  - AC-4 → `pnpm assets` from-scratch: 323/323, 0 faltantes; ASENTS.md ya documenta el flujo (sin pasos manuales extra)
  - AC-5 → e2e/sprites-serve.mjs + tests/t043-assets.test.ts ("sprites.json sin claves ajenas; trainers va aparte")
  - AC-6 → `pnpm verify` OK (ver abajo)
- `pnpm verify`: OK — Tests 1089/1089 (176 archivos), content:validate OK, build ✓,
  size 33.78/200 KB y 432.96/450 KB, bench 77.4/300 · 0.3/2 · 1.7/10 ms OK.
  `pnpm e2e`: 12/12 scripts ok (sprites-serve: 151 dex + 8 líderes, 0 faltantes).
- Decisiones tomadas / defaults aplicados:
  - Mantener la guarda estricta de la UI (falla ruidosa) y corregir el pipeline (mejor que tolerar basura en el manifiesto).
  - e2e t103-card-modal actualizado para matchear la decisión confirmada rediseno-combate-max/AC-3 (base 0 ⇒ sin "(0)"); exigía '(' en TODAS las filas y fallaba determinístico con refugio (base 0), preexistente y ajeno a sprites.
- Dudas nuevas: Q-101 (bench content:load-validate flaky por carga de máquina: 77 ms en reposo vs 252–428 ms bajo carga; no se relajó perf-budget.json). Sin ER solicitados.
- Riesgos / deuda: perf-budget.json sin tolerancia a carga (el AC-9 de t006 puede fallar en máquina ocupada); sprites de líderes se guardan con extensión .gif aunque la fuente sea .png (browsers lo snifflean; preexistente, fuera de alcance).
