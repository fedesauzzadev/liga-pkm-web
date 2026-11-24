// ModelDecor (SPEC-K/T-070d): wrapper R3F fino sobre ModelDecorLayer — arma
// los specs desde las mismas funciones puras de landmarks/scatter (misma
// fuente de verdad que la escena procedural), usa GLTFLoader/OBJLoader de
// three/examples (sin dependencias nuevas) y actualiza por cercanía de cámara
// (AC-6). La lógica vive en layer.ts (testeable en node).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type ReactNode } from 'react'
import type { BoardGraph, Decor, DecorKind } from '@liga/content'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { buildWorldInput, type BoardScene } from './scene'
import type { DeckStacksFile } from './stacks'
import { landmarksFor } from './landmarks'
import { leaderFlagColor } from './leaders'
import { landmarkTransforms, solveBuildings } from './placements'
import { decorPlanFor } from './decor/plan'
import { terrainHeightAt, type WorldInput } from './world'
import { BOARD3D } from '../theme/board3d'
import { boardStyle } from './style'
import {
  ModelDecorLayer, type LandmarkModelSpec, type ModelLoaders, type ScatterModelSpec,
} from './models/layer'
import type { ModelTuneOptions } from './models/normalize'
import { activeTokenTarget, applyOcclusion, applyScatterOcclusion } from './models/occlusion'

/** URL del archivo hermano (mtllib) de un modelo: directorio clásico si la URL
 *  es path-style (`/dev-models/file/hgss/bld/x.obj`), o el mismo query-param si
 *  es `?path=`. Puro, sin DOM (AC-3 fix galería). */
export function siblingModelUrl(url: string, name: string): string {
  const marker = '?path='
  const query = url.indexOf(marker)
  if (query === -1) {
    return `${url.slice(0, url.lastIndexOf('/') + 1)}${encodeURIComponent(name)}`
  }
  const path = decodeURIComponent(url.slice(query + marker.length))
  return `${url.slice(0, query)}${marker}${encodeURIComponent(`${path.slice(0, path.lastIndexOf('/') + 1)}${name}`)}`
}

/** AC-2 (T-086): codifica un segmento de URL preservando escapes ya presentes
 *  (%20) y encodeando lo crudo del MTL (espacios, backslashes). Puro. */
export function encodeUrlSegment(segment: string): string {
  return segment
    .split(/(%[0-9A-Fa-f]{2})/)
    .map((part) => (part.startsWith('%') ? part : encodeURIComponent(part)))
    .join('')
}

/** AC-2 (T-086): candidatos de URL para una textura referenciada por el MTL:
 *  tal cual vino resuelta (dir del modelo + ref), con el pathname encodeado
 *  (tolera espacios) y con el nombre en minúsculas/mayúsculas (tolera
 *  mayúsculas/minúsculas entre el .mtl y el archivo real). Puro, sin DOM. */
export function textureUrlCandidates(resolvedUrl: string): readonly string[] {
  const trimmed = resolvedUrl.trim()
  if (trimmed === '' || /^data:/i.test(trimmed)) return []
  const question = trimmed.indexOf('?')
  const pathname = question === -1 ? trimmed : trimmed.slice(0, question)
  const search = question === -1 ? '' : trimmed.slice(question)
  const encoded = pathname.split('/').map(encodeUrlSegment).join('/')
  const slash = encoded.lastIndexOf('/')
  const dir = slash === -1 ? '' : encoded.slice(0, slash + 1)
  const name = slash === -1 ? encoded : encoded.slice(slash + 1)
  return [
    ...new Set([
      `${pathname}${search}`,
      `${encoded}${search}`,
      `${dir}${name.toLowerCase()}${search}`,
      `${dir}${name.toUpperCase()}${search}`,
    ]),
  ]
}

