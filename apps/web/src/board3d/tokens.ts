// Fichas del tablero 3D (SPEC-G/T-063): three puro, sin R3F ni DOM, para
// verificar numéricamente (NO-VISION). Tokens3D.tsx las monta/anima en la
// escena; todos los números viven en theme/board3d.ts.
import type { BoardGraph } from '@liga/content'
import type { PlaybackSpeed } from '../events/anim.config'
import { BOARD3D } from '../theme/board3d'
import * as THREE from 'three'
import { nodeWorldPos, type WorldPos } from './scene'
import { toonMaterial } from './toon'

/** Qué ficha mostrar: jugador → nodo + sprite del PKM inicial (sprites.json). */
export interface TokenSpec {
  readonly id: string
  readonly nodeId: string
  readonly spriteUrl: string | null
}

const pawnColor = (playerIndex: number): string => {
  const colors: readonly string[] = BOARD3D.token.pawnColors
  return colors[playerIndex % colors.length] ?? colors[0] ?? '#e2504c'
}

/** AC-1: base cilíndrica (r 0,2) + sprite billboard 0,9; sin sprite ⇒ peón. */
export function buildToken(id: string, playerIndex: number): THREE.Group {
  const token = new THREE.Group()
  token.name = `token:${id}`
  token.userData = { kind: 'token', tokenId: id }

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(
      BOARD3D.token.baseRadius,
      BOARD3D.token.baseRadius,
      BOARD3D.token.baseHeight,
      24,
    ),
    toonMaterial({ color: 0xffffff }),
  )
  base.name = 'base'
  base.position.y = BOARD3D.token.baseHeight / 2
  token.add(base)

  const pawn = new THREE.Mesh(
    new THREE.ConeGeometry(BOARD3D.token.pawnRadius, BOARD3D.token.pawnHeight, 16),
    toonMaterial({ color: pawnColor(playerIndex) }),
  )
  pawn.name = 'pawn'
  pawn.position.y = BOARD3D.token.baseHeight + BOARD3D.token.pawnHeight / 2
  token.add(pawn)

  const sprite = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD3D.token.spriteSize, BOARD3D.token.spriteSize),
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  sprite.name = 'sprite'
  sprite.position.y = BOARD3D.token.spriteLift
  sprite.visible = false
  token.add(sprite)

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(BOARD3D.token.baseRadius * 1.3, 16),
    new THREE.MeshBasicMaterial({
      color: BOARD3D.blob.color,
      transparent: true,
      opacity: BOARD3D.blob.opacity,
      depthWrite: false,
    }),
  )
  blob.name = 'blob'
  blob.rotation.x = -Math.PI / 2
  token.add(blob)
  return token
}

/** AC-1: con textura el sprite reemplaza al peón; null vuelve al peón. */
export function setTokenSprite(token: THREE.Group, texture: THREE.Texture | null): void {
  const sprite = token.children.find((child) => child.name === 'sprite') as THREE.Mesh | undefined
  const pawn = token.children.find((child) => child.name === 'pawn') as THREE.Mesh | undefined
  if (sprite === undefined || pawn === undefined) return
  const material = sprite.material as THREE.MeshBasicMaterial
  if (texture === null) {
    material.map = null
    material.needsUpdate = true
    sprite.visible = false
    pawn.visible = true
    return
  }
  material.map = texture
  material.needsUpdate = true
  sprite.visible = true
  pawn.visible = false
}

/** AC: fichas-modelo-3d-hgss/AC-4 — el modelo 3D del inicial se monta sobre la
 *  base (oculta peón y sprite; base y blob se conservan); null los devuelve a
 *  la cadena sprite → peón (AC-5). El modelo es hijo del grupo ficha (AC-6):
 *  sigue el idle bob y los saltos, y NO hace billboard (rotación fija). */
export function setTokenModel(token: THREE.Group, model: THREE.Object3D | null): void {
  for (const child of [...token.children]) {
    if (child.name === 'model') token.remove(child)
  }
  const pawn = token.children.find((child) => child.name === 'pawn')
  if (model === null) {
    if (pawn !== undefined) pawn.visible = true
    return
  }
  model.name = 'model'
  model.rotation.y = BOARD3D.token.modelRotY
  model.position.y = BOARD3D.token.baseHeight
  token.add(model)
  if (pawn !== undefined) pawn.visible = false
  const sprite = token.children.find((child) => child.name === 'sprite')
  if (sprite !== undefined) sprite.visible = false
}

/** Caminata-ficha/AC-5/AC-6: reposo — sola a `soloOffset` del centro (dirección
 *  determinista por índice de jugador); 2..5 en círculo a `radialOffset`. */
export function tokenTargetPos(
  specs: readonly TokenSpec[],
  board: BoardGraph,
  imageSize: readonly [number, number] | undefined,
): ReadonlyMap<string, WorldPos> {
  const targets = new Map<string, WorldPos>()
  const byNode = new Map<string, string[]>()
  for (const spec of specs) {
    const ids = byNode.get(spec.nodeId) ?? []
    ids.push(spec.id)
    byNode.set(spec.nodeId, ids)
  }
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]))
  const playerIndexById = new Map(specs.map((spec, index) => [spec.id, index]))
  for (const [nodeId, ids] of byNode) {
    const node = nodeById.get(nodeId)
    const center: WorldPos =
      node === undefined ? { x: 0, z: 0 } : nodeWorldPos(node, imageSize)
    ids.forEach((id, slot) => {
      if (ids.length === 1) {
        const playerIndex = playerIndexById.get(id) ?? 0
        const angle = (2 * Math.PI * playerIndex) / BOARD3D.token.maxPlayers
        targets.set(id, {
          x: center.x + BOARD3D.token.soloOffset * Math.cos(angle),
          z: center.z + BOARD3D.token.soloOffset * Math.sin(angle),
        })
        return
      }
      const angle = (2 * Math.PI * slot) / ids.length
      targets.set(id, {
        x: center.x + BOARD3D.token.radialOffset * Math.cos(angle),
        z: center.z + BOARD3D.token.radialOffset * Math.sin(angle),
      })
    })
  }
  return targets
}

