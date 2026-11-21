# SDD — LIGA PKM Web (Software Design Document)
Versión 0.1 · Autor: Claude (jefe/arquitecto) · Estado: propuesto, pendiente de gate G0

## 1. Propósito y alcance
Digitalizar el juego de mesa LIGA POKEMON (manual v. sugimoriARG) como juego web.
- **MVP-0 (este SDD detalla)**: 1 jugador, sin rivales. Modo **Partida Clásica** (8 medallas). Tablero completo navegable, mazos, mercado, Centro PKM, Prof. Oak, combates vs PKM salvajes, captura, experiencia/evolución, inventario/elementos, gimnasios (2 PKM por líder), guardado local.
- **Fuera del MVP-0** (diseñado para no bloquearlo): Duelo PKM, multijugador local/online, IA rival, Modo Historia (Sorpresa, Liga, Pokedex de tipos), PWA offline.
- Solo los 151 PKM de Kanto.

## 2. Atributos de calidad (medibles)
| Atributo | Objetivo |
|---|---|
| Peso inicial | JS de arranque ≤ 200 KB gzip; escena de combate y herramientas admin con code-splitting; sprites bajo demanda |
| Fluidez | 60 fps en móvil medio; animaciones con `transform`/`opacity` |
| Determinismo | Misma semilla + mismos comandos ⇒ misma partida (tests de replay) |
| Móvil primero | Usable en 360×640 y en escritorio; controles táctiles ≥ 44 px |
| Mantenibilidad | Motor puro 100 % testeable; cobertura de líneas del motor ≥ 90 % |
| Accesibilidad | `prefers-reduced-motion`, contraste AA, navegación por teclado en menús |

## 3. Arquitectura
Monorepo pnpm:
```
apps/web            Vite + React + TS (UI, escenas, animaciones, persistencia)
  src/battle/{scene,cards,dice,fx,choreo}  Escena de combate híbrida (ADR-6)
packages/engine     Motor de reglas puro (sin DOM). Depende solo de packages/content (tipos)
packages/content    Esquemas Zod, tipos, loaders, CLI `content:validate`
content/            JSON de datos (tablero, cartas, decks, ruleset)
tools/              board-overlay.html, scripts (sprites, extracción por visión, digest)
docs/ specs/ tasks/
```
Dirección de dependencias (impuesta por ESLint `no-restricted-imports`): `web → engine → content`. `content` no importa nada.

Patrón: **comando → reductor → eventos**. La UI nunca muta estado; envía comandos y reproduce eventos.
```ts
interface Rng { d6(): 1|2|3|4|5|6; snapshot(): number }          // mulberry32 con semilla
type Ctx = { content: Content; rng: Rng };
function applyCommand(s: GameState, c: Command, ctx: Ctx): Result<{ state: GameState; events: GameEvent[] }, EngineError>;
function legalCommands(s: GameState, ctx: Ctx): Command[];        // para UI, tests y futura IA
```
- `GameState` es JSON puro e inmutable (se permite `immer` dentro del reductor).
- `state.pending: Decision | null` = lo que el motor espera del jugador (elegir camino, parar/seguir, elegir ataque…). Si `pending` es null, el motor avanza solo con `Advance`.
- Cada tirada produce `DieRolled{purpose,value}` (purpose: `move|attackSelect|gate|effect|wake|dodge|bonus`). El log de dados + semilla permiten replay.
- Guardado = `{ version, seed, commandLog }` (+ snapshot cada N comandos). Migraciones por `version`.

### Futuro multijugador/IA (no implementar ahora, no bloquear)
Un servidor autoritativo (PartyKit/Colyseus/Node) corre el mismo `engine`; los clientes envían comandos. La IA es una función `chooseCommand(state, legalCommands)`. El estado ya incluye `players[]` y `activePlayerId`.

