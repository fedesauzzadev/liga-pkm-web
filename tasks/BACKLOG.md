# BACKLOG
Estados: TODO · DOING · REVIEW · DONE. Modelo sugerido: **S** económico · **M** intermedio · **L** el más fuerte (lógica de reglas / spike de animaciones).
Prioridad transversal: **el combate con animación de ataques es requisito central** (ADR-6). "Comodín" ahora se llama **Multicolor** (D-23). Contenido real: fotos de todas las cartas (SPEC-F).

| ID | Tarea | Spec | Deps | Modelo | Estado |
|---|---|---|---|---|---|
| T-001 | Scaffold monorepo, tooling, `pnpm verify` | A | — | S | DONE |
| T-002 | Esquemas Zod + loaders + `content:validate` (incl. `officialMove`/`fx`) | A | T-001 | M | DONE |
| T-002b | Esquemas del contenido nuevo (multicolor, decks/items/energy/gyms, variantes, efectos nuevos) | F | T-002 | M | DONE |
| T-003 | Grafo del tablero + verificación con overlay | A | T-002 | M | DONE |
| T-004 | RNG con semilla + log de dados + comandos/eventos base | A | T-001 | L | DONE |
| T-006 | Barreras de calidad (tipos estrictos, lint, límites, peso, invariantes, logger, bug report) | A | T-001, T-004 | M | DONE |
| T-005 | Script `pnpm digest` | A | T-001 | S | DONE |
| T-043 | Assets (sprites + efectos) por script + ASSETS.md | E | T-001 | S | REVIDONEEW |
| T-042a | Recorte automático de cartas desde las fotos + hojas de contacto | F | T-001 | M | DONE |
| **G0** | **Gate: revisión del jefe** | | T-001..006, T-002b | | |
| T-032c0 | **Spike animaciones Showdown** (paralelo a M1) | D | T-001, T-043 | L | DONE |
| **GS** | **Gate del spike** | | T-032c0 | | |
| T-010 | Estado inicial + Setup | B | G0 | M | DONE |
| T-011 | Movimiento: dado, bifurcaciones, cuadrados, rebote | B | G0 | L | DONE |
| T-012 | Casilleros, mazos, Centro/Mercado/Oak | B | T-011 | M | DONE |
| T-013 | Equipamiento, costos, inventario (Multicolor) | B | T-010 | M | DONE |
| **G1** | **Gate** | | T-010..013 | | |
| T-020 | Núcleo de batalla y pipeline de daño | C | G1 | L | DONE |
| T-021 | Primitivas de efectos (set 1, incl. `fixedRolls`, `nextAttackBonus`, `onRoll`) | C | T-020 | L | DONE |
| T-022 | XP, evolución, captura, equipo y pila de Oak | C | T-020 | M | DONE |
| T-023 | Gimnasios 2v2, medallas, victoria | C | T-021, T-022 | M | DONE |
| T-024 | Test golden con ejemplos del manual | C | T-021 | L | DONE |
| T-049 | Ítems, mazo Sorpresa, Oportunidad, Ultra/Master Ball | F | T-022, T-023 | L | DONE |
| **G2** | **Gate** | | T-020..024, T-049 | | |
| T-044 | Mazos de desarrollo (energías e ítems reales) | E | T-002b | S | DONE |
| T-030 | App shell, store, reproductor de eventos | D | G1 | M | DONE |
| T-060 | **Diagnóstico**: por qué los casilleros no hacen nada (`/diagnostica tablero`) | G | — | M | DONE |
| T-061 | Casilleros que funcionan de punta a punta (motor + panel + e2e, sin 3D) | G | T-060 | L | DONE |
| T-071 | Shell de pantalla completa (sin scroll, HUD de vidrio, F11) | I | T-030 | M | DONE |
| T-031 | Tablero SVG + ficha animada + UI de caminos | D | T-030 | M | DONE |
| T-062 | Tablero 3D (R3F): base, nodos, mazos, cámara, fallback 2D | G | T-061, T-030, T-071 | M | DONE |
| T-063 | Fichas y movimiento animado por el camino | G | T-062 | M | DONE |
| T-076 | Cámara inmersiva (zoom in al tirar, seguir, zoom out) | I | T-063 | L | DONE |
| T-032b | Dado 3D (también para el tablero) | D | T-030 | M | DONE |
| T-032c1 | FX base + 17 arquetipos propios + `/dev/fx` | D | T-030 | M | DONE |
| T-047 | Íconos de energía: `EnergyIcon`, `CostRow`, `EnergyToken`, `/dev/icons` | F | T-030 | S | DONE |
| T-032a | Escena de combate + carta TCG + carta rival | D | T-030, T-043, T-047 | M | DONE |
| T-064 | Animación de robar carta (pila → carta DOM → decisión/inventario) | G | T-062, T-061, T-047 | M | DONE |
| T-065 | Dado 3D sobre el tablero | G | T-062, T-032b | M | DONE |
| T-074 | Equipo (6 slots), jugadores, turno, botón Oak y menú | I | T-071 | M | DONE |
| T-072 | Panel de historial de acciones | I | T-071, T-061 | M | DONE |
| T-073 | Mochila con arrastrar y soltar (5 filas) | I | T-071, T-047 | M | DONE |
| T-075 | Popups: carta obtenida, combate e intercambio | I | T-071, T-032a, T-064 | M | DONE |
| T-032d | Coreografía de eventos de combate | D | T-032a, T-032b, T-032c1, G2 | M | DONE |
| T-033 | Ficha de carta (`CardDetail`), evolucionar y lógica de equipar (los paneles del HUD son T-073/T-074) | D | T-030, T-047 | M | DONE |
| T-034 | Inicio, setup, guardado, ajustes | D | T-030 | S | DONE |
| T-066 | Verificación visual guiada (`pnpm shots` + métricas + qué mirar) | G | T-062 | S | DONE |
| **G3** | **Gate: partida jugable con tablero 3D y combate animado (contenido de desarrollo)** | | T-030..034, T-032a..d, T-047, T-060..066, T-071..076 | | |
| T-067 | Casilleros con relieve, glifos y camino de tierra (3D) | H | T-062 | M | DONE |
| T-068 | Decoración: casitas de Pueblo Paleta, Centros, Mercados, gimnasios y relleno de zonas | H | T-067 | M | DONE |
| T-069 | Mundo continuo: terreno, biomas, horizonte, cielo y perfil bajo | H | T-062, T-076 | M | DONE |
| T-077 | Cámara de exploración: más cerca, giro 360° y teclas | J | T-076 | M | DONE |
| T-085 | **URGENTE** Cámara: ángulo de picada real (hoy es casi cenital) | M | T-077 | M | REVIEW |
| T-086 | **URGENTE** Modelos negros: diagnóstico y arreglo + `pnpm models:check` | M | T-070 | M | REVIEW |
| T-087 | **URGENTE** Tamaño y huella de modelos, sin tapar nodos ni caminos | M | T-086 | M | CANCELADA |
| T-088 | **URGENTE** Etiquetas sin cortes y manchas de niebla sin píxeles | M | T-069 | S | REVIEW |
| T-089 | Reubicar edificios a los costados del camino (placements.json, sin tocar nodos ni caminos) | N | T-085 | L | REVIEW |
| T-090 | Quitar pedestales Ítem/Sorpresa y origen de cartas desde el nodo | N | T-089 | S | REVIEW |
| T-091 | Modelos nuevos `gim`, `pokecenter`, `pokemart`, `league` en tamaños conservadores | N | T-089, T-086 | M | REVIEW |
| T-092 | Dado 3D fijo en un panel del HUD (fuera del tablero) | N | T-071 | M | REVIEW |
| T-093 | Cierre visual del MVP (capturas, checklist, congelar el aspecto) | N | T-089..T-092, T-088 | S | REVIEW |
| T-094 | **Usar de verdad** los modelos nuevos (`models:use-new`, fallback ruidoso, insignia de debug) | O | T-091 | M | DONE |
| T-095 | Decoración sin solapamientos: mapa de ocupación único, agua limpia, una zona por objeto, `decor:report` | O | T-094 | L | DONE |
| T-096 | Manchas de zona sin volúmenes translúcidos ni bloques | O | T-095 | S | DONE |
| T-097 | Etiquetas siempre encima y legibles | O | T-095 | S | REVIEW |
| T-099 | Ajustes finales: modelo `oak`, eliminar edificios negros procedurales, +20 % de tamaño a modelos nuevos | P | T-094 | M | REVIEW |
| T-100 | Materiales fieles de los modelos nuevos: alfa real, sin sombras negras, sin contornos, bisección de causa | Q | T-099 | M | REVIEW |
| T-101 | Carta grande del Pokémon (ventana legible con ataques, costos y energías sin scroll) | R | T-033, T-047 | M | TODO |
| T-108 | Mostrar resultado del combate (overlay + Continuar) antes de cerrar la pantalla | plan mostrar-resultado-combate | T-032d, T-075 | S | REVIEW |
| T-109 | Rediseño de la pantalla de combate maximizada + popup chico (lienzo 1440×810, dado por lado que siempre rueda, daño cero, cartas fijas, EFECTO/Usar fuera, pestañas) | `.opencode/plan/rediseno-combate-max.md` | T-032d, T-075 | L | REVIEW |
| T-110 | Loader de sprites: integrar trainers.json | D | T-098 | S | DOING |
| T-111 | Motor: evento TrainerAppeared | C | T-110 | M | DONE |
| T-112 | UI: Coreografía de aparición del entrenador | D | T-111 | M | DONE |
| T-113 | Split de deuda de archivos > 400 líneas (es.ts, PlayScreen.tsx, CardsAdmin.tsx) + chequeo decks.json en /admin/cards (Q-031/Q-036/Q-056/Q-103) | `.opencode/plan/resolver-open-questions.md` | — | M | TODO |
| T-098 | Cierre visual final (reportes, checklist, congelar aspecto) | O | T-094..T-097, T-099, T-100, T-101 | S | REVIEW |
| T-102a | Lector de escaneos: base, normalización y segmentación por líneas (`pnpm cards:scan`) | S | T-002b | M | REVIEW |
| T-102b | Lector: OCR gratis (tesseract.js) y análisis de ataques, pie y validaciones | S | T-102a | M | REVIEW |
| T-102c | Lector: íconos (elemento, costos, mazo) con aprendizaje por agrupación y etiquetado único | S | T-102b | M | REVIEW |
| T-102d | Lector: mapeador texto → efectos con `effect-patterns.json` | S | T-102b | M | REVIEW |
| T-102e | Lector: JSON validado, reporte HTML, carta de oro (Dratini) y medición | S | T-102c, T-102d | M | REVIEW |
| T-102f | (Opcional) Respaldo con modelo de visión (local o con capa gratuita) | S | T-102e | S | TODO |
| T-103 | Lector v2: medición y diagnóstico por etapa (`pnpm cards:eval`), comparación de motores de OCR | T | T-102e | M | REVIEW |
| T-104 | Lector v2: nombre y mazo desde el nombre del archivo + segmentación por perfil (gimnasio/Liga) | T | T-103 | M | REVIEW |
| T-105 | Lector v2: reconocedor aprendido de números y caras (HP, daño, dados) | T | T-104 | M | REVIEW |
| T-106 | Lector v2: preproceso, mejor motor de OCR y corrección por vocabulario aprendido | T | T-103 | M | REVIEW |
| T-107 | Lector v2: relectura iterativa, sugerencias de un clic y meta de aceptación | T | T-105, T-106 | M | TODO |
| T-082 | Pulido del HUD (panel de turno cortado, botones duplicados, tamaños) | J | T-071, T-074 | S | DONE |
| T-078 | Etiquetas inteligentes (tamaño fijo, prioridad, sin solaparse) | J | T-062 | M | DONE |
| T-083 | Escala del mundo parametrizada (`toWorld`, `worldScale`, velocidad por distancia, capturas comparativas) | L | T-077, T-085, T-087 | M | CANCELADA |
| T-084 | Ciudades como plazas con slots de edificios + caminos curvos | L | T-083 | M | CANCELADA |
| T-079 | Terreno y biomas rehechos + horizonte + arbolado | J | T-069 | M | DONE |
| T-080 | Luz y materiales cartoon (toon, sombras, contornos, niebla suave) | J | T-079 | M | DONE |
| T-070 | **Modelos Kenney CC0** (catálogo, clasificación, galería `/dev/models`, importación selectiva). Después de T-080 | K | T-068, T-080 | M | DONE |
| T-081 | Densidad y vida: props en caminos, Pokémon decorativos, efectos de ambiente | J | T-068, T-079 | L | TODO |
| T-045 | Datos de PokeAPI (`pnpm pokeapi`) | E | T-002b | S | DONE |
| T-040 | Herramienta `/admin/cards` (con vista previa de FX) | E | T-002b, T-032c1 | M | DONE |
| T-041 | Extracción por visión sobre los recortes | E | T-002b, T-042a, T-045 | M | DONE |
| T-042b | Piloto de 12 cartas (mide errores, ajusta prompt) | F | T-040, T-041 | humano+M | DONE |
| T-046 | Mapeo ataque → `officialMove`/`fx` | E | T-041, T-045 | M | DONE |
| T-048 | Ediciones de la casa (parches sobre cartas) | F | T-002b, T-040 | M | DONE |
| T-042c | Carga completa de las ~266 cartas + `build-decks` | F | T-042b, T-046 | humano+M | TODO |
| T-032c2 | Portado de movimientos de Showdown (si GS aprueba) | D | GS, T-032c1, T-046 | L/M | DONE |
| **G4** | **Gate de contenido** | | T-040..049 | | |
| T-050 | Presupuesto de peso, code-splitting, despliegue **privado** (PRIVACY-DEPLOY) | D | G3, G4 | M | TODO |
| **G5** | **Release privado** | | T-050 | | |

