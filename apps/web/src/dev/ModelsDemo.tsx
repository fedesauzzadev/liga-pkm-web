// Página /dev/models (SPEC-K/T-070c): galería de revisión para el dueño —
// grilla con cada candidato girando lentamente (drei View: un solo canvas
// WebGL), nombre, kind, triángulos y KB; Aprobar/Rechazar/Cambiar tipo y
// Exportar el manifiesto actualizado. SPEC-N/T-091/AC-5: los 4 modelos
// nuevos entran a la grilla con su tamaño final y el panel NewModelsPanel
// ajusta yawOffsetDeg y exporta placements.json. Solo desarrollo (App.tsx la
// carga con import.meta.env.DEV); los archivos los sirve el middleware dev.
import { View } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DecorKind, ModelKind, ModelStatus, NewModelFormat, NewModelKind } from '@liga/content'
import { MODEL_KINDS, MODEL_KIND_TO_DECOR, MODEL_TARGET_HEIGHTS, ModelsManifestSchema } from '@liga/content'
import * as THREE from 'three'
import { modelLoaders } from '../board3d/ModelDecor'
import { boardPlacements } from '../board3d/placements'
import { mergeModelByMaterial, normalizeModel, toonizeModel } from '../board3d/models/normalize'
import { neutralModelColor } from '../theme/models'
import { es } from '../i18n/es'
import { NewModelsPanel, initialYawOffset } from './NewModelsPanel'
import { buildManifestExport } from './models-export'
import manifestJson from '../../../../content/board/models.manifest.json'
import catalogJson from '../../../../content/board/models.catalog.json'
import styles from './models-demo.module.css'

const manifest = ModelsManifestSchema.parse(manifestJson)
const catalogEntryOf = new Map(
  (catalogJson as { entries: { pack: string; file: string; triangles: number; sizeKB: number; flags: string[] }[] }).entries
    .map((entry) => [`${entry.pack}::${entry.file}`, entry]),
)
const LOADERS = modelLoaders()

export interface GalleryItem {
  readonly key: string
  readonly pack: string
  readonly file: string
  readonly format: NewModelFormat
  /** Kind de modelo; null ⇒ sin clasificar. */
  readonly kind: ModelKind | null
  /** Kind HGSS (etiqueta privada). */
  readonly hgssKind: DecorKind | null
  readonly targetHeight: number
  readonly status: ModelStatus
  readonly triangles: number
  readonly sizeKB: number
  readonly flags: readonly string[]
  /** T-091/AC-5: kind de placements si es uno de los 4 modelos nuevos. */
  readonly newKind?: NewModelKind | undefined
  readonly maxFootprint?: number | undefined
}

