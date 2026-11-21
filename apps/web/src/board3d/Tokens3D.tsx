// Fichas del tablero 3D (SPEC-G/T-063): capa R3F fina sobre tokens.ts (three
// puro). Monta el grupo de fichas, decora cada ficha con el modelo 3D HGSS de
// su inicial (fichas-modelo-3d-hgss; fallback sprite → peón), anima el camino
// del PlayerMoved con timers + invalidate (frameloop demand) y publica el foco
// (ficha + próximo waypoint) para la cámara de T-076.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { BoardTokenSpec } from '../board/Board'
import type { PlaybackSpeed } from '../events/anim.config'
import { gameContent } from '../game/content'
import { BOARD3D } from '../theme/board3d'
import { modelLoaders } from './ModelDecor'
import type { RigFocus } from './rig'
import { nodeWorldPos, type WorldPos } from './scene'
import {
  moveTokenAlong,
  setTokenModel,
  setTokenSprite,
  stepMsFor,
  syncTokenSprites,
  syncTokens,
  tokenTargetPos,
  type TokenSpec,
} from './tokens'
import { StarterModelCache, starterModelInstance } from './models/starters'

const imageSize = gameContent.board.meta.imageSize

const textureCache = new Map<string, Promise<THREE.Texture>>()

const loadTexture = (url: string): Promise<THREE.Texture> => {
  const cached = textureCache.get(url)
  if (cached !== undefined) return cached
  const promise = new THREE.TextureLoader().loadAsync(url).then((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  })
  textureCache.set(url, promise)
  promise.catch(() => textureCache.delete(url))
  return promise
}

/** Plantilla por especie del manifiesto HGSS (caché compartida entre fichas). */
const starterCache = new StarterModelCache(modelLoaders())

/** Aplica el sprite billboard (AC-5); fallo ⇒ peón (queda como esté). */
async function applyTokenSprite(token: THREE.Group, url: string | null): Promise<void> {
  if (url === null) return
  try {
    setTokenSprite(token, await loadTexture(url))
  } catch {
    // Sin sprite utilizable: la ficha queda con el peón de color (AC-5).
  }
}

/** Cadena de decoración (AC-4/AC-5): modelo 3D del inicial → sprite → peón.
 *  `isCurrent` corta la aplicación si el spec cambió mientras cargaba. */
async function decorateToken(
  token: THREE.Group,
  spec: BoardTokenSpec,
  isCurrent: () => boolean,
): Promise<void> {
  if (spec.modelSpecies !== null) {
    const template = await starterCache.templateFor(spec.modelSpecies)
    if (!isCurrent()) return
    if (template !== null) {
      setTokenModel(token, starterModelInstance(template))
      return
    }
    // Sin modelo utilizable (sin entrada o carga fallida): quita el modelo
    // viejo si lo había y cae al sprite (AC-5).
    setTokenModel(token, null)
  } else {
    setTokenModel(token, null)
  }
  await applyTokenSprite(token, spec.spriteUrl)
}

export interface Tokens3DProps {
  readonly group: THREE.Group
  readonly tokens: readonly BoardTokenSpec[]
  readonly activeTokenId: string | null
  readonly movePath: readonly string[] | null
  readonly moveNonce: number
  readonly speed: PlaybackSpeed
  readonly reducedMotion: boolean
  /** T-076: publica el foco de la cámara (ficha + próximo waypoint). */
  readonly onFocus?: (focus: RigFocus) => void
  readonly onDone: () => void
}

export function Tokens3D(props: Tokens3DProps): ReactNode {
  const { group, tokens, activeTokenId, movePath, moveNonce, speed, reducedMotion, onFocus, onDone } = props
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const tokenMapRef = useRef<ReadonlyMap<string, THREE.Group>>(new Map())
  const decorationNonceRef = useRef<Map<string, number>>(new Map())

  const specs = useMemo<readonly TokenSpec[]>(
    () => tokens.map((token) => ({ id: token.id, nodeId: token.nodeId, spriteUrl: token.spriteUrl })),
    [tokens],
  )

  useEffect(() => {
    tokenMapRef.current = syncTokens(group, specs, gameContent.board, imageSize)
    invalidate()
  }, [group, specs, invalidate])

  // T-076: foco en reposo (la ficha activa en su nodo; el rig conserva el
  // último heading, así el encuadre no gira cuando no hay camino).
  useEffect(() => {
    const rest = tokenTargetPos(specs, gameContent.board, imageSize).get(activeTokenId ?? '')
    if (rest !== undefined) {
      onFocus?.({ tokenX: rest.x, tokenZ: rest.z, nextX: rest.x, nextZ: rest.z })
    }
  }, [specs, activeTokenId, onFocus])

  // Decoración de la ficha (AC-4/AC-5): modelo 3D del inicial → sprite → peón.
  // Nonce por ficha: si el spec cambia mientras carga, el resultado viejo no se aplica.
  useEffect(() => {
    for (const boardSpec of tokens) {
      const token = tokenMapRef.current.get(boardSpec.id)
      if (token === undefined) continue
      const nonce = (decorationNonceRef.current.get(boardSpec.id) ?? 0) + 1
      decorationNonceRef.current.set(boardSpec.id, nonce)
      const isCurrent = (): boolean => decorationNonceRef.current.get(boardSpec.id) === nonce
      void decorateToken(token, boardSpec, isCurrent).then(() => {
        if (isCurrent()) invalidate()
      })
    }
  }, [tokens, invalidate])

  // Billboard: el sprite mira a la cámara en cada frame renderizado.
  useFrame(() => syncTokenSprites(group, camera))

  // Camino del PlayerMoved (AC-2/AC-3): saltos por tramo, cámara siguiendo.
  useEffect(() => {
    if (movePath === null || movePath.length < 2) return
    const token = tokenMapRef.current.get(activeTokenId ?? '')
    if (token === undefined) return
    const nodeById = new Map(gameContent.board.nodes.map((node) => [node.id, node]))
    const center = (id: string): WorldPos => {
      const node = nodeById.get(id)
      return node === undefined ? { x: 0, z: 0 } : nodeWorldPos(node, imageSize)
    }
    const waypoints: WorldPos[] = movePath.map(center)
    const final = tokenTargetPos(specs, gameContent.board, imageSize).get(activeTokenId ?? '')
    if (final !== undefined) waypoints[movePath.length - 1] = final

    let stopped = false
    const ms = stepMsFor(speed, reducedMotion)
    // T-069/AC-5: el idle ambiental no toca la ficha mientras se mueve.
    token.userData.moving = true
    void moveTokenAlong({
      token,
      waypoints,
      stepMs: ms,
      groundY: BOARD3D.token.lift,
      delay: (millis: number): Promise<void> =>
        millis <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, millis)),
      onFrame: (position: THREE.Vector3, dest: WorldPos): void => {
        onFocus?.({ tokenX: position.x, tokenZ: position.z, nextX: dest.x, nextZ: dest.z })
        invalidate()
      },
      shouldStop: (): boolean => stopped,
    }).then(() => {
      token.userData.moving = false
      if (!stopped) onDone()
    })
    return () => {
      stopped = true
      token.userData.moving = false
    }
  }, [moveNonce, movePath, activeTokenId, specs, speed, reducedMotion, onFocus, invalidate, onDone])

  return null
}
