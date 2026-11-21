// AC: SPEC-G/T-066/AC-1..AC-3 � verificaci�n visual guiada (`pnpm shots`):
// capturas del tablero 3D/2D en 1280�800 y 1440�900 (dados forzados con
// ?seed/?dice, clicks por data-attributes, patr�n de e2e/route.mjs), m�tricas
// por captura (varianza de p�xeles > umbral, tablero = 60 % del ancho, hitos
// del window.__debug.sceneDump, sin errores de consola) ? shots/report.json, y
// shots/README.md autogenerado con el "qu� mirar" para el due�o (NO-VISION �4-5).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { loadContent } from '../packages/content/src/loader.ts'
import { newGame } from '../packages/engine/src/index.ts'
import { findRoute, selectorFor, startDevServer, step, waitForServer, waitVisible } from './route.mjs'
import { CLOSE_ZONES, runOrientationShot, runZoneShot } from './t093-shots-lib.mjs'
import {
  decodePng,
  evaluateShot,
  expectationsFor,
  regionVariance,
  renderReadme,
  SHOT_THRESHOLDS,
  SHOT_SIZES,
  shotFile,
  sizeLabel,
} from '../tools/shots-lib.ts'

const SEED = 7
const STARTER = 'isla'
const PORT = 4173
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'shots')
const BOARD_3D = '[data-testid="board-3d"] canvas'
const BOARD_2D = '[data-testid="board-2d"] svg'

const content = loadContent(join(ROOT, 'content'))

// Packs de modelos para la galería (SPEC-K/T-070c/AC-3): una captura por pack.
const catalogPath = join(ROOT, 'content', 'board', 'models.catalog.json')
const modelPacks =
  existsSync(catalogPath) ? Object.keys(JSON.parse(readFileSync(catalogPath, 'utf8')).packs ?? {}) : []
const packSlug = (pack) => pack.toLowerCase().replace(/[^a-z0-9]+/g, '-')

// -- Contexto con settings deterministas y partida iniciada (como t061). --

// Bloquea WebGL ANTES de que cargue la app: hasWebGl() da false y BoardHost
// toma la ruta REAL de fallback al SVG 2D (T-062/AC-8), con su aviso.
function blockWebGl() {
  const original = globalThis.HTMLCanvasElement.prototype.getContext
  globalThis.HTMLCanvasElement.prototype.getContext = function blocked(type, ...rest) {
    return /webgl/i.test(String(type)) ? null : original.call(this, type, ...rest)
  }
}

async function newShotContext(browser, options) {
  const { size, speed = '1x', reducedMotion = false, noWebGl = false, dice = [] } = options
  const context = await browser.newContext({ viewport: { width: size.w, height: size.h } })
  await context.addInitScript(
    (settings) => globalThis.localStorage.setItem('liga-pkm:settings', JSON.stringify(settings)),
    { speed, sound: false, reducedMotion, board: '3d' },
  )
  if (noWebGl) await context.addInitScript(blockWebGl)
  const page = await context.newPage()
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error)}`))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.goto(`${BASE_URL}/?seed=${String(SEED)}&dice=${dice.join(',')}`)
  await waitVisible(page, '[data-action="new-game"]').then((button) => button.click())
  await waitVisible(page, `[data-deck="${STARTER}"]`).then((button) => button.click())
  // SPEC-I/T-071: en viewports bajo el m�nimo el shell muestra un aviso; las
  // capturas m�viles lo saltean para seguir fotografiando el tablero.
  const warning = page.locator('[data-testid="viewport-warning-dismiss"]')
  if ((await warning.count()) > 0) await warning.click().catch(() => undefined)
  return { context, page, consoleErrors }
}

// -- Driver de acciones a 1�: con velocidad de animaci�n el EventPlayer deja
// `isPlaying` en true un rato y los clicks se pierden. En vez de clickear y
// rezar, se compara una HUELLA de la UI (botones visibles + posici�n de la
// ficha del sceneDump): click ? si la huella no cambi�, el click no aplic� ?
// reintentar. Robusto tambi�n con ContinueMoving consecutivos. --

const FINGERPRINT_SELECTOR = [
  '[data-decision="continue"]',
  '[data-decision="stop-here"]',
  '[data-decision="choose-path"]',
  '[data-command="RollMove"]',
  '[data-command="Advance"]',
  '[data-testid="drawn-card"]',
  '[data-testid="tile-panel"]',
  '[data-testid="btn-fight"]',
  '[data-testid="btn-release"]',
  '[data-testid="btn-challenge"]',
  '[data-testid="btn-skip"]',
  '[data-testid="btn-oak-swap"]',
]

async function pageFingerprint(page) {
  return page.evaluate((selectors) => {
    const visible = selectors.filter((selector) => globalThis.document.querySelector(selector) !== null)
    const nodes = Array.from(globalThis.document.querySelectorAll('[data-decision="choose-path"]'))
      .map((element) => element.dataset.node)
      .join(',')
    const dump = globalThis.window.__debug?.sceneDump?.()?.objects ?? []
    const token = dump.find((entry) => entry.name.startsWith('token:'))
    const tokenPos =
      token === undefined
        ? null
        : token.worldPos.map((value) => Math.round(value * 20) / 20).join(',')
    return `${visible.join('|')}#${nodes}#${tokenPos ?? '-'}`
  }, FINGERPRINT_SELECTOR)
}

