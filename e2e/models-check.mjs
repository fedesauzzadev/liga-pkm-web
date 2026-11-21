// models:check (T-086/AC-4) — driver Playwright del chequeo de brillo de
// modelos. Levanta el dev server, abre /dev/models-check y recorre cada
// modelo (approved + proposed, Kenney y HGSS) midiendo el brillo medio y el %
// de píxeles oscuros (< 0,08) sobre fondo gris con luz neutra. Escribe
// shots/models-check.json y marca los que fallan como status "failed" en
// content/board/models.manifest.json (el juego usa la pieza procedural);
// los que vuelven a pasar recuperan su estado previo (failedFrom).
// exit 1 si algún modelo falla, para que el problema no pase inadvertido.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
import {
  MODEL_CHECK_THRESHOLDS,
  applyCheckToManifest,
} from '../apps/web/src/dev/models-check-lib.ts'
import { startDevServer, waitForServer } from './route.mjs'

const PORT = 4175
const BASE_URL = `http://localhost:${String(PORT)}`
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, 'content', 'board', 'models.manifest.json')
const OUT_DIR = join(ROOT, 'shots')
const OUT = join(OUT_DIR, 'models-check.json')

const pct = (value) => `${(value * 100).toFixed(1)}%`

const server = startDevServer(ROOT, PORT)
const results = []
let hardError = 0

try {
  await waitForServer(BASE_URL)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 480, height: 420 } })
  page.on('pageerror', (error) => console.error(`[models-check] pageerror: ${String(error)}`))
  await page.goto(`${BASE_URL}/dev/models-check`)
  await page.waitForFunction(() => globalThis.window.__modelsCheck?.ready === true, undefined, { timeout: 60_000 })
  const keys = await page.evaluate(() => globalThis.window.__modelsCheck?.list() ?? [])
  console.log(
    `models:check — ${String(keys.length)} modelos ` +
      `(umbrales: brillo medio ≥ ${String(MODEL_CHECK_THRESHOLDS.minMeanBrightness)}, ` +
      `oscuros ≤ ${pct(MODEL_CHECK_THRESHOLDS.maxDarkPixelShare)})`,
  )
  let index = 0
  for (const key of keys) {
    index += 1
    let result
    try {
      result = await page.evaluate(async (modelKey) => {
        const api = globalThis.window.__modelsCheck
        if (api === undefined) throw new Error('window.__modelsCheck no está disponible')
        return await api.show(modelKey)
      }, key)
    } catch (error) {
      hardError += 1
      console.error(`FAIL ${key} — ${error instanceof Error ? error.message : String(error)}`)
      results.push({
        key,
        status: key.startsWith('hgss::') ? 'hgss' : key.startsWith('new::') ? 'new' : 'kenney',
        file: key,
        loaded: false,
        metrics: { modelPixels: 0, meanBrightness: 0, darkShare: 1 },
        verdict: { ok: false, failures: ['excepcion'] },
        failures: ['excepcion'],
        servedFrom: 'dev',
        meanBrightness: 0,
        darkShare: 1,
      })
      continue
    }
    results.push(result)
    const where = result.servedFrom === 'dev' ? ' (sin importar: se midió desde assets-src)' : ''
    console.log(
      `${result.verdict.ok ? 'ok  ' : 'FAIL'} ${String(index).padStart(3)}/${String(keys.length)} ` +
        `brillo=${result.meanBrightness.toFixed(3)} oscuros=${pct(result.darkShare)} ` +
        `pix=${String(result.modelPixels)} ${key}${where}` +
        (result.verdict.ok ? '' : ` [${result.failures.join(', ')}]`),
    )
    await sleep(20)
  }
  await browser.close()
} catch (error) {
  hardError += 1
  console.error(`models:check FALLA — ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
} finally {
  server.kill()
}

mkdirSync(OUT_DIR, { recursive: true })
const failed = results.filter((result) => !result.verdict.ok)
writeFileSync(
  OUT,
  `${JSON.stringify(
    { ok: failed.length === 0 && hardError === 0, thresholds: MODEL_CHECK_THRESHOLDS, total: results.length, failed: failed.length, results },
    null,
    2,
  )}\n`,
  'utf8',
)

// Actualiza el manifiesto con los veredictos (failed ⇒ pieza procedural).
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
writeFileSync(MANIFEST, `${JSON.stringify(applyCheckToManifest(manifest, results), null, 1)}\n`, 'utf8')

console.log(`\n${String(results.length)} modelos chequeados — ${String(failed.length)} fallan → shots/models-check.json`)
console.log('manifiesto actualizado: content/board/models.manifest.json (status failed)')
if (failed.length > 0 || hardError > 0) process.exit(1)
