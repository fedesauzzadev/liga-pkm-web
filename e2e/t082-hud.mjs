// AC: SPEC-J/T-082/AC-1..AC-5 — e2e del pulido del HUD:
// - AC-1: panel-turn sin desborde (scrollHeight <= clientHeight) a 1280×720,
//   1366×768 y 1920×1080; el botón "Tirar dado" mide >= 44 px de alto.
// - AC-2: un solo botón de tirada (el del panel-turn); sin botón "Tirar" ni
//   panel/botón de inventario; cámara (Recentrar / Vista general) en la barra
//   compacta de arriba al centro (pasada 3D con WebGL).
// - AC-3: ningún texto del HUD con letra < 13 px; filas de la mochila >= 28 px.
// - AC-4: nombre del activo sin cortar (slot-name scrollWidth <= clientWidth)
//   con etiqueta de activo y barra de vida.
// - AC-5: ningún par de paneles del HUD se superpone (salvo popups) y ningún
//   panel tiene texto cortado (scroll <= client).
// Corre contra el dev server (patrón e2e/route.mjs). Uso: pnpm e2e.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { startDevServer, waitForServer, waitVisible } from './route.mjs'

const SEED = 7
const STARTER = 'isla'
const PORT = 4174
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SIZES = [
  [1280, 720],
  [1366, 768],
  [1920, 1080],
]

const PANEL_TESTIDS = [
  'panel-turn',
  'panel-team',
  'btn-team-tab',
  'panel-players',
  'panel-history',
  'panel-backpack',
  'btn-oak',
  'btn-menu',
]

function blockWebGl() {
  const original = globalThis.HTMLCanvasElement.prototype.getContext
  globalThis.HTMLCanvasElement.prototype.getContext = function blocked(type, ...rest) {
    return /webgl/i.test(String(type)) ? null : original.call(this, type, ...rest)
  }
}

