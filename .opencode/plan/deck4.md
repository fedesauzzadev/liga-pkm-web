# Agregar un 4.º nodo a cada mazo de terreno (deck4)

## Objetivo

Pasar cada mazo de terreno (llanura, pantano, isla, bosque, montana) de 3 a 4 nodos consecutivos en `content/board/kanto.json`, mediante un script de datos idempotente (`--dry-run` / `--apply`). Sin tocar reglas, motor, cámara, edificios, modelos ni el resto de los nodos.

## Criterios de aceptación

**Algoritmo (por cada mazo D):**
- [ ] Tirada R = componente conexa de nodos con `deck == D` unidos por aristas internas entre ellos. Si R no tiene exactamente 3 nodos: avisar y seguir con los demás mazos.
- [ ] Aristas candidatas: SOLO aristas internas de R (ambos extremos en R). Nunca partir aristas que salen de R hacia otros nodos (bifurcaciones y vecinos quedan intactos).
- [ ] Se parte la arista interna MÁS LARGA por su punto medio. Nodo nuevo: `{type:"deck", shape:"round", deck:D, x,y}` con x,y = punto medio redondeado a entero.
- [ ] Id nuevo = prefijo existente del mazo + siguiente número libre (ej: `mont_4`); si no hay prefijo claro, `<D>_4`. Verificar que no choque con ningún id existente.
- [ ] La arista `[a,b]` se reemplaza por `[a,nuevo]` y `[nuevo,b]`. No se mueve ni renombra ningún nodo existente ni se cambia ningún otro dato.

**Separación mínima y escala:**
- [ ] Distancia entre nodos consecutivos de cada tirada ≥ 65 px (0,65 unidades). Se verifica DESPUÉS de insertar el nodo nuevo.
- [ ] Si alguna tirada no cumple: aplicar UNA escala uniforme y mínima sobre los datos JSON (no en el render), factor ≤ 1,15, el menor que haga cumplir las 5 tiradas. Se aplica a coordenadas de TODOS los nodos y a `deck-stacks.json` (x, y, w, h), respecto del centro del tablero. `meta.imageSize` se multiplica por el mismo factor, recentrado para que el centro no cambie.
- [ ] Si con factor 1,15 no se cumple: NO forzar; detenerse e informar qué tirada falla.

**Idempotencia y meta:**
- [ ] El script es idempotente: si un mazo ya tiene 4 nodos consecutivos, no hace nada con ese mazo.
- [ ] `--dry-run` por defecto (solo reporta qué haría); `--apply` escribe los cambios.
- [ ] En `meta.status` se agrega `+deck4` y se registran la fecha y el factor de escala aplicado.

**Actualización de supuestos de "3 por mazo / 15 totales" → "4 por mazo / 20 totales":**
- [ ] `packages/content/src/board-checks.ts` (hoy exige 3 nodos por mazo, línea ~106).
- [ ] `tests/t003-board.test.ts` (hoy fija 15 nodos de mazo = 3 por mazo, líneas ~28-30).
- [ ] Buscar en tests, specs, docs, `tools/content-validate.ts` y comentarios toda otra asunción de 3 nodos por mazo o 15 nodos de mazo y actualizarla.

**Verificación de grafo y decoración:**
- [ ] El grafo sigue conexo; hay exactamente +5 nodos y +5 aristas respecto de la copia `.bak`.
- [ ] Cada mazo tiene exactamente 4 nodos consecutivos (una sola tirada).
- [ ] Todo nodo existente conserva id, type, deck y vecinos; su grado no cambia (las bifurcaciones siguen igual); y (si no hubo escala) x e y idénticos.
- [ ] Cada nodo nuevo está a ≥ 65 px (o ≥ 65 × factor) de sus vecinos y, si no hubo escala, sobre el segmento original.
- [ ] `pnpm placements:report` y `pnpm decor:report` regenerados y en 0 solapamientos (edificios, agua, árboles, rocas, caminos y nodos). Si falla por los nodos nuevos, se ajusta SOLO la decoración, nunca los nodos.
- [ ] Partidas guardadas viejas: el contentHash cambia; se acepta el aviso, sin migración.

