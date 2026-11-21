// AC: SPEC-I/T-073/AC-1..AC-6 — e2e de la mochila: drag REAL con el mouse
// (pointer events, sin HTML5): energía → slot de PKM equipa y mueve contadores;
// drop ilegal sacude la fila y no cambia nada; tocar-destino (AC-4) equipa sin
// arrastrar; y la ficha equipada vuelve a la mochila (Unequip, AC-5).
// Planificación con el motor (patrón t061: ?seed + ?dice forzados, route.mjs).
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { loadContent } from '../packages/content/src/loader.ts'
import { es } from '../apps/web/src/i18n/es.ts'
import { findRoute, newSkipContext, selectorFor, startDevServer, waitForServer, waitVisible } from './route.mjs'

const SEED = 7
const STARTER = 'isla'
const PORT = 4174
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const content = loadContent(join(ROOT, 'content'))

/** Llega a casilleros de mazo hasta robar `want` cartas de energía (loop de rutas). */
function planEnergies(want) {
  let state = null
  let cursor = 0
  const actions = []
  const dice = []
  let energies = 0
  while (energies < want) {
    const route = findRoute(content, SEED, STARTER, (node) => node.type === 'deck', state, cursor)
    actions.push(...route.actions)
    dice.push(...route.dice)
    energies += route.resolved.events.filter((event) => event.type === 'EnergyGained').length
    state = route.resolved.state
    cursor += route.dice.length
  }
  return { actions, dice }
}

async function drag(page, fromSelector, toSelector) {
  const from = await page.locator(fromSelector).first().boundingBox()
  const to = await page.locator(toSelector).first().boundingBox()
  if (from === null || to === null) throw new Error(`sin caja para ${fromSelector} → ${toSelector}`)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 3 })
  const ghost = await page.locator('[data-testid="drag-ghost"]').count()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()
  return ghost
}

const tokenCount = async (page) =>
  page.locator('[data-testid="backpack-token"][data-token^="element_"]').first().getAttribute('data-count')
const slotEnergy = async (page, index) =>
  page.locator('[data-testid="team-slot"]').nth(index).getAttribute('data-energy-count')

/** Espera a que la reproducción de eventos termine (send se bloquea mientras). */
async function waitIdle(page) {
  let zeros = 0
  for (let i = 0; i < 200 && zeros < 3; i++) {
    const playing = await page.getByText(es.playReproducing).count()
    zeros = playing === 0 ? zeros + 1 : 0
    await sleep(60)
  }
}

