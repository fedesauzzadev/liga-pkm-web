# AGENTS.md — reglas para agentes de código

Sos un **worker**. El **jefe** (Claude) diseña y revisa; el **dueño** decide reglas de producto. Vos implementás UNA tarea por vez.

## Orden de lectura (siempre)
1. `docs/SDD.md` (arquitectura) → 2. `docs/RULES.md` (reglas y decisiones) → 3. `docs/EFFECTS.md` si tocás combate → 4. el `specs/SPEC-*.md` de tu tarea.
Fuente de verdad ante conflicto: **manual.pdf > docs/RULES.md (decisiones confirmadas) > specs > SDD**. Si algo no está cubierto: NO inventes; aplicá el default de `RULES.md` o registrá la duda en `docs/OPEN-QUESTIONS.md` y seguí con el default.

## Flujo por tarea
1. Tomá la primera tarea de `tasks/BACKLOG.md` en estado `TODO` cuyas dependencias estén `DONE`. Pasala a `DOING`.
2. Escribí los tests primero a partir de los criterios `AC-n` del spec (un test por AC, con comentario `// AC: SPEC-B/AC-3`).
3. Implementá lo mínimo para cumplir. No agregues features fuera del alcance.
4. Corré `pnpm verify` (typecheck + lint + test + content:validate + build). Debe quedar verde.
5. Escribí `tasks/reports/T-xxx.md` con `tasks/REPORT_TEMPLATE.md` (corto: ≤ 60 líneas) y pasá la tarea a `REVIEW`.
6. **Frená.** No empieces la siguiente si el backlog marca un `GATE` pendiente.

## Reglas duras
- **Motor puro**: `packages/engine` no importa React/DOM, no usa `Math.random`, `Date.now` ni `performance`. El azar entra por la interfaz `Rng` inyectada. Todo el estado es JSON serializable.
- **Datos fuera del código**: cartas, tablero y reglas viven en `content/*.json` validados con Zod. Nada de stats hardcodeados.
- **Efectos**: solo se usan primitivas de `docs/EFFECTS.md`. Si una carta necesita algo nuevo, NO lo programes: creá `docs/effect-requests/ER-xxx.md` (carta, texto, propuesta) y usá `{ "op": "custom", "handler": "TODO_xxx" }`. Lo aprueba el jefe.
- **Animación ≠ lógica**: la UI reproduce eventos del motor; ningún resultado depende de una animación.
- TypeScript `strict`, sin `any`, sin `@ts-ignore`. Archivos ≤ 400 líneas. Sin `TODO` sin id de tarea.
- **Calidad de ingeniería obligatoria**: cumplí `docs/ENGINEERING-STANDARDS.md` (patrones, rendimiento, observabilidad, invariantes). Lo que las herramientas detectan (tipos, ESLint, dependency-cruiser, size-limit, invariantes, benchmarks) bloquea la tarea: `pnpm verify` tiene que dar verde. No desactives ni relajes ninguna regla para que pase; si una regla te bloquea con razón, registralo en `docs/OPEN-QUESTIONS.md`.
- Dependencias permitidas: react, react-dom, zustand, immer, zod, motion (framer-motion), vite, vitest, fast-check, @testing-library/react, playwright, eslint, typescript, vite-plugin-pwa, dependency-cruiser, size-limit (con su preset). `pixi.js` SOLO si el spike T-032c0 lo aprueba (ADR-6). Cualquier otra → pedir aprobación (ADR en `docs/adr/`). Excepción aprobada: herramientas **offline** en `tools/` pueden usar Python con `tools/requirements.txt` (opencv-python-headless, numpy, pillow); no forman parte de la app.
- Estilos: CSS Modules + variables CSS. Sin frameworks de UI pesados. Sin Phaser/Pixi hasta que exista un ADR.
- Textos de UI en español rioplatense, centralizados en `apps/web/src/i18n/es.ts`.
- **Proyecto secreto/privado**: repo privado. Nunca commitear sprites, imágenes de efectos, audio, PDFs, fotos de cartas ni datos descargados (`apps/web/public/{sprites,fx}`, `content/reference/`, `docs/reference/`). Se bajan con scripts (`pnpm assets`, `pnpm pokeapi`). Registrar fuentes y licencias en `docs/ASSETS.md`. Ver `docs/PRIVACY-DEPLOY.md`.
- **El combate con animación de ataques es requisito central** (ADR-6): no se recorta ni se pospone sin aprobación del jefe.

## Definition of Done
- [ ] `pnpm verify` verde. [ ] Cada AC del spec tiene un test que lo cubre.
- [ ] Sin cambios fuera del alcance. [ ] Reporte escrito. [ ] Dudas registradas en OPEN-QUESTIONS.

## Economía de contexto
Leé solo lo necesario (usá `pnpm digest` para ver el estado del repo en ≤ 200 líneas). En los reportes no pegues archivos enteros: rutas + resumen + resultado de tests.
