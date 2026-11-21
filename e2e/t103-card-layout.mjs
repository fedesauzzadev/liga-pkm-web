// AC: plan/layout-carta-modal — la carta grande del modal "Carta del Pokémon"
// sin huecos ni desbordes: header→arte→ataques→pie consecutivos (huecos ≤ 12
// px, AC-a/b/c), pie dentro de la carta (AC-d), sin overflow (AC-e), carta
// dentro de la zona de contenido .body (AC-f) y arte ≥ 140 px (AC-g). Matriz:
// 1024×600/1366×768/1920×1080 × 1..4 ataques, con nombre largo y descripción
// de ataque larga (mutación del DOM del modal: quitar/duplicar filas
// card-attack-*, alargar h3 y .rawText — toca solo el layout, no los datos).
// Corre contra el dev server (patrón e2e/route.mjs). Uso: node e2e/t103-card-layout.mjs.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'
import { newSkipContext, startDevServer, waitForServer, waitVisible } from './route.mjs'

const SEED = 7
const STARTER = 'isla'
const PORT = 4180
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const VIEWPORTS = [
  [1024, 600],
  [1366, 768],
  [1920, 1080],
]
const ATTACK_COUNTS = [1, 2, 3, 4]

const LONG_NAME = 'Nombre Larguisimo Del Pokemon De Prueba Con Apodo Familiar'
const LONG_TEXT =
  'Descripcion larga de prueba: este ataque hace cosas complejas cuando sale la cara indicada por el costo, con detalles extra y advertencias.'

/** Mutación de DOM (solo layout): N filas de ataque + textos largos. */
const mutate = (page, count) =>
  page.evaluate(
    ([n, longName, longText]) => {
      const face = globalThis.document.querySelector('[data-testid="card-face"]')
      const name = face.querySelector('h3')
      if (name !== null) name.textContent = longName
      const list = face.querySelector('[data-testid="card-attacks"]')
      while (list.children.length > n) list.lastElementChild.remove()
      while (list.children.length < n && list.firstElementChild !== null) {
        list.appendChild(list.firstElementChild.cloneNode(true))
      }
      for (const row of [...list.children]) {
        const p = row.querySelector('[class*="rawText"]')
        if (p !== null) p.textContent = longText
      }
    },
    [count, LONG_NAME, LONG_TEXT],
  )

/** Rectas de las secciones por data-testid (sin mirar imágenes). */
const metrics = (page) =>
  page.evaluate(() => {
    const face = globalThis.document.querySelector('[data-testid="card-face"]')
    const modal = globalThis.document.querySelector('[data-testid="modal-card"]')
    const r = (el) => el.getBoundingClientRect()
    const header = r(face.querySelector('[data-testid="card-header"]'))
    const art = r(face.querySelector('[data-testid="card-art"]'))
    const attacks = r(face.querySelector('[data-testid="card-attacks"]'))
    const footer = r(face.querySelector('[data-testid="card-footer"]'))
    const faceR = r(face)
    const body = r(modal.querySelector('div[class*="body"]'))
    return {
      headerToArt: art.top - header.bottom, // AC-a
      artToAttacks: attacks.top - art.bottom, // AC-b
      attacksToFooter: footer.top - attacks.bottom, // AC-c
      footerInside: faceR.bottom - footer.bottom, // AC-d
      overflow: face.scrollHeight - face.clientHeight, // AC-e
      cardInsideBody: body.bottom - faceR.bottom, // AC-f
      artHeight: art.height, // AC-g
    }
  })

const server = startDevServer(ROOT, PORT)
const browser = await chromium.launch()
try {
  await waitForServer(BASE_URL)
  const { context, page, pageErrors } = await newSkipContext(browser, {
    seed: SEED,
    dice: [4],
    baseUrl: BASE_URL,
    starter: STARTER,
  })

  const tip = page.locator('[data-testid="tip-f11-close"]')
  if ((await tip.count()) > 0) await tip.click()
  const slot = await waitVisible(page, '[data-testid="team-slot-open"]')
  await slot.click()
  await waitVisible(page, '[data-testid="modal-card"]')
  await waitVisible(page, '[data-testid="card-footer"]')

  let cases = 0
  for (const [vw, vh] of VIEWPORTS) {
    await page.setViewportSize({ width: vw, height: vh })
    await page.waitForTimeout(250)
    for (const count of ATTACK_COUNTS) {
      await mutate(page, count)
      await page.waitForTimeout(50)
      const m = await metrics(page)
      const label = `${String(vw)}×${String(vh)}, ${String(count)} ataques`
      if (m.headerToArt > 12) throw new Error(`AC-a header→arte ${m.headerToArt.toFixed(1)} px > 12 (${label})`)
      if (m.artToAttacks > 12) throw new Error(`AC-b arte→ataques ${m.artToAttacks.toFixed(1)} px > 12 (${label})`)
      if (m.attacksToFooter > 12) throw new Error(`AC-c ataques→pie ${m.attacksToFooter.toFixed(1)} px > 12 (${label})`)
      if (m.footerInside < 8) throw new Error(`AC-d pie fuera de la carta: margen ${m.footerInside.toFixed(1)} px < 8 (${label})`)
      if (m.overflow > 0) throw new Error(`AC-e overflow de card-face: ${String(m.overflow)} px (${label})`)
      if (m.cardInsideBody < 12) throw new Error(`AC-f carta fuera de .body: margen ${m.cardInsideBody.toFixed(1)} px < 12 (${label})`)
      if (m.artHeight < 140) throw new Error(`AC-g arte ${m.artHeight.toFixed(1)} px < 140 (${label})`)
      cases += 1
    }
  }

  if (pageErrors.length > 0) throw new Error(`errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
  console.log(
    `ok   layout carta: ${String(cases)} casos (3 viewports × 1-4 ataques), huecos ≤ 12 px, pie dentro, sin overflow, arte ≥ 140 px`,
  )
} finally {
  await browser.close()
  server.kill()
}
console.log('\ne2e layout-carta-modal: carta del modal sin huecos ni desbordes')
