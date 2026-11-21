// AC: SPEC-N/T-092/AC-7 + dado-clicable/AC-4 — e2e del panel-dice: click en el
// dado (btn-roll-die) produce la tirada del motor (dado forzado 4 por ?dice) y
// panel-dice muestra el valor y el jugador activo, sin solaparse con
// panel-turn ni panel-players (1280×720).
// Corre contra el dev server (patrón e2e/route.mjs). Uso: node e2e/t092-dice.mjs.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { newSkipContext, startDevServer, waitForServer, waitVisible } from './route.mjs'

const SEED = 7
const STARTER = 'isla'
const FORCED = 4
const PORT = 4177
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const box = (page, testid) =>
  page.evaluate((id) => {
    const el = globalThis.document.querySelector(`[data-testid="${id}"]`)
    if (el === null) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, testid)

const overlaps = (a, b) =>
  a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1

const server = startDevServer(ROOT, PORT)
const browser = await chromium.launch()
try {
  await waitForServer(BASE_URL)
  const { context, page, pageErrors } = await newSkipContext(browser, {
    seed: SEED,
    dice: [FORCED],
    baseUrl: BASE_URL,
    starter: STARTER,
  })

  // dado-clicable/AC-4: la tirada sale de clickear el DADO (btn-roll-die);
  // btn-roll de panel-turn sigue como camino alternativo (AC-3).
  const rollButtons = await page.locator('[data-testid="btn-roll"]').count()
  if (rollButtons !== 1) throw new Error(`btn-roll presente ${String(rollButtons)} veces (esperaba 1)`)
  const dieButton = await waitVisible(page, '[data-testid="btn-roll-die"]')
  await dieButton.click()
  // El aviso de movimiento confirma el valor que dictó el motor (skip ⇒ directo).
  const hint = await waitVisible(page, '[data-testid="move-hint"]')
  const hintText = await hint.innerText()
  if (!hintText.includes(String(FORCED))) {
    throw new Error(`el motor no tiró ${String(FORCED)}: "${hintText}"`)
  }
  await sleep(120)

  const dice = await page.evaluate((forced) => {
    const panel = globalThis.document.querySelector('[data-testid="panel-dice"]')
    return {
      value: panel?.querySelector('[data-testid="dice-panel"]')?.getAttribute('data-value'),
      who: panel?.querySelector('[data-testid="dice-who"]')?.textContent ?? null,
      purpose: panel?.querySelector('[data-testid="dice-purpose"]')?.textContent ?? null,
      shown: panel?.querySelector('[data-testid="dice-value"]')?.textContent ?? null,
      history: panel?.querySelector('[data-testid="dice-history"]')?.textContent ?? null,
      forced,
    }
  }, FORCED)
  if (dice.value !== String(FORCED)) throw new Error(`panel-dice muestra ${String(dice.value)} (motor: ${String(FORCED)})`)
  if (dice.shown?.trim() !== String(FORCED)) throw new Error(`dice-value muestra "${String(dice.shown)}"`)
  if (dice.who === null || dice.who.trim() !== 'Jugador 1') throw new Error(`dice-who muestra "${String(dice.who)}" (esperaba Jugador 1)`)
  if (dice.purpose === null || dice.purpose.trim() !== 'Dado de movimiento') throw new Error(`dice-purpose muestra "${String(dice.purpose)}"`)

  // Sin solape con panel-turn ni panel-players (cajas reales del DOM).
  const diceBox = await box(page, 'panel-dice')
  for (const testid of ['panel-turn', 'panel-players']) {
    const other = await box(page, testid)
    if (other === null) throw new Error(`falta ${testid}`)
    if (overlaps(diceBox, other)) throw new Error(`panel-dice se solapa con ${testid}`)
  }

  if (pageErrors.length > 0) throw new Error(`errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
  console.log(`ok   click en el dado (btn-roll-die) tiró ${String(FORCED)} de Jugador 1 (motor ✓), sin solapes con turn/players${dice.history === null ? '' : `; historial: ${dice.history}`}`)
} finally {
  await browser.close()
  server.kill()
}
console.log('\ne2e T-092: dado fijo en panel-dice — valor del motor, quién tiró, sin solapes')
