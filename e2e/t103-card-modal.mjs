// AC: SPEC-R/T-103/AC-16 (+AC-2/AC-3 cliente, AC-19) — ventana de carta del
// Pokémon: dentro del viewport a 1024×600/1366×768/1920×1080, card-face con
// aspecto 0,63±0,03 y 70–86 % del alto de la ventana a 1366×768, nombre sin
// recortes (scrollWidth≤clientWidth), una fila por ataque con caras/daño/costo,
// equipar emite Equip y actualiza contadores, Esc y clic en el fondo cierran,
// ningún texto < 13 px y el rótulo del panel del dado no se corta.
// Corre contra el dev server (patrón e2e/route.mjs). Uso: node e2e/t103-card-modal.mjs.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'
import { newSkipContext, startDevServer, waitForServer, waitVisible } from './route.mjs'

const SEED = 7
const STARTER = 'isla'
const PORT = 4179
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const samples = JSON.parse(readFileSync(resolve(ROOT, 'content/pokemon/_samples.json'), 'utf8'))
const squirtle = samples.cards.find((card) => card.id === 'squirtle')

const VIEWPORTS = [
  [1024, 600],
  [1366, 768],
  [1920, 1080],
]

/** Espera a que el selector desaparezca (hasta 12 s: el headless renderiza el
 * 3D por CPU y el commit de React puede demorar; con GPU es inmediato). */
const waitGone = async (page, selector, timeoutMs = 12_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await page.locator(selector).count()) === 0) return
    await page.waitForTimeout(150)
  }
  throw new Error(`no desapareció ${selector}`)
}

const modalMetrics = (page) =>
  page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    const modal = globalThis.document.querySelector('[data-testid="modal-card"]')
    const face = globalThis.document.querySelector('[data-testid="card-face"]')
    const name = face?.querySelector('h3')
    const rows = [...(face?.querySelectorAll('[data-testid^="card-attack-"]') ?? [])].map((row) => ({
      id: row.getAttribute('data-testid'),
      faces: row.querySelector('._faces_2412ed, [class*="faces"]')?.textContent ?? '',
      damage: row.querySelector('[class*="damage"]')?.textContent ?? '',
      costIcons: Number(row.querySelector('[data-cost-row]')?.getAttribute('data-cost-row') ?? '0'),
      costImgs: row.querySelectorAll('[data-cost-row] img').length,
      state: row.getAttribute('data-state'),
    }))
    const tooSmall = [...(modal?.querySelectorAll('*') ?? [])]
      .filter((el) => el.childNodes.length > 0 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0))
      .map((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize))
      .filter((px) => Number.isNaN(px) || px < 13)
    return {
      modal: modal === null ? null : box(modal),
      face: face === null ? null : box(face),
      nameScrollOk: name === null || name.scrollWidth <= name.clientWidth,
      rows,
      tooSmall,
      vw: globalThis.window.innerWidth,
      vh: globalThis.window.innerHeight,
    }
  })

/** AC: SPEC-T/T-104/AC-11 - "Multicolor libres" y estado de una fila de ataque. */
const freeMulticolor = async (page) => {
  const text = await page.textContent('[data-testid="multicolor-free"]')
  const match = text?.match(/(\d+)\s*$/)
  return match === null || match === undefined ? null : Number(match[1])
}