export function galleryItems(): readonly GalleryItem[] {
  const items: GalleryItem[] = []
  for (const [kind, entry] of Object.entries(manifest.kinds)) {
    for (const candidate of entry.candidates) {
      const info = catalogEntryOf.get(`${candidate.pack}::${candidate.file}`)
      items.push({
        key: `${candidate.pack}::${candidate.file}`,
        pack: candidate.pack,
        file: candidate.file,
        format: 'glb',
        kind: kind as ModelKind,
        hgssKind: null,
        targetHeight: candidate.targetHeight,
        status: candidate.status,
        triangles: info?.triangles ?? 0,
        sizeKB: info?.sizeKB ?? 0,
        flags: info?.flags ?? [],
      })
    }
  }
  for (const [kind, group] of Object.entries(manifest.hgss)) {
    for (const file of group.files) {
      const info = catalogEntryOf.get(`hgss::${file.entry}`)
      items.push({
        key: `hgss::${file.entry}`,
        pack: 'hgss',
        file: file.entry,
        format: 'obj',
        kind: null,
        hgssKind: kind as DecorKind,
        targetHeight: file.targetHeight,
        status: file.status,
        triangles: info?.triangles ?? 0,
        sizeKB: info?.sizeKB ?? 0,
        flags: info?.flags ?? [],
      })
    }
  }
  for (const entry of manifest.unclassified) {
    const info = catalogEntryOf.get(`${entry.pack}::${entry.file}`)
    items.push({
      key: `${entry.pack}::${entry.file}`,
      pack: entry.pack,
      file: entry.file,
      format: entry.pack === 'hgss' ? 'obj' : 'glb',
      kind: null,
      hgssKind: null,
      targetHeight: MODEL_TARGET_HEIGHTS.other,
      status: 'proposed',
      triangles: info?.triangles ?? 0,
      sizeKB: info?.sizeKB ?? 0,
      flags: info?.flags ?? [],
    })
  }
  // T-091/AC-5: los 4 modelos nuevos con su tamaño final (máximos de
  // placements.json) y el status que traen del manifiesto.
  for (const kind of Object.keys(manifest.newModels) as NewModelKind[]) {
    const entry = manifest.newModels[kind]
    if (entry === undefined) continue
    items.push({
      key: `new::${kind}`,
      pack: 'new',
      file: entry.file,
      format: entry.format,
      kind: null,
      hgssKind: null,
      targetHeight: boardPlacements.heights[kind],
      status: entry.status,
      triangles: 0,
      sizeKB: 0,
      flags: [],
      newKind: kind,
      maxFootprint: boardPlacements.footprints[kind],
    })
  }
  return items
}

// Fix galería (AC-2): path-style para que el dirUrl clásico del OBJ/MTL/texturas
// (lastIndexOf('/')) funcione igual acá y en el runtime.
export const modelsAssetUrl = (file: string): string =>
  `/dev-models/file/${file.split('/').map(encodeURIComponent).join('/')}`

/** Kind de decoración que reemplaza el ítem (HGSS ya lo trae; Kenney lo mapea). */
export const decorKindOf = (item: GalleryItem): DecorKind | null =>
  item.hgssKind ?? (item.kind === null ? null : MODEL_KIND_TO_DECOR[item.kind]?.kind ?? null)

// ── Modelo 3D de una tarjeta (dentro del Canvas compartido) ─────────────────

function GalleryModel(props: {
  item: GalleryItem
  /** T-091/AC-5: yaw fijo (grados) para los modelos nuevos. */
  yawDeg?: number | undefined
  onReady: () => void
  onError: () => void
}): ReactNode {
  const [group, setGroup] = useState<THREE.Group | null>(null)
  const spin = useRef<THREE.Group>(null)
  useEffect(() => {
    let alive = true
    const options = {
      // Texturas DS solo para HGSS: los modelos nuevos no son pixel art.
      pixelArt: props.item.pack === 'hgss',
      // AC-2 (T-086): mismo color neutro del kind que en el juego.
      neutralColor: neutralModelColor(decorKindOf(props.item)),
      label: props.item.file,
    }
    const url = modelsAssetUrl(props.item.file)
    const load = props.item.format === 'obj'
      ? LOADERS.loadObj(url, options)
      : props.item.format === 'fbx'
        ? LOADERS.loadFbx(url)
        : LOADERS.loadGltf(url)
    load
      .then((raw) => {
        if (!alive) return
        toonizeModel(raw, options)
        const wrap = new THREE.Group()
        for (const part of mergeModelByMaterial(raw)) wrap.add(new THREE.Mesh(part.geometry, part.material))
        setGroup(normalizeModel(wrap, 1))
        props.onReady()
      })
      .catch((err: unknown) => {
        // AC-4 (fix galería): solo dev; ningún fallo de carga vuelve a quedar mudo.
        console.error('[dev-models]', props.item.file, err)
        if (alive) props.onError()
      })
    return () => {
      alive = false
    }
  }, [props.item, props.onReady, props.onError])
  useFrame((_, delta) => {
    if (spin.current === null) return
    // T-091/AC-5: los modelos nuevos NO giran: se quedan en su yaw para que el
    // dueño vea la orientación final de la puerta al camino.
    if (props.yawDeg !== undefined) {
      spin.current.rotation.y = props.yawDeg * (Math.PI / 180)
      return
    }
    spin.current.rotation.y += delta * 0.6
  })
  return (
    <>
      <hemisphereLight intensity={1.6} groundColor="#9db07f" />
      <directionalLight position={[2, 3, 2]} intensity={1.4} />
      <group ref={spin}>{group === null ? null : <primitive object={group} />}</group>
    </>
  )
}

