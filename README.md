# LIGA PKM Web — kit de arranque

Versión web (navegador) del juego de mesa fan-made **LIGA POKEMON** (autor: sugimoriARG).
MVP-0: **un jugador, sin rivales**: recorrer el tablero, sacar cartas, pelear contra PKM salvajes, capturar, evolucionar, curarse y ganar gimnasios (151 PKM de Kanto).

## Cómo usar este kit
1. Poné `manual.pdf` en `docs/reference/` y la foto del tablero en `docs/reference/board-photo.jpg` (no se commitean si pesan: ver `.gitignore`).
2. Un agente "worker" (cualquier modelo) lee `AGENTS.md` y ejecuta la próxima tarea de `tasks/BACKLOG.md`.
3. Al terminar cada tarea el worker escribe `tasks/reports/T-xxx.md`. En cada **gate** (G0–G5) se le pasa el paquete de revisión a Claude ("el jefe"): ver `docs/BOSS-PROTOCOL.md`.
4. Reglas dudosas → `docs/RULES.md` (tabla de decisiones) y `docs/OPEN-QUESTIONS.md`. El dueño del proyecto confirma.

## Uso con opencode
Comandos del proyecto (ya incluidos en `.opencode/commands/`):
- `/ejecuta T-001` — ejecuta una tarea (también `/ejecuta SPEC-B` o sin argumento = la próxima disponible).
- `/revisa T-011` — auditoría independiente de una tarea (usar otro modelo si es posible).
Checklist del dueño: `tasks/OWNER-REVIEW.md`. Si tu versión de opencode usa la carpeta `.opencode/command/` (singular), ya hay una copia ahí.

## Mapa
| Archivo | Para qué |
|---|---|
| `AGENTS.md` | Reglas de trabajo para agentes (leer primero) |
| `docs/SDD.md` | Documento de diseño: arquitectura, modelo, máquinas de estado, UI, testing |
| `docs/RULES.md` | Reglas del manual resumidas + decisiones/ambigüedades |
| `docs/EFFECTS.md` | Vocabulario declarativo de efectos de ataques (DSL) |
| `docs/adr/ADR-6-battle-presentation.md` | Decisión: combate híbrido (sprites + carta TCG + dado 3D + animación de ataques) |
| `docs/FX-ADAPTER.md` | Cómo se conectan las animaciones de ataques (Showdown + respaldo propio) |
| `docs/PRIVACY-DEPLOY.md` | Cómo mantener el proyecto secreto |
| `docs/ASSETS.md` | Registro de fuentes/licencias de assets |
| `docs/CARD-INGESTION.md` | Cómo pasar las cartas físicas a JSON (fotos + visión + revisión) |
| `docs/BOSS-PROTOCOL.md` | Cómo se hace la revisión por Claude con pocos tokens |
| `specs/SPEC-A…E` | Especificaciones por área con criterios de aceptación |
| `tasks/BACKLOG.md` | Tareas ordenadas con dependencias, gates y nivel de modelo sugerido |
| `content/` | Datos: tablero (BORRADOR), ruleset, cartas de muestra |
| `tools/board-overlay.html` | Verifica/corrige el grafo del tablero sobre la foto |

## Desarrollo
Requisitos: Node 20.19+ (o 22.12+) y pnpm 10+.

```bash
pnpm install        # instala el workspace (apps/web, packages/engine, packages/content)
pnpm verify         # typecheck + lint + test + content:validate + build (debe quedar verde)
pnpm dev            # servidor de desarrollo (apps/web) → página "LIGA PKM"
pnpm test           # Vitest en todo el workspace
pnpm lint           # ESLint con límites de import: web → engine → content
pnpm content:validate  # valida los JSON de content/ (placeholder: JSON; Zod llega en T-002)
pnpm digest         # resumen del repo (placeholder; versión completa en T-005)
```

Estructura: `apps/web` (Vite + React) · `packages/engine` (motor puro, sin DOM) · `packages/content` (esquemas y loaders) · `content/` (datos JSON) · `tools/` (scripts).

## Proyecto privado
Juego de fans, **sin venta, sin publicidad, sin acceso público**, para jugar entre amigos. Pokémon es marca de Nintendo/Game Freak/Creatures; el arte del tablero, cartas y reglas es de sugimoriARG.
Reglas de oro: repo privado, despliegue protegido (`docs/PRIVACY-DEPLOY.md`), assets descargados por script y nunca commiteados. Si algún día se quisiera abrir al público, primero pedir permiso al autor.
