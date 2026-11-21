// AC: SPEC-I/T-071/AC-1..AC-7 — e2e del shell de pantalla completa:
// - AC-1: sin scroll de página a 1024×600, 1280×720, 1366×768, 1920×1080,
//   2560×1080 y 3840×2160 (scrollWidth/Height <= innerWidth/Height).
// - AC-2: mundo a pantalla completa detrás del HUD; la capa HUD no captura
//   clics, cada panel sí; un clic en zona vacía llega al mundo.
// - AC-3: cajas de los paneles = fracciones de content/ui/layout.json (±2 %).
// - AC-4: ningún par de paneles normales se superpone (popups aparte, encima).
// - AC-5: Menú → Pantalla completa (y atajo F), tip F11, aviso si la ventana
//   es menor a 1024×600 o vertical.
// - AC-6: vidrio con variables CSS; prefers-reduced-transparency ⇒ opaco.
// - AC-7: Tab recorre los paneles en orden lógico; Esc cierra el menú.
// Corre contra el dev server (patrón e2e/route.mjs). Uso: pnpm e2e.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import layoutJson from '../content/ui/layout.json' with { type: 'json' }
import { startDevServer, waitForServer, waitVisible } from './route.mjs'

const SEED = 7
const STARTER = 'isla'
const PORT = 4173
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const layout = layoutJson
const PANELS = layout.panels
const TOLERANCE = 0.02

const SIZES = [
  [1024, 600],
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1080],
  [3840, 2160],
]

// Bloquea WebGL para el fallback 2D inmediato (el canvas 3D real se verifica
// aparte, en la pasada 1920×1080): el shell es igual con ambos tableros.
function blockWebGl() {
  const original = globalThis.HTMLCanvasElement.prototype.getContext
  globalThis.HTMLCanvasElement.prototype.getContext = function blocked(type, ...rest) {
    return /webgl/i.test(String(type)) ? null : original.call(this, type, ...rest)
  }
}

async function newShellContext(browser, options) {
  const { w, h, layoutDebug = false, webgl = false } = options
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
  const extra = layoutDebug ? '&layoutDebug=1' : ''
  await page.goto(`${BASE_URL}/?seed=${String(SEED)}${extra}`)
  await waitVisible(page, '[data-action="new-game"]').then((button) => button.click())
  await waitVisible(page, `[data-deck="${STARTER}"]`).then((button) => button.click())
  await waitVisible(page, '[data-testid="game-shell"]')
  return { context, page, pageErrors }
}

async function measure(page, testid) {
  return page.evaluate((id) => {
    const element = globalThis.document.querySelector(`[data-testid="${id}"]`)
    if (element === null) return null
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
  }, testid)
}

const overlaps = (a, b) =>
  a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1

/** La Fullscreen API es asíncrona (con WebGL puede tardar > 300 ms): espera el
 * estado esperado en vez de un sleep fijo. */
async function waitForFullscreen(page, expected, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const isFs = await page.evaluate(() => globalThis.document.fullscreenElement !== null)
    if (isFs === expected) return true
    await sleep(100)
  }
  return false
}

// ── AC-1..AC-4 por resolución ──