Notas de orden:
- **Aspecto congelado (SPEC-O/T-098/AC-3):** el aspecto visual del tablero 3D queda congelado; cualquier cambio visual posterior = tarea nueva (decisión del dueño; restaurada por T-099, pérdida en el merge-backlog — Q-077/Q-089).
- **Lector v2 (SPEC-T):** T-103 → T-104 → T-105 → T-106 → T-107. No re-fotografiar ni corregir a mano hasta terminar T-104/T-107 (salvo la carta desteñida de Charmander).
- **Lector de cartas (SPEC-S):** T-102a → b → c → d → e (f opcional). Reemplaza a T-041 y T-042a para escaneos individuales; el piloto de T-042b se hace con las primeras 20 cartas del lector. Se corre en paralelo con el resto: no depende del motor ni de la UI.
- **Carta del Pokémon (SPEC-R):** T-101 reemplaza el panel angosto actual por una ventana grande y legible; va antes del cierre T-098.
- **Materiales fieles (SPEC-Q):** T-100 va después de T-099 y antes del cierre T-098. Primero probar apagando los contornos en style.json (2 minutos) para saber si ese es el origen.
- **Ajustes finales (SPEC-P):** T-099 va antes del cierre T-098.
- **Modelos y solapamientos (SPEC-O):** T-094 → T-095 → T-096 → T-097 → T-098. La cámara y la vista están bien: no se tocan.
- **Cierre visual del MVP (SPEC-N):** T-085 → T-088 → T-089 → T-090 → T-091 → T-092 → T-093. T-083 y T-084 (escala/plazas) y T-087 quedan **CANCELADAS** por decisión del dueño: nodos y caminos no cambian. T-086 se conserva (también valida los modelos nuevos).
- **Correcciones urgentes (SPEC-M):** hacer T-085 → T-086 → T-087 → T-088 antes de T-083/T-084 y de seguir decorando. Usar `/diagnostica-visual` para investigar sin ver imágenes.
- **Escala y ciudades (SPEC-L):** T-083 y T-084 van antes de T-079, T-070 y T-081, porque terreno, modelos y decoración dependen de las distancias. Orden de la mejora visual: T-077 → T-082 → T-078 → **T-083 → (elegir escala) → T-084** → T-079 → T-080 → T-070 → T-081.
- **T-070 usa `specs/SPEC-K-kenney-models.md`** (packs descomprimidos en `assets-src/kenney/`; el dueño revisa la galería `/dev/models`).
- **Mejora visual (SPEC-J):** T-077 → T-082 → T-078 → T-079 → T-080 → (bajar packs CC0) T-070 → T-081. Después de cada una, `pnpm shots` y mirar lo que indica `specs/SPEC-J-visual-polish.md`.
- **Orden de la fase de pantalla:** primero que el juego funcione (T-060, T-061), después el shell de pantalla completa (T-071), el tablero 3D y la cámara inmersiva (T-062, T-063, T-076), los paneles (T-074, T-072, T-073, T-075) y al final el pulido (T-067…T-070, solo decoración).
- Los paneles del HUD y la cámara están descritos en `specs/SPEC-I-hud-and-camera.md` y `content/ui/*.json` (el worker no lee imágenes).
- **Si los casilleros hoy no hacen nada, hacé primero T-060 y T-061** (aunque la fase 3 esté a medio camino); el tablero 3D (T-062 en adelante) viene después y se trabaja según `docs/NO-VISION.md`.
- T-042a, T-045, T-040, T-041 y T-042b son independientes del motor: pueden hacerse en paralelo con las fases 1-3 (en una sesión aparte).
- Si el gate GS rechaza el adaptador, T-032c2 se cancela; el juego conserva animación de ataques con los arquetipos.
- Para pasar estados de un backlog viejo al nuevo: `node tools/merge-backlog.mjs`.
