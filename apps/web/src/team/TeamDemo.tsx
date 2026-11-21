// Demo del equipo cableada al motor real (SPEC-D/T-033): `newGame` + `applyCommand`;
// los eventos producidos van a la queue del store y los reproduce el EventPlayer
// (T-030). El toggle vive en App; este archivo entra por `import()` (chunk lazy).
import { useState } from 'react'
import {
  applyCommand,
  createInitialState,
  createRng,
  type GameState,
} from '@liga/engine'
import { useGameStore } from '../events/store'
import { es } from '../i18n/es'
import { createDemoGame, demoCardOf, demoContent } from './demo'
import type { TeamCommand } from './model'
import { TeamPanel } from './TeamPanel'

export function TeamDemo() {
  const [state, setState] = useState<GameState>(() => createDemoGame(2026) ?? createInitialState())
  const enqueue = useGameStore((store) => store.enqueue)
  const player = state.players.find((p) => p.id === state.activePlayerId)
  if (player === undefined) return null

  const onCommand = (command: TeamCommand): void => {
    const result = applyCommand(state, command, {
      content: demoContent,
      rng: createRng(state.rngState),
    })
    if (!result.ok) return
    setState(result.value.state)
    for (const event of result.value.events) {
      enqueue({ ...event })
    }
  }

  return (
    <section aria-label={es.teamTitle}>
      <h2>{es.teamTitle}</h2>
      <TeamPanel
        player={player}
        cardOf={demoCardOf}
        teamLimit={demoContent.ruleset.teamLimit}
        canEdit={state.phase === 'organize'}
        onCommand={onCommand}
      />
    </section>
  )
}