// ── Tarjeta ─────────────────────────────────────────────────────────────────

export function ModelCard(props: {
  item: GalleryItem
  kind: ModelKind | null
  status: ModelStatus
  yawDeg?: number | undefined
  onStatus: (status: ModelStatus) => void
  onKind: (kind: ModelKind | null) => void
}): ReactNode {
  const [phase, setPhase] = useState<'loading' | 'ok' | 'error'>('loading')
  const onReady = useCallback(() => setPhase('ok'), [])
  const onError = useCallback(() => setPhase('error'), [])
  const name = props.item.file.split('/').pop() ?? props.item.file
  const kindOptions: readonly (ModelKind | null)[] = [null, ...MODEL_KINDS]
  return (
    <article className={styles.card} data-testid="model-card" data-status={props.status}>
      <div className={styles.viewportWrap}>
        <View className={styles.viewport ?? ''}>
          <GalleryModel item={props.item} yawDeg={props.yawDeg} onReady={onReady} onError={onError} />
        </View>
        {phase === 'loading' ? <p className={styles.overlay}>{es.modelsLoadingModel}</p> : null}
        {phase === 'error' ? <p className={styles.overlayError}>{es.modelsModelError}</p> : null}
        {props.status !== 'proposed' ? (
          <p className={styles.statusBadge} data-status={props.status}>
            {props.status === 'approved'
              ? es.modelsStatusApproved
              : props.status === 'failed'
                ? es.modelsStatusFailed
                : es.modelsStatusRejected}
          </p>
        ) : null}
      </div>
      <h3 className={styles.name} title={props.item.file}>{name}</h3>
      <p className={styles.meta}>
        {props.item.hgssKind !== null ? (
          <span className={styles.hgss}>{es.modelsHgssTag} · {props.item.hgssKind}</span>
        ) : (
          <span>{props.item.pack}</span>
        )}
        {' · '}
        {props.item.newKind !== undefined ? (
          // T-091/AC-5: tamaño final (máximos de placements.json), no KB.
          <span data-testid={`card-size-${props.item.newKind}`}>
            {`alto ≤ ${String(props.item.targetHeight)} u · huella ≤ ${String(props.item.maxFootprint ?? 0)} u`}
          </span>
        ) : (
          <>
            {String(props.item.triangles)} {es.modelsTriangles} · {String(props.item.sizeKB)} {es.modelsKb}
            {props.item.flags.map((flag) => (
              <span key={flag} className={styles.flag}>{flag === 'heavy' ? es.modelsFlagHeavy : es.modelsFlagBig}</span>
            ))}
          </>
        )}
      </p>
      <div className={styles.actions}>
        <button type="button" onClick={() => props.onStatus('approved')} data-action="approve">{es.modelsApprove}</button>
        <button type="button" onClick={() => props.onStatus('rejected')} data-action="reject">{es.modelsReject}</button>
        <label className={styles.kindSelect}>
          {es.modelsChangeKind}
          <select
            value={props.kind === null ? '' : props.kind}
            onChange={(event) => props.onKind(event.target.value === '' ? null : (event.target.value as ModelKind))}
          >
            {kindOptions.map((option) => (
              <option key={option ?? 'unclassified'} value={option ?? ''}>
                {option ?? es.modelsUnclassified}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 48

export function ModelsDemo(): ReactNode {
  const initialPack = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('pack') ?? '' : ''
  const [packFilter, setPackFilter] = useState<string>(initialPack)
  const [kindFilter, setKindFilter] = useState<string>('')
  const [page, setPage] = useState(0)
  const [edits, setEdits] = useState<Record<string, { status?: ModelStatus; kind?: ModelKind | null }>>({})
  const [exported, setExported] = useState(false)
  // T-091/AC-5: yawOffsetDeg por kind de los modelos nuevos (panel + tarjetas).
  const [newYaw, setNewYaw] = useState(initialYawOffset)
  const container = useRef<HTMLDivElement>(null)
  const all = useMemo(galleryItems, [])
  const packs = useMemo(() => [...new Set(all.map((item) => item.pack))].sort(), [all])

  const kindOf = (item: GalleryItem): ModelKind | null =>
    item.kind !== null ? item.kind : edits[item.key]?.kind ?? null
  const statusOf = (item: GalleryItem): ModelStatus => edits[item.key]?.status ?? item.status

  const visible = all.filter((item) => {
    if (packFilter !== '' && item.pack !== packFilter) return false
    if (kindFilter !== '') {
      const kind = kindOf(item)
      if (kindFilter === 'unclassified' ? kind !== null || item.hgssKind !== null : kind !== kindFilter) return false
    }
    return true
  })
  const pageItems = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const exportManifest = (): void => {
    const blob = new Blob([buildManifestExport(manifestJson, edits)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'models.manifest.json'
    link.click()
    URL.revokeObjectURL(link.href)
    setExported(true)
  }

  return (
    <main className={styles.page} data-testid="models-gallery">
      <h1>{es.modelsGalleryTitle}</h1>
      <p className={styles.hint}>{es.modelsGalleryHint}</p>
      <div className={styles.toolbar}>
        <label>
          {es.modelsPack}
          <select value={packFilter} onChange={(event) => { setPackFilter(event.target.value); setPage(0) }} data-testid="models-pack">
            <option value="">{es.modelsAllPacks}</option>
            {packs.map((pack) => <option key={pack} value={pack}>{pack}</option>)}
          </select>
        </label>
        <label>
          {es.modelsChangeKind}
          <select value={kindFilter} onChange={(event) => { setKindFilter(event.target.value); setPage(0) }}>
            <option value="">{es.modelsAllPacks}</option>
            {MODEL_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            <option value="unclassified">{es.modelsUnclassified}</option>
          </select>
        </label>
        <button type="button" className={styles.export} onClick={exportManifest} data-action="export-manifest">
          {es.modelsExport}
        </button>
        {exported ? <span className={styles.exported}>{es.modelsExported}</span> : null}
      </div>
      <NewModelsPanel
        yaw={newYaw}
        onYaw={(kind, value) => setNewYaw((current) => ({ ...current, [kind]: value }))}
      />
      {pageItems.length === 0 ? <p className={styles.empty}>{es.modelsEmpty}</p> : null}
      <div ref={container} className={styles.grid}>
        {pageItems.map((item) => (
          <ModelCard
            key={item.key}
            item={item}
            kind={kindOf(item)}
            status={statusOf(item)}
            {...(item.newKind !== undefined ? { yawDeg: newYaw[item.newKind] ?? 0 } : {})}
            onStatus={(status) => setEdits((current) => ({ ...current, [item.key]: { ...current[item.key], status } }))}
            onKind={(kind) => setEdits((current) => ({ ...current, [item.key]: { ...current[item.key], kind } }))}
          />
        ))}
        <Canvas
          className={styles.canvas}
          eventSource={container}
          camera={{ position: [1.15, 0.85, 1.15], fov: 35 }}
          style={{ position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none' }}
        >
          <View.Port />
        </Canvas>
      </div>
      {visible.length > PAGE_SIZE ? (
        <div className={styles.pager}>
          <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>←</button>
          <span>{String(page + 1)} / {String(Math.ceil(visible.length / PAGE_SIZE))}</span>
          <button type="button" disabled={(page + 1) * PAGE_SIZE >= visible.length} onClick={() => setPage((current) => current + 1)}>→</button>
        </div>
      ) : null}
    </main>
  )
}