async function runSize(browser, w, h, with3d) {
  const notes = []
  const { context, page, pageErrors } = await newShellContext(browser, { w, h, webgl: with3d })

  // Tip inicial visible (AC-5); se cierra para que no estorbe las mediciones.
  await waitVisible(page, '[data-testid="tip-f11"]')
  await page.locator('[data-testid="tip-f11-close"]').click()
  await sleep(80)

  // AC-1: sin scroll de página.
  const scroll = await page.evaluate(() => ({
    w: globalThis.document.documentElement.scrollWidth,
    h: globalThis.document.documentElement.scrollHeight,
    iw: globalThis.window.innerWidth,
    ih: globalThis.window.innerHeight,
  }))
  if (scroll.w > scroll.iw || scroll.h > scroll.ih) {
    throw new Error(`scroll de página: ${JSON.stringify(scroll)}`)
  }

  // AC-2: mundo a pantalla completa y capas pointer-events. Con 3D real se
  // espera a que el canvas de R3F mida su contenedor (nace 300×150).
  if (with3d) {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const ready = await page.evaluate(() => {
        const canvas = globalThis.document.querySelector('[data-shell-world] canvas')
        return canvas !== null && canvas.getBoundingClientRect().width > 10
      })
      if (ready) break
      await sleep(150)
    }
  }
  const layers = await page.evaluate(() => {
    const world = globalThis.document.querySelector('[data-shell-world]')
    const hud = globalThis.document.querySelector('[data-shell-hud]')
    const board = world.querySelector('canvas, svg')
    const panel = globalThis.document.querySelector('[data-testid="panel-history"]')
    const wr = world.getBoundingClientRect()
    const br = board === null ? null : board.getBoundingClientRect()
    return {
      world: { x: wr.x, y: wr.y, w: wr.width, h: wr.height },
      board: br === null ? null : { x: br.x, y: br.y, w: br.width, h: br.height },
      vw: globalThis.window.innerWidth,
      vh: globalThis.window.innerHeight,
      hudPointer: globalThis.getComputedStyle(hud).pointerEvents,
      panelPointer: globalThis.getComputedStyle(panel).pointerEvents,
    }
  })
  if (layers.hudPointer !== 'none') throw new Error(`capa HUD captura clics (${layers.hudPointer})`)
  if (layers.panelPointer !== 'auto') throw new Error(`panel no captura clics (${layers.panelPointer})`)
  for (const box of [layers.world, layers.board]) {
    if (box === null) continue
    if (Math.abs(box.x) > 1 || Math.abs(box.y) > 1 || Math.abs(box.w - layers.vw) > 2 || Math.abs(box.h - layers.vh) > 2) {
      throw new Error(`el mundo no cubre la ventana: ${JSON.stringify(box)}`)
    }
  }
  if (with3d && layers.board === null) throw new Error('no hay canvas 3D en el mundo')

  // AC-2: clic en zona vacía llega al mundo (SPEC-N: y 0,75 ahora lo ocupa la
  // pestaña del equipo ⇒ se sondea el mundo libre en 0,40).
  const clickTarget = await page.evaluate(() => {
    const el = globalThis.document.elementFromPoint(
      globalThis.window.innerWidth * 0.5,
      globalThis.window.innerHeight * 0.4,
    )
    return el === null ? null : el.closest('[data-shell-world]') !== null
  })
  if (clickTarget !== true) throw new Error('el clic en zona vacía no llegó al mundo')

  // AC-3: cajas = fracciones de layout.json (±2 % de la ventana).
  const boxes = {}
  for (const key of ['history', 'backpack', 'oakButton', 'menuButton', 'turn', 'players', 'teamTab', 'team']) {
    const panel = PANELS[key]
    const box = await measure(page, panel.testid)
    if (box === null) throw new Error(`falta [${key}] ${panel.testid}`)
    const dw = Math.abs(box.x - panel.x * w) / w
    const dh = Math.abs(box.y - panel.y * h) / h
    const dwd = Math.abs(box.w - panel.w * w) / w
    const dht = Math.abs(box.h - panel.h * h) / h
    if (dw > TOLERANCE || dh > TOLERANCE || dwd > TOLERANCE || dht > TOLERANCE) {
      throw new Error(`[${key}] caja ${JSON.stringify(box)} fuera de tolerancia vs layout.json`)
    }
    boxes[key] = box
  }

  // AC-4: sin solapamiento entre paneles normales.
  const keys = Object.keys(boxes)
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      if (overlaps(boxes[keys[i]], boxes[keys[j]])) {
        throw new Error(`se solapan ${keys[i]} y ${keys[j]}`)
      }
    }
  }
  if (with3d) notes.push('canvas 3D a pantalla completa')

  // AC-7: Tab recorre los paneles en orden lógico (turn→team→pestaña equipo→players→history→backpack→oak→menu).
  const order = ['panel-turn', 'panel-team', 'btn-team-tab', 'panel-players', 'panel-history', 'panel-backpack', 'btn-oak', 'btn-menu']
  const seen = []
  for (let tab = 0; tab < 30 && seen.length < order.length; tab += 1) {
    await page.keyboard.press('Tab')
    const id = await page.evaluate(() => globalThis.document.activeElement?.getAttribute('data-testid') ?? null)
    if (id !== null && order.includes(id) && !seen.includes(id)) seen.push(id)
  }
  if (seen.join(',') !== order.join(',')) {
    throw new Error(`orden de Tab ${seen.join(',')} ≠ ${order.join(',')}`)
  }

  // AC-5: Menú → Pantalla completa; atajo F alterna; Esc cierra el menú.
  const fullscreenEnabled = await page.evaluate(() => globalThis.document.fullscreenEnabled)
  if (fullscreenEnabled) {
    await page.locator('[data-testid="btn-menu"]').click()
    await waitVisible(page, '[data-testid="menu-popover"]')
    await page.locator('[data-testid="btn-fullscreen"]').click()
    if (!(await waitForFullscreen(page, true))) {
      throw new Error('btn-fullscreen no entró en pantalla completa')
    }
    // Esc cierra el menú (si el navegador además sale de fullscreen, el toggle
    // de F se verifica por cambio de estado, no por estado absoluto).
    await page.keyboard.press('Escape')
    await sleep(150)
    if ((await page.locator('[data-testid="menu-popover"]').count()) > 0) throw new Error('Esc no cerró el menú')
    const before = await page.evaluate(() => globalThis.document.fullscreenElement !== null)
    await page.keyboard.press('f')
    if (!(await waitForFullscreen(page, !before))) throw new Error('el atajo F no alternó la pantalla completa')
    await page.keyboard.press('f')
    if (!(await waitForFullscreen(page, before))) throw new Error('el segundo F no volvió al estado inicial')
    notes.push('F + Fullscreen API')
  } else {
    notes.push('Fullscreen API no disponible (skip)')
  }

  if (pageErrors.length > 0) throw new Error(`errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
  return notes
}

// ── AC-3/AC-4 con popups (?layoutDebug=1): cajas medibles de los 2 popups. ──

async function runPopups(browser) {
  const w = 1920
  const h = 1080
  const { context, page, pageErrors } = await newShellContext(browser, { w, h, layoutDebug: true })
  await page.locator('[data-testid="tip-f11-close"]').click()
  const popups = {}
  for (const key of ['cardPopup', 'battlePopup']) {
    const panel = PANELS[key]
    const box = await measure(page, panel.testid)
    if (box === null) throw new Error(`falta [${key}] ${panel.testid}`)
    if (
      Math.abs(box.x - panel.x * w) > TOLERANCE * w ||
      Math.abs(box.y - panel.y * h) > TOLERANCE * h ||
      Math.abs(box.w - panel.w * w) > TOLERANCE * w ||
      Math.abs(box.h - panel.h * h) > TOLERANCE * h
    ) {
      throw new Error(`[${key}] caja ${JSON.stringify(box)} fuera de tolerancia`)
    }
    popups[key] = box
  }
  // popup-solo-en-combate (D-31): la caja normal del popup de combate se
  // achicó (x=0.40) y puede solaparse con popup-card (transitorio, no HUD);
  // el chequeo popups-entre-sí se retiró con esa decisión.
  if (pageErrors.length > 0) throw new Error(`errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
}

