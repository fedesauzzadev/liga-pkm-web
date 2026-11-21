// AC: SPEC-M/T-086/AC-4 — lib del chequeo de brillo: luma709, modelPixelMetrics
// (brillo medio + % oscuros sobre píxeles que se apartan del gris de fondo),
// modelCheckVerdict (brillo < 0,18 o oscuros > 35 % ⇒ falla) y applyCheckToManifest
// (status failed + failedFrom, y restauración al volver a pasar). Puro, sin DOM.
// AC-5: applyCheckToManifest es la parte del manifiesto; el "sin negro puro en
// materiales" lo cubre normalize.test.ts (toonizeModel).
import { expect, test } from 'vitest'
import {
  MODEL_CHECK_THRESHOLDS, applyCheckToManifest, estimateBackground, luma709,
  modelCheckVerdict, modelPixelMetrics, type ModelCheckRecord,
} from './models-check-lib'

/** Imagen RGBA sintética (fondo gris + rectángulo del modelo). */
const image = (width: number, height: number, paint: (x: number, y: number) => [number, number, number] | null): {
  data: Uint8Array
  width: number
  height: number
} => {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4
      const rgb = paint(x, y) ?? [128, 128, 128]
      data[at] = rgb[0]
      data[at + 1] = rgb[1]
      data[at + 2] = rgb[2]
      data[at + 3] = 255
    }
  }
  return { data, width, height }
}

const gray = (value: number): [number, number, number] => [value, value, value]

test('AC: T-086/AC-4 luma709 usa los pesos BT.709', () => {
  expect(luma709(255, 255, 255)).toBeCloseTo(1, 5)
  expect(luma709(0, 0, 0)).toBeCloseTo(0, 5)
  expect(luma709(255, 0, 0)).toBeCloseTo(0.2126, 4)
})

test('AC: T-086/AC-4 estimateBackground promedia las esquinas', () => {
  const img = image(8, 8, (x, y) => (x < 4 && y < 4 ? gray(200) : gray(128)))
  expect(estimateBackground(img)[0]).toBeGreaterThan(128)
})

test('AC: T-086/AC-4 modelPixelMetrics: brillo medio y % de oscuros sobre los píxeles del modelo', () => {
  // Fondo 128; modelo = mitad blanca (255) y mitad casi negra (10).
  const img = image(4, 2, (x, y) => (y === 0 ? gray(255) : gray(10)))
  const metrics = modelPixelMetrics(img, [128, 128, 128])
  expect(metrics.modelPixels).toBe(8) // todo el frame se aparta del gris 128
  expect(metrics.meanBrightness).toBeCloseTo((1 + 10 / 255) / 2, 3)
  expect(metrics.darkShare).toBeCloseTo(0.5, 5)
})

test('AC: T-086/AC-4 modelPixelMetrics: fondo solo no aporta píxeles de modelo', () => {
  const img = image(4, 4, () => gray(128))
  const metrics = modelPixelMetrics(img, [128, 128, 128])
  expect(metrics.modelPixels).toBe(0)
  expect(metrics.meanBrightness).toBe(0)
  expect(metrics.darkShare).toBe(1) // sin modelo no hay brillo que medir
})

