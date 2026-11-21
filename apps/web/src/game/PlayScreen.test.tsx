// @vitest-environment jsdom
// AC: SPEC-D/T-034/AC-1/AC-2 — juego real: el tablero y los comandos del motor
// quedan cableados (data-command) y el autosave es visible. Proxy SSR; lo
// visual lo revisa el dueño (patrón T-030/T-033).
// cerrar-popup-mensajes: además interactivo (@testing-library) — el estado
// tileDismissed solo se ejercita clickeando de verdad.
import { renderToString } from 'react-dom/server'
import { act, cleanup, fireEvent, render, type RenderResult } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { STARTER_BY_DECK, createRng, legalCommands, type Command, type PkmInstance, type Result } from '@liga/engine'
import { DECK_IDS, parseCardId, parseNodeId, parsePkmUid } from '@liga/content'
import { movePathFromEvents } from '../board/Board'
import type { SpritesManifest } from '../battle/sprites'
import { restoredWildBattleSession } from '../battle/choreo/resume.fixtures'
import { useGameStore } from '../events/store'
import { es } from '../i18n/es'
import { battleScriptAfterCommand, battleShouldResume, battleViewAfterCommand, battleViewAfterScriptDone } from '../popup/model'
import { cardOf, contentHash, gameContent, starterTokenCard } from './content'
import { createMemoryStorage } from './save'
import { applyToSession, restoreSession, saveFromSession, startSession, type GameSession } from './session'
import { boardTokenSpecs, isBoardDiePurpose, PlayScreen } from './PlayScreen'

