// AC: unificar-popup-encuentro — e2e del popup de encuentro salvaje con el
// botón dev (btn-dev-encounter ⇒ DebugEncounter Abra de Pantano, como el flujo
// de t064). Verifica POR data-testid y texto (sin mirar imágenes) en los 3
// tamaños del spec (1024×600, 1366×768, 1920×1080):
// - AC-1: UN popup-encounter, sin popup-card, sin tile-panel ni drawn-card.
// - AC-2: caja dentro del safeArea con 12 px de margen y sin tocar NINGÚN
//   panel del HUD (boundingBox contra layout.json).
// - AC-3: card-face presente (la carta grande de T-101).
// - AC-4: título/subtítulo/botones con HP; Esc no cierra.
// - AC-5 (una vez): pelear abre popup-battle y cierra popup-encounter.
// - AC-6 (una vez): dejar ir cierra sin popup-battle, turno +1, historial
//   "Dejaste ir a Abra." y sin ningún otro popup.
// - AC-8: clic sobre card-face no abre nada.
// Uso: pnpm e2e
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { es } from '../apps/web/src/i18n/es.ts'
import { newSkipContext, startDevServer, waitForServer, waitVisible } from './route.mjs'

const SEED = 7
const STARTER = 'montana'
const PORT = 4173
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VIEWPORTS = [
  [1024, 600],
  [1366, 768],
  [1920, 1080],
]
const MARGIN_PX = 12
const MAX_HEIGHT_PX = 760

/** Paneles del HUD (layout.json) que el popup NO puede tapar (AC-2). */
const HUD_PANELS = [
  'panel-history',
  'panel-backpack',
  'btn-oak',
  'btn-menu',
  'btn-hud-toggle',
  'panel-dice',
  'panel-turn',
  'panel-players',
  'btn-team-tab',
  'panel-team',
]

/** Caja {x,y,w,h} de un elemento por data-testid. */
async function boxOf(page, testid) {
  const box = await page.locator(`[data-testid="${testid}"]`).first().boundingBox()
  if (box === null) throw new Error(`sin boundingBox: ${testid}`)
  return box
}

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** Arranca partida y fuerza el encuentro con Abra (botón dev). */
async function openEncounter(browser, viewport) {
  const { context, page, pageErrors } = await newSkipContext(browser, {
    seed: SEED,
    dice: [],
    baseUrl: BASE_URL,
    starter: STARTER,
    viewport,
  })
  await waitVisible(page, '[data-testid="btn-dev-encounter"]').then((button) => button.click())
  await waitVisible(page, '[data-testid="popup-encounter"]')
  return { context, page, pageErrors }
}

/** AC-1..AC-4, AC-8 en un viewport. */
async function checkViewport(browser, vw, vh, label) {
  const { context, page, pageErrors } = await openEncounter(browser, { width: vw, height: vh })
  try {
    // AC-1: exactamente UN popup-encounter, sin popup-card ni tile-panel.
    if ((await page.locator('[data-testid="popup-encounter"]').count()) !== 1) {
      throw new Error(`[${label}] no hay exactamente un popup-encounter`)
    }
    if ((await page.locator('[data-testid="popup-card"]').count()) > 0) {
      throw new Error(`[${label}] existe popup-card junto al encuentro`)
    }
    if ((await page.locator('[data-testid="tile-panel"]').count()) > 0) {
      throw new Error(`[${label}] el tile-panel sigue visible con FightOrRelease`)
    }
    if ((await page.locator('[data-testid="drawn-card"]').count()) > 0) {
      throw new Error(`[${label}] la carta del robo (drawn-card) no cedió al popup`)
    }

    // AC-2: caja dentro del safeArea (x 0..0.83, y 0..0.79) con 12 px de margen,
    // alto ≤ 760 y sin tocar ningún panel del HUD.
    const box = await boxOf(page, 'popup-encounter')
    const safe = { x: 0, y: 0, w: 0.83 * vw, h: 0.79 * vh }
    if (box.x < safe.x + MARGIN_PX - 1 || box.y < safe.y + MARGIN_PX - 1) {
      throw new Error(`[${label}] la caja rompe el margen del safeArea (arriba/izq)`)
    }
    if (box.x + box.width > safe.w + safe.x - MARGIN_PX + 1 || box.y + box.height > safe.h + safe.y - MARGIN_PX + 1) {
      throw new Error(`[${label}] la caja rompe el margen del safeArea (abajo/der)`)
    }
    if (box.height > MAX_HEIGHT_PX + 1) throw new Error(`[${label}] alto ${String(box.height)} > 760`)
    for (const testid of HUD_PANELS) {
      const panel = await boxOf(page, testid)
      if (overlaps(box, panel)) throw new Error(`[${label}] la caja tapa ${testid}`)
    }

    // AC-3: la carta grande de T-101 dentro del popup.
    const popup = page.locator('[data-testid="popup-encounter"]')
    if ((await popup.locator('[data-testid="card-face"]').count()) !== 1) {
      throw new Error(`[${label}] falta card-face dentro del popup`)
    }

    // AC-4: título, subtítulo, botones por sano con HP y release al final.
    const text = await popup.innerText()
    const title = es.playWildAppeared.replace('{name}', 'Abra')
    if (!text.includes(title)) throw new Error(`[${label}] falta el título "${title}"`)
    const subtitle = es.tileMsgCardDrawn.replace('{card}', 'Abra').replace('{deck}', es.tileDeckNames.pantano)
    if (!text.includes(subtitle)) throw new Error(`[${label}] falta el subtítulo "${subtitle}"`)
    const fight = page.locator('[data-testid^="btn-fight-"]')
    if ((await fight.count()) < 1) throw new Error(`[${label}] no hay botones de pelear`)
    const fightText = await fight.first().innerText()
    if (!/HP \d+\/\d+/.test(fightText)) throw new Error(`[${label}] el botón de pelear no muestra HP`)
    if ((await page.locator('[data-testid="btn-release"]').count()) !== 1) {
      throw new Error(`[${label}] falta btn-release`)
    }

    // AC-4: Esc NO cierra el popup.
    await page.keyboard.press('Escape')
    await sleep(120)
    if ((await page.locator('[data-testid="popup-encounter"]').count()) !== 1) {
      throw new Error(`[${label}] Esc cerró el popup de encuentro`)
    }

    // AC-8: clic sobre la carta no abre nada nuevo.
    await popup.locator('[data-testid="card-face"]').click()
    await sleep(120)
    if ((await page.locator('[data-card-modal="true"]').count()) > 0) {
      throw new Error(`[${label}] el clic en card-face abrió una ventana`)
    }
    if ((await page.locator('[data-testid="popup-encounter"]').count()) !== 1) {
      throw new Error(`[${label}] el clic en card-face cambió el popup`)
    }
    if (pageErrors.length > 0) throw new Error(`[${label}] errores de página: ${pageErrors.join(' | ')}`)
  } finally {
    await context.close()
  }
  return label
}

