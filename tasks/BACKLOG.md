# BACKLOG
Estados: TODO · DOING · REVIEW · DONE. Modelo sugerido: **S** económico · **M** intermedio · **L** el más fuerte (lógica de reglas / spike de animaciones).
Prioridad transversal: **el combate con animación de ataques es requisito central** (ADR-6). Por eso el spike T-032c0 corre en paralelo desde G0 y los arquetipos propios (T-032c1) se construyen antes que el portado de Showdown.

| ID | Tarea | Spec | Deps | Modelo | Estado |
|---|---|---|---|---|---|
| T-001 | Scaffold monorepo, tooling, `pnpm verify` | A | — | S | DONE |
| T-002 | Esquemas Zod + loaders + `content:validate` (incl. `officialMove`/`fx`) | A | T-001 | M | DONE |
| T-003 | Grafo del tablero + verificación con overlay | A | T-002 | M | DONE |
| T-004 | RNG con semilla + log de dados + comandos/eventos base | A | T-001 | L | DONE |
| T-005 | Script `pnpm digest` | A | T-001 | S | DONE |
| T-006 | Barreras de calidad (tipos estrictos, lint, límites de import, peso, invariantes, logger, reporte de bug) | A | T-001, T-004 | M | DONE |
| T-043 | Assets (sprites + efectos) por script + ASSETS.md | E | T-001 | S | REVIDONEEW |
| **G0** | **Gate: revisión del jefe** | | T-001..006 | | |
| T-032c0 | **Spike animaciones Showdown** (paralelo a M1) | D | T-001, T-043 | L | DONE |
| **GS** | **Gate del spike** (decide alcance del adaptador) | | T-032c0 | | |
| T-010 | Estado inicial + Setup | B | G0 | M | DONE |
| T-011 | Movimiento: dado, bifurcaciones, cuadrados, rebote | B | G0 | L | DONE |
| T-012 | Casilleros, mazos, Centro/Mercado/Oak | B | T-011 | M | DONE |
| T-013 | Equipamiento, costos, inventario | B | T-010 | M | DONE |
| **G1** | **Gate** | | T-010..013 | | |
| T-020 | Núcleo de batalla y pipeline de daño | C | G1 | L | DONE |
| T-021 | Primitivas de efectos (set 1) | C | T-020 | L | DONE |
| T-022 | XP, evolución, captura, equipo y pila de Oak | C | T-020 | M | DONE |
| T-023 | Gimnasios 2v2, medallas, victoria | C | T-021,022 | M | DONE |
| T-024 | Test golden con ejemplos del manual | C | T-021 | L | DONE |
| T-011b | Ajuste D-19 (Q-007): solo frenar/caer exacto en **cuadrado** libera dirección; redondo exacto conserva `cameFrom` (motor T-011 + tests) | B | T-011 | M | REVIEW |
| **G2** | **Gate** | | T-020..024 | | |
| T-030 | App shell, store, reproductor de eventos | D | G1 | M | TODO |
| T-031 | Tablero SVG + ficha animada + UI de caminos | D | T-030 | M | TODO |
| T-032b | Dado 3D (también para el tablero) | D | T-030 | M | TODO |
| T-032c1 | FX base + 17 arquetipos propios + `/dev/fx` | D | T-030 | M | TODO |
| T-032a | Escena de combate + carta TCG + carta rival | D | T-030, T-043 | M | TODO |
| T-032d | Coreografía de eventos de combate | D | T-032a,b,c1, G2 | M | TODO |
| T-032c2 | Portado de movimientos de Showdown (si GS aprueba) | D | GS, T-032c1, T-046 | L/M | TODO |
| T-033 | Equipo / inventario / equipar / ficha de carta | D | T-030 | M | TODO |
| T-034 | Inicio, setup, guardado, ajustes | D | T-030 | S | TODO |
| **G3** | **Gate: combate jugable con animación (contenido de desarrollo)** | | T-030..034, T-032a..d | | |
| T-044 | `gen-dev-decks.ts` (mazos de desarrollo) | E | T-002 | S | REVIEW |
| T-045 | Datos de PokeAPI (`pnpm pokeapi`) | E | T-002 | S | TODO |
| T-040 | Herramienta `/admin/cards` (con vista previa de FX) | E | T-002, T-032c1 | M | TODO |
| T-041 | Extracción por visión (script + prompt) | E | T-002, T-045 | M | TODO |
| T-046 | Mapeo ataque → `officialMove`/`fx` | E | T-041, T-045 | M | TODO |
| T-042 | Lote piloto de 12 cartas → luego 40-60 | E | T-040,041 + fotos | humano+M | TODO |
| **G4** | **Gate de contenido** | | T-040..046 | | |
| T-050 | Presupuesto de peso, code-splitting, PWA opcional, despliegue **privado** (PRIVACY-DEPLOY) | D | G3, G4 | M | TODO |
| **G5** | **Release privado** | | T-050 | | |

Notas de orden:
- Para tener datos de desarrollo temprano, T-044 puede adelantarse a T-030.
- T-040..042, T-045 y T-046 corren en paralelo con la UI.
- Si el gate GS rechaza el adaptador, T-032c2 se cancela; el juego conserva animación de ataques con los arquetipos.