function must<T>(result: Result<T, { readonly message: string }>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const started = must(startSession({ seed: 7, starterDeck: 'isla' }, gameContent))
const storage = createMemoryStorage()

test('AC: SPEC-D/AC-1 - partida iniciada: turno, tirada de dado y autosave visibles', () => {
  const html = renderToString(
    <PlayScreen session={started} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain(es.playTurn)
  expect(html).toContain(es.phaseNames.organize)
  // T-074: el botón de tirar vive en panel-turn (btn-roll, AC-4).
  expect(html).toContain(es.hudRollButton)
  expect(html).toContain('data-testid="btn-roll"')
  expect(html).toContain('data-command="RollMove"')
  // dado-clicable/AC-1,AC-3: el dado de panel-dice tira igual (mismo comando).
  expect(html).toContain('data-testid="btn-roll-die"')
  expect(html).toContain(es.playAutosave)
})

// AC: SPEC-I/T-074 — el HUD llena los paneles del shell con el estado real.
test('AC: SPEC-I/T-074/AC-1,AC-3,AC-4 - equipo, jugadores y turno en los paneles del shell', () => {
  const html = renderToString(
    <PlayScreen session={started} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-team-strip="true"')
  expect(html).toContain('data-players-panel="true"')
  // AC-6: MVP de un jugador ⇒ una sola fila.
  expect((html.match(/data-testid="players-row"/g) ?? []).length).toBe(1)
  expect(html).toContain('data-turn-panel="true"')
  expect(html).toContain(es.hudTurnOf.replace('{name}', 'Jugador 1'))
})

// AC: SPEC-I/T-072/AC-1 — panel-history lleno desde el arranque (vacío al inicio).
test('AC: SPEC-I/T-072/AC-1 - el historial vive en panel-history con filtro y estado vacío', () => {
  const html = renderToString(
    <PlayScreen session={started} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="panel-history"')
  expect(html).toContain('data-history-panel="true"')
  expect(html).toContain(es.historyEmpty)
  expect(html).toContain('data-testid="history-filter-all"')
  expect(html).toContain('data-testid="history-filter-me"')
})

// AC: SPEC-I/T-073 — la mochila del jugador propio llena panel-backpack.
test('AC: SPEC-I/T-073/AC-1 - panel-backpack con las 5 filas y slots como destino de drop', () => {
  const html = renderToString(
    <PlayScreen session={started} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="panel-backpack"')
  expect(html).toContain('data-backpack-panel="true"')
  expect((html.match(/data-testid="backpack-row"/g) ?? []).length).toBe(5)
  expect(html).toContain('data-drop-target="pkm"')
})

// AC: SPEC-N/AC-4 — al cargar la partida el equipo arranca visible (estado local
// default false): panel-team con sus 6 slots y la pestaña en aria-expanded=true.
test('AC: SPEC-N/AC-4 - PlayScreen arranca con el equipo visible (6 slots) y la pestaña', () => {
  const html = renderToString(
    <PlayScreen session={started} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="panel-team"')
  expect(html).toContain('data-team-strip="true"')
  expect((html.match(/data-testid="team-slot"/g) ?? []).length).toBe(6)
  const tab = /<button[^>]*data-testid="btn-team-tab"[^>]*>/.exec(html)?.[0] ?? ''
  expect(tab).toContain('aria-expanded="true"')
  expect(tab).toContain('aria-controls="panel-team"')
  expect((/data-testid="btn-team-tab"[^>]*>([^<]*)</.exec(html)?.[1] ?? '').replace(/<!-- -->/g, '')).toBe(
    es.teamCollapse,
  )
})

test('AC: SPEC-D/AC-2 - tras tirar el dado, la UI ofrece las decisiones del motor', () => {
  const rolled = must(applyToSession(started, { type: 'RollMove' }, gameContent))
  const html = renderToString(
    <PlayScreen session={rolled.session} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('Tablero de Kanto')
  expect(html).toMatch(/Elegí camino|¿Qué querés hacer\?|Resolver casillero/)
  // dado-clicable/AC-2: fuera de organize el dado deja de ser botón (informativo).
  expect(html).not.toContain('data-testid="btn-roll-die"')
})

test('AC: SPEC-D/AC-2 - encuentro pendiente: Dejar ir envía ReleaseWild', () => {
  const session: GameSession = {
    ...started,
    state: {
      ...started.state,
      phase: 'tileResolution',
      pending: { type: 'FightOrRelease', card: 'poliwag', deck: 'pantano' },
    },
  }
  const html = renderToString(
    <PlayScreen session={session} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain(es.playWildAppeared.replace('{name}', 'Poliwag'))
  expect(html).toContain('data-command="ReleaseWild"')
})

// ── dado-de-combate: separación de rutas entre panel-dice y el popup ──

// AC: dado-de-combate/AC-2 - solo el dado de tablero (move/oportunidad)
// alimenta panel-dice; los propósitos de combate van al dado del popup.
test('AC: dado-de-combate/AC-2 - isBoardDiePurpose separa tiradas de tablero y de combate', () => {
  expect(isBoardDiePurpose('move')).toBe(true)
  expect(isBoardDiePurpose('oportunidad')).toBe(true)
  for (const purpose of ['attackSelect', 'gate', 'effect', 'wake', 'dodge', 'bonus'] as const) {
    expect(isBoardDiePurpose(purpose)).toBe(false)
  }
})

// AC: dado-de-combate/AC-6 - sin combate activo la UI queda idéntica: el dado
// de combate solo existe dentro del popup de combate.
test('AC: dado-de-combate/AC-6 - sin combate no existe battle-die en la UI', () => {
  const html = renderToString(
    <PlayScreen session={started} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="panel-dice"')
  expect(html).not.toContain('data-testid="battle-die"')
})

test('AC: SPEC-G/T-063/AC-2 - tras tirar el dado hay camino derivable y el tablero sigue renderizando', () => {
  const rolled = must(applyToSession(started, { type: 'RollMove' }, gameContent))
  const moved = rolled.events.some((event) => event.type === 'MoveStep')
  if (moved) {
    const path = movePathFromEvents(rolled.events, rolled.session.state.activePlayerId)
    expect(path).not.toBeNull()
    expect((path ?? []).length).toBeGreaterThanOrEqual(2)
  }
  // Sin WebGL (SSR) BoardHost cae al 2D: la partida nunca se rompe por la ficha.
  const html = renderToString(
    <PlayScreen session={rolled.session} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="board-2d"')
})

// AC: SPEC-G/T-064/AC-2 — el destino del vuelo de energía/ítem es la mochila
// (T-082 quitó el botón de inventario; DrawnCard apunta a panel-backpack).
test('AC: SPEC-G/T-064/AC-2 - el HUD tiene el panel de mochila (destino del vuelo)', () => {
  const html = renderToString(
    <PlayScreen session={started} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="panel-backpack"')
  expect(html).not.toContain('data-testid="btn-inventory"')
})

// AC: SPEC-I/T-075/AC-6 - popup-battle abre según el estado y falta del DOM si no corresponde.
test('AC: SPEC-I/T-075/AC-6 - popup-battle solo cuando hay combate (ausente sin él)', () => {
  const starterUid = started.state.players[0]?.team[0]?.uid
  if (starterUid !== undefined) {
    const battling: GameSession = {
      ...started,
      state: {
        ...started.state,
        phase: 'battle',
        battle: {
          kind: 'wild',
          card: parseCardId('weedle'),
          deck: 'bosque',
          rival: [{ uid: parsePkmUid('rival-1'), cardId: parseCardId('weedle'), damage: 0, fainted: false }],
          active: [starterUid, parsePkmUid('rival-1')],
          turnSide: 0,
          trainerId: null,
          conditions: {},
          firstTurn: [starterUid],
          participants: [starterUid],
          won: false,
          noAttackThisTurn: false,
          actedThisTurn: false,
          lostCount: 0,
        },
      },
    }
    const withBattle = renderToString(
      <PlayScreen session={battling} storage={storage} onExit={() => undefined} />,
    )
    expect(withBattle).toContain('data-testid="popup-battle"')
    expect(withBattle).toContain('data-battle-popup="battle"')
  }
  const idle = renderToString(
    <PlayScreen session={started} storage={storage} onExit={() => undefined} />,
  )
  expect(idle).not.toContain('data-testid="popup-battle"')
  expect(idle).not.toContain('data-testid="popup-card"')
})

// ── SPEC-R/T-103: ventana de carta del Pokémon (wiring con motor real) ──

const starterUid = started.state.players[0]?.team[0]?.uid ?? ''
const starterElementId = started.state.players[0]?.team[0]?.equipped[0]?.id ?? ''

/** Slice de la ventana de carta: del overlay (data-card-modal) hacia abajo
 * (incluye fondo, header con Cerrar, carta y panel lateral). */
const modalHtml = (html: string): string => {
  const start = html.indexOf('data-card-modal="true"')
  expect(start).toBeGreaterThanOrEqual(0)
  return html.slice(start)
}

const screen = (session: GameSession): string =>
  renderToString(
    <PlayScreen
      session={session}
      storage={storage}
      onExit={() => undefined}
      initialCardModalUid={starterUid}
    />,
  )

// AC: SPEC-R/T-103/AC-1 - el slot abre la ventana con la carta de ESE PKM;
// nombre completo, HP y filas de ataque presentes; sin overlay de equipo.
test('AC: SPEC-R/T-103/AC-1 - ventana de carta con el PKM seleccionado (nombre sin recortar)', () => {
  const html = modalHtml(screen(started))
  expect(html).toContain('data-card-modal="true"')
  expect(html).toContain(`data-uid="${starterUid}"`)
  expect(html).toContain('Squirtle')
  expect(screen(started)).not.toContain('data-team-panel="true"')
})

// AC: SPEC-R/T-103/AC-2 - botón Cerrar y fondo oscuro clicables presentes.
test('AC: SPEC-R/T-103/AC-2 - botón Cerrar y backdrop en el DOM', () => {
  const html = screen(started)
  expect(html).toContain('data-testid="btn-close"')
  expect(html).toContain('data-testid="modal-card-backdrop"')
})

// AC: SPEC-R/T-103/AC-9,AC-12 - flujo con el motor real: desequipar pasa la
// energía a Disponibles (apaga la fila por costo) y equipar la devuelve.
test('AC: SPEC-R/T-103/AC-9,AC-12 - equipar/desequipar actualiza la ventana en vivo', () => {
  const unequipped = must(
    applyToSession(started, { type: 'Unequip', pkmUid: starterUid, elementId: starterElementId }, gameContent),
  )
  const afterUnequip = modalHtml(screen(unequipped.session))
  expect(afterUnequip).toMatch(/<button[^>]*data-element="water"[^>]*data-command="Equip"/)
  expect(afterUnequip).toContain('data-available="false"')
  const reequipped = must(
    applyToSession(unequipped.session, { type: 'Equip', pkmUid: starterUid, elementId: starterElementId }, gameContent),
  )
  const afterEquip = modalHtml(screen(reequipped.session))
  expect(afterEquip).toMatch(/<button[^>]*data-element-id="element_water#1"[^>]*data-command="Unequip"/)
  expect(afterEquip).toContain('data-available="true"')
})

// AC: SPEC-R/T-103/AC-14 - en combate la ventana es de consulta: Solo lectura,
// sin botones de equipar/desequipar ni secciones de acción.
test('AC: SPEC-R/T-103/AC-14 - en combate: solo lectura, sin acciones', () => {
  const battling: GameSession = {
    ...started,
    state: {
      ...started.state,
      phase: 'battle',
      battle: {
        kind: 'wild',
        card: parseCardId('poliwag'),
        deck: 'bosque',
        rival: [
          { uid: parsePkmUid('rival-1'), cardId: parseCardId('poliwag'), damage: 0, fainted: false },
        ],
        active: [parsePkmUid(String(starterUid)), parsePkmUid('rival-1')],
        turnSide: 0,
        conditions: {},
        trainerId: null,
        firstTurn: [parsePkmUid(String(starterUid))],
        participants: [parsePkmUid(String(starterUid))],
        won: false,
        noAttackThisTurn: false,
        actedThisTurn: false,
        lostCount: 0,
      },
    },
  }
  const html = modalHtml(screen(battling))
  expect(html).toContain(es.modalReadOnly)
  expect(html).not.toContain('data-command="Equip"')
  expect(html).not.toContain('data-command="Unequip"')
  expect(html).not.toContain('data-command="Evolve"')
})

/** Sesión real con captura pendiente: Montaña/semilla 1 → DebugEncounter(Abra)
 * → pelear con Rasguños hasta vencer (turno del rival corre en cada Attack). */
const capturePendingSession = (): GameSession => {
  const montana = must(startSession({ seed: 1, starterDeck: 'montana' }, gameContent))
  const starter = montana.state.players[0]!.team[0]!.uid
  const drawn = must(
    applyToSession(montana, { type: 'DebugEncounter', deck: 'pantano', card: parseCardId('abra') }, gameContent),
  )
  const fight = must(
    applyToSession(drawn.session, { type: 'FightEncounter', pkmUid: starter }, gameContent),
  )
  let session = fight.session
  let guard = 0
  while (session.state.battle !== null && guard < 60) {
    guard += 1
    const command: Command =
      session.state.pending?.type === 'ChooseReplacement'
        ? { type: 'SendOut', pkmUid: session.state.pending.options[0]! }
        : { type: 'Attack' as const, attackId: 'rasgunos' }
    session = must(applyToSession(session, command, gameContent)).session
  }
  return session
}

// AC: fin-de-combate/AC-7 + captura-en-popup-combate/AC-1,AC-2 - la captura
// sigue siendo determinística (motor sin cambios): el montaje con guion vacío
// es el caso degradado (AC-8, partida restaurada/sin escena) ⇒ popup abierto
// con la decisión en su pie: "¿Capturar a Abra?" con Capturar (gated por
// Pokebolas) y Dejar ir, sin TilePanel de captura; Capture gasta la Pokebola
// y suma a Abra; Release devuelve la carta al fondo del mazo; en ambos casos
// el popup se cierra y el turno avanza.
test('AC: fin-de-combate/AC-7 - captura en el pie del popup: motor intacto (bola, pending, turno)', () => {
  const render = (session: GameSession): string =>
    renderToString(<PlayScreen session={session} storage={storage} onExit={() => undefined} />)
  const session = capturePendingSession()
  expect(session.state.pending?.type).toBe('CaptureOrRelease')
  // Popup abierto con la decisión en el pie (TilePanel sin captura, AC-2).
  const captureUi = render(session)
  expect(captureUi).toContain('data-testid="popup-battle"')
  expect(captureUi).toContain(es.tileCapturePrompt.replace('{name}', 'Abra'))
  expect(captureUi).toContain('data-testid="btn-capture"')
  expect(captureUi).toContain('data-command="Capture"')
  expect(captureUi).toContain('data-command="Release"')
  expect(captureUi).not.toContain('data-testid="tile-panel"')
  // Capture: gasta la Pokebola, Abra al equipo, popup cerrado y turno avanzado.
  const balls = session.state.players[0]!.items.pokeball
  const captured = must(applyToSession(session, { type: 'Capture' }, gameContent))
  expect(captured.session.state.players[0]!.items.pokeball).toBe(balls - 1)
  expect(captured.session.state.pending).toBeNull()
  expect(captured.session.state.phase).toBe('organize')
  expect(captured.session.state.turn).toBe(session.state.turn + 1)
  const afterCapture = render(captured.session)
  expect(afterCapture).not.toContain('data-testid="popup-battle"')
  expect(afterCapture).not.toContain('data-testid="tile-panel"')
  expect(afterCapture).not.toContain('data-testid="capture-footer"')
  expect(afterCapture).toContain('Abra')
  // Release: la carta vuelve al FONDO del mazo Pantano y el turno también avanza.
  const released = must(applyToSession(session, { type: 'Release' }, gameContent))
  expect(released.session.state.pending).toBeNull()
  expect(released.session.state.phase).toBe('organize')
  expect(released.session.state.turn).toBe(session.state.turn + 1)
  const pantano = released.session.state.decks.pantano
  expect(pantano[pantano.length - 1]).toBe('abra')
  expect(render(released.session)).not.toContain('data-testid="tile-panel"')
})

// AC: fin-de-combate/AC-8 + captura-en-popup-combate/AC-7 - "Continuar
// partida" con captura pendiente: el restore no re-emite eventos (guion
// vacío) ⇒ el popup abre directo con la decisión en su pie (escena
// degradada, sin coreografía que animar).
test('AC: fin-de-combate/AC-8 - partida restaurada con captura pendiente: decisión en el pie del popup', () => {
  const session = capturePendingSession()
  const restored = must(
    restoreSession(saveFromSession(session, contentHash), gameContent),
  )
  expect(restored.session.state.pending?.type).toBe('CaptureOrRelease')
  expect(restored.events).toEqual([])
  const html = renderToString(
    <PlayScreen session={restored.session} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="popup-battle"')
  expect(html).toContain(es.tileCapturePrompt.replace('{name}', 'Abra'))
  expect(html).toContain('data-command="Capture"')
  expect(html).toContain('data-command="Release"')
  expect(html).not.toContain('data-testid="tile-panel"')
})

// ── fix-combate-refresco: continuar partida con combate en curso ──

// AC: fix-combate-refresco/AC-1 - al continuar una partida restaurada en
// combate el popup abre con la escena reanudada desde state.battle (los PKM
// visibles con su HP los cubre BattlePopup.test en jsdom; SSR = chunk lazy).
test('AC: fix-combate-refresco/AC-1 - partida restaurada en combate: popup de combate abierto', () => {
  const session = restoredWildBattleSession()
  expect(session.state.battle).not.toBeNull()
  expect(battleShouldResume([], session.state.battle)).toBe(true)
  const html = renderToString(
    <PlayScreen session={session} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="popup-battle"')
  expect(html).toContain('data-battle-popup="battle"')
})

// AC: fix-combate-refresco/AC-2 - la escena reanudada acepta los comandos
// legales del motor y el guion acumula los eventos nuevos desde vacío.
test('AC: fix-combate-refresco/AC-2 - comandos legales tras el restore y guion acumulado', () => {
  const session = restoredWildBattleSession()
  const commands = legalCommands(session.state, { content: gameContent, rng: createRng(0) })
  const attack = commands.find((command) => command.type === 'Attack')
  expect(attack).toBeDefined()
  const step = must(applyToSession(session, attack!, gameContent))
  expect(step.events.length).toBeGreaterThan(0)
  expect(
    battleScriptAfterCommand([], attack!, step.events, step.session.state.battle !== null),
  ).toEqual(step.events)
})

// AC: fix-combate-refresco/AC-5 - sin regresión: restore con batalla terminada
// y captura pendiente resuelve por el pie del popup (captura-en-popup-combate).
test('AC: fix-combate-refresco/AC-5 - restore con captura pendiente: decisión en el pie del popup', () => {
  const session = capturePendingSession()
  const restored = must(restoreSession(saveFromSession(session, contentHash), gameContent))
  const html = renderToString(
    <PlayScreen session={restored.session} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="popup-battle"')
  expect(html).toContain(es.tileCapturePrompt.replace('{name}', 'Abra'))
  expect(html).toContain('data-command="Capture"')
  expect(html).toContain('data-command="Release"')
  expect(html).not.toContain('data-testid="tile-panel"')
})

// ── Plan probar-encuentro-abra: flujo completo robo → pelea → captura ──

// AC: probar-encuentro-abra/AC-6 - el botón dev manda DebugEncounter por send;
// el popup/panel ofrece Pelear/Liberar, el BattlePopup trae a Abra de rival y
// tras capturarla Abra queda en el team.
test('AC: probar-encuentro-abra/AC-6 - DebugEncounter abre el encuentro y la captura suma a Abra', () => {
  // Inicial Montaña (semilla 1): charmander le gana a Abra con Rasguños.
  const montana = must(startSession({ seed: 1, starterDeck: 'montana' }, gameContent))
  const starter = montana.state.players[0]!.team[0]!.uid
  const render = (session: GameSession): string =>
    renderToString(<PlayScreen session={session} storage={storage} onExit={() => undefined} />)

  // (a) En dev el botón existe al lado del anteojito y solo envía el comando.
  expect(render(montana)).toContain('data-testid="btn-dev-encounter"')

  // (b) Tras el comando: encuentro pendiente con Abra y botones Pelear/Liberar.
  const drawn = must(
    applyToSession(montana, { type: 'DebugEncounter', deck: 'pantano', card: parseCardId('abra') }, gameContent),
  )
  const withEncounter = render(drawn.session)
  expect(withEncounter).toContain(es.playWildAppeared.replace('{name}', 'Abra'))
  expect(withEncounter).toContain('data-command="FightEncounter"')
  expect(withEncounter).toContain('data-command="ReleaseWild"')

  // (c) Pelear: el BattlePopup abre con Abra de rival.
  const fight = must(
    applyToSession(drawn.session, { type: 'FightEncounter', pkmUid: starter }, gameContent),
  )
  const withBattle = render(fight.session)
  expect(withBattle).toContain('data-testid="popup-battle"')
  expect(withBattle).toContain('Abra')

  // (d) Batalla completa (dados de la semilla) + Capture: Abra pasa al team.
  // turno-automatico-rival: cada Attack arrastra el turno de Abra en el mismo
  // comando; el loop solo repone (SendOut) si cae el propio.
  let session = fight.session
  let guard = 0
  while (session.state.battle !== null && guard < 60) {
    guard += 1
    const command: Command =
      session.state.pending?.type === 'ChooseReplacement'
        ? { type: 'SendOut', pkmUid: session.state.pending.options[0]! }
        : { type: 'Attack' as const, attackId: 'rasgunos' }
    session = must(applyToSession(session, command, gameContent)).session
  }
  const captured = must(applyToSession(session, { type: 'Capture' }, gameContent))
  const after = render(captured.session)
  expect(after).toContain('data-team-strip="true"')
  expect((after.match(/data-testid="slot-name"/g) ?? []).length).toBeGreaterThan(0)
  expect(after).toContain('Abra')
  expect(after).not.toContain(es.playWildAppeared.replace('{name}', 'Abra'))
})

// ── ficha-inicial-fija: la ficha del tablero representa SIEMPRE al inicial base ──

/** Manifiesto falso: dex del charmander base (4) y de su evolución charmeleon (5). */
const evolveManifest: SpritesManifest = {
  4: { front: '/sprites/4.png', back: null },
  5: { front: '/sprites/5.png', back: null },
}

/** Equipo con otro PKM adelante del inicial (capturado/reorden/intercambio). */
const teamWithOtherFirst = (): GameSession => {
  const player = started.state.players[0]!
  const other: PkmInstance = {
    uid: parsePkmUid('p1-catch-1'),
    cardId: parseCardId('poliwag'),
    damage: 0,
    xp: 0,
    equipped: [],
    multicolor: [],
    fainted: false,
  }
  return {
    ...started,
    state: { ...started.state, players: [{ ...player, team: [other, ...player.team] }] },
  }
}

// AC: ficha-inicial-fija/AC-1 - con Evolve real aplicado al inicial (XP
// suficiente), el spec de la ficha resuelve spriteUrl/modelSpecies desde la
// carta inicial base del mazo, no desde el cardId evolucionado del equipo.
test('AC: ficha-inicial-fija/AC-1 - tras Evolve la ficha sigue mostrando el inicial base', () => {
  // Montaña/charmander → charmeleon: única evolución con ambas cartas en el contenido.
  const montana = must(startSession({ seed: 1, starterDeck: 'montana' }, gameContent))
  const uid = montana.state.players[0]!.team[0]!.uid
  const withXp: GameSession = {
    ...montana,
    state: {
      ...montana.state,
      players: montana.state.players.map((p) => ({
        ...p,
        team: p.team.map((pkm) => (pkm.uid === uid ? { ...pkm, xp: 2 } : pkm)),
      })),
    },
  }
  const evolved = must(applyToSession(withXp, { type: 'Evolve', pkmUid: uid, toId: 'charmeleon' }, gameContent))
  expect(evolved.session.state.players[0]!.team[0]!.cardId).toBe(parseCardId('charmeleon'))
  const tokens = boardTokenSpecs(evolved.session.state.players, evolved.session.starterDeck, evolveManifest)
  expect(tokens[0]!.modelSpecies).toBe('charmander')
  expect(tokens[0]!.spriteUrl).toBe('/sprites/4.png')
})

// AC: ficha-inicial-fija/AC-2 - parametrizado por los 5 mazos (STARTER_BY_DECK):
// cada inicial base se representa a sí mismo, con otro PKM de team[0] incluido.
test('AC: ficha-inicial-fija/AC-2 - cada mazo representa a su propio inicial base', () => {
  const players = teamWithOtherFirst().state.players
  for (const deck of DECK_IDS) {
    const expected = cardOf(STARTER_BY_DECK[deck])?.id ?? null
    expect(starterTokenCard(deck) === null ? null : starterTokenCard(deck)!.id).toBe(expected)
    const tokens = boardTokenSpecs(players, deck, null)
    expect(tokens[0]!.modelSpecies).toBe(expected)
    expect(tokens[0]!.modelSpecies).not.toBe('poliwag')
  }
})

// AC: ficha-inicial-fija/AC-3 - el spec no depende del orden del equipo: ni el
// reorden real (ReorderTeam) ni el intercambio con Oak cambian al representado.
test('AC: ficha-inicial-fija/AC-3 - reorden/intercambio con Oak no cambia la ficha', () => {
  const player = started.state.players[0]!
  const other: PkmInstance = {
    uid: parsePkmUid('p1-catch-1'),
    cardId: parseCardId('poliwag'),
    damage: 0,
    xp: 0,
    equipped: [],
    multicolor: [],
    fainted: false,
  }
  const withTwo: GameSession = {
    ...started,
    state: { ...started.state, players: [{ ...player, team: [...player.team, other] }] },
  }
  const reordered = must(
    applyToSession(withTwo, { type: 'ReorderTeam', uid: starterUid, to: 1 }, gameContent),
  )
  expect(reordered.session.state.players[0]!.team[0]!.cardId).toBe(parseCardId('poliwag'))
  expect(boardTokenSpecs(reordered.session.state.players, 'isla', null)[0]!.modelSpecies).toBe('squirtle')
  // Intercambio con Oak: el inicial en la pila, otro PKM en el equipo.
  const oakSwapped: GameSession = {
    ...started,
    state: {
      ...started.state,
      players: [{ ...player, team: [other], oakPile: [...player.oakPile, ...player.team] }],
    },
  }
  expect(boardTokenSpecs(oakSwapped.state.players, 'isla', null)[0]!.modelSpecies).toBe('squirtle')
})

// AC: ficha-inicial-fija/AC-4 - sin manifest el sprite cae a null y el peón de
// color del tablero queda intacto (el 2D sigue renderizando); sin carta del
// inicial en el contenido (bosque) también cae a peón.
test('AC: ficha-inicial-fija/AC-4 - sin sprites: spriteUrl null, peón de color intacto', () => {
  const tokens = boardTokenSpecs(started.state.players, 'isla', null)
  expect(tokens[0]!.spriteUrl).toBeNull()
  expect(tokens[0]!.modelSpecies).toBe('squirtle')
  const noCard = boardTokenSpecs(started.state.players, 'bosque', null)
  expect(noCard[0]!.spriteUrl).toBeNull()
  expect(noCard[0]!.modelSpecies).toBeNull()
  const html = renderToString(
    <PlayScreen session={started} storage={storage} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="board-2d"')
})

// ── sync-estado-combate: retención del snapshot de presentación ──

// AC: sync-estado-combate/AC-2 - sendOnce retiene el prefijo ya reproducido:
// el PRIMER lote del guion fija el estado PRE-comando como snapshot; los
// siguientes lotes lo mantienen (el propio aún no terminó de mostrarse); sin
// guion vivo se suelta y al terminar el guion la presentación pasa al final.
test('AC: sync-estado-combate/AC-2 - battleViewAfterCommand/AfterScriptDone retienen el prefijo', () => {
  const before = started.state
  const after = { ...started.state, turn: started.state.turn + 1 }
  expect(battleViewAfterCommand(null, before, true)).toBe(before)
  expect(battleViewAfterCommand(after, before, true)).toBe(after)
  expect(battleViewAfterCommand(after, before, false)).toBeNull()
  expect(battleViewAfterScriptDone(true, after)).toBe(after)
  expect(battleViewAfterScriptDone(false, after)).toBeNull()
})

// ── cerrar-popup-mensajes: descartar los mensajes del panel de casillero ──
// Interactivo (jsdom): tileDismissed es estado interno de PlayScreen que solo
// se ejercita clickeando; los comandos van por la UI real (btn-advance/btn-roll
// y los botones de camino del tablero 2D).

afterEach(() => {
  cleanup()
  useGameStore.setState({ isPlaying: false })
})

/** Sesión parada en un casillero a punto de resolver (tileResolution sin pending). */
const landedAt = (nodeId: string, oakPile: readonly PkmInstance[] = []): GameSession => ({
  ...started,
  state: {
    ...started.state,
    phase: 'tileResolution',
    pending: null,
    players: started.state.players.map((player, index) =>
      index === 0 ? { ...player, position: parseNodeId(nodeId), oakPile } : player,
    ),
  },
})

const renderPlay = (session: GameSession): RenderResult =>
  render(
    <PlayScreen
      session={session}
      storage={storage}
      onExit={() => undefined}
      boardMode="2d"
    />,
  )

const tilePanelOf = (view: RenderResult): Element | null =>
  view.container.querySelector('[data-testid="tile-panel"]')

const click = (view: RenderResult, selector: string): void => {
  const target = view.container.querySelector(selector)
  expect(target, selector).not.toBeNull()
  fireEvent.click(target!)
}

// AC: cerrar-popup-mensajes/AC-1 - con mensajes visibles y sin decisión
// pendiente el panel muestra Cerrar; al clickkearlo desaparece del overlay.
test('AC: cerrar-popup-mensajes/AC-1 - Cerrar descarta el panel del overlay', () => {
  const view = renderPlay(landedAt('pb_415'))
  click(view, '[data-testid="btn-advance"]')
  const tilePanel = tilePanelOf(view)
  expect(tilePanel).not.toBeNull()
  expect(tilePanel?.textContent).toContain(es.tileMsgNone)
  const close = view.container.querySelector('[data-testid="btn-tile-close"]')
  expect(close?.textContent).toBe(es.shellTipClose)
  fireEvent.click(close!)
  expect(tilePanelOf(view)).toBeNull()
})

// AC: cerrar-popup-mensajes/AC-2 - con decisión pendiente (OakSwap) Cerrar
// oculta SOLO los mensajes: el panel sigue visible con sus botones de decisión.
test('AC: cerrar-popup-mensajes/AC-2 - Cerrar oculta los mensajes, no la decisión', () => {
  const withPile = landedAt('oak_b', [
    {
      uid: parsePkmUid('p1-oak-1'),
      cardId: parseCardId('poliwag'),
      damage: 0,
      xp: 0,
      equipped: [],
      multicolor: [],
      fainted: false,
    },
  ])
  const view = renderPlay(withPile)
  click(view, '[data-testid="btn-advance"]')
  const tilePanel = tilePanelOf(view)
  expect(tilePanel).not.toBeNull()
  expect(tilePanel?.textContent).toContain(es.tileMsgOak)
  expect(tilePanel?.querySelector('[data-testid="btn-oak-swap"]')).not.toBeNull()
  fireEvent.click(view.container.querySelector('[data-testid="tile-panel"] [data-testid="btn-tile-close"]')!)
  const afterClose = tilePanelOf(view)
  expect(afterClose).not.toBeNull()
  expect(afterClose?.textContent).not.toContain(es.tileMsgOak)
  expect(afterClose?.querySelector('[data-testid="btn-skip"]')).not.toBeNull()
  expect(afterClose?.querySelector('[data-testid="btn-oak-swap"]')).not.toBeNull()
})

// AC: cerrar-popup-mensajes/AC-3 - al llegar eventos nuevos de casillero (nueva
// tirada + camino + resolución) los mensajes vuelven: el cierre no persiste.
test('AC: cerrar-popup-mensajes/AC-3 - una nueva tirada vuelve a mostrar los mensajes', () => {
  const view = renderPlay(landedAt('pb_415'))
  click(view, '[data-testid="btn-advance"]')
  click(view, '[data-testid="btn-tile-close"]')
  expect(tilePanelOf(view)).toBeNull()
  // Nueva tirada desde pb_415 (semilla 7 ⇒ paso 1): camino al mercado_b y
  // resolución ⇒ robo del mazo Ítem (evento nuevo de casillero).
  click(view, '[data-testid="btn-roll"]')
  click(view, '[data-decision="choose-path"][data-node="mercado_b"]')
  click(view, '[data-testid="btn-advance"]')
  const reopened = tilePanelOf(view)
  expect(reopened).not.toBeNull()
  expect(reopened?.textContent).toContain(
    es.tileMsgCardDrawn.split('{card}')[1]!.replace('{deck}', es.tileDeckNames.item),
  )
})

// AC: cerrar-popup-mensajes/AC-4 - el cierre del panel no toca el error del
// motor (role="alert") ni la nota de reproducción (isPlaying).
test('AC: cerrar-popup-mensajes/AC-4 - error y nota de reproducción sobreviven al cierre', () => {
  const view = renderPlay(landedAt('pb_415'))
  click(view, '[data-testid="btn-advance"]')
  click(view, '[data-testid="btn-tile-close"]')
  expect(tilePanelOf(view)).toBeNull()
  // Nota de reproducción: visible con el panel descartado.
  act(() => {
    useGameStore.setState({ isPlaying: true })
  })
  expect(view.container.textContent).toContain(es.playReproducing)
  act(() => {
    useGameStore.setState({ isPlaying: false })
  })
  // Error del motor: comando ilegal desde la UI (dev en fase moving) ⇒ el
  // role="alert" queda visible con el panel descartado y no lo reabre.
  click(view, '[data-testid="btn-roll"]')
  click(view, '[data-testid="btn-dev-encounter"]')
  const alert = view.container.querySelector('[role="alert"]')
  expect(alert?.textContent).toContain('decisión pendiente')
  expect(tilePanelOf(view)).toBeNull()
})

