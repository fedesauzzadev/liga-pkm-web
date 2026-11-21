// @vitest-environment jsdom
// AC: SPEC-I/T-075/AC-2, AC-3, AC-5 — popup de combate: escena lazy (chunk de
// combate) dentro del contenedor único, Ampliar y controles solo del activo
// (D-30). Proxy SSR: la escena llega por Suspense; lo visual mide el e2e.
// T-108: overlay de resultado + Continuar (no se cierra solo).
// fin-de-combate: el overlay espera la reproducción completa del guion
// (AC-1/AC-2); el pie se oculta por guion (AC-3); tras "Continuar" con
// captura pendiente la escena queda congelada (AC-4).
// reemplazo-tras-desmayo/AC-1,AC-4 — render real (jsdom): el popup deriva
// `forceSwitch` del pending ChooseReplacement y lo pasa a la escena.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { parseCardId, parseNodeId, parsePlayerId, parsePkmUid } from '@liga/content'
import {
  createRng,
  legalCommands,
  type BattleState,
  type Command,
  type GameEvent,
  type GameState,
  type PlayerState,
  type PkmInstance,
} from '@liga/engine'
import { applyToSession, startSession } from '../game/session'
import { cardOf, gameContent } from '../game/content'
import { restoredWildBattleSession } from '../battle/choreo/resume.fixtures'
import { es } from '../i18n/es'
import { BattlePopup, BattleResultOverlay } from './BattlePopup'
import { battleScriptAfterCommand, presentationActorOf, presentationRivalEntry } from './model'

afterEach(cleanup)

const pkm = (uid: string, cardId = 'squirtle'): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
})

const player = (): PlayerState => ({
  id: parsePlayerId('p1'),
  position: parseNodeId('paleta'),
  cameFrom: null,
  team: [pkm('p1-a'), pkm('p1-b', 'weedle')],
  oakPile: [],
  elements: [],
  multicolor: 0,
  items: { pokeball: 1, potion: 1, oportunidad: 0, super_potion: 0, ultraball: 0, masterball: 0 },
  medals: [],
})

const battle = (): BattleState => ({
  kind: 'wild',
  card: parseCardId('weedle'),
  deck: 'bosque',
  rival: [{ uid: parsePkmUid('rival-1'), cardId: parseCardId('weedle'), damage: 0, fainted: false }],
  active: [parsePkmUid('p1-a'), parsePkmUid('rival-1')],
  turnSide: 0,
  conditions: {},
  trainerId: null,
  firstTurn: [],
  participants: [parsePkmUid('p1-a')],
  won: false,
  noAttackThisTurn: false,
  actedThisTurn: false,
  lostCount: 0,
})

const stateOf = (overrides: Partial<GameState> = {}): GameState => ({
  version: 1,
  turn: 1,
  phase: 'battle',
  pending: null,
  battle: battle(),
  stepsLeft: 0,
  rngState: 0,
  dieLog: [],
  ruleset: gameContent.ruleset,
  players: [player()],
  activePlayerId: parsePlayerId('p1'),
  decks: { bosque: [], montana: [], isla: [], llanura: [], pantano: [], item: [], sorpresa: [] },
  ...overrides,
})

const legal = (state: GameState): readonly Command[] =>
  legalCommands(state, { content: gameContent, rng: createRng(0) })

const popup = (
  state: GameState,
  props: {
    readonly viewingOwn?: boolean
    readonly expanded?: boolean
    readonly script?: readonly GameEvent[]
    readonly resultDismissed?: boolean
  } = {},
): string =>
  renderToString(
    <BattlePopup
      state={state}
      legal={legal(state)}
      script={props.script ?? []}
      speed="1x"
      reducedMotion={false}
      viewingOwn={props.viewingOwn ?? true}
      expanded={props.expanded ?? false}
      resultDismissed={props.resultDismissed ?? false}
      onExpandToggle={() => undefined}
      onCommand={() => undefined}
      onContinue={() => undefined}
    />,
  )

