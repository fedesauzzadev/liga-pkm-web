import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import type { GameEvent } from '@liga/engine'
import { BoardView, drawFromEvents, movePathFromEvents } from './Board'

test('AC: SPEC-D/AC-1 - el tablero renderiza SVG con nodos y la ficha del jugador', () => {
  const html = renderToString(<BoardView position="paleta" pending={null} />)
  expect(html).toContain('<svg')
  expect(html).toContain('Tablero de Kanto')
  expect(html).toContain('Pueblo Paleta')
})

test('AC: SPEC-D/AC-3 - la UI de caminos resalta opciones y muestra Parar acá / Seguir', () => {
  const html = renderToString(
    <BoardView
      position="paleta"
      pending={{ type: 'ChoosePath', options: ['oak_b', 'verde'] }}
      onChoosePath={() => undefined}
    />,
  )
  expect(html).toContain('Elegí camino')
  expect(html).toContain('Profesor Oak')
  expect(html).toContain('Ciudad Verde')

  const stopContinue = renderToString(
    <BoardView position="oak_b" pending={{ type: 'StopOrContinue' }} onStopOrContinue={() => undefined} />,
  )
  expect(stopContinue).toContain('Parar acá')
  expect(stopContinue).toContain('Seguir')
})

test('AC: SPEC-G/T-063/AC-2 - el camino del PlayerMoved se deriva de la cadena de MoveStep', () => {
  const events: readonly GameEvent[] = [
    { type: 'DieRolled', purpose: 'move', value: 3 },
    { type: 'MoveStep', player: 'p1', from: 'paleta', to: 'a1' },
    { type: 'MoveStep', player: 'p1', from: 'a1', to: 'a2' },
    { type: 'MoveStep', player: 'p1', from: 'a2', to: 'a3' },
    { type: 'Landed', player: 'p1', node: 'a3' },
  ]
  expect(movePathFromEvents(events, 'p1')).toEqual(['paleta', 'a1', 'a2', 'a3'])
  // Otro jugador o sin movimiento ⇒ null.
  expect(movePathFromEvents(events, 'p2')).toBeNull()
  expect(movePathFromEvents([events[0] ?? { type: 'TurnAdvanced', turn: 2 }], 'p1')).toBeNull()
  expect(movePathFromEvents(events, null)).toBeNull()
})

// AC: SPEC-G/T-064/AC-1 - el último CardDrawn del comando dispara el robo animado.
// T-090/AC-2: drawFromEvents incluye el jugador (nodo origen de Ítem/Sorpresa).
test('AC: SPEC-G/T-064/AC-1 - drawFromEvents devuelve el último robo o null', () => {
  const events: readonly GameEvent[] = [
    { type: 'DieRolled', purpose: 'move', value: 3 },
    { type: 'CardDrawn', player: 'p1', deck: 'isla', card: 'element_water' },
    { type: 'EnergyGained', player: 'p1', element: 'water' },
    { type: 'CardDrawn', player: 'p1', deck: 'item', card: 'potion' },
  ]
  expect(drawFromEvents(events)).toEqual({ deck: 'item', card: 'potion', player: 'p1' })
  expect(drawFromEvents(events.slice(0, 3))).toEqual({ deck: 'isla', card: 'element_water', player: 'p1' })
  expect(drawFromEvents([events[0]!])).toBeNull()
  expect(drawFromEvents([])).toBeNull()
})
