# Fix: el dado muestra la cara equivocada (salía 4 y mostraba 2 puntos)

## Objetivo
Que el dado del panel (HUD, anclado a la izquierda) muestre la cara correcta del valor que dicta el motor. Hoy `orientationMap` tiene invertidas las rotaciones de 2 y 4 respecto de las caras del CSS: al salir 4 el cubo gira `rotateY(-90deg)` y trae al frente la cara `right` (2 puntos).

## Criterios de aceptación
- [ ] AC-1: Para cada valor 1..6, la rotación del cubo en `orientationMap` es la inversa de la transformada CSS de la cara que contiene ese valor (2 ⇒ `rotateY(-90deg)` trae `right`; 4 ⇒ `rotateY(90deg)` trae `left`; 3/5 y 1/6 ya estaban OK).
- [ ] AC-2: `Die3D` renderizado con `value={4}` termina con transform `rotateY(90deg)` y con `value={2}` con `rotateY(-90deg)` (test sobre el `style` serializado o el mapa exportado).
- [ ] AC-3: Los tests existentes de `Die3D` y `DicePanel` siguen verdes; no se cambia lógica del motor ni del panel.
- [ ] AC-4: `pnpm verify` verde.

## Archivos involucrados
- `apps/web/src/board/Die3D.tsx` — `orientationMap` (líneas 21-28): swap de las entradas 2 y 4; exportar el mapa si el test lo necesita.
- `apps/web/src/board/Die3D.test.tsx` — nuevo test tabla por valor (AC-2), con comentario `// AC: fix-dado-cara/AC-2`.
- `apps/web/src/board/Die3D.module.css` — solo lectura de referencia (caras: front=1, right=2, back=6, left=4, top=3, bottom=5).
- `apps/web/src/hud/DicePanel.tsx` — sin cambios (cablea `rollTo(value)`; el bug está en el mapa, no acá).

## Plan de pasos
1. Escribir el test tabla en `Die3D.test.tsx`: para cada valor, transform esperado (1: `rotateX(0deg) rotateY(0deg)`, 2: `rotateY(-90deg)`, 3: `rotateX(-90deg)`, 4: `rotateY(90deg)`, 5: `rotateX(90deg)`, 6: `rotateY(180deg)`).
2. Correr el test y verificar que falla para 2 y 4 (reproduce el bug).
3. Corregir `orientationMap`: swap de las rotaciones de 2 y 4.
4. Verificar suite completa.

## Comandos de verificación
- `pnpm test -- Die3D`
- `pnpm test -- dice-panel`
- `pnpm verify`