test('AC: SPEC-I/T-075/AC-2 - Ampliar alterna el tamaño y la escena carga lazy dentro', () => {
  const html = popup(stateOf())
  expect(html).toContain('data-battle-popup="battle"')
  expect(html).toContain('data-testid="btn-battle-expand"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain(es.popupBattleExpand)
  // La escena (chunk de combate) entra por Suspense: placeholder sin romper el popup.
  expect(html).toContain(es.battleLoading)

  const wide = popup(stateOf(), { expanded: true })
  expect(wide).toContain('aria-expanded="true"')
  expect(wide).toContain(es.popupBattleRestore)
})

test('AC: rediseno-combate-max/AC-0 - sin título "PKM salvaje" ni botón "Pasar"; header de 56 px con Restaurar', () => {
  const html = popup(stateOf())
  expect(html).not.toContain(es.popupBattleTitleWild)
  expect(html).not.toContain(es.popupBattlePass)
  expect(html).not.toContain(`>${es.popupBattlePass}<`)
  expect(html).toContain('data-testid="battle-popup-header"')
  expect(html).toContain('data-testid="btn-battle-expand"')
  // Maximizado: el botón queda en "Restaurar".
  const wide = popup(stateOf(), { expanded: true })
  expect(wide).toContain(es.popupBattleRestore)
})

test('AC: SPEC-I/T-075/AC-2 (rediseno-combate-max) - sin pie de acciones: nada de data-command ni data-battle-actions', () => {
  const mine = popup(stateOf())
  expect(mine).not.toContain('data-battle-actions')
  expect(mine).not.toContain('data-command="')
  const spectator = popup(stateOf(), { viewingOwn: false })
  expect(spectator).not.toContain('data-battle-actions')
  expect(spectator).not.toContain('data-command="')
})

// AC: fin-de-combate/AC-1, AC-3 + captura-en-popup-combate/AC-5 - victoria de
// salvaje con BattleEnded en el guion PERO eventos aún sin reproducir: sin
// overlay de resultado (espera a la coreografía del golpe final), sin pie de
// acciones y sin pie de captura (aparece recién tras "Continuar").
test('AC: fin-de-combate/AC-1 - victoria de salvaje sin reproducir: ni overlay ni pie ni captura', () => {
  const won: readonly GameEvent[] = [
    { type: 'PokemonFainted', pkmUid: 'rival-1' },
    { type: 'BattleEnded', player: 'p1', result: 'won' },
    { type: 'XpGained', pkmUid: 'p1-a', amount: 1 },
  ]
  const state = stateOf({
    battle: null,
    phase: 'tileResolution',
    pending: {
      type: 'CaptureOrRelease',
      card: 'weedle',
      deck: 'bosque',
      participants: [parsePkmUid('p1-a')],
    },
  })
  const html = popup(state, { script: won })
  expect(html).not.toContain('data-testid="battle-result-overlay"')
  expect(html).not.toContain('data-testid="btn-battle-continue"')
  // AC-3: el pie se oculta por guion (BattleEnded entró), no por reproducción.
  expect(html).not.toContain('data-battle-actions')
  expect(html).not.toContain('data-command="Capture"')
  expect(html).not.toContain('data-command="Release"')
})

// AC: fin-de-combate/AC-2 - el overlay de resultado (Ganaste/Perdiste +
// Continuar) se muestra recién con todo el guion reproducido; su markup vive
// en BattleResultOverlay (la vista lo pinta según battleResultPlayed).
test('AC: fin-de-combate/AC-2 - BattleResultOverlay: ¡Ganaste/Perdiste + Continuar', () => {
  const won = renderToString(<BattleResultOverlay result="won" onContinue={() => undefined} />)
  expect(won).toContain('data-testid="battle-result-overlay"')
  expect(won).toContain(es.battleMsgWon)
  expect(won).toContain('data-testid="btn-battle-continue"')
  expect(won).toContain(es.popupBattleContinue)
  const lost = renderToString(<BattleResultOverlay result="lost" onContinue={() => undefined} />)
  expect(lost).toContain(es.battleMsgLost)
  expect(lost).toContain('data-testid="btn-battle-continue"')
})

// ── medalla-gimnasio: bloque de medalla en el overlay de resultado ──

// AC: medalla-gimnasio/AC-1 - victoria de gimnasio: junto al texto de victoria
// existente, el bloque de medalla con "¡Ganaste la Medalla {medal}!", el
// nombre del líder y la imagen del manifest (todo del MedalWon del guion).
test('AC: medalla-gimnasio/AC-1 - overlay con medalla: texto, líder e insignia del manifest', () => {
  const html = renderToString(
    <BattleResultOverlay
      result="won"
      medal={{ medal: 'Cascada', leader: 'Misty', badgeUrl: '/badges/cascade.png', color: '#4F8FD6' }}
      onContinue={() => undefined}
    />,
  )
  expect(html).toContain(es.battleMsgWon)
  expect(html).toContain('data-testid="gym-medal-block"')
  expect(html).toContain(es.battleResultMedal.replace('{medal}', 'Cascada'))
  expect(html).toContain(es.battleResultMedalLeader.replace('{leader}', 'Misty'))
  expect(html).toContain('data-testid="gym-medal-img"')
  expect(html).toContain('src="/badges/cascade.png"')
  expect(html).not.toContain('data-testid="gym-medal-fallback"')
  // Sin medalla (salvaje o derrota) el bloque no existe.
  const plain = renderToString(<BattleResultOverlay result="won" onContinue={() => undefined} />)
  expect(plain).not.toContain('data-testid="gym-medal-block"')
})

// AC: medalla-gimnasio/AC-4 - fallback sin red: sin insignia en el manifest,
// disco CSS con el color de decor.medalColors + nombre de la medalla.
test('AC: medalla-gimnasio/AC-4 - sin manifest: disco CSS con color y nombre de la medalla', () => {
  const html = renderToString(
    <BattleResultOverlay
      result="won"
      medal={{ medal: 'Roca', leader: 'Brock', badgeUrl: null, color: '#8C8577' }}
      onContinue={() => undefined}
    />,
  )
  expect(html).toContain('data-testid="gym-medal-fallback"')
  expect(html).not.toContain('data-testid="gym-medal-img"')
  expect(html).toContain('>Roca<')
  expect(html).toContain('#8C8577')
})

// AC: fin-de-combate/AC-4 + captura-en-popup-combate/AC-1 - tras "Continuar"
// con captura pendiente el popup NO se cierra: la escena queda congelada y la
// decisión vive en el PIE del propio popup (D-31 revertido): "¿Capturar a
// {name}?" con Capturar y Dejar ir (AC-4: despachan Capture/Release).
test('AC: captura-en-popup-combate/AC-1 - Continuar con captura pendiente: pie con ¿Capturar a {name}?', () => {
  const ended: readonly GameEvent[] = [
    { type: 'PokemonFainted', pkmUid: 'rival-1' },
    { type: 'BattleEnded', player: 'p1', result: 'won' },
    { type: 'XpGained', pkmUid: 'p1-a', amount: 1 },
  ]
  const state = stateOf({
    battle: null,
    phase: 'tileResolution',
    pending: {
      type: 'CaptureOrRelease',
      card: 'abra',
      deck: 'bosque',
      participants: [parsePkmUid('p1-a')],
    },
  })
  const html = popup(state, { script: ended, resultDismissed: true })
  expect(html).toContain('data-battle-popup="battle"')
  expect(html).not.toContain('data-testid="battle-result-overlay"')
  expect(html).not.toContain('data-battle-actions')
  expect(html).toContain('data-testid="capture-footer"')
  expect(html).toContain(es.tileCapturePrompt.replace('{name}', 'Abra'))
  expect(html).toContain('data-testid="btn-capture"')
  expect(html).toContain('data-command="Capture"')
  expect(html).toContain(es.battleCapture)
  expect(html).toContain('data-testid="btn-release"')
  expect(html).toContain('data-command="Release"')
  expect(html).toContain(es.battleRelease)
})

// AC: captura-en-popup-combate/AC-3 - sin Pokebolas (D-12) el pie solo ofrece
// "Dejar ir" (Capturar no se renderiza).
test('AC: captura-en-popup-combate/AC-3 - sin Pokebolas el pie solo ofrece Dejar ir', () => {
  const state = stateOf({
    battle: null,
    phase: 'tileResolution',
    pending: {
      type: 'CaptureOrRelease',
      card: 'weedle',
      deck: 'bosque',
      participants: [parsePkmUid('p1-a')],
    },
    players: [{ ...player(), items: { ...player().items, pokeball: 0 } }],
  })
  const html = popup(state, { script: [], resultDismissed: true })
  expect(html).toContain('data-testid="capture-footer"')
  expect(html).not.toContain('data-testid="btn-capture"')
  expect(html).not.toContain('data-command="Capture"')
  expect(html).toContain('data-testid="btn-release"')
  expect(html).toContain('data-command="Release"')
})

// AC: captura-en-popup-combate/AC-5 - sin captura pendiente el popup se
// comporta igual que hoy: overlay de resultado + Continuar (o escena normal),
// sin pie de captura.
test('AC: captura-en-popup-combate/AC-5 - sin captura pendiente: sin pie de captura', () => {
  const idle = popup(stateOf())
  expect(idle).not.toContain('data-testid="capture-footer"')
  expect(idle).not.toContain('data-testid="btn-capture"')
  expect(idle).not.toContain('data-testid="btn-release"')
  const ended: readonly GameEvent[] = [{ type: 'BattleEnded', player: 'p1', result: 'won' }]
  const dismissed = popup(stateOf({ battle: null }), { script: ended, resultDismissed: true })
  expect(dismissed).not.toContain('data-testid="capture-footer"')
  expect(dismissed).not.toContain('data-testid="btn-release"')
})

// AC: captura-en-popup-combate/AC-7 - partida restaurada con captura pendiente
// (guion vacío, sin BattleEnded pendiente): el pie decide directo sobre la
// escena degradada, sin pasar por el overlay.
test('AC: captura-en-popup-combate/AC-7 - restaurada con captura pendiente: pie directo', () => {
  const state = stateOf({
    battle: null,
    phase: 'tileResolution',
    pending: {
      type: 'CaptureOrRelease',
      card: 'abra',
      deck: 'bosque',
      participants: [parsePkmUid('p1-a')],
    },
  })
  const html = popup(state, { script: [] })
  expect(html).toContain('data-battle-popup="battle"')
  expect(html).toContain('data-testid="capture-footer"')
  expect(html).toContain(es.tileCapturePrompt.replace('{name}', 'Abra'))
  expect(html).toContain('data-testid="btn-capture"')
  expect(html).toContain('data-testid="btn-release"')
})

// AC: turno-automatico-rival/AC-7 (rediseno-combate-max) - "Pasar" desapareció
// del popup: el turno del rival corre dentro del comando que cede el turno y
// las acciones viven en las pestañas de la escena (sin Advance visible).
test('AC: turno-automatico-rival/AC-7 - el popup no ofrece ningún botón "Pasar"', () => {
  const html = popup(stateOf())
  expect(html).not.toContain(es.popupBattlePass)
  expect(html).not.toContain('data-command="Advance"')
})

// AC: fin-de-combate/AC-1, T-108/AC-3 - con BattleEnded en el guion y la
// coreografía en curso no hay overlay; el popup espera a que todo se
// reproduzca antes de mostrar el resultado.
test('AC: fin-de-combate/AC-1 - victoria: el overlay espera la coreografía (sin reproducir no aparece)', () => {
  const ended: readonly GameEvent[] = [
    { type: 'PokemonFainted', pkmUid: 'rival-1' },
    { type: 'BattleEnded', player: 'p1', result: 'won' },
    { type: 'XpGained', pkmUid: 'p1-a', amount: 1 },
  ]
  const html = popup(stateOf({ battle: null }), { script: ended })
  expect(html).not.toContain('data-testid="battle-result-overlay"')
  expect(html).not.toContain(es.battleMsgWon)
  expect(html).not.toContain('data-testid="btn-battle-continue"')
  expect(html).not.toContain('data-battle-actions')
})

test('AC: fin-de-combate/AC-1 - derrota: ídem, el overlay de Perdiste tampoco se adelanta', () => {
  const ended: readonly GameEvent[] = [
    { type: 'BattleEnded', player: 'p1', result: 'lost' },
    { type: 'CardToBottom', player: 'p1', deck: 'pantano', card: 'poliwag' },
    { type: 'TurnAdvanced', turn: 2 },
  ]
  const html = popup(stateOf({ battle: null, phase: 'organize' }), { script: ended })
  expect(html).not.toContain('data-testid="battle-result-overlay"')
  expect(html).not.toContain(es.battleMsgLost)
  expect(html).not.toContain('data-battle-actions')
})

test('AC: T-108/AC-3 - sin BattleEnded en el guion no hay overlay (coreografía en curso)', () => {
  const mid: readonly GameEvent[] = [
    { type: 'BattleStarted', player: 'p1', kind: 'wild', rival: 'weedle', active: 'p1-a' },
    { type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' },
  ]
  const html = popup(stateOf(), { script: mid })
  expect(html).not.toContain('data-testid="battle-result-overlay"')
  expect(html).not.toContain('data-battle-actions')
})

// AC: retirada-solo-inicio-turno/AC-6 (rediseno-combate-max) - mientras el
// guion se reproduce (SSR: played=0 < script.length) el popup pasa `blocked`:
// sin pie que deshabilitar, la señal la consumen las pestañas de la escena
// (cubierta en BattleScene.test.tsx) y el latch sigue activo en el dispatch.
test('AC: retirada-solo-inicio-turno/AC-6 - guion en curso: sin pie, señal de bloqueo para la escena', () => {
  const mid: readonly GameEvent[] = [
    { type: 'BattleStarted', player: 'p1', kind: 'wild', rival: 'weedle', active: 'p1-a' },
    { type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' },
  ]
  const playing = popup(stateOf(), { script: mid })
  expect(playing).toContain('data-battle-popup="battle"')
  expect(playing).not.toContain('data-battle-actions')
  const idle = popup(stateOf())
  expect(idle).toContain('data-battle-popup="battle"')
})

// ── reemplazo-tras-desmayo: el popup deriva forceSwitch del pending ──

/** Render real (jsdom): la escena lazy resuelve y se puede inspeccionar.
 * `speed="skip"` + `reducedMotion` hacen la coreografía instantánea (Q-099 ya
 * resuelto: la velocidad ya no la pisa reducedMotion) y el timeout amplio
 * absorbe la carga del import() dinámico en la suite completa. */
const popupLive = (state: GameState, script: readonly GameEvent[]): void => {
  render(
    <BattlePopup
      state={state}
      legal={legal(state)}
      script={script}
      speed="skip"
      reducedMotion
      viewingOwn
      expanded={false}
      onExpandToggle={() => undefined}
      onCommand={() => undefined}
      onContinue={() => undefined}
    />,
  )
}

const intro: readonly GameEvent[] = [
  { type: 'BattleStarted', player: parsePlayerId('p1'), kind: 'wild', rival: 'poliwag', active: 'p1-a' },
]

/** Batalla con cartas del contenido real (la escena resuelve los actores). */
const liveBattle = (): BattleState => {
  const base = battle()
  if (base.kind !== 'wild') throw new Error('se esperaba batalla salvaje')
  return {
    ...base,
    card: parseCardId('poliwag'),
    rival: [{ uid: parsePkmUid('rival-1'), cardId: parseCardId('poliwag'), damage: 0, fainted: false }],
  }
}

const replacementState = (): GameState =>
  stateOf({
    pending: { type: 'ChooseReplacement', options: ['p1-b'] },
    battle: liveBattle(),
    players: [
      {
        ...player(),
        team: [{ ...pkm('p1-a'), damage: 60, fainted: true }, pkm('p1-b', 'poliwag')],
      },
    ],
  })

// AC: reemplazo-tras-desmayo/AC-1 — con pending ChooseReplacement el popup pasa
// forceSwitch a la escena: la pestaña inicial es "Cambiar" y la banca sana
// ofertada por el motor queda habilitada (el activo caído no figura).
test('AC: reemplazo-tras-desmayo/AC-1 - popup con ChooseReplacement: escena forzada en Cambiar con la banca sana habilitada', async () => {
  popupLive(replacementState(), intro)
  const switchTab = await screen.findByTestId('tab-switch', {}, { timeout: 5000 })
  expect(switchTab.getAttribute('data-selected')).toBe('true')
  expect(screen.getByTestId('tab-attack').getAttribute('data-selected')).toBeNull()
  const healthy = await screen.findByTestId('btn-switch-p1-b')
  expect(healthy.getAttribute('aria-disabled')).toBeNull()
  expect(screen.queryByTestId('btn-switch-p1-a')).toBeNull()
})

// AC: reemplazo-tras-desmayo/AC-4 — sin pending ChooseReplacement (caso "sin
// banca sana": el motor ya emitió BattleEnded y nunca arma el pending) el popup
// NO fuerza Cambiar ni ofrece comandos de reemplazo.
test('AC: reemplazo-tras-desmayo/AC-4 - sin ChooseReplacement: sin fuerza de pestaña ni SendOut', async () => {
  const state = stateOf({ battle: liveBattle() })
  expect(legal(state).some((command) => command.type === 'SendOut')).toBe(false)
  popupLive(state, intro)
  const attackTab = await screen.findByTestId('tab-attack', {}, { timeout: 5000 })
  expect(attackTab.getAttribute('data-selected')).toBe('true')
  expect(screen.getByTestId('tab-switch').getAttribute('data-selected')).toBeNull()
})

// ── fix-combate-refresco: la escena se reanuda desde state.battle (restore) ──

/** Render jsdom con guion y callbacks custom (flujo de reanudación). */
const popupFlow = (
  state: GameState,
  script: readonly GameEvent[],
  onCommand: (command: Command) => void,
): ReturnType<typeof render> =>
  render(
    <BattlePopup
      state={state}
      legal={legal(state)}
      script={script}
      speed="skip"
      reducedMotion
      viewingOwn
      expanded={false}
      onExpandToggle={() => undefined}
      onCommand={onCommand}
      onContinue={() => undefined}
    />,
  )

// AC: fix-combate-refresco/AC-2 - la escena reanudada acepta el comando legal
// del turno y, tras aplicarlo, el guion acumulado sigue fluyendo sobre la
// MISMA montura: el HP del rival avanza al del estado del motor.
test('AC: fix-combate-refresco/AC-2 - despacho legal y el combate sigue fluyendo', async () => {
  const restored = restoredWildBattleSession()
  const onCommand = vi.fn()
  const view = popupFlow(restored.state, [], onCommand)
  const attackTab = await view.findByTestId('tab-attack', {}, { timeout: 5000 })
  expect(attackTab.getAttribute('data-selected')).toBe('true')
  fireEvent.click(view.getByTestId('btn-attack-1'))
  fireEvent.click(view.getByTestId('btn-accept'))
  expect(onCommand).toHaveBeenCalledTimes(1)
  const command = onCommand.mock.calls[0]![0] as Command
  expect(command.type).toBe('Attack')
  const step = (() => {
    const result = applyToSession(restored, command, gameContent)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  })()
  expect(step.events.length).toBeGreaterThan(0)
  const nextScript = battleScriptAfterCommand(
    [],
    command,
    step.events,
    step.session.state.battle !== null,
  )
  expect(nextScript).toEqual(step.events)
  view.rerender(
    <BattlePopup
      state={step.session.state}
      legal={legal(step.session.state)}
      script={nextScript}
      speed="skip"
      reducedMotion
      viewingOwn
      expanded={false}
      onExpandToggle={() => undefined}
      onCommand={onCommand}
      onContinue={() => undefined}
    />,
  )
  expect(view.queryByText(es.battleWait)).toBeNull()
  const battle = step.session.state.battle
  if (battle === null) return // terminó el combate: el flujo siguió igual
  const rival = battle.rival.find((candidate) => candidate.uid === battle.active[1]) ?? battle.rival[0]!
  const hpMax = cardOf(rival.cardId)?.hp ?? 0
  await waitFor(() => {
    expect(
      view.container.querySelector('[data-testid="battle-card-enemy"] [data-hp]')?.getAttribute('data-hp'),
    ).toBe(`${String(hpMax - rival.damage)}/${String(hpMax)}`)
  })
})

// AC: fix-combate-refresco/AC-3 - gimnasio reanudado: el líder queda en la
// zona rival; el salvaje restaurado no muestra trainer.
test('AC: fix-combate-refresco/AC-3 - gimnasio: trainer en escena; salvaje: sin trainer', async () => {
  const gymBattle: BattleState = {
    kind: 'gym',
    gym: 'celeste',
    medal: 'Cascada',
    prize: { from: 'isla', count: 1 },
    rival: [
      { uid: parsePkmUid('rival-1'), cardId: parseCardId('poliwag'), damage: 10, fainted: false },
      { uid: parsePkmUid('rival-2'), cardId: parseCardId('weedle'), damage: 0, fainted: false },
    ],
    active: [parsePkmUid('p1-a'), parsePkmUid('rival-1')],
    turnSide: 0,
    conditions: {},
    trainerId: 'misty',
    firstTurn: [],
    participants: [parsePkmUid('p1-a')],
    won: false,
    noAttackThisTurn: false,
    actedThisTurn: false,
    lostCount: 0,
  }
  const noop = (): void => undefined
  const gym = render(
    <BattlePopup
      state={stateOf({ battle: gymBattle })}
      legal={[]}
      script={[]}
      speed="skip"
      reducedMotion
      viewingOwn
      expanded={false}
      onExpandToggle={noop}
      onCommand={noop}
      onContinue={noop}
    />,
  )
  await gym.findByTestId('battle-arena', {}, { timeout: 5000 })
  expect(gym.container.querySelector('[data-side="trainer"]')).not.toBeNull()
  cleanup()
  const wild = popupFlow(restoredWildBattleSession().state, [], noop)
  await wild.findByTestId('battle-arena', {}, { timeout: 5000 })
  expect(wild.container.querySelector('[data-side="trainer"]')).toBeNull()
})

// AC: fix-combate-refresco/AC-4 - restaurada con ChooseReplacement: la pestaña
// "Cambiar" forzada funciona sobre la escena reanudada (activo caído en escena).
test('AC: fix-combate-refresco/AC-4 - ChooseReplacement restaurado: Cambiar forzada con banca sana', async () => {
  popupLive(replacementState(), [])
  const switchTab = await screen.findByTestId('tab-switch', {}, { timeout: 5000 })
  expect(switchTab.getAttribute('data-selected')).toBe('true')
  expect(screen.getByTestId('tab-attack').getAttribute('data-selected')).toBeNull()
  const healthy = await screen.findByTestId('btn-switch-p1-b')
  expect(healthy.getAttribute('aria-disabled')).toBeNull()
  expect(screen.queryByTestId('btn-switch-p1-a')).toBeNull()
})

// ── sync-estado-combate: la presentación sigue al prefijo ya reproducido ──

function mustStep<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly message: string } },
): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const squirtleUid = parsePkmUid('p1-squirtle')

