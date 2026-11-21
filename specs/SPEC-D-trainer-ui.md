# SPEC-D-trainer-ui: Coreografía de aparición del entrenador en combate de gimnasio

## Objetivo
Definir cómo el entrenador aparece visualmente en la arena antes de que su primer Pokémon inicie el combate. Esto incluye el flujo de eventos, la lógica del coreógrafo y la configuración de la UI para renderizar el sprite del entrenador.

## AC-1
**Coreógrafo:** `playTrainerAppeared` en `apps/web/src/battle/choreo/registry.ts`
- Recibe `GameEvent` de tipo `TrainerAppeared` con `trainerId: string`.
- Usa `api.stage.trainerId` como respaldo (si está presente).
- Consulta `api.deps.cardOf(trainerId)` para obtener la carta del entrenador.
- Renderiza el sprite del entrenador con `api.patch({ trainerAppeared: trainerId })` (el componente `BattleScene` observa `visuals.trainerAppeared`).
- Espera `ANIMATION_CONFIG.trainerIntroMs` (250 ms) para el tiempo de entrada.
- Aplica un efecto de parpadeo suave (`flash: 'trainer'`) con `ANIMATION_CONFIG.trainerFlashMs` (150 ms).
- Mueve el sprite del entrenador al slot "rival" (con `side="rival"` pero `name="trainer"`).
- Configura el nombre del entrenador en la caja de texto (`message: es.battleMsgTrainerIntro` o similar).

## AC-2
**BattleScene** (parte del file `apps/web/src/battle/BattleScene.tsx`)
- Añade `trainerAppeared: string | null` al `BattleVisuals` interface.
- Inicialmente `null`; se setea a `trainerId` cuando llega el evento `TrainerAppeared`.
- En la render, si `trainerAppeared != null`, agrega `<SpriteSlot side="rival" name="trainer" url={trainerUrl(trainers, visuals.trainerAppeared)} entering={entrance('rival')} />`.
- Importa `trainerUrl` de `apps/web/src/battle/sprites.ts`.
- `useSprites` extiende su retorno para incluir `trainers: TrainersManifest | null`.

## AC-3
**Hooks de sprites** (`apps/web/src/battle/sprites.ts`)
- `SpritesManifest` se mantiene como `Record<string, SpriteEntry | undefined>`.
- Nuevo `TrainersManifest` como `Record<string, TrainerEntry | undefined>`.
- `useSprites()` retorna `{ sprites: SpritesManifest | null; trainers: TrainersManifest | null }`.
- `trainerUrl(trainers, sdId)` retorna `trainers?.[sdId]?.front ?? null`.

## AC-4
**Tiempo de transición y retraso**
- `trainerIntroMs: 250`
- `trainerFlashMs: 150`
- La transición del sprite del entrenador debe coincidir con el inicio del combate del Pokémon rival (el evento `BattleStarted` viene después).
- Si hay retraso (`reducedMotion`), el efecto del parpadeo se saltea; el sprite aparece instantáneamente.

## AC-5
**Mensajes de la interfaz**
- `es.battleMsgTrainerIntro: "{name} aparece!"
- `es.battleMsgTrainerDefeated: "{name} ha caído!"
- El texto del entrenador aparece en la caja de texto del HUD cuando aparece.

## AC-6
**Transición de salida**
- Después de `trainerIntroMs` y `trainerFlashMs`, aplica `{ opacity: 0, transform: 'translateX(20px)' }` al sprite del entrenador con `transition: opacity {duration}ms, transform {duration}ms` (ejemplo: 400 ms) para moverlo al lateral.
- Esto da la impresión de que el líder aparece y se aleja antes de que salga su Pokémon.

## Plan de implementación
1. Agregar `trainerAppeared: string | null` al `BattleStage` en `apps/web/src/battle/choreo/stage.ts`.
2. En el coreógrafo, parchear `trainerAppeared` en `api.patch({ trainerAppeared: event.trainerId })`.
3. Agregar la entrada del sprite del entrenador en `BattleScene` condicionalmente cuando `visuals?.trainerAppeared != null`.
4. Definir constantes de tiempo en `ANIMATION_CONFIG.battle`.
5. Correr las pruebas existentes para verificar que la implementación no rompe nada.