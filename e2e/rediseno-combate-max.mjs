// AC: rediseno-combate-max/AC-7 — e2e del rediseño del combate maximizado por
// data-testid (sin mirar imágenes) a los 4 tamaños del spec (1024×600,
// 1366×768, 1920×1080, 2560×1080): battle-stage entra sin scroll, escala
// uniforme, orden carta mía < recuadro < carta enemiga, dados debajo de las
// cartas, pestañas/acciones debajo del recuadro, sin solapes, sin "Pasar" ni
// "PKM salvaje", "Restaurar" presente, letra efectiva ≥ 12/10 px y flujo por
// pestaña (elegir → Aceptar / elegir → Cancelar). Uso: node e2e/rediseno-combate-max.mjs.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { es } from '../apps/web/src/i18n/es.ts'
import { newSkipContext, startDevServer, waitForServer, waitVisible } from './route.mjs'

const SEED = 7
const STARTER = 'isla' // Squirtle: cabezazo legal en el primer turno
const PORT = 4183
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VIEWPORTS = [
  [1024, 600],
  [1366, 768],
  [1920, 1080],
  [2560, 1080],
]

const HEADER_PX = 56

/** Caja {x,y,width,height} de un elemento por data-testid. */
async function boxOf(page, testid) {
  const box = await page.locator(`[data-testid="${testid}"]`).first().boundingBox()
  if (box === null) throw new Error(`sin boundingBox: ${testid}`)
  return box
}

const overlaps = (a, b, tolerance = 1) =>
  a.x < b.x + b.width - tolerance &&
  b.x < a.x + a.width - tolerance &&
  a.y < b.y + b.height - tolerance &&
  b.y < a.y + a.height - tolerance

/** Arranca partida, fuerza el encuentro con Abra, pelea y maximiza el popup. */
async function openBattle(browser, viewport) {
  const { context, page, pageErrors } = await newSkipContext(browser, {
    seed: SEED,
    dice: [],
    baseUrl: BASE_URL,
    starter: STARTER,
    viewport,
  })
  // El overlay de carga (pantalla-carga-tablero) tapa el HUD hasta que el
  // tablero renderiza (con compile en frío puede tardar): esperar su salida.
  const loading = page.locator('[data-testid="loading-screen"]')
  if ((await loading.count()) > 0) {
    await loading.first().waitFor({ state: 'detached', timeout: 90_000 })
  }
  await waitVisible(page, '[data-testid="btn-dev-encounter"]').then((button) => button.click())
  await waitVisible(page, '[data-testid="popup-encounter"]')
  await page.locator('[data-testid^="btn-fight-"]').first().click()
  await waitVisible(page, '[data-testid="popup-battle"]')
  // El chunk de combate es lazy (ADR-8): esperar la escena antes de ampliar
  // (en frío la compilación del chunk puede tardar varios segundos).
  await waitVisible(page, '[data-battle-scene], [data-battle-wait]', 90_000)
  await waitVisible(page, '[data-testid="btn-battle-expand"]').then((button) => button.click())
  await waitVisible(page, '[data-testid="battle-stage"]', 30_000)
  // La intro (skip) reproduce rápido; esperamos el turno propio (tabs activas).
  await waitEnabled(page, '[data-testid="tab-attack"]')
  return { context, page, pageErrors }
}

async function waitEnabled(page, selector, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const locator = page.locator(selector).first()
    if ((await locator.count()) > 0 && (await locator.isEnabled())) return locator
    await sleep(80)
  }
  throw new Error(`no se habilitó ${selector}`)
}