/** Precalienta el chunk lazy de la escena ANTES de instalar fake timers: el
 * import() dinámico necesita I/O real que los timers falsos no esperan. */
const warmBattleScene = async (): Promise<void> => {
  await import('../battle/ChoreographedBattle')
}

/** Flujo real (semilla 1, determinístico): Montaña/charmander + Squirtle en
 * banca → DebugEncounter(Abra) → FightEncounter → Retire a Squirtle. El Retire
 * arrastra el turno del rival en el MISMO lote (turno-automatico-rival): Abra
 * ataca a Squirtle con Psíquico (40 de daño) dentro del guion. `snapshot` es el
 * estado PRE-Retire (el prefijo ya reproducido que retiene PlayScreen). */
const retireFlow = (): {
  readonly fight: { readonly state: GameState; readonly script: readonly GameEvent[] }
  readonly snapshot: GameState
  readonly final: GameState
  readonly script: readonly GameEvent[]
} => {
  const montana = mustStep(startSession({ seed: 1, starterDeck: 'montana' }, gameContent))
  const starter = montana.state.players[0]!.team[0]!.uid
  const bench: PkmInstance = {
    uid: squirtleUid,
    cardId: parseCardId('squirtle'),
    damage: 0,
    xp: 0,
    equipped: [],
    multicolor: [],
    fainted: false,
  }
  const withBench = {
    ...montana,
    state: {
      ...montana.state,
      players: [{ ...montana.state.players[0]!, team: [...montana.state.players[0]!.team, bench] }],
    },
  }
  const drawn = mustStep(
    applyToSession(withBench, { type: 'DebugEncounter', deck: 'pantano', card: parseCardId('abra') }, gameContent),
  )
  const fight = mustStep(
    applyToSession(drawn.session, { type: 'FightEncounter', pkmUid: starter }, gameContent),
  )
  const retire = mustStep(applyToSession(fight.session, { type: 'Retire', to: squirtleUid }, gameContent))
  return {
    fight: { state: fight.session.state, script: [...fight.events] },
    snapshot: fight.session.state,
    final: retire.session.state,
    script: [...fight.events, ...retire.events],
  }
}

