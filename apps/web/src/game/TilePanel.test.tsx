// AC: SPEC-G/T-061/AC-3 — panel de casillero: título, un mensaje por evento y
// botones según pending (btn-challenge/btn-skip/btn-oak-swap).
// Proxy SSR (patrón T-034): presencia por data-testid; lo visual lo revisa el dueño.
// unificar-popup-encuentro/AC-1: FightOrRelease ya no vive acá (popup-encounter).
// captura-en-popup-combate/AC-2: CaptureOrRelease tampoco (pie del popup).
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { TilePanel, cardLabel, tileEventMessage } from './TilePanel'

const healthy = [{ uid: 'p1-starter', name: 'Charmander' }]

const panel = (
  pending: Parameters<typeof TilePanel>[0]['pending'],
  messages: readonly string[] = [],
): string =>
  renderToString(
    <TilePanel
      title={es.tileNames.gym}
      messages={messages}
      pending={pending}
      player={{
        healthy,
        swapPairs: [{ teamUid: 'p1-starter', pileUid: 'p1-oak-1', teamName: 'Charmander', pileName: 'Poliwag' }],
      }}
      onCommand={() => undefined}
      onClose={() => undefined}
    />,
  )

test('AC-3 ChallengeGym: botón de desafío por PKM sano y salteo', () => {
  const html = panel({ type: 'ChallengeGym' })
  expect(html).toContain('data-testid="btn-challenge"')
  expect(html).toContain(es.tileChallengeWith.replace('{name}', 'Charmander'))
  expect(html).toContain('data-testid="btn-skip"')
  expect(html).toContain('data-command="Advance"')
})

test('AC-3 OakSwap: pares de intercambio y salteo', () => {
  const html = panel({ type: 'OakSwap' })
  expect(html).toContain('data-testid="btn-oak-swap"')
  expect(html).toContain(es.tileSwapPair.replace('{team}', 'Charmander').replace('{pile}', 'Poliwag'))
  expect(html).toContain('data-testid="btn-skip"')
  expect(html).toContain('data-command="SwapWithOak"')
})

// AC: captura-en-popup-combate/AC-2 - la decisión CaptureOrRelease dejó de
// vivir en el panel de casillero (D-31 revertido): ningún pending renderiza
// prompt ni botones de captura (la decisión está en el pie del popup).
test('AC: captura-en-popup-combate/AC-2 - el panel no ofrece UI de captura', () => {
  for (const pending of [{ type: 'ChallengeGym' }, { type: 'OakSwap' }] as const) {
    const html = panel(pending)
    expect(html).not.toContain('data-testid="btn-capture"')
    expect(html).not.toContain('data-testid="btn-release"')
    expect(html).not.toContain('data-command="Capture"')
    expect(html).not.toContain('data-command="Release"')
    expect(html).not.toContain(es.tileCapturePrompt.replace('{name}', ''))
  }
})

// AC: SPEC-G/T-061/AC-3 — cada evento de la lista tiene su mensaje.
test('AC-3 cada evento de casillero tiene mensaje (CardDrawn, EnergyGained, PartyHealed, TileResolved, GymLocked, DeckEmpty)', () => {
  expect(
    tileEventMessage({ type: 'CardDrawn', player: 'p1', deck: 'item', card: 'potion' }),
  ).toBe(es.tileMsgCardDrawn.replace('{card}', es.tileItemNames.potion).replace('{deck}', es.tileDeckNames.item))
  expect(cardLabel('element_water')).toBe(es.tileEnergyCard.replace('{element}', es.elementNames.water))
  expect(cardLabel('poliwag')).toBe('Poliwag')
  expect(tileEventMessage({ type: 'EnergyGained', player: 'p1', element: 'fire' })).toBe(
    es.tileMsgEnergyGained.replace('{element}', es.elementNames.fire),
  )
  expect(tileEventMessage({ type: 'PartyHealed', player: 'p1', count: 3 })).toBe(
    es.tileMsgPartyHealed.replace('{count}', '3'),
  )
  expect(tileEventMessage({ type: 'TileResolved', player: 'p1', info: 'none' })).toBe(es.tileMsgNone)
  expect(tileEventMessage({ type: 'TileResolved', player: 'p1', info: 'oak' })).toBe(es.tileMsgOak)
  expect(tileEventMessage({ type: 'TileResolved', player: 'p1', info: 'disabledByRuleset' })).toBe(
    es.tileMsgDisabled,
  )
  expect(tileEventMessage({ type: 'GymLocked', player: 'p1', gym: 'giovanni', requiresMedals: 7 })).toBe(
    es.battleMsgGymLocked.replace('{n}', '7'),
  )
  // AC-6: el mensaje de mazo vacío (D-10).
  expect(tileEventMessage({ type: 'DeckEmpty', player: 'p1', deck: 'bosque' })).toBe(
    es.tileMsgDeckEmpty.replace('{deck}', es.tileDeckNames.bosque),
  )
  expect(tileEventMessage({ type: 'MoveStep', player: 'p1', from: 'a', to: 'b' })).toBeNull()
})

// AC: medalla-gimnasio/AC-2 — aterrizar en un gimnasio ya ganado avisa en el
// panel de casillero (antes se resolvía en silencio como TileResolved none).
test('AC: medalla-gimnasio/AC-2 - GymAlreadyWon: "Ya ganaste este gimnasio"', () => {
  expect(tileEventMessage({ type: 'GymAlreadyWon', player: 'p1', gym: 'brock' })).toBe(
    es.tileMsgGymAlreadyWon,
  )
})

// ── cerrar-popup-mensajes: botón Cerrar del panel de casillero ──

// AC: cerrar-popup-mensajes/AC-1 — con mensajes visibles y sin decisión
// pendiente el panel ofrece Cerrar (btn-tile-close, es.shellTipClose); sin
// mensajes no hay botón: no hay nada que descartar.
test('AC: cerrar-popup-mensajes/AC-1 - Cerrar visible con mensajes y ausente sin ellos', () => {
  const html = panel(null, [es.tileMsgNone])
  expect(html).toContain('data-testid="btn-tile-close"')
  expect(html).toContain(`>${es.shellTipClose}</button>`)
  expect(panel(null)).not.toContain('data-testid="btn-tile-close"')
})

// AC: cerrar-popup-mensajes/AC-2 — con decisión pendiente (ChallengeGym/OakSwap)
// el Cerrar convive con los botones de decisión: descarta mensajes, no el pending.
test('AC: cerrar-popup-mensajes/AC-2 - Cerrar convive con los botones de decisión', () => {
  const gym = panel({ type: 'ChallengeGym' }, [es.tileMsgNone])
  expect(gym).toContain('data-testid="btn-tile-close"')
  expect(gym).toContain('data-testid="btn-challenge"')
  expect(gym).toContain('data-testid="btn-skip"')
  const oak = panel({ type: 'OakSwap' }, [es.tileMsgOak])
  expect(oak).toContain('data-testid="btn-tile-close"')
  expect(oak).toContain('data-testid="btn-oak-swap"')
  // El pending solo (sin mensajes) no trae Cerrar: la decisión no se cierra.
  expect(panel({ type: 'OakSwap' })).not.toContain('data-testid="btn-tile-close"')
})