/** AC-7 por viewport: geometría, escala uniforme, solapes, textos y letra. */
async function checkViewport(browser, vw, vh, label) {
  const { context, page, pageErrors } = await openBattle(browser, { width: vw, height: vh })
  try {
    const stage = await boxOf(page, 'battle-stage')
    // Sin scroll y dentro de pantalla (tolerancia 1 px).
    const scroll = await page.evaluate(() => ({
      w: globalThis.document.scrollingElement.scrollWidth,
      h: globalThis.document.scrollingElement.scrollHeight,
      iw: globalThis.window.innerWidth,
      ih: globalThis.window.innerHeight,
    }))
    if (scroll.w > scroll.iw + 1 || scroll.h > scroll.ih + 1) {
      throw new Error(`[${label}] hay scroll de página: ${String(scroll.w)}×${String(scroll.h)}`)
    }
    if (stage.x < -1 || stage.y < -1 || stage.x + stage.width > vw + 1 || stage.y + stage.height > vh + 1) {
      throw new Error(`[${label}] battle-stage se sale de pantalla`)
    }

    const [mine, enemy, arena, tabs, actions, dieMine, dieEnemy] = await Promise.all([
      boxOf(page, 'battle-card-mine'),
      boxOf(page, 'battle-card-enemy'),
      boxOf(page, 'battle-arena'),
      boxOf(page, 'battle-tabs'),
      boxOf(page, 'battle-actions'),
      boxOf(page, 'battle-die-mine'),
      boxOf(page, 'battle-die-enemy'),
    ])

    // Escala uniforme: todos los hijos usan la MISMA escala (la del recuadro
    // 690×460 de diseño contra el recuadro real).
    const scale = arena.width / 690
    const expectDesign = (box, designW, designH, what) => {
      if (Math.abs(box.width - designW * scale) > 1.5 || Math.abs(box.height - designH * scale) > 1.5) {
        throw new Error(
          `[${label}] ${what} mide ${box.width.toFixed(1)}×${box.height.toFixed(1)} (esperado ${(
            designW * scale
          ).toFixed(1)}×${(designH * scale).toFixed(1)} a escala ${scale.toFixed(3)})`,
        )
      }
    }
    expectDesign(mine, 340, 540, 'carta mía')
    expectDesign(enemy, 340, 540, 'carta enemiga')
    expectDesign(tabs, 690, 52, 'pestañas')
    expectDesign(actions, 690, 200, 'acciones')

    // Orden en x: carta mía < recuadro < carta enemiga.
    if (!(mine.x + mine.width <= arena.x + 1 && arena.x + arena.width <= enemy.x + 1)) {
      throw new Error(`[${label}] el orden x no es carta mía < recuadro < carta enemiga`)
    }
    // Dados debajo de las cartas; pestañas debajo del recuadro; acciones debajo.
    if (dieMine.y < mine.y + mine.height - 1) throw new Error(`[${label}] dado mío no está debajo de mi carta`)
    if (dieEnemy.y < enemy.y + enemy.height - 1) throw new Error(`[${label}] dado rival no está debajo de su carta`)
    if (tabs.y < arena.y + arena.height - 1) throw new Error(`[${label}] pestañas no están debajo del recuadro`)
    if (actions.y < tabs.y + tabs.height - 1) throw new Error(`[${label}] acciones no están debajo de las pestañas`)

    // Ninguna caja se solapa.
    const boxes = { mine, enemy, arena, tabs, actions, dieMine, dieEnemy }
    for (const [nameA, a] of Object.entries(boxes)) {
      for (const [nameB, b] of Object.entries(boxes)) {
        if (nameA < nameB && overlaps(a, b)) throw new Error(`[${label}] ${nameA} se solapa con ${nameB}`)
      }
    }

    // Sin "Pasar" ni "PKM salvaje"; existe "Restaurar".
    const popupText = await page.locator('[data-testid="popup-battle"]').innerText()
    if (popupText.includes(es.popupBattlePass)) throw new Error(`[${label}] existe "Pasar"`)
    if (popupText.includes(es.popupBattleTitleWild)) throw new Error(`[${label}] existe "PKM salvaje"`)
    if (!popupText.includes(es.popupBattleRestore)) throw new Error(`[${label}] falta "Restaurar"`)

    // Letra efectiva: principal (pestañas, 18 px de diseño) ≥ 12 px y
    // secundaria (resumen de efecto de la carta, 15 px) ≥ 10 px.
    const fonts = await page.evaluate(() => {
      const tab = globalThis.document.querySelector('[data-testid="tab-attack"]')
      const summary = globalThis.document.querySelector('[data-testid="battle-card-mine"] .effectSummary')
        ?? globalThis.document.querySelector('[data-testid="battle-card-mine"] p')
      return {
        tab: tab === null ? 0 : Number.parseFloat(globalThis.getComputedStyle(tab).fontSize),
        summary: summary === null ? 0 : Number.parseFloat(globalThis.getComputedStyle(summary).fontSize),
      }
    })
    if (fonts.tab < 12 - 0.01) throw new Error(`[${label}] letra principal ${String(fonts.tab)} px < 12`)
    if (fonts.summary < 10 - 0.01) throw new Error(`[${label}] letra secundaria ${String(fonts.summary)} px < 10`)

    // Ninguna fila/botón contiene "(0)"/"(00)"/"-0".
    const cards = await page.evaluate(() => {
      const pick = (id) => globalThis.document.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''
      return `${pick('battle-card-mine')} ${pick('battle-card-enemy')} ${pick('battle-attack-list')}`
    })
    if (/\((0|00)\)|-0/.test(cards)) throw new Error(`[${label}] hay "(0)"/"(00)"/"-0" en filas o botones`)

    // AC-4: cada fila de ataques entra sin desbordar (scrollHeight ≤ clientHeight).
    const fit = await page.evaluate(() => {
      const rows = globalThis.document.querySelectorAll('[data-testid="card-attack-row"]')
      return Array.from(rows).map((row) => ({ s: row.scrollHeight, c: row.clientHeight }))
    })
    for (const row of fit) {
      if (row.c > 0 && row.s > row.c + 1) {
        throw new Error(`[${label}] una fila de ataque desborda (${String(row.s)} > ${String(row.c)})`)
      }
    }

    if (pageErrors.length > 0) throw new Error(`[${label}] errores de página: ${pageErrors.join(' | ')}`)
  } finally {
    await context.close()
  }
  return label
}