const mineHp = (view: ReturnType<typeof render>): string | null =>
  view.container.querySelector('[data-testid="battle-card-mine"] [data-hp]')?.getAttribute('data-hp') ?? null

const enemyHp = (view: ReturnType<typeof render>): string | null =>
  view.container.querySelector('[data-testid="battle-card-enemy"] [data-hp]')?.getAttribute('data-hp') ?? null

/** Render jsdom del popup con snapshot de presentación (flujo del guion). */
const popupScript = (
  state: GameState,
  script: readonly GameEvent[],
  viewState: GameState | null,
  props: {
    readonly speed?: '1x' | '2x' | 'skip'
    readonly reducedMotion?: boolean
    readonly onCommand?: (command: Command) => void
  } = {},
): ReturnType<typeof render> =>
  render(
    <BattlePopup
      state={state}
      legal={legal(state)}
      script={script}
      viewState={viewState}
      speed={props.speed ?? 'skip'}
      reducedMotion={props.reducedMotion ?? true}
      viewingOwn
      expanded={false}
      onExpandToggle={() => undefined}
      onCommand={props.onCommand ?? (() => undefined)}
      onContinue={() => undefined}
    />,
  )

// AC: sync-estado-combate/AC-2 - los actores que entran a escena se arman
// desde el snapshot del prefijo reproducido (daño/desmayo/condiciones), no
// desde el estado final; el final solo cubre lo que nace en el lote en curso
// (el roster rival del BattleStarted, sin daño previo en el prefijo).
test('AC: sync-estado-combate/AC-2 - presentationActorOf/presentationRivalEntry leen el prefijo', () => {
  const prefix = stateOf()
  const final: GameState = stateOf({
    battle: {
      ...battle(),
      conditions: {
        [parsePkmUid('p1-a')]: {
          rollGate: { failFaces: [1, 2], outcome: 'selfHit', duration: 'nextTurn' },
        },
      },
    },
    players: [
      {
        ...player(),
        team: [{ ...pkm('p1-a'), damage: 30, fainted: true }, pkm('p1-b', 'weedle')],
      },
    ],
  })
  const actor = presentationActorOf(prefix, final, parsePkmUid('p1-a'))
  expect(actor?.damage).toBe(0)
  expect(actor?.fainted).toBe(false)
  expect(actor?.conditions).toBeUndefined()
  // El rival del encuentro: snapshot sin batalla (primer lote) cae al final.
  const noBattle = stateOf({ battle: null })
  expect(presentationRivalEntry(noBattle, final, 'wild', 'weedle')?.uid).toBe(parsePkmUid('rival-1'))
  // Con batalla en el snapshot manda el prefijo; ref que no coincide, nada.
  expect(presentationRivalEntry(prefix, final, 'wild', 'weedle')?.damage).toBe(0)
  expect(presentationRivalEntry(prefix, final, 'wild', 'abra')).toBeUndefined()
})

