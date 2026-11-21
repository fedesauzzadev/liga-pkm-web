// Helpers e2e compartidos (T-061 → T-064): planificación de rutas con el motor
// mismo (BFS determinista con dados forzados), driver de UI por data-attributes
// y dev server de Vite. Corren contra el dev server (import.meta.env.DEV).
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { es } from '../apps/web/src/i18n/es.ts'
import { applyCommand, createRng, newGame } from '../packages/engine/src/index.ts'

// ── RNG con dados forzados: espejo exacto de devmode.ts (misma semántica de cola). ──

/** Un paso simulado: comando + cursor de la cola forzada ⇒ resultado + cursor siguiente. */
export function step(state, command, cursor, forcedRoll, content) {
  const base = createRng(state.rngState)
  let next = cursor
  const rng = {
    d6: () => {
      if (forcedRoll !== undefined) {
        next += 1
        return forcedRoll
      }
      return base.d6()
    },
    int: (maxExclusive) => base.int(maxExclusive),
    snapshot: () => base.snapshot(),
  }
  const result = applyCommand(state, command, { content, rng })
  return { result, cursor: next }
}

// ── BFS sobre estados del motor: encuentra la secuencia de acciones que aterriza
// en el casillero objetivo. La clave incluye mazos y rngState para que la ruta
// encontrada se reproduzca EXACTA en la UI (dados forzados ⇒ determinista). ──

function stateKey(state) {
  const pending = state.pending === null
    ? '-'
    : `${state.pending.type}:${state.pending.type === 'ChoosePath' ? state.pending.options.join('/') : ''}`
  // Clave de ALCANZABILIDAD de movimiento: mazos y rngState no afectan qué
  // movimientos son posibles (los dados son ramas y el robo siempre cierra en
  // organize), y la ruta elegida se reproduce exacta por determinismo.
  return [
    state.phase,
    state.players[0].position,
    String(state.players[0].cameFrom),
    String(state.stepsLeft),
    pending,
  ].join('|')
}

function expansion(state) {
  if (state.pending !== null) {
    switch (state.pending.type) {
      case 'ChoosePath':
        return state.pending.options.map((to) => ({ type: 'ChoosePath', to }))
      case 'StopOrContinue':
        return [{ type: 'StopHere' }, { type: 'ContinueMoving' }]
      case 'FightOrRelease':
        return [{ type: 'ReleaseWild' }]
      case 'OakSwap':
      case 'ChallengeGym':
        return [{ type: 'Advance' }]
      default:
        return []
    }
  }
  if (state.phase === 'organize') {
    return [1, 2, 3, 4, 5, 6].map((roll) => ({ type: 'RollMove', roll }))
  }
  if (state.phase === 'tileResolution') return [{ type: 'Advance' }]
  return []
}

/** Ruta hasta un casillero que cumple `match(node)` + el resultado de resolverlo.
 *  `start`/`startCursor` permiten planificar desde un estado ya avanzado (e2e
 *  multi-turno, p. ej. robar del mismo mazo hasta que salga un PKM). */
export function findRoute(content, seed, starter, match, start = null, startCursor = 0) {
  const nodesById = new Map(content.board.nodes.map((node) => [node.id, node]))
  const started = start === null
    ? newGame({ seed, starterDeck: starter, ruleset: content.ruleset }, content)
    : null
  if (started !== null && !started.ok) throw new Error(started.error.message)
  const first = started !== null ? started.value.state : start
  const queue = [{ state: first, cursor: startCursor, actions: [] }]
  const seen = new Set()
  let explored = 0
  while (queue.length > 0) {
    const node = queue.shift()
    explored += 1
    if (explored > 20_000) throw new Error('BFS sin solución (tope de estados)')
    const key = stateKey(node.state)
    if (seen.has(key)) continue
    seen.add(key)
    const at = nodesById.get(node.state.players[0].position)
    if (
      at !== undefined && match(at) &&
      node.state.phase === 'tileResolution' && node.state.pending === null
    ) {
      // Aterrizó: resolver el casillero es la última acción de la ruta.
      const resolveStep = step(node.state, { type: 'Advance' }, node.cursor, undefined, content)
      if (!resolveStep.result.ok) throw new Error(resolveStep.result.error.message)
      return {
        actions: [...node.actions, { type: 'Advance' }],
        dice: node.actions.filter((action) => action.type === 'RollMove').map((action) => action.roll),
        resolved: resolveStep.result.value,
      }
    }
    for (const command of expansion(node.state)) {
      const forcedRoll = command.type === 'RollMove' ? command.roll : undefined
      const { result, cursor } = step(node.state, { type: command.type, ...command }, node.cursor, forcedRoll, content)
      if (!result.ok) continue
      queue.push({ state: result.value.state, cursor, actions: [...node.actions, command] })
    }
  }
  throw new Error('sin ruta al casillero objetivo')
}

// ── Expectativas del panel (mismos textos que TilePanel; JSX no importa acá). ──

export function cardName(content, card) {
  return content.cards.find((c) => c.id === card)?.name ?? card
}

export function cardLabel(content, card) {
  if (card.startsWith('element_')) {
    const element = card.slice('element_'.length)
    return es.tileEnergyCard.replace('{element}', es.elementNames[element] ?? element)
  }
  if (card in es.tileItemNames) return es.tileItemNames[card]
  return cardName(content, card)
}

// ── Driver de UI ──

export const selectorFor = (action) => {
  switch (action.type) {
    case 'RollMove':
      return '[data-command="RollMove"]'
    case 'ChoosePath':
      return `[data-decision="choose-path"][data-node="${action.to}"]`
    case 'StopHere':
      return '[data-decision="stop-here"]'
    case 'ContinueMoving':
      return '[data-decision="continue"]'
    default:
      return `[data-command="${action.type}"]`
  }
}

export async function waitVisible(page, selector, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const locator = page.locator(selector).first()
    if ((await locator.count()) > 0 && (await locator.isVisible())) return locator
    await sleep(80)
  }
  throw new Error(`no apareció ${selector}`)
}

/** Contexto con settings deterministas para e2e (skip + reducedMotion) y partida
 * iniciada con ?seed y ?dice forzados. `viewport` fija el tamaño (por defecto
 * el del navegador, 1280×720). */
export async function newSkipContext(browser, options) {
  const { seed, dice, baseUrl, starter, viewport } = options
  const context = await browser.newContext(viewport === undefined ? {} : { viewport })
  await context.addInitScript(() => {
    globalThis.localStorage.setItem(
      'liga-pkm:settings',
      JSON.stringify({ speed: 'skip', sound: false, reducedMotion: true }),
    )
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.goto(`${baseUrl}/?seed=${String(seed)}&dice=${dice.join(',')}`)
  await waitVisible(page, '[data-action="new-game"]').then((button) => button.click())
  await waitVisible(page, `[data-deck="${starter}"]`).then((button) => button.click())
  await waitVisible(page, '[data-testid="tile-panel"], [data-command="RollMove"]')
  return { context, page, pageErrors }
}

// ── Dev server ──

export async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(url)
      if (response.ok) return
    } catch {
      // todavía levantando
    }
    await sleep(250)
  }
  throw new Error(`el dev server no respondió en ${url}`)
}

export function startDevServer(root, port) {
  const server = spawn(
    process.execPath,
    [join('node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort'],
    { cwd: join(root, 'apps', 'web'), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  server.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${String(chunk)}`))
  return server
}