## 4. Modelo de dominio (tipos núcleo; versión canónica en `packages/content`)
```ts
type DeckId = 'bosque'|'montana'|'isla'|'llanura'|'pantano';
type Element = 'normal'|'fire'|'water'|'grass'|'electric'|'psychic'|'fighting'|'poison'|'ground'|'flying'|'bug'|'ghost'|'ice'|'rock'|'dragon';
type CostSlot = Element | 'any';            // 'any' = ícono gris "cualquier elemento"
type Faces = (1|2|3|4|5|6)[];

interface PokemonCard {
  id: string; dex: number; variant?: string; name: string;     // el dex puede repetirse (variantes _a, _b)
  stage: 'basic'|'evolution'|'gym'|'league'|'surprise';
  deck: DeckId|'gimnasio'|'liga'|'sorpresa'|'evolucion';
  hp: number; element: Element;
  attacks: Attack[]; specialties: Effect[];                  // especialidades = efectos pasivos permanentes
  evolvesTo: { id: string; xp: number }[];                   // "E: Kingler (3)"
  chances?: number;                                          // "Oportunidad" (Sorpresa)
  // art/sprite: se resuelve por `dex` vía sprites.json (no se guarda en la carta)
  gym?: { leader: string; slot: 1|2 };
  source: { manualPage?: number; photo?: string; verified: boolean };
}
interface Attack {
  id: string; name: string; kind: 'attack'|'ability';        // ability = texto en cursiva y entre comillas
  rollFaces: Faces;            // "4-5_": qué dado elige este ataque para PKM salvaje/gimnasio
  cost: CostSlot[];            // vacío para salvajes/gimnasio
  element: Element;            // 'normal' = ataque normal (sin elemento)
  damage: { base: number; ifRoll?: { faces: Faces; damage: number } };   // "(10) 4-5-6 (20)"
  effects: Effect[];           // ver docs/EFFECTS.md
  rawText: string;             // texto original de la carta (trazabilidad)
  officialMove?: string;       // id de movimiento oficial (PokeAPI/Showdown, ej. 'flamethrower') → animación real
  officialMoveStatus?: 'proposed'|'verified'|'unmapped';
  fx?: FxArchetype;            // arquetipo de respaldo propio (docs/FX-ADAPTER.md)
  canOpen?: boolean;           // "Podés empezar con este ataque"
}
interface PlayerState {
  id: string; position: string; cameFrom: string|null;       // nodo actual y de dónde vino (regla de no retroceder)
  team: PkmInstance[];         // máx 6
  oakPile: PkmInstance[];      // "hogar del Prof. Oak"
  elements: ElementCard[];     // sueltas; las equipadas viven en PkmInstance.equipped
  multicolor: number; items: { pokeball: number; potion: number; /* … */ };
  medals: string[];
}
interface PkmInstance { uid: string; cardId: string; damage: number; xp: number; equipped: ElementCard[]; status: PkmStatus; fainted: boolean }
```
Estados de combate (condiciones temporales) viven en `BattleState`, no en `PkmInstance`, y se limpian al retirar/derrotar (ver RULES §Combate).

## 5. Máquinas de estado
**Turno (MVP-0):**
`Setup(elegir inicial) → Organize → AwaitRoll → Moving → TileResolution → TurnEnd → Organize…`
- `Organize`: equipar/reasignar energías y cartas Multicolor, evolucionar (si cumple XP), usar pociones fuera de combate, reordenar equipo.
- `Moving`: por cada paso; si el nodo siguiente tiene >1 salida (excluyendo `cameFrom`) ⇒ `Decision.ChoosePath`; si el jugador pasa por un nodo **cuadrado** con pasos restantes ⇒ `Decision.StopOrContinue`. Los nodos redondos solo aplican efecto si se cae exacto. Fin de camino ciego ⇒ rebote (D-01).
- `TileResolution` según tipo de nodo: `deck` (robar), `mercado` (robar ítem), `centro` (curar todo), `oak` (intercambiar equipo/pila), `gym` (opcional: pelear), `empty`, y (deshabilitados por ruleset) `duelo`, `sorpresa`, `liga`.

**Encuentro (robar de un mazo):** `Draw → ElementCard? → inventario | PkmCard? → Decision.FightOrRelease → Battle → (ganó) Decision.CaptureOrRelease | (perdió todo) el PKM escapa`.

**Batalla (turno de un lado):**
`TurnStart → PoisonTick/Drain → WakeRoll (si dormido) → ActionPhase{potion*, retire | attack} → AttackResolution → FaintCheck → SwitchSide`
`AttackResolution`: (1) elegir ataque (jugador elige; salvaje/gimnasio: dado `attackSelect` por `rollFaces`; sin coincidencia = no ataca) → (2) **dado de condiciones previas** (`gate`, una sola tirada por turno con unión de caras fallidas) → (3) esquiva defensiva (`dodge`) → (4) dado de efecto del ataque (`effect`, solo si el ataque lo requiere) → (5) cálculo de daño (pipeline en EFFECTS §Daño) → (6) aplicar efectos → (7) ¿`attackAgain`? Detalle en `docs/EFFECTS.md`.

## 6. Contenido y datos
- `content/ruleset.classic.json`, `content/board/kanto.json` (**borrador sin verificar**), `content/pokemon/*.json` (un archivo por mazo + `evolutions.json` + `gyms.json`), `content/items.json`, `content/decks.json` (composición de cada mazo: ids y cantidades; los elementos son cartas simples por tipo).
- Todo se valida con `pnpm content:validate` (Zod + chequeos cruzados: evoluciones existentes, ids únicos, grafo conexo, 151 dex sin duplicados cuando esté completo).
- Ingesta de cartas físicas: `docs/CARD-INGESTION.md`.
- Mientras no existan todas las cartas: `tools/gen-dev-decks.ts` arma mazos de desarrollo con lo disponible (marcados `devOnly`).