async function main() {
  const { actions, dice } = planEnergies(3)
  const { context, page, pageErrors } = await newSkipContext(browser, {
    seed: SEED,
    dice,
    baseUrl: BASE_URL,
    starter: STARTER,
  })
  for (const action of actions) {
    const button = await waitVisible(page, selectorFor(action))
    await button.click()
    await sleep(60)
  }
  await waitVisible(page, '[data-testid="panel-backpack"]')
  const tokenSel = '[data-testid="backpack-token"][data-token^="element_"]'
  await waitVisible(page, tokenSel)
  await waitIdle(page)

  // AC-6/AC-2: drag energía → slot 1 ejecuta Equip y mueve contadores.
  const before = await tokenCount(page)
  const failures = []
  try {
    const ghostDuringDrag = await (async () => {
      const from = await page.locator(tokenSel).first().boundingBox()
      const to = await page.locator('[data-testid="team-slot"]').first().boundingBox()
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 })
      const visible = await page.locator('[data-testid="drag-ghost"]').isVisible()
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
      await page.mouse.up()
      return visible
    })()
    const afterToken = Number(await tokenCount(page))
    const slot0 = await slotEnergy(page, 0)
    if (!ghostDuringDrag) throw new Error('el ghost no siguió al puntero (AC-1)')
    if (afterToken !== Number(before) - 1) {
      throw new Error(`contador mochila ${String(afterToken)} ≠ ${String(Number(before) - 1)}`)
    }
    if (slot0 === null || Number(slot0) < 1) {
      throw new Error(`el slot no sumó energía (data-energy-count=${slot0 ?? 'null'})`)
    }
    console.log('ok   AC-6/AC-2 drag energía→slot: ghost + Equip + contadores')
  } catch (error) {
    failures.push(`drag legal: ${error instanceof Error ? error.message : String(error)}`)
  }

  // AC-3: drop ilegal (sobre panel-history, no es destino) sacude y no cambia nada.
  try {
    await waitIdle(page)
    const before3 = await tokenCount(page)
    const slotBefore3 = await slotEnergy(page, 0)
    await drag(page, tokenSel, '[data-testid="panel-history"]')
    await sleep(80)
    const shake = await page.locator('[data-backpack-panel][data-shake="true"]').count()
    const noteText = await page.locator('[data-testid="backpack-note"]').innerText()
    const after3 = await tokenCount(page)
    const slotAfter3 = await slotEnergy(page, 0)
    if (shake < 1) throw new Error('no hubo sacudida (data-shake)')
    if (!noteText.includes(es.backpackDropInvalid.slice(0, 10))) throw new Error(`nota inesperada: "${noteText}"`)
    if (after3 !== before3 || slotAfter3 !== slotBefore3) {
      throw new Error('el drop ilegal cambió el estado')
    }
    console.log('ok   AC-3 drop ilegal: nota + sacudida + estado intacto')
  } catch (error) {
    failures.push(`drop ilegal: ${error instanceof Error ? error.message : String(error)}`)
  }

  // AC-4: tocar la carta y después tocar el slot (alternativa táctil/accesible).
  try {
    await waitIdle(page)
    const before4 = await tokenCount(page)
    await page.locator(tokenSel).first().click()
    const selected = await page.locator('[data-testid="backpack-token"][data-selected="true"]').count()
    if (selected < 1) throw new Error('la carta no quedó seleccionada')
    // El primer slot es el PKM real (los demás están vacíos en el MVP).
    const slotBefore4 = await slotEnergy(page, 0)
    await page.locator('[data-testid="team-slot"]').first().click()
    await sleep(150)
    const after4 = Number(await tokenCount(page))
    const slot4 = await slotEnergy(page, 0)
    if (after4 !== Number(before4) - 1) throw new Error(`contador mochila ${String(after4)} ≠ ${String(Number(before4) - 1)}`)
    if (Number(slot4) !== Number(slotBefore4) + 1) throw new Error('el slot no recibió la energía')
    console.log('ok   AC-4 tocar-destino: seleccionar + tocar slot equipa')
  } catch (error) {
    failures.push(`tocar-destino: ${error instanceof Error ? error.message : String(error)}`)
  }

  // AC-5: quitar energía: arrastrar la ficha equipada del slot de vuelta a la mochila.
  try {
    await waitIdle(page)
    const chip = page.locator('[data-testid="equip-chip"]').first()
    const chipId = (await chip.getAttribute('data-element-id')) ?? ''
    const element = chipId.slice('element_'.length).split('#')[0]
    const tokenSel5 = `[data-token="element_${element}"]`
    const countOf = async () => {
      const found = await page.locator(tokenSel5).count()
      return found === 0 ? 0 : Number(await page.locator(tokenSel5).first().getAttribute('data-count'))
    }
    const before5 = await countOf()
    const slot5 = await slotEnergy(page, 0)
    const chipBox = await chip.boundingBox()
    const packBox = await page.locator('[data-testid="panel-backpack"]').boundingBox()
    await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(chipBox.x + chipBox.width / 2 + 20, chipBox.y + chipBox.height / 2 + 20, { steps: 3 })
    const ghostVisible = await page.locator('[data-testid="drag-ghost"]').isVisible().catch(() => false)
    await page.mouse.move(packBox.x + packBox.width / 2, packBox.y + packBox.height / 2, { steps: 8 })
    await page.mouse.up()
    await sleep(200)
    const after5 = await countOf()
    const slotAfter5 = await slotEnergy(page, 0)
    if (!ghostVisible) throw new Error('el ghost no apareció al arrastrar la ficha')
    if (after5 !== before5 + 1) {
      throw new Error(`contador ${element} ${String(after5)} ≠ ${String(before5 + 1)}`)
    }
    if (Number(slotAfter5) !== Number(slot5) - 1) {
      throw new Error(`slot ${String(slotAfter5)} ≠ ${String(Number(slot5) - 1)}`)
    }
    console.log('ok   AC-5 unequip: ficha del slot → mochila (Unequip)')
  } catch (error) {
    const noteText = await page.locator('[data-testid="backpack-note"]').allInnerTexts().catch(() => [])
    const alertText = await page.locator('[role="alert"]').allInnerTexts().catch(() => [])
    failures.push(
      `unequip: ${error instanceof Error ? error.message : String(error)} | nota: ${noteText.join(' / ') || '(ninguna)'} | alerta: ${alertText.join(' / ') || '(ninguna)'}`,
    )
  }

  if (pageErrors.length > 0) failures.push(`errores de página: ${pageErrors.join(' | ')}`)
  await context.close()
  return failures
}

let browser
const server = startDevServer(ROOT, PORT)
let failures = []
try {
  await waitForServer(BASE_URL)
  browser = await chromium.launch()
  failures = await main()
} finally {
  await browser?.close()
  server.kill()
}

if (failures.length > 0) {
  console.error(`\ne2e T-073 falló:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('\ne2e T-073: mochila con arrastrar y soltar responde de punta a punta')