/** Huella "en reposo": dos lecturas iguales (terminaron las animaciones). */
async function settledFingerprint(page, timeoutMs = 6000) {
  let previous = await pageFingerprint(page)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(150)
    const current = await pageFingerprint(page)
    if (current === previous) return current
    previous = current
  }
  throw new Error(`la UI no se estabiliz� (huella en movimiento: ${previous})`)
}

async function runPlannedActions(page, actions, timeoutMs = 15_000) {
  for (const action of actions) {
    const selector = selectorFor(action)
    // Asentar ANTES: si la animaci�n anterior sigue, un cambio de huella
    // ajeno a esta acci�n nos har�a avanzar de m�s y desincronizarnos.
    const before = await settledFingerprint(page)
    const deadline = Date.now() + timeoutMs
    let applied = false
    while (Date.now() < deadline) {
      const button = page.locator(selector).first()
      if ((await button.count()) > 0 && (await button.isVisible())) {
        await button.click().catch(() => undefined)
      }
      await sleep(120)
      if ((await pageFingerprint(page)) !== before) {
        applied = true
        break
      }
    }
    if (!applied) {
      throw new Error(`la acci�n ${JSON.stringify(action)} no aplic� (huella sin cambios)`)
    }
  }
}

// -- Lectura del tablero (rect en px + volcado de escena en texto). --

async function boardRect(page, selector) {
  return page.evaluate((sel) => {
    const element = globalThis.document.querySelector(sel)
    if (element === null) return null
    const rect = element.getBoundingClientRect()
    return {
      x: rect.x + globalThis.window.scrollX,
      y: rect.y + globalThis.window.scrollY,
      w: rect.width,
      h: rect.height,
      vw: globalThis.document.documentElement.clientWidth,
      vh: globalThis.window.innerHeight,
    }
  }, selector)
}

// El tablero 3D "aparece" varias veces antes de estar usable: el chunk tarda en
// compilarse (dev en fr�o), el canvas de R3F nace 0�0/300�150 hasta medir su
// contenedor y las etiquetas de drei (<Text>) suspenden el boundary mientras
// baja la fuente. Esperamos la se�al de escena viva: canvas con tama�o, sin el
// fallback de carga y con nodos en el sceneDump.
async function waitBoard3dReady(page, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await page.evaluate((sel) => {
      const canvas = globalThis.document.querySelector(sel)
      if (canvas === null) return false
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 10 || rect.height <= 10) return false
      if (globalThis.document.querySelector('[data-testid="board-3d-loading"]') !== null) return false
      return (globalThis.window.__debug?.sceneDump?.()?.objects ?? []).some((entry) => entry.name.startsWith('node:'))
    }, BOARD_3D)
    if (ready) return
    await sleep(150)
  }
  throw new Error('el tablero 3D no qued� listo (canvas sin escena)')
}

async function sceneDump(page) {
  return page.evaluate(() => globalThis.window.__debug?.sceneDump?.() ?? null)
}

function dumpObjects(dump) {
  // T-076/AC-8: sceneDump() devuelve { objects, camera }; los hitos leen objects.
  return dump?.objects ?? dump ?? []
}

function milestoneAll(dump, prefix, label) {
  const entries = dumpObjects(dump).filter((entry) => entry.name.startsWith(prefix))
  return {
    name: `${label} (${String(entries.length)})`,
    inViewport: entries.length > 0 && entries.every((entry) => entry.inViewport),
  }
}

