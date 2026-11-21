// AC: SPEC-N/T-089/AC-3,AC-4,AC-5,AC-6 — e2e de la pestaña del equipo:
// - AC-5: a 1024×600 btn-team-tab mide ≥ 44 px (±2), respeta la caja de
//   layout.json y no se solapa con panel-team, btn-oak ni btn-menu.
// - AC-6: Tab recorre los paneles con btn-team-tab en su lugar (tras panel-team).
// - AC-3: un click colapsa ⇒ panel-team sale del DOM, la pestaña queda donde
//   estaba y ningún otro panel cambia de caja (mundo/HUD siguen visibles).
// - AC-4: un segundo click vuelve a mostrar panel-team con sus 6 slots
//   (roundtrip visible → oculto → visible; arranca visible).
// Corre contra el dev server (patrón e2e/route.mjs). Uso: pnpm e2e.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import layoutJson from '../content/ui/layout.json' with { type: 'json' }
import { es } from '../apps/web/src/i18n/es.ts'
import { startDevServer, waitForServer, waitVisible } from './route.mjs'

const SEED = 7
const STARTER = 'isla'
const PORT = 4176
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const TOLERANCE = 0.02
const PANELS = layoutJson.panels
const OTHER_IDS = ['panel-turn', 'panel-players', 'panel-history', 'panel-backpack', 'btn-oak', 'btn-menu']

function blockWebGl() {
  const original = globalThis.HTMLCanvasElement.prototype.getContext
  globalThis.HTMLCanvasElement.prototype.getContext = function blocked(type, ...rest) {
    return /webgl/i.test(String(type)) ? null : original.call(this, type, ...rest)
  }
}

async function newGameContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 600 } })
  await context.addInitScript(() => {
    globalThis.localStorage.setItem(
      'liga-pkm:settings',
      JSON.stringify({ speed: 'skip', sound: false, reducedMotion: true }),
    )
  })
  await context.addInitScript(blockWebGl)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.goto(`${BASE_URL}/?seed=${String(SEED)}`)
  await waitVisible(page, '[data-action="new-game"]').then((button) => button.click())
  await waitVisible(page, `[data-deck="${STARTER}"]`).then((button) => button.click())
  await waitVisible(page, '[data-testid="game-shell"]')
  return { context, page, pageErrors }
}

async function box(page, testid) {
  return page.evaluate((id) => {
    const el = globalThis.document.querySelector(`[data-testid="${id}"]`)
    if (el === null) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, testid)
}

async function tabState(page) {
  return page.evaluate(() => {
    const el = globalThis.document.querySelector('[data-testid="btn-team-tab"]')
    if (el === null) return null
    const r = el.getBoundingClientRect()
    return {
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      expanded: el.getAttribute('aria-expanded'),
      controls: el.getAttribute('aria-controls'),
      text: (el.textContent ?? '').trim(),
    }
  })
}

const overlaps = (a, b) =>
  a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1

async function waitCount(page, selector, expected, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await page.locator(selector).count()) === expected) return
    await sleep(80)
  }
  throw new Error(`${selector}: ${String(await page.locator(selector).count())} ≠ ${String(expected)}`)
}