// AC: sync-estado-combate/AC-1 - al cambiar de PKM con ataque rival en el
// mismo lote, el HP del que entra (Squirtle) no baja hasta que el evento de
// daño del guion se reproduce: la escena lo arma desde el prefijo (0 de daño)
// y el DamageTaken le recién los 40 de Psíquico cuando le toca.
test('AC: sync-estado-combate/AC-1 - el PKM que entra no llega golpeado: el HP baja con su evento', async () => {
  await warmBattleScene()
  vi.useFakeTimers()
  try {
    const flow = retireFlow()
    const hpMax = cardOf(parseCardId('squirtle'))?.hp ?? 0
    const view = popupScript(flow.final, flow.script, flow.snapshot, { speed: '1x', reducedMotion: false })
    // La escena monta lazy y corre a 1x: esperá a que Squirtle entre a escena.
    let entered = false
    for (let left = 120_000; left > 0 && !entered; left -= 250) {
      await vi.advanceTimersByTimeAsync(250)
      entered = mineHp(view) === `${String(hpMax)}/${String(hpMax)}`
    }
    expect(entered).toBe(true)
    // Corré el resto del guion (attackSelect + AttackUsed + DamageTaken).
    await vi.runAllTimersAsync()
    await vi.advanceTimersByTimeAsync(0)
    expect(mineHp(view)).toBe(`${String(hpMax - 40)}/${String(hpMax)}`)
  } finally {
    vi.useRealTimers()
  }
})