// ── AC-5: aviso de viewport chico y vertical; AC-6: transparencia reducida. ──

async function runViewportWarning(browser) {
  for (const size of [
    [900, 600],
    [800, 1280],
  ]) {
    const { context, page } = await newShellContext(browser, { w: size[0], h: size[1] })
    await waitVisible(page, '[data-testid="viewport-warning"]')
    await page.locator('[data-testid="viewport-warning-dismiss"]').click()
    await sleep(120)
    if ((await page.locator('[data-testid="viewport-warning"]').count()) > 0) {
      throw new Error(`[${String(size[0])}×${String(size[1])}] el aviso no se cierra`)
    }
    await waitVisible(page, '[data-testid="game-shell"]')
    await context.close()
  }
}

async function runReducedTransparency(browser) {
  // Nota: la opción reducedTransparency de Playwright no voltea esta media
  // feature en este Chromium; se emula por CDP (Sensors → emulated media).
  const { context, page } = await newShellContext(browser, { w: 1280, h: 720 })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  })
  const alpha = await page.evaluate(() => {
    const panel = globalThis.document.querySelector('[data-testid="panel-history"]')
    const color = globalThis.getComputedStyle(panel).backgroundColor
    const match = /rgba?\(([^)]+)\)/.exec(color)
    return match === null ? null : match[1].split(',').map((v) => v.trim())
  })
  if (alpha === null) throw new Error('sin backgroundColor en el panel')
  if (alpha.length !== 3) throw new Error(`panel translúcido con reduced-transparency: ${alpha.join(',')}`)
  const { context: normalContext, page: normalPage } = await newShellContext(browser, { w: 1280, h: 720 })
  const normalAlpha = await normalPage.evaluate(() => {
    const panel = globalThis.document.querySelector('[data-testid="panel-history"]')
    return globalThis.getComputedStyle(panel).backgroundColor
  })
  if (!normalAlpha.includes('0.78')) throw new Error(`vidrio normal sin alpha 0.78: ${normalAlpha}`)
  await context.close()
  await normalContext.close()
}

// ── Main ──

const server = startDevServer(ROOT, PORT)
const browser = await chromium.launch()
let failed = 0
try {
  await waitForServer(BASE_URL)
  for (const size of SIZES) {
    const with3d = size[0] === 1920
    try {
      const notes = await runSize(browser, size[0], size[1], with3d)
      console.log(`ok   ${String(size[0])}×${String(size[1])} — sin scroll, cajas ±2 %, capas y Tab${notes.length > 0 ? ` (${notes.join('; ')})` : ''}`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${String(size[0])}×${String(size[1])}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const extras = [
    ['popups (layoutDebug)', () => runPopups(browser)],
    ['aviso de viewport chico/vertical', () => runViewportWarning(browser)],
    ['transparencia reducida', () => runReducedTransparency(browser)],
  ]
  for (const [name, run] of extras) {
    try {
      await run()
      console.log(`ok   ${name}`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
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
console.log('\ne2e T-071: shell sin scroll, HUD de vidrio por layout.json, F11/F y teclado')
