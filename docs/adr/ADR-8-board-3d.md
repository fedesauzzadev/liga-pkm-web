# ADR-8 — Tablero 3D con React Three Fiber
Estado: aprobado por el dueño · Fecha: 2026-10-10

## Contexto
El tablero actual es 2D (SVG, T-031). El dueño quiere un tablero digital en 3D con fichas que se mueven, mazos con cartas que se roban con animación y un dado sobre la mesa.

## Decisión
- Tablero 3D con **three.js + @react-three/fiber (R3F) + @react-three/drei**, todos MIT. R3F v9 pide React 19 y three ≥ 0.159; usar las versiones compatibles con las de React del proyecto.
- Se carga con `import()` **solo al entrar a la partida** (pantalla de carga mientras tanto). El JS del shell inicial mantiene su presupuesto (200 KB gzip); el chunk 3D tiene presupuesto propio inicial de **450 KB gzip** (estimación a ajustar con medición real en `size-limit`).
- **Tablero guiado por datos**: se genera de `content/board/kanto.json` + `content/board/deck-stacks.json`; sin modelos 3D externos en el MVP (geometrías simples y materiales procedurales). Texturas/modelos CC0 (p. ej. Poly Haven, Kenney) son opcionales, con licencia verificada y registrada en `docs/ASSETS.md`.
- Las cartas **no** se dibujan como texturas 3D: al robar, una carta DOM (`<PkmCard>`/`<EnergyCardFace>`/`<ItemCardFace>`) vuela desde la posición proyectada del mazo. Es nítida, accesible y reutiliza lo ya hecho.
- Render bajo demanda (`frameloop="demand"`) cuando no hay animación; `dpr` limitado a [1, 2]; sombras solo "blob" bajo fichas y mazos.
- **Fallback**: si no hay WebGL o el dispositivo es muy lento, se usa el tablero 2D SVG existente. Ambos consumen el mismo estado y los mismos eventos.
- Dado: componente 3D propio con resultado dictado por el motor (tabla valor → orientación). `@3d-dice/dice-box-threejs` (permite forzar el resultado) es una alternativa solo si se verifica su licencia.

## Consecuencias
- Dependencias nuevas aprobadas, **solo dentro del chunk 3D**: `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`.
- El motor no cambia. Hay que respetar `docs/NO-VISION.md` (verificación sin imágenes).
- Riesgo: ajuste visual sin ver ⇒ valores numéricos en el spec, volcado de escena en texto y revisión humana con capturas.