async function run(browser) {
  const { context, page, pageErrors } = await newGameContext(browser)
  await waitVisible(page, '[data-testid="tip-f11"]')
  await page.locator('[data-testid="tip-f11-close"]').click()
  await sleep(80)

  // ── AC-5: caja de la pestaña a 1024×600 (layout.json + ≥ 44 px ±2) ──
  const tab = await tabState(page)
  if (tab === null) throw new Error('falta btn-team-tab')
  const panel = PANELS.teamTab
  if (
    Math.abs(tab.x - panel.x * 1024) > TOLERANCE * 1024 ||
    Math.abs(tab.y - panel.y * 600) > TOLERANCE * 600 ||
    Math.abs(tab.w - panel.w * 1024) > TOLERANCE * 1024 ||
    Math.abs(tab.h - panel.h * 600) > TOLERANCE * 600
  ) {
    throw new Error(`btn-team-tab fuera de tolerancia vs layout.json: ${JSON.stringify(tab)}`)
  }
  if (tab.h < 44 - 2) throw new Error(`btn-team-tab mide ${String(tab.h)} px (< 44 ±2)`)
  if (tab.expanded !== 'true') throw new Error(`aria-expanded inicial ${String(tab.expanded)} (esperaba true)`)
  if (tab.controls !== 'panel-team') throw new Error(`aria-controls ${String(tab.controls)}`)
  if (tab.text !== es.teamCollapse) throw new Error(`texto inicial "${tab.text}" ≠ "${es.teamCollapse}"`)

  const before = {}
  for (const id of ['panel-team', ...OTHER_IDS]) {
    const b = await box(page, id)
    if (b === null) throw new Error(`falta ${id}`)
    before[id] = b
    if (id !== 'panel-team' && overlaps(tab, b)) throw new Error(`btn-team-tab se solapa con ${id}`)
  }

  // ── AC-6: Tab recorre los paneles con la pestaña en su lugar ──
  const order = ['panel-turn', 'panel-team', 'btn-team-tab', 'panel-players', 'panel-history', 'panel-backpack', 'btn-oak', 'btn-menu']
  const seen = []
  for (let press = 0; press < 30 && seen.length < order.length; press += 1) {
    await page.keyboard.press('Tab')
    const id = await page.evaluate(() => globalThis.document.activeElement?.getAttribute('data-testid') ?? null)
    if (id !== null && order.includes(id) && !seen.includes(id)) seen.push(id)
  }
  if (seen.join(',') !== order.join(',')) {
    throw new Error(`orden de Tab ${seen.join(',')} ≠ ${order.join(',')}`)
  }

  // ── AC-3: click ⇒ panel-team fuera del DOM, el resto intacto ──
  await page.locator('[data-testid="btn-team-tab"]').click()
  await waitCount(page, '[data-testid="panel-team"]', 0)
  const collapsed = await tabState(page)
  if (collapsed === null) throw new Error('la pestaña desapareció al colapsar')
  if (collapsed.expanded !== 'false') throw new Error('aria-expanded no pasó a false')
  if (collapsed.text !== es.teamExpand) throw new Error(`texto colapsado "${collapsed.text}" ≠ "${es.teamExpand}"`)
  if (Math.abs(collapsed.y - tab.y) > 2 || Math.abs(collapsed.h - tab.h) > 2) {
    throw new Error(`la pestaña se movió al colapsar: ${JSON.stringify(collapsed)}`)
  }
  const worldVisible = await page.evaluate(() => {
    const world = globalThis.document.querySelector('[data-shell-world]')
    return world !== null && world.querySelector('canvas, svg') !== null
  })
  if (!worldVisible) throw new Error('el mundo/tablero no quedó visible al colapsar')
  for (const id of OTHER_IDS) {
    const b = await box(page, id)
    if (b === null) throw new Error(`${id} desapareció al colapsar`)
    const moved =
      Math.abs(b.x - before[id].x) > 1 ||
      Math.abs(b.y - before[id].y) > 1 ||
      Math.abs(b.w - before[id].w) > 1 ||
      Math.abs(b.h - before[id].h) > 1
    if (moved) throw new Error(`${id} cambió de caja al colapsar: ${JSON.stringify(before[id])} → ${JSON.stringify(b)}`)
  }

  // ── AC-4: segundo click ⇒ roundtrip con los 6 slots intactos ──
  await page.locator('[data-testid="btn-team-tab"]').click()
  await waitCount(page, '[data-testid="panel-team"]', 1)
  await waitCount(page, '[data-testid="team-slot"]', 6)
  const restored = await tabState(page)
  if (restored === null || restored.expanded !== 'true') throw new Error('la pestaña no volvió a expanded')
  if (restored === null || restored.text !== es.teamCollapse) throw new Error('el texto no volvió a "Ocultar equipo"')
  if (Math.abs(restored.y - tab.y) > 2) throw new Error('la pestaña no volvió a su lugar')

  if (pageErrors.length > 0) throw new Error(`errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
}

const server = startDevServer(ROOT, PORT)
const browser = await chromium.launch()
let failed = 0
try {
  await waitForServer(BASE_URL)
  try {
    await run(browser)
    console.log('ok   1024×600 — pestaña ≥ 44 px, sin solapes, Tab, colapso y roundtrip')
  } catch (error) {
    failed += 1
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  }
} finally {
  await browser.close()
  server.kill()
}

if (failed > 0) {
  console.error(`\n${String(failed)} verificaciones fallaron`)
  process.exit(1)
}
console.log('\ne2e T-089: pestaña del equipo (ocultar/mostrar panel-team)')