// AC: sync-estado-combate/AC-3 - al terminar el guion la escena muestra
// EXACTAMENTE el estado final del motor: el HP de ambos lados coincide con
// state.battle (sin drift residual entre presentación y motor).
test('AC: sync-estado-combate/AC-3 - guion completo: HP de la escena == estado final del motor', async () => {
  const flow = retireFlow()
  const view = popupScript(flow.final, flow.script, flow.snapshot)
  await view.findByTestId('battle-card-mine', {}, { timeout: 5000 })
  const squirtle = flow.final.players[0]!.team.find((pkm) => pkm.uid === squirtleUid)
  if (squirtle === undefined) throw new Error('squirtle no está en el equipo final')
  const battle = flow.final.battle
  if (battle === null) throw new Error('la batalla sigue viva tras el Retire')
  const rival = battle.rival[0]
  if (rival === undefined) throw new Error('roster rival vacío')
  const sMax = cardOf(squirtle.cardId)?.hp ?? 0
  const rMax = cardOf(rival.cardId)?.hp ?? 0
  await waitFor(() => {
    expect(mineHp(view)).toBe(`${String(sMax - squirtle.damage)}/${String(sMax)}`)
  })
  expect(enemyHp(view)).toBe(`${String(rMax - rival.damage)}/${String(rMax)}`)
})