function milestoneOne(dump, name) {
  const entry = dumpObjects(dump).find((candidate) => candidate.name === name)
  return { name, inViewport: entry?.inViewport === true }
}

// T-069: los hitos de "todo en viewport" aplican con la c�mara encuadrando el
// tablero (overview/free). Con la c�mara inmersiva de T-076 (follow/fork o una
// transici�n en curso) el zoom EXCLUYE objetos lejanos por dise�o; en esos
// modos se registra el modo como hito en vez de exigir el encuadre completo.
function milestonesFor(dump, wanted) {
  const mode = dump?.camera?.mode ?? 'overview'
  if (mode === 'overview' || mode === 'free') return wanted
  return [{ name: `camera:${mode} (el zoom excluye hitos lejanos)`, inViewport: true }]
}

// -- Captura + m�tricas (AC-2): varianza sobre el �rea del tablero, ancho
// relativo al viewport, hitos y errores de consola; veredicto en report.json. --

async function takeShot(page, consoleErrors, options) {
  // Nota: NO usar screenshot({ clip }) � con WebGL animado, Chromium captura la
  // regi�n en blanco (verificado); la varianza se recorta en node con el rect.
  // El primer frame tambi�n puede salir en blanco por la misma carrera: se
  // reintenta hasta capturar un frame pintado (m�x. 4).
  const { scene, size, fullPage = false, boardSelector, milestones } = options
  const rect = await boardRect(page, boardSelector)
  let buffer = new Uint8Array(0)
  let variance = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    buffer = await page.screenshot({ fullPage })
    if (rect === null) break
    variance = regionVariance(decodePng(new Uint8Array(buffer)), rect)
    if (variance >= SHOT_THRESHOLDS.minVariance) break
    await sleep(100)
  }
  const file = shotFile(scene, size)
  writeFileSync(join(ROOT, file), buffer)
  const boardWidthPct = rect === null ? null : (rect.w / rect.vw) * 100
  const verdict = evaluateShot(
    { pixelVariance: variance, boardWidthPct, milestones, consoleErrors: consoleErrors.length },
    expectationsFor(scene, size),
  )
  const metrics = {
    pixelVariance: variance,
    boardWidthPct,
    milestones,
    consoleErrors: consoleErrors.length,
  }
  console.log(
    `${verdict.ok ? 'ok  ' : `FAIL ${verdict.failures.join('; ')}`} ${scene} [${sizeLabel(size)}] ` +
      `varianza=${variance.toFixed(0)} ancho=${boardWidthPct === null ? '?' : boardWidthPct.toFixed(0)}% ` +
      `errores=${String(consoleErrors.length)}`,
  )
  return { scene, size: sizeLabel(size), file, metrics, ok: verdict.ok, failures: verdict.failures }
}

// -- Escenas (AC-1). --

async function runIdle(browser, size) {
  const { context, page, consoleErrors } = await newShotContext(browser, { size })
  await waitBoard3dReady(page)
  await sleep(500)
  const dump = await sceneDump(page)
  const record = await takeShot(page, consoleErrors, {
    scene: 'board-idle',
    size,
    fullPage: true,
    boardSelector: BOARD_3D,
    milestones: milestonesFor(dump, [milestoneAll(dump, 'node:', 'nodos')]),
  })
  await context.close()
  return record
}

async function tokenWorldPos(page) {
  const dump = await sceneDump(page)
  const token = dumpObjects(dump).find((entry) => entry.name.startsWith('token:'))
  return token === undefined ? null : token.worldPos
}