export function createTokensGroup(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'tokens'
  return group
}

/** Crea/quita fichas y las deja en su posición de reposo (nodo + offset). */
export function syncTokens(
  group: THREE.Group,
  specs: readonly TokenSpec[],
  board: BoardGraph,
  imageSize: readonly [number, number] | undefined,
): ReadonlyMap<string, THREE.Group> {
  const targets = tokenTargetPos(specs, board, imageSize)
  const alive = new Set(specs.map((spec) => spec.id))
  for (const child of [...group.children]) {
    if (child.userData.kind === 'token' && !alive.has(child.userData.tokenId)) group.remove(child)
  }
  const tokens = new Map<string, THREE.Group>()
  specs.forEach((spec, index) => {
    const isTokenOf = (child: THREE.Object3D): child is THREE.Group =>
      child.userData.kind === 'token' && child.userData.tokenId === spec.id
    let token: THREE.Group | undefined = group.children.find(isTokenOf)
    if (token === undefined) {
      token = buildToken(spec.id, index)
      group.add(token)
    }
    const target = targets.get(spec.id) ?? { x: 0, z: 0 }
    token.position.set(target.x, BOARD3D.token.lift, target.z)
    tokens.set(spec.id, token)
  })
  return tokens
}

/** AC-2: salto parabólico por tramo (pico hopHeight en t=0,5; extremos exactos). */
export function hopPosition(from: WorldPos, to: WorldPos, progress: number): {
  readonly x: number
  readonly y: number
  readonly z: number
} {
  const t = Math.min(1, Math.max(0, progress))
  const arc = 4 * BOARD3D.token.hopHeight * t * (1 - t)
  return {
    x: from.x + (to.x - from.x) * t,
    y: arc,
    z: from.z + (to.z - from.z) * t,
  }
}

/** AC-3: skip y reducedMotion saltan directo (0 ms); 2× a la mitad. */
export function stepMsFor(speed: PlaybackSpeed, reducedMotion: boolean): number {
  if (reducedMotion || speed === 'skip') return 0
  if (speed === '2x') return BOARD3D.token.stepMs / 2
  return BOARD3D.token.stepMs
}

export interface TokenMoveOptions {
  readonly token: THREE.Group
  /** Nodos del camino en orden (≥ 2 para animar). */
  readonly waypoints: readonly WorldPos[]
  /** 0 ⇒ salta directo al destino (AC-3). */
  readonly stepMs: number
  readonly groundY: number
  readonly framesPerStep?: number
  /** Reloj inyectado: en tests resuelve ya; en la UI espera ms reales. */
  readonly delay: (ms: number) => Promise<void>
  /** Hook por frame: posición de la ficha y destino del tramo (T-076: foco). */
  readonly onFrame?: (position: THREE.Vector3, dest: WorldPos) => void
  /** Cancelación entre frames (desmonte / movimiento nuevo). */
  readonly shouldStop?: () => boolean
}

/** AC-2/AC-3: recorre los tramos con saltos parabólicos, sin vaivén lateral
 *  (quitar-tambaleo/AC-1); resuelve al llegar con la ficha exacta. */
export async function moveTokenAlong(options: TokenMoveOptions): Promise<void> {
  const { token, waypoints, stepMs, groundY, delay, onFrame, shouldStop } = options
  const framesPerStep = options.framesPerStep ?? BOARD3D.token.framesPerStep
  const last = waypoints[waypoints.length - 1]
  if (last === undefined) return
  if (waypoints.length < 2 || stepMs <= 0 || framesPerStep < 1) {
    token.position.set(last.x, groundY, last.z)
    onFrame?.(token.position, last)
    return
  }
  for (let segment = 0; segment + 1 < waypoints.length; segment += 1) {
    const from = waypoints[segment]
    if (from === undefined) continue
    const to = waypoints[segment + 1]
    if (to === undefined) continue
    for (let frame = 1; frame <= framesPerStep; frame += 1) {
      if (shouldStop?.() === true) return
      const t = frame / framesPerStep
      const hop = hopPosition(from, to, t)
      token.position.set(hop.x, groundY + hop.y, hop.z)
      onFrame?.(token.position, to)
      await delay(stepMs / framesPerStep)
    }
  }
  token.position.set(last.x, groundY, last.z)
  onFrame?.(token.position, last)
}

/** AC-1: el plano del sprite copia la orientación de la cámara (billboard). */
export function syncTokenSprites(group: THREE.Group, camera: THREE.Camera): void {
  for (const token of group.children) {
    if (token.userData.kind !== 'token') continue
    const sprite = token.children.find((child) => child.name === 'sprite')
    if (sprite !== undefined) sprite.quaternion.copy(camera.quaternion)
  }
}
