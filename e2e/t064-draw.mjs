// AC: SPEC-G/T-064/AC-5 — e2e del robo animado: con ?seed y ?dice forzados
// (speed=skip + reducedMotion, como t061) llega a cada mazo de terreno y al
// Mercado, y verifica POR TEXTO el nombre de la carta robada:
// - PKM ⇒ el robo termina en popup-encounter (unificar-popup-encuentro): carta
//   grande + decisión, sin popup-card ni drawn-card (plan multi-turno: roba del
//   mismo mazo hasta que salga el PKM del mazo dev).
// - energía/ítem ⇒ el panel de casillero muestra el mensaje con el nombre.
// Uso: pnpm e2e
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { loadContent } from '../packages/content/src/loader.ts'
import { es } from '../apps/web/src/i18n/es.ts'
import { newGame } from '../packages/engine/src/index.ts'
import {
  cardLabel,
  cardName,
  findRoute,
  newSkipContext,
  selectorFor,
  startDevServer,
  waitForServer,
  waitVisible,
} from './route.mjs'

const SEED = 7
const STARTER = 'isla'
const PORT = 4173
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const content = loadContent(join(ROOT, 'content'))
const isPkm = (card) => content.cards.some((candidate) => candidate.id === card)

/** Plan multi-turno: roba del mazo `deck` hasta que salga un PKM (mazo dev). */
function planUntilPkm(deck, maxTurns) {
  const started = newGame({ seed: SEED, starterDeck: STARTER, ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  let state = started.value.state
  let cursor = 0
  const actions = []
  const dice = []
  for (let turn = 0; turn < maxTurns; turn += 1) {
    const route = findRoute(
      content, SEED, STARTER,
      (node) => node.type === 'deck' && node.deck === deck,
      state, cursor,
    )
    actions.push(...route.actions)
    dice.push(...route.dice)
    cursor += route.dice.length
    state = route.resolved.state
    const drawn = route.resolved.events.find((event) => event.type === 'CardDrawn')
    if (drawn !== undefined && isPkm(drawn.card)) {
      return { actions, dice, drawn: drawn.card }
    }
  }
  return null
}

/** El mazo de terreno cuyo PKM sale antes (menos tiradas totales). */
function shortestPkmPlan() {
  const decks = ['bosque', 'montana', 'isla', 'llanura', 'pantano']
  let best = null
  for (const deck of decks) {
    const plan = planUntilPkm(deck, 8)
    if (plan === null) continue
    if (best === null || plan.dice.length < best.dice.length) best = { ...plan, deck }
  }
  return best
}

async function runActions(page, actions) {
  for (const action of actions) {
    const button = await waitVisible(page, selectorFor(action))
    await button.click()
    await sleep(60)
  }
}

async function runTarget(browser, target) {
  const route = findRoute(content, SEED, STARTER, target.match)
  const drawn = route.resolved.events.find((event) => event.type === 'CardDrawn')
  if (drawn === undefined) throw new Error('la ruta no robó ninguna carta')
  const label = cardLabel(content, drawn.card)
  const { context, page, pageErrors } = await newSkipContext(browser, {
    seed: SEED,
    dice: route.dice,
    baseUrl: BASE_URL,
    starter: STARTER,
  })
  await runActions(page, route.actions)
  // unificar-popup-encuentro/AC-1: si salió un PKM, la decisión vive en el
  // popup (sin tile-panel); el nombre se verifica en el popup.
  if (route.resolved.state.pending?.type === 'FightOrRelease') {
    const popup = await waitVisible(page, '[data-testid="popup-encounter"]')
    const popupText = await popup.innerText()
    if (!popupText.includes(label)) throw new Error(`[${target.name}] falta en el popup: "${label}"`)
    await waitVisible(page, '[data-testid="btn-release"]', 3_000)
    if (pageErrors.length > 0) throw new Error(`[${target.name}] errores de página: ${pageErrors.join(' | ')}`)
    await context.close()
    return { name: target.name, card: label, pkm: true }
  }
  const panel = await waitVisible(page, '[data-testid="tile-panel"]')
  const panelText = await panel.innerText()
  if (!panelText.includes(label)) throw new Error(`[${target.name}] falta en el panel: "${label}"`)
  if (pageErrors.length > 0) throw new Error(`[${target.name}] errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
  return { name: target.name, card: label, pkm: isPkm(drawn.card) }
}

/** AC-5 + unificar-popup-encuentro/AC-1: el robo de un PKM termina en el popup
 * de encuentro (carta grande + decisión), sin popup-card ni tile-panel. */
async function runPkmCase(browser, plan) {
  const name = cardName(content, plan.drawn)
  const { context, page, pageErrors } = await newSkipContext(browser, {
    seed: SEED,
    dice: plan.dice,
    baseUrl: BASE_URL,
    starter: STARTER,
  })
  await runActions(page, plan.actions)
  const popup = await waitVisible(page, '[data-testid="popup-encounter"]')
  const popupText = await popup.innerText()
  if (!popupText.includes(name)) throw new Error(`[pkm ${plan.deck}] el popup no muestra "${name}"`)
  if (!popupText.includes(es.playWildAppeared.replace('{name}', name))) {
    throw new Error(`[pkm ${plan.deck}] falta el título del encuentro`)
  }
  if ((await page.locator('[data-testid="popup-card"]').count()) > 0) {
    throw new Error(`[pkm ${plan.deck}] popup-card duplica el encuentro`)
  }
  if ((await page.locator('[data-testid="drawn-card"]').count()) > 0) {
    throw new Error(`[pkm ${plan.deck}] la carta del robo no cedió al popup`)
  }
  await waitVisible(page, '[data-testid="btn-release"]', 3_000)
  if ((await popup.locator('[data-testid="card-face"]').count()) !== 1) {
    throw new Error(`[pkm ${plan.deck}] falta card-face en el popup`)
  }

  // AC-2 (T-082) + SPEC-R/T-103: el slot del equipo abre la ventana de carta
  // (modal-card) aunque el encuentro siga abierto; se cierra con btn-close.
  await page.locator('[data-testid="team-slot-open"]').first().click()
  await waitVisible(page, '[data-testid="modal-card"]')
  await page.locator('[data-testid="btn-close"]').click()
  // La ventana sale con su animación (animationMs 180 + margen).
  await sleep(400)
  if ((await page.locator('[data-card-modal="true"]').count()) > 0) {
    throw new Error(`[pkm ${plan.deck}] la ventana de carta no se cerró`)
  }
  if ((await page.locator('[data-testid="popup-encounter"]').count()) !== 1) {
    throw new Error(`[pkm ${plan.deck}] el popup de encuentro no sobrevivió a la consulta`)
  }
  if (pageErrors.length > 0) throw new Error(`[pkm ${plan.deck}] errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
  return { name: `pkm ${plan.deck} (${String(plan.dice.length)} tiradas)`, card: name, pkm: true }
}

const targets = [
  { name: 'deck bosque', match: (node) => node.type === 'deck' && node.deck === 'bosque' },
  { name: 'deck montana', match: (node) => node.type === 'deck' && node.deck === 'montana' },
  { name: 'deck isla', match: (node) => node.type === 'deck' && node.deck === 'isla' },
  { name: 'deck llanura', match: (node) => node.type === 'deck' && node.deck === 'llanura' },
  { name: 'deck pantano', match: (node) => node.type === 'deck' && node.deck === 'pantano' },
  { name: 'mercado (mazo Ítem)', match: (node) => node.type === 'mercado' },
]

const server = startDevServer(ROOT, PORT)
const browser = await chromium.launch()
let failed = 0
const seen = []
try {
  await waitForServer(BASE_URL)
  const pkmPlan = shortestPkmPlan()
  if (pkmPlan === null) throw new Error(`ningún mazo dev suelta PKM en 8 turnos con seed ${String(SEED)}`)
  for (const target of targets) {
    try {
      const summary = await runTarget(browser, target)
      seen.push(summary)
      console.log(`ok   ${summary.name} — robó: ${summary.card}`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${target.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  try {
    const summary = await runPkmCase(browser, pkmPlan)
    seen.push(summary)
    console.log(`ok   ${summary.name} — robó: ${summary.card} (carta en pantalla)`)
  } catch (error) {
    failed += 1
    console.error(`FAIL caso pkm: ${error instanceof Error ? error.message : String(error)}`)
  }
} finally {
  await browser.close()
  server.kill()
}

if (failed > 0) {
  console.error(`\n${String(failed)} de ${String(seen.length + failed)} casos fallaron`)
  process.exit(1)
}
console.log(`\ne2e T-064: ${String(seen.length)} robos con nombre verificado por texto`)

