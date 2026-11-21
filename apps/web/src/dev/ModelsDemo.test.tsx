// AC: SPEC-K/T-070c/AC-1 — /dev/models renderiza la grilla de candidatos con
// nombre, kind, triángulos y KB, botones Aprobar/Rechazar/Cambiar tipo y
// Exportar. Proxy sin navegador (renderToString): la rotación visual la revisa
// el dueño en la galería (NO-VISION); el 3D real se verifica con pnpm shots.
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import manifestJson from '../../../../content/board/models.manifest.json'
import { es } from '../i18n/es'
import { boardPlacements } from '../board3d/placements'
import { galleryItems, ModelCard, ModelsDemo, modelsAssetUrl } from './ModelsDemo'
import { buildManifestExport } from './models-export'
import { buildPlacementsExport, initialYawOffset, NewModelsPanel } from './NewModelsPanel'

test('AC: fix-modelos-galeria/AC-2 modelsAssetUrl genera URLs path-style con segmentos encodeados', () => {
  expect(modelsAssetUrl('kenney/city-kit/model.glb')).toBe('/dev-models/file/kenney/city-kit/model.glb')
  expect(modelsAssetUrl('hgss/bld/a b.obj')).toBe('/dev-models/file/hgss/bld/a%20b.obj')
})

test('AC: SPEC-K/T-070c/AC-1 la galería lista candidatos con datos y acciones', () => {
  const items = galleryItems()
  expect(items.length).toBeGreaterThan(50)
  const html = renderToString(<ModelsDemo />)
  expect(html).toContain(es.modelsGalleryTitle)
  expect(html).toContain(es.modelsApprove)
  expect(html).toContain(es.modelsReject)
  expect(html).toContain(es.modelsChangeKind)
  expect(html).toContain(es.modelsExport)
  expect(html).toContain('data-testid="model-card"')
  // Datos por tarjeta: triángulos y KB presentes en el HTML.
  expect(html).toContain(es.modelsTriangles)
  expect(html).toContain(es.modelsKb)
})

test('AC: SPEC-K/T-070b/AC-3 los candidatos Kenney tienen kind y los HGSS etiqueta privada', () => {
  const items = galleryItems()
  const kenney = items.filter((item) => item.pack !== 'hgss' && item.kind !== null)
  expect(kenney.length).toBeGreaterThan(20)
  const hgss = items.filter((item) => item.hgssKind !== null)
  expect(hgss.length).toBeGreaterThan(5)
  expect(items.every((item) => Number.isFinite(item.triangles))).toBe(true)
})

test('AC: fix-modelos-galeria/AC-3 feedback de estado: insignia y data-status al aprobar/rechazar', () => {
  const item = galleryItems()[0]!
  const base = { item, kind: null, onStatus: () => {}, onKind: () => {} } as const
  const proposed = renderToString(<ModelCard {...base} status="proposed" />)
  expect(proposed).toContain('data-status="proposed"')
  expect(proposed).not.toContain(es.modelsStatusApproved)
  const approved = renderToString(<ModelCard {...base} status="approved" />)
  expect(approved).toContain('data-status="approved"')
  expect(approved).toContain(es.modelsStatusApproved)
  const rejected = renderToString(<ModelCard {...base} status="rejected" />)
  expect(rejected).toContain('data-status="rejected"')
  expect(rejected).toContain(es.modelsStatusRejected)
})

// ── T-091/AC-5 ──────────────────────────────────────────────────────────────
test('AC: SPEC-N/T-091/AC-5 - la galería lista los modelos nuevos con su tamaño final en la card', () => {
  const news = galleryItems().filter((item) => item.pack === 'new')
  // SPEC-P/T-099: son 5 (se agregó lab/oak).
  expect(news.map((item) => item.newKind).sort()).toEqual(['gym', 'lab', 'league', 'market', 'pokecenter'])
  expect(news.every((item) => item.format === 'glb')).toBe(true)
  expect(news.every((item) => item.targetHeight > 0 && (item.maxFootprint ?? 0) > 0)).toBe(true)
  const gim = news.find((item) => item.newKind === 'gym')!
  const card = renderToString(
    <ModelCard item={gim} kind={null} status="proposed" onStatus={() => {}} onKind={() => {}} />,
  )
  expect(card).toContain('data-testid="card-size-gym"')
  expect(card).toContain(`alto ≤ ${String(gim.targetHeight)} u`)
  expect(card).toContain(`huella ≤ ${String(gim.maxFootprint ?? 0)} u`)
  expect(card).not.toContain(es.modelsKb)
})

test('AC: SPEC-N/T-091/AC-5 - la página trae el panel de modelos nuevos con yaw por kind y export', () => {
  const html = renderToString(<ModelsDemo />)
  expect(html).toContain('data-testid="new-models-panel"')
  expect(html).toContain(es.modelsNewPanelTitle)
  expect(html).toContain(es.modelsExportPlacements)
  for (const kind of ['gym', 'pokecenter', 'market', 'league', 'lab'] as const) {
    expect(html).toContain(`data-testid="yaw-${kind}"`)
    expect(html).toContain(`data-testid="new-size-${kind}"`)
  }
  const panel = renderToString(
    <NewModelsPanel yaw={initialYawOffset()} onYaw={() => {}} />,
  )
  expect(panel).toContain(es.modelsYawOffset)
  expect(panel).toContain('data-action="export-placements"')
})

test('AC: SPEC-N/T-091/AC-5 - buildPlacementsExport actualiza yawOffsetDeg y conserva los 21 nodos', () => {
  const text = buildPlacementsExport({ gym: 42, league: -15 })
  const data = JSON.parse(text) as {
    nodes: Record<string, unknown>
    models: { yawOffsetDeg: Record<string, number> }
  }
  expect(Object.keys(data.nodes)).toHaveLength(21)
  expect(data.models.yawOffsetDeg.gym).toBe(42)
  expect(data.models.yawOffsetDeg.league).toBe(-15)
  // Los kind no tocados conservan el valor de placements.json.
  expect(data.models.yawOffsetDeg.market).toBe(boardPlacements.models.yawOffsetDeg.market ?? 0)
  expect(initialYawOffset()).toEqual({
    gym: boardPlacements.models.yawOffsetDeg.gym ?? 0,
    pokecenter: boardPlacements.models.yawOffsetDeg.pokecenter ?? 0,
    market: boardPlacements.models.yawOffsetDeg.market ?? 0,
    league: boardPlacements.models.yawOffsetDeg.league ?? 0,
    lab: boardPlacements.models.yawOffsetDeg.lab ?? 0,
  })
})

test('AC: SPEC-N/T-091/AC-5 - buildManifestExport preserva newModels intacto', () => {
  const exported = JSON.parse(buildManifestExport(manifestJson, {})) as { newModels: Record<string, unknown> }
  const source = manifestJson as unknown as { newModels: Record<string, unknown> }
  expect(Object.keys(source.newModels).sort()).toEqual(['gym', 'lab', 'league', 'market', 'pokecenter'])
  expect(exported.newModels).toEqual(source.newModels)
})