test('AC: T-086/AC-4 modelCheckVerdict: brillo medio < 0,18 o oscuros > 35 % ⇒ falla', () => {
  const total = 100
  // Brillo medio bajo.
  const oscuro = modelCheckVerdict({ modelPixels: 50, meanBrightness: 0.1, darkShare: 0.1 }, true, total)
  expect(oscuro.ok).toBe(false)
  expect(oscuro.failures).toContain('brillo-medio-bajo')
  // Oscuros > 35 %.
  const conOscuros = modelCheckVerdict({ modelPixels: 50, meanBrightness: 0.5, darkShare: 0.4 }, true, total)
  expect(conOscuros.ok).toBe(false)
  expect(conOscuros.failures).toContain('pixeles-oscuros')
  // Brillo sano.
  const sano = modelCheckVerdict({ modelPixels: 50, meanBrightness: 0.5, darkShare: 0.1 }, true, total)
  expect(sano.ok).toBe(true)
  // No cargó.
  const fallo = modelCheckVerdict({ modelPixels: 0, meanBrightness: 0, darkShare: 1 }, false, total)
  expect(fallo.ok).toBe(false)
  expect(fallo.failures).toContain('no-cargo')
  // Invisible (casi sin píxeles de modelo).
  const invisible = modelCheckVerdict({ modelPixels: 1, meanBrightness: 0.9, darkShare: 0 }, true, 10_000)
  expect(invisible.ok).toBe(false)
  expect(invisible.failures).toContain('sin-pixeles')
})

test('AC: T-086/AC-4 los umbrales del chequeo coinciden con la spec', () => {
  expect(MODEL_CHECK_THRESHOLDS.minMeanBrightness).toBe(0.18)
  expect(MODEL_CHECK_THRESHOLDS.maxDarkPixelShare).toBe(0.35)
  expect(MODEL_CHECK_THRESHOLDS.darkLuma).toBe(0.08)
})

const record = (key: string, ok: boolean): ModelCheckRecord => ({
  key,
  status: key.startsWith('hgss::') ? 'hgss' : 'kenney',
  file: key,
  loaded: ok,
  metrics: { modelPixels: 10, meanBrightness: 0.5, darkShare: 0.1 },
  verdict: { ok, failures: ok ? [] : ['brillo-medio-bajo'] },
  failures: ok ? [] : ['brillo-medio-bajo'],
})

test('AC: T-086/AC-4 applyCheckToManifest marca failed con failedFrom y restaura al pasar', () => {
  interface Candidate {
    pack: string
    file: string
    status: string
    failedFrom?: string
  }
  interface Manifest {
    kinds: Record<string, { candidates: Candidate[] }>
    hgss: Record<string, { files: { entry: string; status: string; failedFrom?: string }[] }>
  }
  const manifest: Manifest = {
    kinds: {
      rock: {
        candidates: [
          { pack: 'p', file: 'ok.glb', status: 'approved' },
          { pack: 'p', file: 'bad.glb', status: 'approved' },
          { pack: 'p', file: 'prev-proposed.glb', status: 'proposed' },
        ],
      },
    },
    hgss: { gym: { files: [{ entry: 'hgss/gym.obj', status: 'approved' }] } },
  }
  const results = [
    record('p::ok.glb', true),
    record('p::bad.glb', false),
    record('p::prev-proposed.glb', false),
    record('hgss::hgss/gym.obj', false),
  ]
  const updated = applyCheckToManifest(manifest, results)
  const candidates = updated.kinds.rock!.candidates
  expect(candidates[0]!.status).toBe('approved')
  expect(candidates[1]!.status).toBe('failed')
  expect(candidates[1]!.failedFrom).toBe('approved')
  expect(candidates[2]!.status).toBe('failed')
  expect(candidates[2]!.failedFrom).toBe('proposed')
  expect(updated.hgss.gym!.files[0]!.status).toBe('failed')
  // El original no se muta (puro).
  expect(manifest.kinds.rock!.candidates[1]!.status).toBe('approved')

  // Restauración: ahora todos pasan → recuperan su estado previo.
  const allOk = applyCheckToManifest(updated, [
    record('p::ok.glb', true),
    record('p::bad.glb', true),
    record('p::prev-proposed.glb', true),
    record('hgss::hgss/gym.obj', true),
  ])
  const restored = allOk.kinds.rock!.candidates
  expect(restored[1]!.status).toBe('approved')
  expect(restored[1]!.failedFrom).toBeUndefined()
  expect(restored[2]!.status).toBe('proposed')
  expect(restored[2]!.failedFrom).toBeUndefined()
  expect(allOk.hgss.gym!.files[0]!.status).toBe('approved')
})