/** Carga la primera variante de URL que responda (AC-2); null si ninguna. */
async function loadTextureCandidates(resolvedUrl: string): Promise<THREE.Texture | null> {
  const loader = new THREE.TextureLoader()
  for (const candidate of textureUrlCandidates(resolvedUrl)) {
    try {
      return await loader.loadAsync(candidate)
    } catch {
      // Probamos la siguiente variante (case/espacios).
    }
  }
  return null
}

/** AC-2 (T-070e/T-086): OBJ + MTL hermanos con texturas del mismo directorio.
 *  Interceptamos `MaterialCreator.loadTexture` para resolver cada textura con
 *  tolerancia a mayúsculas/minúsculas y espacios, y esperamos su resultado:
 *  si no carga, el material queda sin `map` (toonizeModel pone el color neutro
 *  del kind y avisa con el nombre del modelo). */
async function loadObjWithMtl(url: string, options: ModelTuneOptions): Promise<THREE.Object3D> {
  const dirUrl = url.slice(0, url.lastIndexOf('/') + 1)
  const objLoader = new OBJLoader()
  objLoader.setResourcePath(dirUrl)
  const textureJobs: { url: string; texture: THREE.Texture }[] = []
  try {
    const objText = await (await fetch(url)).text()
    const mtllib = /^\s*mtllib\s+(.+)$/m.exec(objText)?.[1]?.trim()
    if (mtllib !== undefined && mtllib.length > 0) {
      const mtlLoader = new MTLLoader()
      mtlLoader.setResourcePath(dirUrl)
      const creator = await mtlLoader.loadAsync(siblingModelUrl(url, mtllib))
      creator.loadTexture = (textureUrl: string): THREE.Texture => {
        const texture = new THREE.Texture()
        texture.name = textureUrl
        if (options.ignoreTextures !== true) textureJobs.push({ url: textureUrl, texture })
        return texture
      }
      creator.preload()
      objLoader.setMaterials(creator)
    }
  } catch {
    // Sin MTL o sin red: el OBJ se carga con material plano y sigue el flujo.
  }
  const object = await objLoader.loadAsync(url)
  await Promise.all(
    textureJobs.map(async (job) => {
      const texture = await loadTextureCandidates(job.url)
      if (texture !== null) {
        job.texture.image = texture.image
        job.texture.needsUpdate = true
      }
    }),
  )
  return object
}

export function modelLoaders(): ModelLoaders {
  return {
    // AC-2: las texturas externas del GLB se resuelven contra el dir del modelo.
    loadGltf: async (url) => {
      const gltf = new GLTFLoader()
      gltf.setResourcePath(url.slice(0, url.lastIndexOf('/') + 1))
      return (await gltf.loadAsync(url)).scene
    },
    loadObj: loadObjWithMtl,
    // SPEC-N/T-091/AC-1: FBXLoader de three/examples, solo si un modelo nuevo
    // es .fbx (import dinámico ⇒ no entra al chunk hasta que se necesita).
    loadFbx: async (url) => {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      return await new FBXLoader().loadAsync(url)
    },
  }
}

