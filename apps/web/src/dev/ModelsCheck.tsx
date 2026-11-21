// Página /dev/models-check (T-086/AC-4): chequeo automático SIN OJOS de cada
// modelo del manifiesto — se renderiza uno por uno sobre fondo gris con luz
// neutra (mismas intensidades que el juego, tonemapping ACES de R3F) y se
// miden el brillo medio y el % de píxeles oscuros (< 0,08) leyendo el canvas
// WebGL (gl.readPixels). El driver `pnpm models:check` recorre
// window.__modelsCheck y escribe los status "failed" en el manifiesto (el
// juego entonces usa la pieza procedural). SPEC-N/T-091/AC-3: los 4 modelos
// nuevos entran al mismo chequeo (brillo, normales, texturas, negro).
// Solo desarrollo.
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { MODEL_KIND_TO_DECOR, ModelsManifestSchema, type DecorKind, type NewModelFormat } from '@liga/content'
import * as THREE from 'three'
import { modelLoaders } from '../board3d/ModelDecor'
import { mergeModelByMaterial, normalizeModel, toonizeModel } from '../board3d/models/normalize'
import { BUILDING_PIECE_KIND } from '../board3d/placements'
import { neutralModelColor } from '../theme/models'
import { es } from '../i18n/es'
import manifestJson from '../../../../content/board/models.manifest.json'
import {
  MODEL_CHECK_THRESHOLDS, modelCheckVerdict, modelPixelMetrics, type ModelCheckRecord,
} from './models-check-lib'
import styles from './models-check.module.css'

const manifest = ModelsManifestSchema.parse(manifestJson)
const LOADERS = modelLoaders()
/** Tamaño del canvas de medición (px, dpr=1 ⇒ píxeles reales). */
export const CHECK_CANVAS = 256

const devAssetUrl = (file: string): string =>
  `/dev-models/file/${file.split('/').map(encodeURIComponent).join('/')}`

const kenneyGameUrl = (file: string): string =>
  `/models/${file.replace(/^kenney\//, '').split('/').map(encodeURIComponent).join('/')}`

const hgssGameUrl = (entry: string): string =>
  `/models/${entry.split('/').map(encodeURIComponent).join('/')}`

const newGameUrl = (file: string): string =>
  `/models/new/${file.split('/').map(encodeURIComponent).join('/')}`

export interface CheckItem {
  readonly key: string
  readonly file: string
  readonly format: NewModelFormat
  readonly decorKind: DecorKind | null
  readonly options: { readonly ignoreTextures?: boolean; readonly keepOriginalMaterial?: boolean }
  readonly status: string
  /** URL del juego (public/models) y del dev server (assets-src, respaldo). */
  readonly gameUrl: string
  readonly devFile: string
}

/** Candidatos no rechazados del manifiesto: el chequeo mide lo que el juego
 *  usaría (approved + proposed; los `failed` ya están fuera de la rotación). */
export function checkItems(): readonly CheckItem[] {
  const items: CheckItem[] = []
  for (const [kind, entry] of Object.entries(manifest.kinds)) {
    for (const candidate of entry.candidates) {
      if (candidate.status === 'rejected') continue
      const decor = MODEL_KIND_TO_DECOR[kind as keyof typeof MODEL_KIND_TO_DECOR]
      items.push({
        key: `${candidate.pack}::${candidate.file}`,
        file: candidate.file,
        format: 'glb',
        decorKind: decor?.kind ?? null,
        options: candidate.options,
        status: candidate.status,
        gameUrl: kenneyGameUrl(candidate.file),
        devFile: candidate.file,
      })
    }
  }
  for (const [kind, group] of Object.entries(manifest.hgss)) {
    for (const file of group.files) {
      if (file.status === 'rejected') continue
      items.push({
        key: `hgss::${file.entry}`,
        file: file.entry,
        format: 'obj',
        decorKind: kind as DecorKind,
        options: file.options,
        status: file.status,
        gameUrl: hgssGameUrl(file.entry),
        devFile: file.entry,
      })
    }
  }
  // SPEC-N/T-091/AC-3: los modelos nuevos entran al mismo chequeo T-086;
  // un failed acá ⇒ la escena usa la pieza procedural de su kind.
  for (const [kind, entry] of Object.entries(manifest.newModels)) {
    if (entry.status === 'rejected') continue
    items.push({
      key: `new::${kind}`,
      file: entry.file,
      format: entry.format,
      decorKind: BUILDING_PIECE_KIND[kind as keyof typeof BUILDING_PIECE_KIND],
      options: entry.options,
      status: entry.status,
      gameUrl: newGameUrl(entry.file),
      devFile: `new/${entry.file}`,
    })
  }
  return items
}

export interface CheckShowResult extends ModelCheckRecord {
  readonly servedFrom: 'juego' | 'dev'
  readonly meanBrightness: number
  readonly darkShare: number
  readonly modelPixels: number
}

declare global {
  interface Window {
    __modelsCheck?: {
      readonly ready: boolean
      readonly total: number
      list(): readonly string[]
      show(key: string): Promise<CheckShowResult>
    }
  }
}

const disposeTree = (root: THREE.Object3D): void => {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) material.dispose()
  })
}

/** ¿El objeto cargado tiene al menos una malla con posiciones? Un OBJ parseado
 *  desde HTML (fallback SPA de Vite, `public/models` ausente) queda vacío sin
 *  lanzar; así lo detectamos y reintentamos desde assets-src (AC-4). */