// AC: sync-estado-combate/AC-4 - skip/reducedMotion resuelven instantáneo pero
// conservan el orden evento→visual: el actor que entra se arma igual desde el
// prefijo y los eventos parchean en orden ⇒ nada se adelanta ni se salta.
test('AC: sync-estado-combate/AC-4 - skip y reducedMotion: instantáneo, mismo estado final', async () => {
  const flow = retireFlow()
  const squirtle = flow.final.players[0]!.team.find((pkm) => pkm.uid === squirtleUid)!
  const sMax = cardOf(squirtle.cardId)?.hp ?? 0
  const expected = `${String(sMax - squirtle.damage)}/${String(sMax)}`
  const skipped = popupScript(flow.final, flow.script, flow.snapshot, { speed: 'skip', reducedMotion: false })
  await skipped.findByTestId('battle-card-mine', {}, { timeout: 5000 })
  await waitFor(() => {
    expect(mineHp(skipped)).toBe(expected)
  })
  cleanup()
  const reduced = popupScript(flow.final, flow.script, flow.snapshot, { speed: '1x', reducedMotion: true })
  await reduced.findByTestId('battle-card-mine', {}, { timeout: 5000 })
  await waitFor(() => {
    expect(mineHp(reduced)).toBe(expected)
  })
})