const rowState = async (page, attackId) =>
  page.getAttribute(`[data-testid="card-attack-${attackId}"]`, 'data-state')

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

  // AC-1: clic en un slot del equipo abre la ventana con ESA carta.
  const tip = page.locator('[data-testid="tip-f11-close"]')
  if ((await tip.count()) > 0) await tip.click()
  const slot = await waitVisible(page, '[data-testid="team-slot-open"]')
  await slot.click()
  await waitVisible(page, '[data-testid="modal-card"]')
  const name = await page.textContent('[data-testid="card-face"] h3')
  if (name?.trim() !== 'Squirtle') throw new Error(`la ventana no muestra a Squirtle: "${String(name)}"`)

  // AC-16: geometría por viewport.
  for (const [vw, vh] of VIEWPORTS) {
    await page.setViewportSize({ width: vw, height: vh })
    await page.waitForTimeout(250)
    const m = await modalMetrics(page)
    if (m.modal === null || m.face === null) throw new Error(`a ${String(vw)}×${String(vh)} no hay ventana`)
    const { modal, face } = m
    if (modal.x < 0 || modal.y < 0 || modal.x + modal.w > m.vw + 1 || modal.y + modal.h > m.vh + 1) {
      throw new Error(`modal fuera del viewport a ${String(vw)}×${String(vh)}: ${JSON.stringify(modal)}`)
    }
    const aspect = face.w / face.h
    if (Math.abs(aspect - 0.63) > 0.03) {
      throw new Error(`aspecto de card-face ${aspect.toFixed(3)} fuera de 0,63±0,03 a ${String(vw)}×${String(vh)}`)
    }
    if (vw === 1366 && vh === 768) {
      const ratio = face.h / m.vh
      if (ratio < 0.7 || ratio > 0.86) {
        throw new Error(`card-face ocupa ${ratio.toFixed(2)} del alto de la ventana (esperado 0,70–0,86)`)
      }
    }
    if (!m.nameScrollOk) throw new Error(`nombre recortado a ${String(vw)}×${String(vh)}`)
    if (m.tooSmall.length > 0) throw new Error(`textos < 13px a ${stringifyView(vw, vh)}: ${String(m.tooSmall.join(','))}`)
  }

  // AC-16: tantas filas como ataques, con caras, daño y costo correcto.
  const m = await modalMetrics(page)
  if (m.rows.length !== squirtle.attacks.length) {
    throw new Error(`filas ${String(m.rows.length)} ≠ ataques ${String(squirtle.attacks.length)}`)
  }
  for (const [index, row] of m.rows.entries()) {
    const attack = squirtle.attacks[index]
    if (!row.id.endsWith(attack.id)) throw new Error(`fila ${String(index)} debería ser ${attack.id}: ${String(row.id)}`)
    if (!row.faces.includes('_')) throw new Error(`fila ${attack.id} sin caras de dado`)
    // rediseno-combate-max/AC-3: base 0 sin ifRoll no muestra daño ("(0)" fuera).
    const hasDamage = attack.damage.base > 0 || attack.damage.ifRoll !== undefined
    if (hasDamage && !row.damage.includes('(')) throw new Error(`fila ${attack.id} sin daño`)
    if (!hasDamage && row.damage.length > 0) throw new Error(`fila ${attack.id} muestra daño "${row.damage}" con base 0`)
    if (row.costIcons !== attack.cost.length || row.costImgs !== attack.cost.length) {
      throw new Error(`fila ${attack.id}: íconos de costo ${String(row.costImgs)}/${String(row.costIcons)} ≠ ${String(attack.cost.length)}`)
    }
  }

  // AC-2/AC-3: Esc cierra (con animación de salida de 180 ms).
  await page.keyboard.press('Escape')
  await waitGone(page, '[data-testid="modal-card"]')

  // AC-16: tocar una energía disponible emite Equip y actualiza contadores.
  // La energía inicial arranca equipada: primero se desequipa desde la ventana.
  await slot.click()
  await waitVisible(page, '[data-testid="modal-card"]')
  const equippedChip = await waitVisible(page, '[data-testid="card-energy-equipped"]:not([disabled])')
  await equippedChip.click()
  await page.waitForTimeout(150)
  const availableChip = await waitVisible(page, '[data-testid="card-energy-available"]:not([disabled])')
  const countBefore = await availableChip.getAttribute('data-count')
  const energyBefore = Number(await page.getAttribute('[data-testid="team-slot"]', 'data-energy-count'))
  await availableChip.click()
  await page.waitForTimeout(150)
  const energyAfter = Number(await page.getAttribute('[data-testid="team-slot"]', 'data-energy-count'))
  if (energyAfter !== energyBefore + 1) {
    throw new Error(`Equip no actualizó el slot: ${String(energyBefore)} → ${String(energyAfter)}`)
  }
  // La carta equipada volvió a la carta (fila habilitada) y desapareció de disponibles.
  const availableAgain = await page.locator('[data-testid="card-energy-available"]').count()
  if (availableAgain !== 0 && countBefore === '1') {
    throw new Error('la energía no se consumió de Disponibles al equiparla')
  }

  // AC: SPEC-T/T-104/AC-11 - Multicolor: asignar como Agua desde la ventana,
  // quitarlo y verificar contador + fila ✖ (todo por data-testid).
  await waitVisible(page, '[data-testid="btn-multicolor-open"]')
  await page.click('[data-testid="btn-multicolor-open"]')
  const asWater = await waitVisible(page, '[data-command="AssignMulticolor"][data-element="water"]')
  await asWater.click()
  await page.waitForTimeout(150)
  // Burbujas (Agua×2) pasa a disponible: 1 Agua equipada + Multicolor Agua.
  if ((await freeMulticolor(page)) !== 1) throw new Error('asignar no bajó "Multicolor libres" a 1')
  if ((await rowState(page, 'burbujas')) !== 'available') throw new Error('burbujas no quedó disponible con el Multicolor')
  const chip = await waitVisible(page, '[data-testid="card-multicolor-equipped"]:not([disabled])')
  await chip.click()
  await page.waitForTimeout(150)
  if ((await freeMulticolor(page)) !== 2) throw new Error('quitar no subió "Multicolor libres" a 2')
  if ((await rowState(page, 'burbujas')) !== 'blocked') throw new Error('burbujas no volvió a ✖ tras quitar el Multicolor')
  if ((await page.locator('[data-testid="card-multicolor-equipped"]').count()) !== 0) {
    throw new Error('la ficha del Multicolor sigue en Equipadas tras quitarla')
  }

  // AC-2: clic en el fondo oscuro cierra.
  await page.locator('[data-testid="modal-card-backdrop"]').click({ position: { x: 6, y: 6 } })
  await waitGone(page, '[data-testid="modal-card"]')

  // AC-19: el rótulo del panel del dado no se corta (2 líneas si hace falta).
  await page.setViewportSize({ width: 1024, height: 600 })
  await page.waitForTimeout(120)
  const dice = await page.evaluate(() => {
    const who = globalThis.document.querySelector('[data-testid="dice-who"]')
    return { text: who?.textContent ?? '', ok: who === null || who.scrollWidth <= who.clientWidth }
  })
  if (!dice.ok) throw new Error(`rótulo del dado cortado: "${dice.text}"`)
  if (!dice.text.includes('Tirá el dado')) throw new Error(`rótulo inesperado: "${dice.text}"`)

  if (pageErrors.length > 0) throw new Error(`errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
  console.log(
    `ok   carta grande: ${String(squirtle.attacks.length)} filas, aspecto 0,63, 3 viewports, Equip ✓, Esc/fondo ✓, dado sin cortes`,
  )
} finally {
  await browser.close()
  server.kill()
}
console.log('\ne2e T-103: ventana de carta del Pokémon — legible, medible, cerrable')

function stringifyView(vw, vh) {
  return `${String(vw)}×${String(vh)}`
}
