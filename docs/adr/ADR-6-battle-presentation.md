# ADR-6 — Presentación del combate: escenario animado + carta TCG + dado 3D + animación de ataques
Estado: **aprobado por el dueño** (requisito central del producto) · Fecha: 2026-10-08

## Contexto
El juego de mesa se juega con cartas, pero el dueño quiere la inmersión de los juegos de Game Boy (sprites animados, efectos de ataque) sin perder la identidad de carta. El motor ya emite eventos, por lo que la presentación es 100 % capa de UI.

## Decisión
1. **Escenario** estilo Game Boy: sprites animados (frente rival, espalda propio), placas con nombre/HP, fondo de arena, capa FX superpuesta.
2. **Carta TCG** del PKM activo = menú de ataques. Se renderiza desde datos (marco por mazo, HP actual/máx, costos con íconos, filas de ataque con `rollFaces`). Tocar un ataque lo previsualiza (efecto en texto); botón "Usar" confirma. La carta se levanta al atacar.
3. **Carta del rival** visible: cuando el dado elige su ataque, esa fila se ilumina con el valor tirado.
4. **Dado 3D** (cubo CSS 3D, sin librería) sobre una mesa con fieltro dentro de la escena; mismo componente en el tablero. El valor lo dicta el motor; la animación aterriza en esa cara.
5. **Animación de ataques** en dos capas (docs/FX-ADAPTER.md): adaptador de animaciones de Pokémon Showdown para el movimiento oficial (`officialMove`) + 17 arquetipos propios como respaldo permanente.
6. **FX en DOM + Web Animations/Motion** por defecto. `pixi.js` solo si el spike T-032c0 demuestra que hace falta (se carga con `import()` dentro del chunk de combate).

## Consecuencias
- Motor y reglas intactos. T-032 se divide en T-032a/b/c0/c1/c2/d.
- Nuevo campo de datos por ataque: `officialMove`, `officialMoveStatus`, `fx`.
- Assets (sprites, imágenes de efectos) descargados por script, fuera del repo (ADR-7).
- Riesgo principal: portar animaciones de Showdown → spike temprano (gate GS) y respaldo propio siempre activo.
- Presupuesto: el chunk de combate es lazy; el JS inicial sigue ≤ 200 KB gzip.

## Alternativas descartadas
Solo cartas (poca inmersión) · solo sprites sin carta (pierde el juego de mesa) · Phaser/three.js completos (peso y complejidad sin necesidad).