**Pruebas (obligatorias, sin mirar imágenes):**
- [ ] Robar en un nodo nuevo funciona igual que en los otros del mismo mazo (test del motor con dado forzado).
- [ ] Recorrido de 200 movimientos con semilla fija nunca se traba ni pisa un nodo inexistente (el test de propiedad del movimiento sigue pasando).
- [ ] Test de regresión que fije "4 nodos por mazo" (queda en el repo).
- [ ] `pnpm verify` verde.

## Archivos involucrados

- `content/board/kanto.json` — datos del tablero (nodos nuevos, aristas partidas, meta.status, posible escala).
- `content/board/kanto.json.bak` — copia de seguridad creada ANTES de tocar nada.
- `content/board/deck-stacks.json` — solo si hay escala (x, y, w, h).
- `tools/board/add-deck-nodes.mjs` — NUEVO script (Node puro, sin dependencias nuevas, `--dry-run` por defecto / `--apply`).
- `tools/board-render.mjs` / `tools/board-overlay.html` — referencia para generar el SVG del entregable.
- `shots/board-deck-nodes.svg` — NUEVO shot: nodos y aristas en la orientación de la foto, con los 5 nodos nuevos resaltados.
- `packages/content/src/board-checks.ts` — actualizar expected 3 → 4 por mazo.
- `tests/t003-board.test.ts` — actualizar 15 → 20 nodos de mazo, 3 → 4 por mazo.
- `tests/` — test de regresión "4 nodos por mazo" + test de robo en nodo nuevo (motor, dado forzado).
- `tasks/reports/T-deck4.md` — reporte con tabla: mazo | tirada (ids) | arista partida | id nuevo | x,y | separación mínima antes/después | factor de escala aplicado.
- Otros que asuman 3/15 (buscar con grep en tests, specs, docs y content-validate antes de cerrar).

## Plan de pasos

1. Backup: copiar `content/board/kanto.json` → `kanto.json.bak` y correr `pnpm verify` (estado base, debe estar verde).
2. Detectar por campo `deck` (NO por id) las 5 tiradas y sus aristas internas; confirmar que cada una tiene 3 nodos.
3. Escribir `tools/board/add-deck-nodes.mjs` con el algoritmo de arriba (dry-run por defecto, `--apply`, idempotente, ids sin colisión).
4. Correr `--dry-run`, revisar el plan de cambios; luego `--apply` (incluye verificación de separación ≥ 65 px y escala uniforme ≤ 1,15 solo si hace falta).
5. Actualizar `packages/content/src/board-checks.ts`, `tests/t003-board.test.ts` y toda otra asunción 3/15 encontrada (grep).
6. Agregar tests: regresión "4 por mazo", +5 nodos/aristas vs `.bak`, preservación de id/type/deck/vecinos/grado, nodo nuevo a ≥ 65 px (o 65 × factor) y sobre el segmento, robo en nodo nuevo (motor, dado forzado), propiedad de 200 movimientos con semilla fija.
7. Regenerar `pnpm placements:report` y `pnpm decor:report`; si hay solapamientos, ajustar solo decoración.
8. Generar `shots/board-deck-nodes.svg` (nodos nuevos resaltados, orientación de la foto).
9. Correr `pnpm verify` hasta verde; escribir `tasks/reports/T-deck4.md` con la tabla y los criterios aplicados ante ambigüedades. NO commitear hasta que `pnpm verify` pase.

## Comandos de verificación

```powershell
Copy-Item content/board/kanto.json content/board/kanto.json.bak   # paso 1 (antes de tocar nada)
pnpm verify                                                       # base y final (debe quedar verde)
node tools/board/add-deck-nodes.mjs                               # dry-run por defecto
node tools/board/add-deck-nodes.mjs --apply                       # aplica cambios
pnpm placements:report                                            # 0 solapamientos
pnpm decor:report                                                 # 0 solapamientos
pnpm vitest run tests/t003-board.test.ts                          # tests de tablero actualizados
```

## Criterios resueltos (no preguntar)

- Detección de mazos SOLO por campo `deck`; los ids pueden haber cambiado.
- Solo se parten aristas internas de la tirada; las externas quedan intactas.
- La escala (si hace falta) es única, uniforme, ≤ 1,15, sobre los datos JSON (todos los nodos + deck-stacks.json + meta.imageSize), centrada.
- Ante cualquier otra ambigüedad: aplicar este criterio y anotarlo en `tasks/reports/T-deck4.md`.
