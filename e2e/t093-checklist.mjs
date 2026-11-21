// mvp:checklist (SPEC-N/T-093/AC-3) — checklist de cierre visual del MVP, todo
// verificable: cámara (sceneDump), etiquetas, tema (manchas), placements.report
// (edificios/Liga), sceneDump (pedestales), models-check.json (negros) y
// layout.json + DOM (dado en panel). Escribe shots/mvp-checklist.{json,md};
// exit 1 si algún ítem automático falla. `pnpm verify` queda como ítem manual.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import { loadContent } from '../packages/content/src/loader.ts'
import { BOARD3D } from '../apps/web/src/theme/board3d.ts'
import { evaluateChecklist, renderChecklist } from '../tools/mvp-checklist-lib.ts'
import { newSkipContext, startDevServer, waitForServer } from './route.mjs'

const SEED = 7
const STARTER = 'isla'
const PORT = 4178
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'shots')

const content = loadContent(join(ROOT, 'content'))

// ── Datos de archivo: placements (siempre fresco) y models-check (si existe). ──

const placementsRun = spawnSync(process.execPath, ['tools/placements-report.ts'], {
  cwd: ROOT,
  encoding: 'utf8',
})
if (placementsRun.status !== 0) {
  console.error(placementsRun.stdout)
  console.error(placementsRun.stderr)
  throw new Error('pnpm placements:report falló (ver arriba)')
}
const placements = JSON.parse(readFileSync(join(OUT_DIR, 'placements.report.json'), 'utf8'))

const modelsCheckPath = join(OUT_DIR, 'models-check.json')
if (!existsSync(modelsCheckPath)) {
  console.log('shots/models-check.json ausente — corriendo pnpm models:check (demora un poco)')
  const modelsRun = spawnSync(process.execPath, ['e2e/models-check.mjs'], { cwd: ROOT, encoding: 'utf8' })
  process.stdout.write(modelsRun.stdout ?? '')
  process.stderr.write(modelsRun.stderr ?? '')
}

// AC-3 ("modelos NUEVOS sin negros"): solo los new:: de SPEC-N/T-091. Los
// candidatos HGSS sin importar que fallan brillo son deuda previa (Q-052).
const modelsCheckRaw = existsSync(modelsCheckPath)
  ? JSON.parse(readFileSync(modelsCheckPath, 'utf8'))
  : null
const newModels =
  modelsCheckRaw === null
    ? null
    : (modelsCheckRaw.results ?? []).filter((result) => String(result.key).startsWith('new::'))

const layout = JSON.parse(readFileSync(join(ROOT, 'content', 'ui', 'layout.json'), 'utf8'))

// ── Datos de la página: cámara, etiquetas, dump y panel-dice. ──

const server = startDevServer(ROOT, PORT)
let pageData
try {
  await waitForServer(BASE_URL)
  const browser = await chromium.launch()
  const { context, page } = await newSkipContext(browser, {
    seed: SEED,
    dice: [],
    baseUrl: BASE_URL,
    starter: STARTER,
  })

  // Tablero 3D vivo: canvas con escena y nodos en el dump (como t066).
  const deadline = Date.now() + 30_000
  let dump = null
  while (Date.now() < deadline) {
    dump = await page.evaluate(() => globalThis.window.__debug?.sceneDump?.() ?? null)
    if (dump !== null && (dump.objects ?? []).some((entry) => entry.name.startsWith('node:'))) break
    await sleep(150)
  }
  if (dump === null) throw new Error('el tablero 3D no quedó listo (sin sceneDump)')

  // Margen para el primer plan de etiquetas (throttle 100 ms).
  await sleep(450)
  dump = await page.evaluate(() => globalThis.window.__debug?.sceneDump?.() ?? null)
  const viewport = await page.evaluate(() => {
    const canvas = globalThis.document.querySelector('[data-testid="board-3d"] canvas')
    return {
      width: canvas?.clientWidth ?? globalThis.document.documentElement.clientWidth,
      height: canvas?.clientHeight ?? globalThis.window.innerHeight,
    }
  })
  const panelDiceVisible = await page.evaluate(() => {
    const panel = globalThis.document.querySelector('[data-testid="panel-dice"]')
    return panel !== null && panel.checkVisibility()
  })
  pageData = { dump, viewport, panelDiceVisible }
  await context.close()
  await browser.close()
} finally {
  server.kill()
}

const labeledNodeCount = content.board.nodes.filter(
  (node) => typeof node.label === 'string' && node.label.length > 0,
).length

const result = evaluateChecklist({
  camera: pageData.dump.camera,
  labels: (pageData.dump.labels ?? []).map((label) => ({
    visible: label.visible,
    reason: label.reason,
    box: label.screenBBox,
  })),
  labeledNodeCount,
  viewport: pageData.viewport,
  dumpNames: pageData.dump.objects.map((entry) => entry.name),
  placements,
  modelsCheck:
    newModels === null
      ? null
      : {
          ok: newModels.every((result) => result.verdict?.ok === true),
          total: newModels.length,
          failed: newModels.filter((result) => result.verdict?.ok !== true).length,
        },
  layout: {
    diceY: layout.panels.dice?.y ?? 0,
    diceH: layout.panels.dice?.h ?? 0,
    turnY: layout.panels.turn?.y ?? 0,
  },
  panelDiceVisible: pageData.panelDiceVisible,
  theme: {
    mistOpacity: BOARD3D.decor.mist.opacity,
    waterOpacity: BOARD3D.world.lake.waterOpacity,
  },
})

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'mvp-checklist.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
writeFileSync(join(OUT_DIR, 'mvp-checklist.md'), renderChecklist(result), 'utf8')

for (const item of result.items) {
  const mark = item.manual ? '·   ' : item.ok ? 'ok  ' : 'FAIL'
  console.log(`${mark} ${item.id} — ${item.label}: ${item.detail}`)
}
console.log(`\nmvp-checklist ${result.ok ? 'VERDE' : 'ROJO'} → shots/mvp-checklist.{json,md}`)
if (!result.ok) process.exit(1)