function hasVisibleGeometry(root: THREE.Object3D): boolean {
  let found = false
  root.traverse((object) => {
    if (found || !(object instanceof THREE.Mesh)) return
    const position = object.geometry.getAttribute('position')
    if (position !== undefined && position.count > 0) found = true
  })
  return found
}

/** Carga según formato (T-091/AC-1: glb/gltf, obj y fbx). */
async function loadCheckModel(item: CheckItem, url: string): Promise<THREE.Object3D> {
  if (item.format === 'obj') return await LOADERS.loadObj(url, item.options)
  if (item.format === 'fbx') return await LOADERS.loadFbx(url)
  return await LOADERS.loadGltf(url)
}

function Checker(props: { readonly items: readonly CheckItem[] }): ReactNode {
  const { gl, scene, camera } = useThree()
  const current = useRef<THREE.Group | null>(null)

  useEffect(() => {
    camera.position.set(1.45, 1.05, 1.45)
    camera.lookAt(0, 0.5, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  useEffect(() => {
    const clearScene = (): void => {
      if (current.current === null) return
      scene.remove(current.current)
      disposeTree(current.current)
      current.current = null
    }
    /** Renderiza un frame y devuelve los píxeles crudos del canvas. */
    const measure = (): { pixels: Uint8Array; width: number; height: number } => {
      const width = gl.domElement.width
      const height = gl.domElement.height
      const pixels = new Uint8Array(width * height * 4)
      gl.render(scene, camera)
      const context = gl.getContext()
      context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels)
      return { pixels, width, height }
    }
    const show = async (key: string): Promise<CheckShowResult> => {
      const item = props.items.find((candidate) => candidate.key === key)
      if (item === undefined) throw new Error(`modelo desconocido: ${key}`)
      clearScene()
      let loaded = true
      let servedFrom: 'juego' | 'dev' = 'juego'
      try {
        let raw: THREE.Object3D
        try {
          raw = await loadCheckModel(item, item.gameUrl)
          // AC-4: `public/models` aún sin importar ⇒ Vite responde el HTML de la
          // SPA (200) y el loader lo parsea vacío sin lanzar. Reintentamos desde
          // assets-src (dev) para medir los mismos bytes del juego.
          if (!hasVisibleGeometry(raw)) throw new Error('carga del juego sin geometría')
        } catch {
          servedFrom = 'dev'
          raw = await loadCheckModel(item, devAssetUrl(item.devFile))
        }
        toonizeModel(raw, {
          ...item.options,
          // Texturas DS solo para HGSS: los modelos nuevos no son pixel art.
          pixelArt: item.key.startsWith('hgss::'),
          neutralColor: neutralModelColor(item.decorKind),
          label: item.file,
        })
        const wrap = new THREE.Group()
        for (const part of mergeModelByMaterial(raw)) {
          wrap.add(new THREE.Mesh(part.geometry, part.material))
        }
        const group = normalizeModel(wrap, 1)
        group.name = `models-check:${key}`
        scene.add(group)
        current.current = group
      } catch {
        loaded = false
      }
      const frame = measure()
      // El fondo se estima de las esquinas del canvas (no del gris teórico).
      const metrics = modelPixelMetrics({ data: frame.pixels, width: frame.width, height: frame.height })
      const verdict = modelCheckVerdict(metrics, loaded, frame.width * frame.height)
      return {
        key,
        status: item.key.startsWith('new::') ? 'new' : item.format === 'glb' ? 'kenney' : 'hgss',
        file: item.file,
        loaded,
        metrics,
        verdict,
        failures: verdict.failures,
        servedFrom,
        meanBrightness: metrics.meanBrightness,
        darkShare: metrics.darkShare,
        modelPixels: metrics.modelPixels,
      }
    }

    window.__modelsCheck = {
      ready: true,
      total: props.items.length,
      list: () => props.items.map((item) => item.key),
      show,
    }
    return () => {
      clearScene()
      delete window.__modelsCheck
    }
  }, [props.items, gl, scene, camera])

  return (
    <group>
      {/* Luz neutra (blanca) con la intensidad y la dirección del juego. */}
      <hemisphereLight args={['#ffffff', '#808080', 0.9]} />
      <directionalLight position={[-6, 10, 4]} intensity={1} color="#ffffff" />
    </group>
  )
}

export function ModelsCheck(): ReactNode {
  const items = useMemo(checkItems, [])
  return (
    <main className={styles.page} data-testid="models-check">
      <h1>{es.modelsCheckTitle}</h1>
      <p className={styles.hint}>{es.modelsCheckHint}</p>
      <p className={styles.thresholds} data-testid="models-check-thresholds">
        {`brillo medio ≥ ${String(MODEL_CHECK_THRESHOLDS.minMeanBrightness)} · ` +
          `píxeles oscuros ≤ ${String(Math.round(MODEL_CHECK_THRESHOLDS.maxDarkPixelShare * 100))} % · ` +
          `${String(items.length)} modelos`}
      </p>
      <p className={styles.hint}>
        {'El driver de Playwright (pnpm models:check) recorre window.__modelsCheck y escribe ' +
          'content/board/models.manifest.json con los status failed.'}
      </p>
      <div className={styles.stage} style={{ width: CHECK_CANVAS, height: CHECK_CANVAS }}>
        <Canvas
          className={styles.canvas}
          dpr={1}
          gl={{ preserveDrawingBuffer: true, antialias: false, alpha: false }}
          camera={{ position: [1.45, 1.05, 1.45], fov: 35 }}
          style={{ width: CHECK_CANVAS, height: CHECK_CANVAS }}
        >
          <color attach="background" args={['#808080']} />
          <Checker items={items} />
        </Canvas>
      </div>
    </main>
  )
}