// Ficha a mitad de camino: BFS hasta un comando con = 3 MoveStep seguidos (la
// animaci�n de tramos corre seguida); captura cuando la ficha se desplaz�
// > 0,5 unidades del punto de partida.
async function runMidMove(browser, size, plan) {
  const dice = [...plan.prefix, plan.big]
    .filter((action) => action.type === 'RollMove')
    .map((action) => action.roll)
  const { context, page, consoleErrors } = await newShotContext(browser, { size, dice })
  await waitBoard3dReady(page)
  await sleep(300)
  await runPlannedActions(page, plan.prefix)
  const bigSelector = selectorFor(plan.big)
  await waitVisible(page, bigSelector)
  await settledFingerprint(page)
  const start = await tokenWorldPos(page)
  const deadline = Date.now() + 6000
  let moved = false
  while (Date.now() < deadline) {
    const pos = await tokenWorldPos(page)
    if (pos !== null && start !== null && Math.hypot(pos[0] - start[0], pos[2] - start[2]) > 0.5) {
      moved = true
      break
    }
    const button = page.locator(bigSelector).first()
    if ((await button.count()) > 0 && (await button.isVisible())) {
      await button.click().catch(() => undefined)
    }
    await sleep(40)
  }
  if (!moved) throw new Error('la ficha no se movi� tras la tirada')
  const dump = await sceneDump(page)
  const record = await takeShot(page, consoleErrors, {
    scene: 'token-mid-move',
    size,
    boardSelector: BOARD_3D,
    milestones: milestonesFor(dump, [milestoneAll(dump, 'token:', 'fichas')]),
  })
  await context.close()
  return record
}

// Dado en el aire: captura a ~300 ms de la tirada de 800 ms (mitad del primer
// rebote); con dice=1 la ficha ya aterriz� y no compite con el movimiento.
async function runDieAir(browser, size) {
  const { context, page, consoleErrors } = await newShotContext(browser, { size, dice: [1] })
  await waitBoard3dReady(page)
  await sleep(300)
  await waitVisible(page, '[data-command="RollMove"]').then((button) => button.click())
  await sleep(300)
  const dump = await sceneDump(page)
  const record = await takeShot(page, consoleErrors, {
    scene: 'die-air',
    size,
    boardSelector: BOARD_3D,
    milestones: milestonesFor(dump, [milestoneAll(dump, 'token:', 'fichas')]),
  })
  await context.close()
  return record
}

// Robo en 3 fases (AC-1): highlight/fly con un robo de energ�a (o �tem) de una
// tirada; reveal con un PKM multi-turno (la carta queda para la decisi�n).
// El poller de fase se arma ANTES del �ltimo click (el highlight dura 250 ms):
// se clickea mientras no aparezca la carta y se acepta la fase objetivo o una
// posterior (si llegamos tarde con el roundtrip del browser fr�o).
const DRAW_PHASES = ['highlight', 'fly', 'reveal', 'stow', 'done']

async function runDrawPhase(browser, size, phase, plan) {
  const wantedIndex = DRAW_PHASES.indexOf(phase === 'reveal' ? 'reveal' : phase)
  const { context, page, consoleErrors } = await newShotContext(browser, { size, dice: plan.dice })
  await waitBoard3dReady(page)
  await sleep(300)
  const allButLast = plan.actions.slice(0, -1)
  const last = plan.actions[plan.actions.length - 1]
  await runPlannedActions(page, allButLast)
  await settledFingerprint(page)
  const deadline = Date.now() + 6000
  let caught = null
  while (Date.now() < deadline) {
    const card = page.locator('[data-testid="drawn-card"]')
    if ((await card.count()) > 0) {
      const current = await card.first().getAttribute('data-phase')
      const index = current === null ? -1 : DRAW_PHASES.indexOf(current)
      if (index >= wantedIndex) {
        caught = current
        break
      }
    } else {
      const button = page.locator(selectorFor(last)).first()
      if ((await button.count()) > 0 && (await button.isVisible())) {
        await button.click().catch(() => undefined)
      }
    }
    await sleep(15)
  }
  if (caught === null) {
    throw new Error(`la carta robada no lleg� a la fase ${phase} (plan ${JSON.stringify(plan.actions)})`)
  }
  if (phase === 'fly' && caught === 'fly') await sleep(250)
  const dump = await sceneDump(page)
  const record = await takeShot(page, consoleErrors, {
    scene: `draw-${phase}`,
    size,
    boardSelector: BOARD_3D,
    milestones: milestonesFor(dump, [milestoneOne(dump, `stack:${plan.deck}`)]),
  })
  await context.close()
  return record
}