## 7. UI / UX
Estética: homenaje a Rojo/Azul (Game Boy Color): paleta del tablero por mazo (blanco/azul/negro-violeta/rojo/verde), tipografía pixel legible (p. ej. "Press Start 2P" solo en títulos; cuerpo legible), bordes gruesos.
Escenas (rutas): `/` título/carga · `/setup` elegir inicial · `/play` (Tablero + panel lateral/hoja inferior en móvil) · overlay `Encounter/Battle` · overlays `Team`, `Inventory`, `CardDetail` · `/admin/cards` (herramienta, code-split, no enlazada en producción).
- **Tablero**: SVG generado desde `kanto.json` (aristas como trazos, nodos con íconos), ficha del jugador animada por camino (tween por tramos), resaltado de caminos posibles, panel de dado con tirada animada.
- **Combate híbrido** (ADR-6, requisito central): arriba el **escenario** estilo Game Boy (sprites animados de frente/espalda, placas de nombre y barra de vida, capa de efectos); abajo la **carta TCG** del PKM activo como menú de ataques (se dibuja desde datos, no con fotos); a un costado la **mesa del dado** con un dado 3D que rueda y cae en el valor que dicta el motor. El rival muestra su carta y, cuando el dado elige su ataque, esa fila se ilumina.
- **Capas de la escena (z-order)**: fondo de arena → sprites → capa FX (overlay, `pointer-events:none`) → placas/HUD/caja de texto → bandeja de carta y mesa del dado. Móvil: carta como hoja inferior plegable; escritorio: carta a la izquierda.
- **Cola de eventos**: `EventPlayer` consume `GameEvent[]` en orden; cada tipo tiene `play(event): Promise<void>` en `battle/choreo`; velocidad 1×/2×/saltar; duraciones en `anim.config.ts`.
- **Animación de ataques**: `playMoveFx(ctx)` resuelve en este orden: (1) adaptador Showdown si el `officialMove` está portado, (2) arquetipo propio por `fx`, (3) arquetipo por elemento. Nunca lanza error y nunca decide un resultado. Detalle: `docs/FX-ADAPTER.md`.
- Coreografía mínima del MVP (T-032d): entrada de encuentro, dado → fila de ataque, texto "X usó Y", carta se levanta, FX del ataque, daño (parpadeo ×3, número flotante, barra), estados con ícono, curación/drenaje, derrota, XP, evolución, captura (arco, 3 sacudidas, destello; determinista), Centro PKM.
- Assets: `apps/web/public/{sprites,fx}` generados por `pnpm assets` (T-043) con manifest; **no se commitean**; carga perezosa y precarga de lo que usa el combate; fallback visual si falta algo (el juego nunca se rompe por un asset).

## 8. Estrategia de pruebas
1. **Unit** por módulo del motor (Vitest). 2. **Golden replay**: ejemplos del manual (Poliwag/Doble bofetón; Clefairy vs Tangela y Gloom, p.45-49) con secuencias de dados fijas. 3. **Property tests** (fast-check): invariantes (HP ≤ máx, daño ≥ 0, jugador nunca cae en nodo inexistente, sin retroceso inmediato, replay determinista). 4. **Contenido**: validación + chequeos cruzados en CI. 5. **UI**: pruebas de componentes críticos y 1 smoke E2E (Playwright): iniciar → mover → pelear → capturar.

## 9. Hitos
M0 Fundaciones (G0) · M1 Motor de tablero/turnos (G1) · M2 Combate (G2) · M3 UI jugable (G3) · M4 Contenido real + herramienta de cartas (G4) · M5 Pulido, PWA, despliegue privado (G5). Detalle en `tasks/BACKLOG.md`.

## 10. Riesgos
| Riesgo | Mitigación |
|---|---|
| Combinatoria de efectos (151 PKM) | DSL cerrado + `custom` con handler nombrado, aprobado por el jefe; tests por primitiva |
| Reglas ambiguas | Tabla de decisiones D-xx con defaults; el dueño confirma; cambios vía config de ruleset |
| Carga de cartas (≈250 PKM) | Fotos en grilla + extracción por visión + herramienta de revisión lado a lado |
| Tablero mal transcripto | Borrador + overlay interactivo + gate G0 |
| Derechos de autor | Proyecto privado, sin venta ni acceso público; assets fuera del repo; ver `docs/PRIVACY-DEPLOY.md` |
| Animaciones de ataques (adaptador Showdown) | Spike T-032c0 temprano con gate GS; respaldo de 17 arquetipos propios siempre disponible; nunca bloquea el juego |
| Animaciones acopladas a la lógica | Eventos desacoplados; tests del motor sin UI |

## 11. ADRs iniciales
- ADR-1 Motor puro + comandos/eventos (sobre estado mutable en componentes).
- ADR-2 Tablero SVG desde datos (sobre canvas/Phaser): liviano, accesible, escalable.
- ADR-3 DOM/CSS + Motion para combate; PixiJS solo si el spike T-032c0 lo exige.
- ADR-6 Presentación híbrida del combate + animaciones de ataques (ver `docs/adr/ADR-6-battle-presentation.md`).
- ADR-7 Datos de referencia desde PokeAPI/Showdown descargados por script, fuera del repo.
- ADR-4 Datos en JSON + Zod (sobre base de datos): editable por no-programadores, versionable.
- ADR-5 Sin backend en MVP-0; guardado en `localStorage` con versión.