/** Flujo por pestaña (eleger → Aceptar / elegir → Cancelar) + estabilidad. */
async function checkFlows(browser) {
  const { context, page, pageErrors } = await openBattle(browser, { width: 1920, height: 1080 })
  try {
    const effectBox = page.locator('[data-testid="battle-effect-box"]')
    const accept = page.locator('[data-testid="btn-accept"]')

    // Esperar a que la escala del lienzo se estabilice (el ResizeObserver la
    // aplica tras el primer paint; medir antes sería medir scale 1).
    const scaleOf = () =>
      page.locator('[data-testid="battle-stage"]').first().getAttribute('data-scale')
    let prev = await scaleOf()
    for (let i = 0; i < 40; i += 1) {
      await sleep(250)
      const next = await scaleOf()
      if (next === prev) break
      prev = next
    }


    // AC-4: cajas de la carta mía (y de cada hijo directo) antes de interactuar.
    const boxesBefore = await page.evaluate(() => {
      const card = globalThis.document.querySelector('[data-testid="battle-card-mine"] article')
        ?? globalThis.document.querySelector('[data-testid="battle-card-mine"]')
      const kids = Array.from(card?.children ?? []).map((kid) => {
        const r = kid.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      })
      const r = card?.getBoundingClientRect()
      return { card: r === undefined ? null : { x: r.x, y: r.y, w: r.width, h: r.height }, kids }
    })
    const sameBox = (a, b) =>
      a === null || b === null ? false :
      Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5 &&
      Math.abs(a.w - b.w) <= 0.5 && Math.abs(a.h - b.h) <= 0.5

    // Atacar: ilegal (primer turno) ⇒ clic muestra el motivo y Aceptar queda
    // deshabilitado (aria-disabled, nota n.º 5).
    // aria-disabled (nota n.º 5): el clic debe mostrar el motivo; se usa
    // dispatchEvent porque force-click puede caer en un elemento tapado.
    await page.locator('[data-testid="btn-attack-2"]').dispatchEvent('click')
    let reason = (await effectBox.innerText()).trim()
    if (!reason.includes(es.battleReasonFirstTurn) && !reason.includes('Falta')) {
      throw new Error(`[flows] el ataque ilegal no mostró motivo: "${reason}"`)
    }
    if (await accept.isEnabled()) throw new Error('[flows] Aceptar habilitado con ataque ilegal')

    // Elegir ataque legal ⇒ resalte + efecto completo en battle-effect-box +
    // Aceptar habilitado; Cancelar limpia.
    await page.locator('[data-testid="btn-attack-1"]').click()
    if (!(await accept.isEnabled())) throw new Error('[flows] Aceptar no se habilitó con ataque legal')
    const selected = await page.locator('[data-testid="battle-card-mine"] [data-state="selected"]').count()
    if (selected !== 1) throw new Error('[flows] el ataque elegido no se resaltó en la carta')
    await page.locator('[data-testid="btn-cancel"]').click()
    if (await accept.isEnabled()) throw new Error('[flows] Cancelar no limpió la selección')

    // AC-4: las cajas de la carta (y sus hijos directos) no cambiaron al
    // seleccionar/cancelar.
    const boxesAfter = await page.evaluate(() => {
      const card = globalThis.document.querySelector('[data-testid="battle-card-mine"] article')
        ?? globalThis.document.querySelector('[data-testid="battle-card-mine"]')
      const kids = Array.from(card?.children ?? []).map((kid) => {
        const r = kid.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      })
      const r = card?.getBoundingClientRect()
      return { card: r === undefined ? null : { x: r.x, y: r.y, w: r.width, h: r.height }, kids }
    })
    if (boxesBefore.card === null || !sameBox(boxesBefore.card, boxesAfter.card)) {
      throw new Error(
        `[flows] la carta mía cambió de forma al seleccionar: ${JSON.stringify(boxesBefore.card)} → ${JSON.stringify(boxesAfter.card)}`,
      )
    }
    for (let index = 0; index < boxesBefore.kids.length; index += 1) {
      const before = boxesBefore.kids[index]
      const after = boxesAfter.kids[index]
      if (before === undefined || after === undefined) throw new Error('[flows] cambió la cantidad de hijos de la carta')
      if (
        Math.abs(before.x - after.x) > 0.5 || Math.abs(before.y - after.y) > 0.5 ||
        Math.abs(before.w - after.w) > 0.5 || Math.abs(before.h - after.h) > 0.5
      ) {
        throw new Error(
          `[flows] el hijo ${String(index)} de la carta cambió de caja: ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
        )
      }
    }

    // Aceptar un ataque ⇒ comando Attack (el guion crece: bloqueo y re-habilitación).
    await page.locator('[data-testid="btn-attack-1"]').click()
    await accept.click()
    await sleep(400) // skip: el turno del rival resuelve inmediato
    await waitEnabled(page, '[data-testid="tab-attack"]', 20_000)

    // Mochila: poción deshabilitada con motivo (activo sin daño) y sin despachar.
    await page.locator('[data-testid="tab-bag"]').click()
    const potion = page.locator('[data-testid="btn-item-potion"]')
    if ((await potion.count()) > 0) {
      await potion.dispatchEvent('click')
      reason = (await effectBox.innerText()).trim()
      if (reason.length === 0) throw new Error('[flows] ítem no usable sin motivo en battle-effect-box')
      if (await accept.isEnabled()) throw new Error('[flows] Aceptar habilitado con ítem no usable')
    }
    await page.locator('[data-testid="btn-cancel"]').click()

    // Dejar ir: texto de confirmación; Aceptar deshabilitado (Release no es
    // legal en mitad del combate) ⇒ no se envía nada.
    await page.locator('[data-testid="tab-release"]').click()
    const releaseText = await page.locator('[data-testid="battle-actions"]').innerText()
    if (!releaseText.includes(es.battleReleaseConfirm.slice(0, '¿Dejar ir a'.length))) {
      throw new Error('[flows] falta el texto de confirmación de Dejar ir')
    }
    if (await accept.isEnabled()) throw new Error('[flows] Aceptar habilitado para Dejar ir sin Release legal')
    await page.locator('[data-testid="btn-cancel"]').click()

    // Dado del rival: tras mi ataque el rival tiró attackSelect ⇒ el dado
    // enemigo quedó con el valor del motor (skip ⇒ valor final directo).
    const enemyDie = await page.locator('[data-testid="battle-die-enemy"]').getAttribute('data-value')
    if (enemyDie === null || !'123456'.includes(enemyDie)) {
      throw new Error(`[flows] battle-die-enemy sin valor del motor: ${String(enemyDie)}`)
    }

    // El header de 56 px está presente con "Restaurar".
    const header = await boxOf(page, 'battle-popup-header')
    if (Math.abs(header.height - HEADER_PX) > 1.5) {
      throw new Error(`[flows] header mide ${String(header.height)} (esperado 56)`)
    }

    if (pageErrors.length > 0) throw new Error(`[flows] errores de página: ${pageErrors.join(' | ')}`)
  } finally {
    await context.close()
  }
  return 'flujos por pestaña + estabilidad de cartas'
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
      console.log(`ok   ${label} — stage sin scroll, escala uniforme, orden/sin solapes, letra ≥ 12/10 px`)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  try {
    seen.push(await checkFlows(browser))
    console.log('ok   flujos — elegir/Aceptar y elegir/Cancelar, motivos, dado rival, header 56 px')
  } catch (error) {
    failed += 1
    console.error(`FAIL flujos: ${error instanceof Error ? error.message : String(error)}`)
  }
} finally {
  await browser.close()
  server.kill()
}
if (failed > 0) {
  console.error(`\n${String(failed)} de ${String(seen.length + failed)} casos fallaron`)
  process.exit(1)
}
console.log('\ne2e rediseno-combate-max: 4 viewports + flujos verificados')