// AC: sync-estado-combate/AC-5 - mientras el guion corre los comandos de la
// escena no despachan (bloqueo por battleScriptPlaying) y el overlay de
// resultado solo aparece con el guion COMPLETO (fin-de-combate/AC-1 intacto).
test('AC: sync-estado-combate/AC-5 - bloqueo durante el guion y overlay solo al terminar', async () => {
  await warmBattleScene()
  vi.useFakeTimers()
  try {
    // Arranque del combate (charmander activo, turno propio): BattleStarted
    // tarda ~1,9 s a 1x ⇒ la escena montó pero el guion sigue corriendo.
    const flow = retireFlow()
    const onCommand = vi.fn()
    const view = popupScript(flow.fight.state, flow.fight.script, null, {
      speed: '1x',
      reducedMotion: false,
      onCommand,
    })
    let mounted = false
    for (let left = 120_000; left > 0 && !mounted; left -= 250) {
      await vi.advanceTimersByTimeAsync(250)
      mounted = view.queryByTestId('tab-attack') !== null
    }
    expect(view.queryByTestId('tab-attack')).toBeDefined()
    // Guion corriendo: la acción no despacha (bloqueada por battleScriptPlaying).
    fireEvent.click(view.queryAllByTestId(/btn-attack-/)[0]!)
    expect(onCommand).not.toHaveBeenCalled()
    // Overlay de resultado: solo con guion completo — acá no terminó la batalla.
    await vi.runAllTimersAsync()
    await vi.advanceTimersByTimeAsync(0)
    expect(view.queryByTestId('battle-result-overlay')).toBeNull()
    // Terminado el guion, el flujo de ataque vuelve a habilitarse.
    fireEvent.click(view.queryAllByTestId(/btn-attack-/)[0]!)
    fireEvent.click(view.getByTestId('btn-accept'))
    expect(onCommand).toHaveBeenCalledTimes(1)
    // Overlay con BattleEnded: ausente mientras corre, presente al terminar.
    cleanup()
    const won: readonly GameEvent[] = [
      { type: 'PokemonFainted', pkmUid: 'rival-1' },
      { type: 'BattleEnded', player: 'p1', result: 'won' },
      { type: 'XpGained', pkmUid: 'p1-a', amount: 1 },
    ]
    const ended = popupScript(stateOf({ battle: null }), won, null, { speed: '1x', reducedMotion: false })
    await vi.advanceTimersByTimeAsync(300)
    expect(ended.queryByTestId('battle-result-overlay')).toBeNull()
    await vi.runAllTimersAsync()
    await vi.advanceTimersByTimeAsync(0)
    expect(ended.queryByTestId('battle-result-overlay')).not.toBeNull()
  } finally {
    vi.useRealTimers()
  }
})