export function modelDecorSpecs(
  board: BoardGraph,
  decor: Decor,
  input: WorldInput,
  stacks: DeckStacksFile,
): { landmarks: readonly LandmarkModelSpec[]; scatter: readonly ScatterModelSpec[] } {
  const nodePos = new Map(input.nodes.map((node) => [node.id, node]))
  // T-091/AC-2: la pieza primaria de cada edificio reubicado toma x/z/yaw/
  // escala del solver + máximos de altura/huella; el resto queda relativo.
  const transforms = landmarkTransforms(board, decor, solveBuildings(board, stacks))
  // SPEC-O/T-095: mismas posiciones que la escena — el plan de ocupación es
  // la única fuente; los landmarks pisados no se cubren con modelos.
  const plan = decorPlanFor(board, stacks, decor)
  const hidden = new Set(plan.hiddenLandmarks)
  const landmarks: LandmarkModelSpec[] = landmarksFor(board, decor).flatMap((placed) => {
    if (hidden.has(`${placed.nodeId}:${placed.index}`)) return []
    const anchor = nodePos.get(placed.nodeId)
    if (anchor === undefined) return []
    const transform = transforms.get(`${placed.nodeId}:${placed.index}`)
    const x = transform?.x ?? anchor.x + placed.piece.offset[0]
    const z = transform?.z ?? anchor.z + placed.piece.offset[1]
    return [{
      key: `${placed.nodeId}:${placed.piece.kind}:${placed.index}`,
      kind: placed.piece.kind,
      variant: placed.piece.variant,
      nodeId: placed.nodeId,
      x,
      y: terrainHeightAt(x, z, input) + BOARD3D.decor.scatter.lift,
      z,
      rotY: transform?.rotY ?? placed.piece.rotY ?? 0,
      scale: transform?.buildingScale ?? placed.piece.scale ?? 1,
      ...(transform !== undefined
        ? {
            buildingKind: transform.buildingKind,
            targetHeight: transform.targetHeight,
            maxFootprint: transform.maxFootprint,
          }
        : {}),
      ...(placed.piece.flagFromLeader === true
        ? { flagColor: leaderFlagColor(placed.nodeId) }
        : placed.piece.flag !== undefined
          ? { flagColor: placed.piece.flag }
          : {}),
    }]
  })
  const scatter: ScatterModelSpec[] = plan.scatterSpecs.map((spec) => ({
    zone: spec.zone,
    kind: spec.kind as DecorKind,
    variant: spec.variant,
    seed: spec.seed,
    spots: spec.spots.map((spot) => ({
      x: spot.x,
      y: terrainHeightAt(spot.x, spot.z, input) + BOARD3D.decor.scatter.lift,
      z: spot.z,
      scale: spot.scale,
      rotY: spot.rotY,
    })),
  }))
  return { landmarks, scatter }
}

/** AC-6: precarga los landmarks del nodo de inicio (Pueblo Paleta). */
export const PRELOAD_NODE_IDS = ['paleta']

export function ModelDecor(props: {
  boardScene: BoardScene
  board: BoardGraph
  stacks: DeckStacksFile
  decor: Decor
}): ReactNode {
  const { boardScene } = props
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const layer = useMemo(() => {
    const input = buildWorldInput(props.board, props.stacks, props.decor)
    const specs = modelDecorSpecs(props.board, props.decor, input, props.stacks)
    return new ModelDecorLayer({
      landmarks: boardScene.landmarks,
      scatter: boardScene.scatter,
      palette: props.decor.palette,
      outlines: boardScene.outlines,
      outlineStyle: boardStyle.lighting.outlines,
      specs: specs.landmarks,
      scatterSpecs: specs.scatter,
      loaders: modelLoaders(),
      budget: {
        maxDrawCalls: props.decor.budgets.maxDrawCalls,
        maxTriangles: props.decor.budgets.maxTriangles,
      },
      // El tablero entero entra: con 14 la cámara por defecto (a 15 del
      // blanco) dejaba las zonas del norte con piezas procedurales.
      loadDistance: 40,
    })
  }, [boardScene, props.board, props.decor, props.stacks])

  useEffect(() => {
    layer.preload(PRELOAD_NODE_IDS)
    return () => layer.dispose()
  }, [layer])

  useFrame(() => {
    layer.update(camera.position.x, camera.position.z)
    // N-0002: lo que tapa la ficha activa se vuelve translúcido.
    const tokens = scene.getObjectByName('tokens')
    const target = tokens === undefined ? null : activeTokenTarget(tokens)
    applyOcclusion(boardScene.landmarks, boardScene.outlines, camera.position, target)
    // N-0030: árboles y rocas instanciados que tapan la ficha se ocultan.
    applyScatterOcclusion(boardScene.scatter, camera.position, target)
  })
  return null
}