// Panel de cada tipo de casillero: mismos targets que el e2e T-061 (skip +
// reducedMotion para llegar r�pido a un estado final estable).
const panelTargets = [
  { shot: 'start', match: (node) => node.type === 'start' },
  { shot: 'oak', match: (node) => node.type === 'oak' },
  { shot: 'gym-cerrojo', match: (node) => node.type === 'gym' && node.gym === 'giovanni' },
  { shot: 'gym-desafiable', match: (node) => node.type === 'gym' && node.gym === 'erika' },
  { shot: 'centro', match: (node) => node.type === 'centro' },
  { shot: 'mercado', match: (node) => node.type === 'mercado' },
  { shot: 'empty', match: (node) => node.type === 'empty' },
  { shot: 'deck-bosque', match: (node) => node.type === 'deck' && node.deck === 'bosque' },
  { shot: 'deck-montana', match: (node) => node.type === 'deck' && node.deck === 'montana' },
  { shot: 'deck-isla', match: (node) => node.type === 'deck' && node.deck === 'isla' },
  { shot: 'deck-llanura', match: (node) => node.type === 'deck' && node.deck === 'llanura' },
  { shot: 'deck-pantano', match: (node) => node.type === 'deck' && node.deck === 'pantano' },
  { shot: 'duelo', match: (node) => node.type === 'duelo' },
  { shot: 'sorpresa', match: (node) => node.type === 'sorpresa' },
  { shot: 'liga', match: (node) => node.type === 'liga' },
]

async function runPanel(browser, size, target) {
  const route = findRoute(content, SEED, STARTER, target.match)
  const { context, page, consoleErrors } = await newShotContext(browser, {
    size,
    speed: 'skip',
    reducedMotion: true,
    dice: route.dice,
  })
  await waitBoard3dReady(page)
  await runPlannedActions(page, route.actions)
  try {
    await waitVisible(page, '[data-testid="tile-panel"]')
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: globalThis.window.location.href,
      alert: globalThis.document.querySelector('[role="alert"]')?.textContent ?? null,
      panel: globalThis.document.querySelector('[data-testid="tile-panel"]')?.textContent?.slice(0, 120) ?? null,
      hud: globalThis.document.querySelector('section[aria-label]')?.textContent?.slice(0, 160) ?? null,
    }))
    console.log(`  [diag ${target.shot}] ${JSON.stringify(state)} errores=${JSON.stringify(consoleErrors)}`)
    throw error
  }
  await sleep(100)
  const dump = await sceneDump(page)
  const record = await takeShot(page, consoleErrors, {
    scene: `tile-${target.shot}`,
    size,
    fullPage: true,
    boardSelector: BOARD_3D,
    milestones: milestonesFor(dump, [milestoneAll(dump, 'node:', 'nodos')]),
  })
  await context.close()
  return record
}

