# Reporte camara-libre-total — cámara libre total: sin centrado automático en la ficha
- Estado: REVIEW | Rama/commit: —
- Resumen (≤ 5 líneas):
  Explore centra el frustum en el safeArea (safeMix 1, criterio overview): ninguna ficha se
  auto-centra. tokenWorld queda reservado a la cámara de combate (follow/fork/transitionIn y la
  transitionOut que interpola). Las transiciones interpolan el safeMix desde el valor de origen
  (nuevo fromSafeMix) hacia el destino (follow 0 / explore+overview 1), sin snap en ningún extremo
  (también arregla el snap preexistente al entrar/salir del overview/free).
- Archivos clave tocados (rutas):
  - apps/web/src/board3d/rig.ts (explore safeMix 1; TransitionState.fromSafeMix + safeMixState)
  - apps/web/src/board3d/CameraRig.tsx (tokenWorld solo con battleCamera)
  - apps/web/src/board3d/camara-libre-total.test.ts (nuevo, 5 tests)
  - apps/web/src/board3d/rig.test.ts (AC-4/AC-1/AC-5/AC-6 de T-077 actualizados)
- AC cubiertos → test (camara-libre-total/AC-n → archivo:test):
  - AC-1 → camara-libre-total.test.ts:'AC-1 explore: frustum en el safeArea y paneo sin pinning'
  - AC-2 → camara-libre-total.test.ts:'AC-2 tokenWorld solo en follow/fork/transitionIn'
  - AC-3 → camara-libre-total.test.ts:'AC-3 transitionOut → explore interpola safeMix 0→1 sin snap'
  - AC-4 → camara-libre-total.test.ts:'AC-4 encuadre inicial + Centrar en mí, sin pinning posterior'
  - AC-5 → camara-libre-total.test.ts:'AC-5 battleCameraCue y zoom del popup intactos'
  - AC-6 → un test por AC-1..AC-5 con comentario // AC: camara-libre-total/AC-n (este archivo)
- `pnpm verify`: OK — 110 archivos / 579 tests verdes, lint, depcruise (342 módulos),
  content:validate (23 archivos), build, size-limit (23,4/200 kB y 384,5/450 kB) y benches OK.
- Decisiones tomadas / defaults aplicados:
  - safeMix interpola desde el último valor emitido (safeMixState) y no desde 0: evita snaps al
    entrar en combate desde explore/free (antes snap 1→0) y al volver.
  - transitionOut hacia explore interpola a 1 igual que hacia overview (un solo criterio).
  - camera.ts sin cambios (applyCenteredOffset/applySafeOffset los usa la cámara de combate).
- Dudas nuevas (→ OPEN-QUESTIONS.md) y ER solicitados (→ effect-requests/): ninguna.
- Riesgos / deuda: rig.ts queda en ~493 líneas (ya excedía las 400 antes de esta tarea).