/** AC-5: pelear manda FightEncounter, abre popup-battle y cierra el encuentro. */
async function checkFight(browser) {
  const { context, page, pageErrors } = await openEncounter(browser, { width: 1366, height: 768 })
  try {
    const uid = await page.locator('[data-testid^="btn-fight-"]').first().getAttribute('data-pkm-uid')
    if (uid === null || uid.length === 0) throw new Error('[fight] btn-fight sin data-pkm-uid')
    await page.locator('[data-testid^="btn-fight-"]').first().click()
    await waitVisible(page, '[data-testid="popup-battle"]')
    if ((await page.locator('[data-testid="popup-encounter"]').count()) > 0) {
      throw new Error('[fight] popup-encounter sigue abierto junto a popup-battle')
    }
    if (pageErrors.length > 0) throw new Error(`[fight] errores de página: ${pageErrors.join(' | ')}`)
  } finally {
    await context.close()
  }
  return 'pelear → popup-battle'
}

/** AC-6: dejar ir manda ReleaseWild, sin combate, turno +1 e historial. */
async function checkRelease(browser) {
  const { context, page, pageErrors } = await openEncounter(browser, { width: 1366, height: 768 })
  try {
    const turnOf = () =>
      page.locator('[data-testid="panel-turn"] [data-turn-number]').getAttribute('data-turn-number')
    const before = Number(await turnOf())
    await page.locator('[data-testid="btn-release"]').click()
    await sleep(200)
    if ((await page.locator('[data-testid="popup-encounter"]').count()) > 0) {
      throw new Error('[release] popup-encounter sigue abierto tras Dejar ir')
    }
    if ((await page.locator('[data-testid="popup-battle"]').count()) > 0) {
      throw new Error('[release] se abrió un popup de combate tras Dejar ir')
    }
    // El turno avanza exactamente en 1 (panel-turn › data-turn-number).
    const after = Number(await turnOf())
    if (after !== before + 1) {
      throw new Error(`[release] turno ${String(before)} → ${String(after)} (esperaba +1)`)
    }
    // Historial: "Dejaste ir a Abra." (AC-6) y el robo sigue registrado (AC-1).
    const history = await page.locator('[data-testid="panel-history"]').innerText()
    if (!history.includes(es.historyReleasedWild.replace('{name}', 'Abra'))) {
      throw new Error('[release] falta "Dejaste ir a Abra." en el historial')
    }
    if (!history.includes(es.historyCardDrawn.replace('{deck}', es.tileDeckNames.pantano).replace('{card}', 'Abra'))) {
      throw new Error('[release] falta el robo de Abra en el historial')
    }
    if (pageErrors.length > 0) throw new Error(`[release] errores de página: ${pageErrors.join(' | ')}`)
  } finally {
    await context.close()
  }
  return 'dejar ir → turno +1, al fondo del mazo, historial'
}

const server = startDevServer(ROOT, PORT)
const browser = await chromium.launch()
let failed = 0
const seen = []
try {
  await waitForServer(BASE_URL)
  for (const [vw, vh] of VIEWPORTS) {
    const label = `${String(vw)}×${String(vh)}`
    try {
      seen.push(await checkViewport(browser, vw, vh, label))
      console.log(`ok   ${label} — popup-encounter solo, dentro del safeArea, sin tocar el HUD`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const check of [checkFight, checkRelease]) {
    try {
      seen.push(await check(browser))
      console.log(`ok   ${check === checkFight ? 'AC-5' : 'AC-6'} — ${seen.at(-1)}`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} finally {
  await browser.close()
  server.kill()
}

if (failed > 0) {
  console.error(`\n${String(failed)} de ${String(seen.length + failed)} casos fallaron`)
  process.exit(1)
}
console.log('\ne2e unificar-popup-encuentro: 3 viewports + pelear + dejar ir verificados')