// Galería de modelos /dev/models (SPEC-K/T-070c/AC-3): una captura por pack con
// los candidatos girando; no hace falta partida, solo el server de desarrollo.
async function runModelsGallery(browser, size, pack) {
  const context = await browser.newContext({ viewport: { width: size.w, height: size.h } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error)}`))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.goto(`${BASE_URL}/dev/models?pack=${encodeURIComponent(pack)}`)
  await waitVisible(page, '[data-testid="model-card"]')
  // Los modelos cargan por archivo: margen para el primer lote de tarjetas.
  await sleep(2500)
  const cards = await page.locator('[data-testid="model-card"]').count()
  const record = await takeShot(page, consoleErrors, {
    scene: `models-${packSlug(pack)}`,
    size,
    fullPage: false,
    boardSelector: '[data-testid="models-gallery"] canvas',
    milestones: [{ name: `${String(cards)} tarjetas de modelo (${pack})`, inViewport: cards > 0 }],
  })
  await context.close()
  return record
}

// Tablero 2D por fallback real (sin WebGL): nota + SVG, ficha en el inicio.
async function run2dFallback(browser, size) {  const { context, page, consoleErrors } = await newShotContext(browser, {
    size,
    speed: 'skip',
    reducedMotion: true,
    noWebGl: true,
  })
  await waitVisible(page, '[data-testid="board-fallback-note"]')
  await waitVisible(page, BOARD_2D)
  await sleep(150)
  const rect = await boardRect(page, BOARD_2D)
  const visible = rect !== null && rect.y >= 0 && rect.y + rect.h <= rect.vh
  const record = await takeShot(page, consoleErrors, {
    scene: 'board-2d-fallback',
    size,
    fullPage: true,
    boardSelector: BOARD_2D,
    milestones: [{ name: 'tablero 2D completo en viewport', inViewport: visible }],
  })
  await context.close()
  return record
}

// -- Planificaci�n con el motor (determinista, misma mec�nica que route.mjs). --

function startState() {
  const started = newGame({ seed: SEED, starterDeck: STARTER, ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  return started.value.state
}

function stateKeyOf(state) {
  const pending = state.pending === null
    ? '-'
    : `${state.pending.type}:${state.pending.type === 'ChoosePath' ? state.pending.options.join('/') : ''}`
  return [
    state.phase,
    state.players[0].position,
    String(state.players[0].cameFrom),
    String(state.stepsLeft),
    pending,
  ].join('|')
}

function expansionOf(state) {
  if (state.pending !== null) {
    switch (state.pending.type) {
      case 'ChoosePath':
        return state.pending.options.map((to) => ({ type: 'ChoosePath', to }))
      case 'StopOrContinue':
        return [{ type: 'StopHere' }, { type: 'ContinueMoving' }]
      case 'FightOrRelease':
        return [{ type: 'ReleaseWild' }]
      case 'OakSwap':
      case 'ChallengeGym':
        return [{ type: 'Advance' }]
      default:
        return []
    }
  }
  if (state.phase === 'organize') return [1, 2, 3, 4, 5, 6].map((roll) => ({ type: 'RollMove', roll }))
  if (state.phase === 'tileResolution') return [{ type: 'Advance' }]
  return []
}

// BFS por estados del motor buscando un comando cuyo resultado tenga = minSteps
// MoveStep (tramo seguido animable). Devuelve prefijo + el comando grande.
function planMidMove(minSteps) {
  const start = startState()
  const queue = [{ state: start, cursor: 0, actions: [] }]
  const seen = new Set([stateKeyOf(start)])
  let explored = 0
  while (queue.length > 0) {
    const node = queue.shift()
    explored += 1
    if (explored > 20_000) break
    for (const command of expansionOf(node.state)) {
      const forcedRoll = command.type === 'RollMove' ? command.roll : undefined
      const { result, cursor } = step(node.state, { type: command.type, ...command }, node.cursor, forcedRoll, content)
      if (!result.ok) continue
      const steps = result.value.events.filter((event) => event.type === 'MoveStep').length
      const actions = [...node.actions, command]
      if (steps >= minSteps) return { prefix: node.actions, big: command, steps }
      const key = stateKeyOf(result.value.state)
      if (seen.has(key)) continue
      seen.add(key)
      queue.push({ state: result.value.state, cursor, actions })
    }
  }
  return null
}

function planMidMoveWithFallback() {
  for (const minSteps of [3, 2]) {
    const plan = planMidMove(minSteps)
    if (plan !== null) return plan
  }
  throw new Error('no hay un movimiento de = 2 pasos alcanzable desde el inicio')
}

const drawnOf = (route) => route.resolved.events.find((event) => event.type === 'CardDrawn') ?? null
const isPkmCard = (card) => content.cards.some((candidate) => candidate.id === card)

function planEnergyOrItemDraw() {
  let fallback = null
  for (const deck of ['bosque', 'montana', 'isla', 'llanura', 'pantano']) {
    const route = findRoute(content, SEED, STARTER, (node) => node.type === 'deck' && node.deck === deck)
    const drawn = drawnOf(route)
    if (drawn === null) continue
    if (drawn.card.startsWith('element_')) {
      return { actions: route.actions, dice: route.dice, deck, card: drawn.card }
    }
    if (fallback === null) fallback = { actions: route.actions, dice: route.dice, deck, card: drawn.card }
  }
  const mercado = findRoute(content, SEED, STARTER, (node) => node.type === 'mercado')
  const drawn = drawnOf(mercado)
  if (drawn !== null && fallback === null) {
    fallback = { actions: mercado.actions, dice: mercado.dice, deck: 'item', card: drawn.card }
  }
  if (fallback === null) throw new Error('ning�n mazo entrega una carta de energ�a o �tem')
  return fallback
}

function planPkmDraw(maxTurns = 8) {
  let best = null
  for (const deck of ['bosque', 'montana', 'isla', 'llanura', 'pantano']) {
    let state = startState()
    let cursor = 0
    const actions = []
    const dice = []
    for (let turn = 0; turn < maxTurns; turn += 1) {
      const route = findRoute(
        content, SEED, STARTER,
        (node) => node.type === 'deck' && node.deck === deck,
        state, cursor,
      )
      actions.push(...route.actions)
      dice.push(...route.dice)
      cursor += route.dice.length
      state = route.resolved.state
      const drawn = drawnOf(route)
      if (drawn !== null && isPkmCard(drawn.card)) {
        if (best === null || dice.length < best.dice.length) best = { actions, dice, deck }
        break
      }
    }
  }
  if (best === null) throw new Error('ning�n mazo suelta PKM en 8 turnos')
  return best
}

// -- Main: planificar ? limpiar shots/ ? dev server ? capturas ? reportes. --

const movePlan = planMidMoveWithFallback()
const energyPlan = planEnergyOrItemDraw()
const pkmPlan = planPkmDraw()
console.log(
  `plan: movimiento de ${String(movePlan.steps)} pasos (${String(movePlan.prefix.length)} acciones previas), ` +
    `robo energ�a/�tem del mazo ${energyPlan.deck}, robo PKM del mazo ${pkmPlan.deck} (${String(pkmPlan.dice.length)} tiradas)`,
)

rmSync(OUT_DIR, { recursive: true, force: true })
for (const size of SHOT_SIZES) mkdirSync(join(OUT_DIR, sizeLabel(size)), { recursive: true })

const server = startDevServer(ROOT, PORT)
const records = []
let hardFailures = 0

// SPEC-N/T-093/AC-1: dependencias inyectadas a los corredores del cierre.
const closeDeps = {
  newShotContext,
  waitBoard3dReady,
  takeShot,
  sceneDump,
  boardSelector: BOARD_3D,
}

/** Una escena con hasta 2 intentos (browser nuevo por intento): la captura del
 *  canvas WebGL en headless es candidata a carreras del compositor. */
async function runScene(name, run) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const browser = await chromium.launch()
    try {
      const record = await run(browser)
      if (record.ok || attempt === 3) return record
      console.log(`     ${name}: reintento ${String(attempt)} (m�tricas fallidas: ${record.failures.join('; ')})`)
    } catch (error) {
      if (attempt === 3) throw error
      console.log(`     ${name}: reintento ${String(attempt)} (${error instanceof Error ? error.message : String(error)})`)
    } finally {
      await browser.close()
    }
  }
  throw new Error(`${name}: inalcanzable`)
}

try {
  await waitForServer(BASE_URL)
  for (const size of SHOT_SIZES) {
    // Un browser POR ESCENA: Chromium agota los contextos WebGL acumulados en
    // un mismo proceso (~8) y el canvas empieza a salir en blanco.
    const scenes = [
      ['board-idle', (browser) => runIdle(browser, size)],
      ['token-mid-move', (browser) => runMidMove(browser, size, movePlan)],
      ['die-air', (browser) => runDieAir(browser, size)],
      ['draw-highlight', (browser) => runDrawPhase(browser, size, 'highlight', energyPlan)],
      ['draw-fly', (browser) => runDrawPhase(browser, size, 'fly', energyPlan)],
      ['draw-reveal', (browser) => runDrawPhase(browser, size, 'reveal', pkmPlan)],
      ['board-2d-fallback', (browser) => run2dFallback(browser, size)],
      ['board-orientation', (browser) => runOrientationShot(closeDeps, browser, size, content.board)],
      ...CLOSE_ZONES.map((zone) => [zone.scene, (browser) => runZoneShot(closeDeps, browser, size, zone)]),
      ...panelTargets.map((target) => [`tile-${target.shot}`, (browser) => runPanel(browser, size, target)]),
      ...modelPacks.map((pack) => [`models-${packSlug(pack)}`, (browser) => runModelsGallery(browser, size, pack)]),
    ]
    for (const scene of scenes) {
      records.push(await runScene(scene[0], scene[1]))
    }
  }
} catch (error) {
  hardFailures += 1
  console.error(`FAIL (escena): ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
} finally {
  server.kill()
}

const report = {
  ok: hardFailures === 0 && records.every((record) => record.ok),
  thresholds: SHOT_THRESHOLDS,
  sizes: SHOT_SIZES.map((size) => sizeLabel(size)),
  shots: records,
}
writeFileSync(join(OUT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(join(OUT_DIR, 'README.md'), renderReadme(records))

const failedShots = records.filter((record) => !record.ok).length
console.log(`\n${String(records.length)} capturas en shots/ (${String(failedShots)} con m�tricas fallidas)`)
console.log('m�tricas: shots/report.json � gu�a: shots/README.md (para el due�o)')
if (!report.ok) process.exit(1)
