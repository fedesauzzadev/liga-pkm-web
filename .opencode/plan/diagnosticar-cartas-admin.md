# Diagnóstico: las ~266 cartas extraídas no aparecen en /admin/cards

## Objetivo
Explicar por qué las "200 y pico" cartas extraídas no se ven en `/admin/cards` y dejar registrado el camino mínimo para que aparezcan. **No implementa la carga completa** (esa es T-042c, con sus gates).

## Diagnóstico (causa raíz — ya verificado en disco)
1. Lo que se hizo fue el **recorte** (T-042a, `pnpm crop-cards`): 266 **imágenes** en
   `content/photos/crops/{iniciales(3), evolucion(84), terreno(101), gimnasio(25), liga(25), sorpresa(28)}`.
   Eso es lo que el usuario percibe como "las 200 y pico extraídas".
2. La **extracción por visión** (`pnpm extract`, T-041) nunca corrió a escala:
   `content/pokemon/_staging/` tiene solo 5 JSONs de muestra (1 carta c/u, ~5 cartas en total:
   Charmander/Abra de ingestas de prueba), sin `_errors/` ni `_recordings/`. Lo confirma
   Q-030 en `docs/OPEN-QUESTIONS.md`: "la extracción completa de las ~266 cartas (T-042c) no corrió".
3. `/admin/cards` lee **solo** `content/pokemon/*.json` y `content/pokemon/_staging/*.json`
   (`listAdminCards` en `apps/web/src/admin/server.ts:49`). Los recortes (imágenes en
   `content/photos/crops/`) nunca van a aparecer ahí: no son datos de cartas.
4. Obstáculos adicionales si se quisiera correr `pnpm extract` hoy:
   - `tools/extract.ts` **no es recursivo** (`extractPhotos` filtra `e.isFile()`): corrido sobre
     `content/photos/crops` devuelve "no hay fotos" (están en 6 subcarpetas).
   - Los recortes de T-042a fueron **rechazados por el dueño** (Q-027: "mal cortados");
     el dueño aportará su propia carpeta de recortes.
   - Sin `VISION_API_KEY` (y sin `--dry-run` con grabaciones) el CLI sale con código 2.
   - T-042c está `TODO` en `tasks/BACKLOG.md` y depende de T-042b (corrida real del piloto) y T-046.

## Criterios de aceptación
- [x] AC-1: El diagnóstico queda documentado en este archivo y referenciado desde
      `docs/OPEN-QUESTIONS.md` (actualizar Q-030 con el hallazgo, sin cerrarla si sigue abierta).
- [x] AC-2: `/admin/cards` muestra exactamente lo que hay en `content/pokemon/` y
      `content/pokemon/_staging/` (hoy: `_samples.json` + 5 staging = comportamiento correcto,
      no un bug de la UI ni del middleware).
- [x] AC-3: Qeda registrado en `tasks/BACKLOG.md` (nota en T-042c) que para ver las ~266 cartas
      hace falta: recortes del dueño (Q-027) → `pnpm extract` sobre ellos → JSONs en `_staging/`.
- [x] AC-4: Sin cambios de código en `apps/web/`, `tools/extract.ts` ni `content/` (solo docs/backlog).

## Archivos involucrados
- `docs/OPEN-QUESTIONS.md` (nota en Q-030)
- `tasks/BACKLOG.md` (nota en T-042c)
- `.opencode/plan/diagnosticar-cartas-admin.md` (este archivo)
- Solo lectura (evidencia): `apps/web/src/admin/server.ts`, `tools/extract.ts`,
  `content/pokemon/_staging/`, `content/photos/crops/`

## Plan de pasos
1. Agregar nota de hallazgo en `docs/OPEN-QUESTIONS.md` (Q-030): la causa de "no se ven" es que
   solo existen recortes; `_staging/` tiene 5 muestras; T-042c sigue TODO.
2. Agregar nota en la fila/notas de T-042c en `tasks/BACKLOG.md` con la cadena de dependencias
   (Q-027 → T-042b real → T-046 → T-042c).
3. Verificar AC-2 empíricamente: levantar dev server y confirmar que `/admin/cards` lista las
   ~6 cartas existentes (no es un bug de la página).

## Comandos de verificación
```powershell
# qué ve /admin/cards (mismo código que el middleware):
node -e "import('./apps/web/src/admin/server.ts').then(m => console.log(m.listAdminCards(m.CONTENT_DIR).files.map(f => `${f.file}: ${f.cards.length} cartas`).join('\n')))"
# recortes existentes (las "200 y pico" son imágenes, no cartas):
Get-ChildItem content\photos\crops -Recurse -File -Filter *.jpg | Measure-Object | Select-Object Count
# tests del admin y del extract siguen verdes:
pnpm vitest run tests/t040-admin-cards.test.ts tests/t041-extract.test.ts
# verify completo antes de cerrar:
pnpm verify
```
