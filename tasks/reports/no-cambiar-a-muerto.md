# Reporte — No cambiar un PKM vivo por uno muerto (validación de intercambios)
- Estado: REVIEW · Rama/commit: — (plan `.opencode/plan/no-cambiar-a-muerto.md`)
- Resumen (≤ 5 líneas): `swapWithOak` ahora rechaza con `ILLEGAL_COMMAND` si el PKM de la
  pila de Oak llega `fainted` o con `damage > 0` (defensa en profundidad además del
  invariante `casillero/pila-de-oak-sana`). `retire` y `sendOut` ya validaban (D-07):
  no se tocó su lógica, se cubrieron con tests de regresión.
- Archivos clave tocados (rutas):
  - `packages/engine/src/tiles.ts` — validación del entrante en `swapWithOak` (AC-3).
  - `packages/engine/src/index.test.ts` — 5 tests nuevos + helpers (estados a mano, patrón t012/t020).
- AC cubiertos → test (no-cambiar-a-muerto/AC-n → packages/engine/src/index.test.ts):
  - AC-1 → "AC-1 Retire hacia un PKM debilitado" (rechazo + estado sin cambios).
  - AC-2 → "AC-2 SendOut de un debilitado (dentro y fuera de options)" (KO real via Embestida
    para el pending ChooseReplacement; options corruptas a mano para el caso "dentro").
  - AC-3 → "AC-3 SwapWithOak con PKM de la pila debilitado o dañado" + regresión del camino feliz.
  - AC-4 → "AC-4 rechazos sin eventos, invariantes verdes y legalCommands nunca ofrece al debilitado".
  - AC-5 → "AC-5 cada AC de no-cambiar-a-muerto tiene su test tageado" (meta-check de comentarios).
- `pnpm verify`: OK — typecheck + lint + tests 1034/1034 (165 archivos) + content:validate
  (6 cartas verificadas) + build + deps:check + size-limit + bench, todo verde.
- Decisiones tomadas / defaults aplicados:
  - Estados corruptos (pila dañada, options con debilitado) se arman a mano DESPUÉS del
    `Advance` exitoso: el rechazo no corre invariantes y así no choca con `pila-de-oak-sana`
    ni `reemplazo-con-opciones` (que solo se afirman en éxito).
  - RNG guionado local (patrón t020-helpers): face 3 ⇒ Embestida 20 KO del starter con 40 de daño.
  - `legal.ts` sigue ofreciendo todos los cruces equipo×pila: la UI ya nunca ve pila insana
    (invariante); el rechazo del handler es la segunda barrera. No se cambió (fuera de alcance).
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados: ninguna. ER: ninguno.
- Riesgos / deuda: ninguno nuevo; sin cambios de comportamiento en comandos legales.