async function newGameContext(browser, options) {
  const { w, h, webgl = false } = options
  const context = await browser.newContext({ viewport: { width: w, height: h } })
  await context.addInitScript(() => {
    globalThis.localStorage.setItem(
      'liga-pkm:settings',
      JSON.stringify({ speed: 'skip', sound: false, reducedMotion: true }),
    )
  })
  if (!webgl) await context.addInitScript(blockWebGl)
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

const overlaps = (a, b) =>
  a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1

// ── AC-1..AC-5 por resolución ──

async function runSize(browser, w, h, with3d) {
  const notes = []
  const { context, page, pageErrors } = await newGameContext(browser, { w, h, webgl: with3d })
  await waitVisible(page, '[data-testid="tip-f11"]')
  await page.locator('[data-testid="tip-f11-close"]').click()
  await sleep(120)

  // AC-1: panel-turn sin desborde; botón de tirada >= 44 px.
  const turn = await page.evaluate(() => {
    const panel = globalThis.document.querySelector('[data-testid="panel-turn"]')
    const button = globalThis.document.querySelector('[data-testid="btn-roll"]')
    return {
      scrollH: panel.scrollHeight,
      clientH: panel.clientHeight,
      scrollW: panel.scrollWidth,
      clientW: panel.clientWidth,
      button: button === null ? null : button.getBoundingClientRect().height,
      buttonVisible: button !== null,
    }
  })
  if (!turn.buttonVisible) throw new Error('falta btn-roll en panel-turn al inicio del turno')
  if (turn.button !== null && turn.button < 44) {
    throw new Error(`btn-roll mide ${String(turn.button)}px (< 44)`)
  }
  if (turn.scrollH > turn.clientH || turn.scrollW > turn.clientW) {
    throw new Error(`panel-turn desborda: scroll ${String(turn.scrollH)}x${String(turn.scrollW)} > client ${String(turn.clientH)}x${String(turn.clientW)}`)
  }

  // AC-2: un solo "Tirar dado"; sin "Tirar" suelto ni inventario.
  const dupes = await page.evaluate(() => {
    const buttons = [...globalThis.document.querySelectorAll('button')]
    return {
      rollDice: buttons.filter((b) => b.textContent?.trim() === 'Tirar dado').length,
      tirar: buttons.filter((b) => b.textContent?.trim() === 'Tirar').length,
      inventory: globalThis.document.querySelectorAll('[data-testid="btn-inventory"]').length,
      inventoryText: [...globalThis.document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Inventario').length,
    }
  })
  if (dupes.rollDice !== 1) throw new Error(`hay ${String(dupes.rollDice)} botones "Tirar dado" (esperaba 1)`)
  if (dupes.tirar !== 0) throw new Error('queda un botón duplicado "Tirar"')
  if (dupes.inventory !== 0 || dupes.inventoryText !== 0) throw new Error('queda el panel/botón de inventario')

  // AC-2 (3D): barra compacta de cámara arriba al centro.
  if (with3d) {
    await waitVisible(page, '[data-testid="camera-bar"]', 10_000)
    const bar = await box(page, 'camera-bar')
    if (bar === null) throw new Error('falta la barra de cámara')
    const centerX = (bar.x + bar.w / 2) / w
    if (centerX < 0.35 || centerX > 0.65 || bar.y > h * 0.15) {
      throw new Error(`barra de cámara fuera de arriba al centro: ${JSON.stringify(bar)}`)
    }
    const camButtons = await page.evaluate(() => {
      const bar = globalThis.document.querySelector('[data-testid="camera-bar"]')
      if (bar === null) return []
      return [...bar.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')
    })
    // camara-libre-sin-ficha: el botón se llama "Centrar en mí" (es.board3dCenterOnMe).
    if (camButtons.join(',') !== 'Centrar en mí,Vista general') {
      throw new Error(`barra de cámara con botones inesperados: ${camButtons.join(',')}`)
    }
    notes.push('barra de cámara arriba al centro')
  }

  // AC-3: letra >= 13 px en todos los paneles; filas de mochila >= 28 px.
  // Los íconos (role="img" o aria-hidden: "AG", glifos) no son texto legible.
  const smallFonts = await page.evaluate((ids) => {
    const small = []
    for (const id of ids) {
      const panel = globalThis.document.querySelector(`[data-testid="${id}"]`)
      if (panel === null) continue
      const els = [panel, ...panel.querySelectorAll('*')]
      for (const el of els) {
        const hasText = [...el.childNodes].some(
          (node) => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0,
        )
        if (!hasText) continue
        if (el.closest('[role="img"], [aria-hidden="true"]') !== null) continue
        const px = Number.parseFloat(globalThis.getComputedStyle(el).fontSize)
        if (px < 12.99) small.push(`${id}: ${String(px)}px <${el.tagName}> ${el.textContent?.trim().slice(0, 24)}`)
      }
    }
    return small
  }, PANEL_TESTIDS)
  if (smallFonts.length > 0) throw new Error(`letra < 13 px: ${smallFonts.join(' | ')}`)
  const rowHeights = await page.evaluate(() =>
    [...globalThis.document.querySelectorAll('[data-testid="backpack-row"]')].map(
      (row) => row.getBoundingClientRect().height,
    ),
  )
  if (rowHeights.length !== 5) throw new Error(`filas de mochila: ${String(rowHeights.length)} (esperaba 5)`)
  for (const height of rowHeights) {
    if (height < 28) throw new Error(`fila de mochila de ${String(height)}px (< 28)`)
  }

  // AC-4: nombre del activo sin cortar, con etiqueta y barra de vida.
  const slots = await page.evaluate(() => {
    const names = [...globalThis.document.querySelectorAll('[data-testid="slot-name"]')]
    const cut = names.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent ?? '')
    const active = globalThis.document.querySelector('[data-testid="team-slot"][data-active="true"]')
    return {
      cut,
      activeFound: active !== null,
      activeLabel: active?.textContent ?? '',
      hp: active?.querySelector('[data-hp]')?.getAttribute('data-hp') ?? null,
    }
  })
  if (slots.cut.length > 0) throw new Error(`nombres cortados: ${slots.cut.join(', ')}`)
  if (!slots.activeFound) throw new Error('no hay slot activo en el equipo')
  if (!slots.activeLabel.includes('Activo')) throw new Error('falta la etiqueta de activo')
  if (slots.hp === null) throw new Error('falta la barra de vida del activo')

  // AC-5: sin solapamientos entre paneles y sin texto cortado.
  const boxes = {}
  for (const id of PANEL_TESTIDS) {
    const b = await box(page, id)
    if (b === null) throw new Error(`falta el panel ${id}`)
    boxes[id] = b
  }
  const keys = Object.keys(boxes)
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      if (overlaps(boxes[keys[i]], boxes[keys[j]])) {
        throw new Error(`se solapan ${keys[i]} y ${keys[j]}`)
      }
    }
  }
  const clipped = await page.evaluate((ids) => {
    const out = []
    for (const id of ids) {
      const panel = globalThis.document.querySelector(`[data-testid="${id}"]`)
      if (panel === null) continue
      if (panel.scrollHeight > panel.clientHeight + 1 || panel.scrollWidth > panel.clientWidth + 1) {
        out.push(`${id} ${String(panel.scrollWidth)}x${String(panel.scrollHeight)} > ${String(panel.clientWidth)}x${String(panel.clientHeight)}`)
      }
    }
    return out
  }, PANEL_TESTIDS)
  if (clipped.length > 0) throw new Error(`paneles con texto cortado: ${clipped.join(' | ')}`)

  if (pageErrors.length > 0) throw new Error(`errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
  return notes
}

const server = startDevServer(ROOT, PORT)
const browser = await chromium.launch()
let failed = 0
try {
  await waitForServer(BASE_URL)
  for (const size of SIZES) {
    const with3d = size[0] === 1920
    try {
      const notes = await runSize(browser, size[0], size[1], with3d)
      console.log(`ok   ${String(size[0])}×${String(size[1])} — turn sin cortar, ≥44px, 13px, sin duplicados${notes.length > 0 ? ` (${notes.join('; ')})` : ''}`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${String(size[0])}×${String(size[1])}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} finally {
  await browser.close()
  server.kill()
}

if (failed > 0) {
  console.error(`\n${String(failed)} verificaciones fallaron`)
  process.exit(1)
}
console.log('\ne2e T-082: HUD pulido — turn, sin duplicados, 13px/28px, sin cortes ni solapes')
