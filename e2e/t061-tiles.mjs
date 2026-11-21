// AC: SPEC-G/T-061/AC-5 — e2e: con ?seed y ?dice forzados llega a CADA tipo de
// casillero del tablero real de kanto y comprueba texto y botones del panel por
// data-testid. Incluye robar de los 5 mazos y del mazo Ítem.
//
// Cómo funciona: la ruta se PLANIFICA con el motor mismo (BFS determinista con
// los dados forzados de devmode, ver apps/web/src/game/devmode.ts) y después se
// maneja la UI haciendo clic en los botones data-command/data-decision. Corre
// contra el dev server (import.meta.env.DEV), NO contra el build de producción.
// Uso: pnpm e2e (helpers compartidos en e2e/route.mjs).
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { loadContent } from '../packages/content/src/loader.ts'
import { es } from '../apps/web/src/i18n/es.ts'
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

// ── Expectativas del panel (mismos textos que TilePanel; JSX no importa acá). ──

function messageOf(event) {
  switch (event.type) {
    case 'CardDrawn':
      return es.tileMsgCardDrawn
        .replace('{card}', cardLabel(content, event.card))
        .replace('{deck}', es.tileDeckNames[event.deck])
    case 'EnergyGained':
      return es.tileMsgEnergyGained.replace('{element}', es.elementNames[event.element])
    case 'PartyHealed':
      return es.tileMsgPartyHealed.replace('{count}', String(event.count))
    case 'TileResolved':
      if (event.info === 'none') return es.tileMsgNone
      if (event.info === 'oak') return es.tileMsgOak
      return es.tileMsgDisabled
    case 'DeckEmpty':
      return es.tileMsgDeckEmpty.replace('{deck}', es.tileDeckNames[event.deck])
    case 'GymLocked':
      return es.battleMsgGymLocked.replace('{n}', String(event.requiresMedals))
    default:
      return null
  }
}

function expectedPanel(resolved) {
  const pending = resolved.state.pending
  const isEncounter = pending?.type === 'FightOrRelease'
  // unificar-popup-encuentro/AC-1: con FightOrRelease el panel NO muestra el
  // robo ni botones — la decisión vive en popup-encounter.
  const texts = resolved.events
    .map(messageOf)
    .filter((text) => text !== null && !(isEncounter && text.startsWith('Robaste')))
  const buttons = []
  if (pending?.type === 'ChallengeGym') buttons.push('btn-challenge', 'btn-skip')
  if (pending?.type === 'OakSwap') buttons.push('btn-oak-swap', 'btn-skip')
  return { texts, buttons, isEncounter }
}

// ── Driver de UI ──

async function runTarget(browser, target) {
  const route = findRoute(content, SEED, STARTER, target.match)
  const { texts, buttons, isEncounter } = expectedPanel(route.resolved)
  const { context, page, pageErrors } = await newSkipContext(browser, {
    seed: SEED,
    dice: route.dice,
    baseUrl: BASE_URL,
    starter: STARTER,
  })
  for (const action of route.actions) {
    const button = await waitVisible(page, selectorFor(action))
    await button.click()
    await sleep(60)
  }
  if (isEncounter) {
    // unificar-popup-encuentro/AC-1: la decisión vive en popup-encounter (sin
    // tile-panel, sin popup-card, con btn-fight-*/btn-release).
    const pending = route.resolved.state.pending
    const popup = await waitVisible(page, '[data-testid="popup-encounter"]')
    const popupText = await popup.innerText()
    const name = cardName(content, pending.card)
    if (!popupText.includes(es.playWildAppeared.replace('{name}', name))) {
      throw new Error(`[${target.name}] falta el título del encuentro con ${name}`)
    }
    if ((await page.locator('[data-testid="popup-card"]').count()) > 0) {
      throw new Error(`[${target.name}] popup-card duplica el encuentro`)
    }
    if ((await page.locator('[data-testid="tile-panel"]').count()) > 0) {
      throw new Error(`[${target.name}] tile-panel visible durante el encuentro`)
    }
    await waitVisible(page, '[data-testid="btn-release"]', 3_000)
    if (pageErrors.length > 0) throw new Error(`[${target.name}] errores de página: ${pageErrors.join(' | ')}`)
    await context.close()
    return { name: target.name, dice: route.dice.length, texts: texts.length, buttons: ['popup-encounter'] }
  }
  const panel = await waitVisible(page, '[data-testid="tile-panel"]')
  const panelText = await panel.innerText()
  for (const text of texts) {
    if (!panelText.includes(text)) throw new Error(`[${target.name}] falta en el panel: "${text}"`)
  }
  for (const testid of buttons) {
    await waitVisible(page, `[data-testid="${testid}"]`, 3_000)
  }
  const allButtons = ['btn-capture', 'btn-release', 'btn-challenge', 'btn-skip', 'btn-oak-swap']
  for (const testid of allButtons.filter((candidate) => !buttons.includes(candidate))) {
    const count = await page.locator(`[data-testid="${testid}"]`).count()
    if (count > 0) throw new Error(`[${target.name}] no debería estar: ${testid}`)
  }
  if (pageErrors.length > 0) throw new Error(`[${target.name}] errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
  return { name: target.name, dice: route.dice.length, texts: texts.length, buttons }
}

// ── Targets: CADA tipo de casillero + robo de los 5 mazos y de Ítem. ──

const targets = [
  { name: 'start', match: (node) => node.type === 'start' },
  { name: 'oak', match: (node) => node.type === 'oak' },
  { name: 'gym cerrojo (giovanni)', match: (node) => node.type === 'gym' && node.gym === 'giovanni' },
  { name: 'gym desafiable (erika)', match: (node) => node.type === 'gym' && node.gym === 'erika' },
  { name: 'centro', match: (node) => node.type === 'centro' },
  { name: 'mercado (mazo Ítem)', match: (node) => node.type === 'mercado' },
  { name: 'empty', match: (node) => node.type === 'empty' },
  { name: 'deck bosque', match: (node) => node.type === 'deck' && node.deck === 'bosque' },
  { name: 'deck montana', match: (node) => node.type === 'deck' && node.deck === 'montana' },
  { name: 'deck isla', match: (node) => node.type === 'deck' && node.deck === 'isla' },
  { name: 'deck llanura', match: (node) => node.type === 'deck' && node.deck === 'llanura' },
  { name: 'deck pantano', match: (node) => node.type === 'deck' && node.deck === 'pantano' },
  { name: 'duelo (deshabilitado)', match: (node) => node.type === 'duelo' },
  { name: 'sorpresa (deshabilitado)', match: (node) => node.type === 'sorpresa' },
  { name: 'liga (deshabilitado)', match: (node) => node.type === 'liga' },
]

// ── Main: dev server + navegador ──

const server = startDevServer(ROOT, PORT)
const browser = await chromium.launch()
let failed = 0
try {
  await waitForServer(BASE_URL)
  for (const target of targets) {
    try {
      const summary = await runTarget(browser, target)
      console.log(`ok   ${summary.name} — ${String(summary.dice)} tiradas, ${String(summary.texts)} mensaje(s), botones: ${summary.buttons.join('+') || '(ninguno)'}`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${target.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} finally {
  await browser.close()
  server.kill()
}

if (failed > 0) {
  console.error(`\n${String(failed)} de ${String(targets.length)} casilleros fallaron`)
  process.exit(1)
}
console.log(`\ne2e T-061: los ${String(targets.length)} tipos de casillero responden de punta a punta`)
