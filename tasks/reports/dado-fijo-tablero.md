# Reporte dado-fijo-tablero — dado fijo en el tablero + safezone de paneo ampliada
- Estado: REVIEW | Rama/commit: —
- Resumen (≤ 5 líneas):
  El dado pasa a ser un landmark FIJO del mundo: reposo `dice.rest [3.4, 6.2]` en
  content/ui/camera.json (apoyado a y = size/2); se elimina `diePosInFront` y todo el wiring
  `dieRestRef`/`getRest` (rig/CameraRig/shared/Board3D/Die3D ya no reposicionan el dado).
  Safezone: `overview.panLimit` 0,1→0,25 y el clamp de `explorePose` escala el offset 3D
  completo (dirección preservada ⇒ sin salto de elevación contra la pared de paneo).
- Archivos clave tocados (rutas):
  - content/ui/camera.json (dice.rest, panLimit 0,25, _status)
  - packages/content/src/ui.ts (UiCameraSchema dice.rest ±20 + crossCheckCamera: rest ≠ origen)
  - apps/web/src/theme/board3d.ts (sin die.posX/posZ)
  - apps/web/src/board3d/{die,rig,explore}.ts (dieRest del content; clampExplorePosition AC-6)
  - apps/web/src/board3d/{CameraRig.tsx,Board3D.shared.ts,Board3D.tsx,Die3D.tsx} (wiring fuera)
  - Tests: dado-fijo-tablero.test.ts (nuevo, 7); {rig,camara-libre-sin-ficha,die,camera}.test.ts,
    camara-libre-3d.test.ts y labels.test.ts actualizados
- AC cubiertos → test (dado-fijo-tablero/AC-n → archivo:test):
  - AC-1 → dado-fijo-tablero.test.ts:'AC-1 reposo fijo del mundo (dice.rest) sin wiring de cámara'
  - AC-2 → dado-fijo-tablero.test.ts:'AC-2 la tirada aterriza en el reposo fijo en cualquier pose'
  - AC-3 → dado-fijo-tablero.test.ts:'AC-3 zoom-in total: la cámara no pisa ni atraviesa el dado'
  - AC-4 → dado-fijo-tablero.test.ts:'AC-4 content sin claves muertas; rest = única fuente'
  - AC-5 → dado-fijo-tablero.test.ts:'AC-5 panLimit 0,25 ⇒ panBounds más allá del borde'
  - AC-6 → dado-fijo-tablero.test.ts:'AC-6 clamp del explore preserva la dirección del offset'
  - AC-7 → dado-fijo-tablero.test.ts:'AC-7 tests de diePosInFront reemplazados' (un test por AC)
- `pnpm verify`: OK — typecheck, lint, tests (board3d 153/153), content:validate (23 archivos),
  build, depcruise (343 módulos), size-limit (23,3/200 kB y 384,5/450 kB), benches OK.
- Decisiones tomadas / defaults aplicados:
  - Schema: `dice.rest` = tupla [x, z] acotada a ±20 (escala del mundo: tablero 11,76×16, domo 60);
    crossCheckCamera rechaza el origen (0,0) (quedaría en el centro del tablero).
  - AC-3 geométrico: con distanceRange[0]=3 y polarDegRange[0]=25°, la cámara orbita a
    y ≥ 1,39 > 0,7 (tope del dado) ⇒ nunca lo pisa ni lo atraviesa, en cualquier azimut.
  - AC-6: clamp escala el offset 3D completo (k≤1) desde el objetivo; azimut/elevación intactos.
    Caso extremo (objetivo pegado a la pared, cámara detrás): k→0, la cámara converge al objetivo
    de forma CONTINUA (sin snap); registrado en Q-048.
  - Die3D: se quitó también la prop `getRest` y el useFrame que perseguía el reposo (era el
    consumidor del wiring eliminado); el dado se mueve solo durante la tirada.
  - Tests afectados por la pared más lejos / pose inicial distinta: camara-libre-3d AC-1 (loop de
    8 pulsaciones para tocar la pared) y labels AC-3 ("lejos" a 1,2/−0,5 para seguir en viewport).
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados (→ effect-requests/):
  - Q-047: "safezone" interpretada como panLimit (no safeArea del layout).
  - Q-048: ¿paneo sin límites o basta pared a 0,25 + sin salto vertical?
- Riesgos / deuda: `pnpm shots` queda como chequeo visual del dueño (dado siempre en el mismo
  lugar del mapa y sin salto en la pared de paneo).
