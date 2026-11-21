// Naturaleza del catálogo (SPEC-H/T-068): árboles, arbusto, roca, montaña,
// estanque, juncos, pasto, flores, lava y niebla. Recetas en theme §decor;
// colores en decor.json. Origen apoyado en y=0.
import * as THREE from 'three'
import { BOARD3D } from '../../theme/board3d'
import { mergeParts, part, specialMaterial, type PiecePart } from './geometry'
import type { PiecePalette, PieceSpec } from './types'
import { pal } from './types'

const cyl = (r: number, h: number, seg = 6): THREE.CylinderGeometry => new THREE.CylinderGeometry(r, r, h, seg)

/** tree: pine = tronco + 2 conos; round = tronco + esfera 8×6. */
export function treeParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const wood = pal(palette, 'wood', '#7A5230')
  const leaf = pal(palette, 'leafGreen', '#4E9D5B')
  if (spec.variant === 'pine') {
    const t = BOARD3D.decor.tree.pine
    const parts: PiecePart[] = [part(cyl(t.trunk.radius, t.trunk.height), wood, { pos: [0, t.trunk.height / 2, 0] })]
    let base = t.trunk.height * 0.7
    t.cones.forEach((cone, index) => {
      parts.push(
        part(new THREE.ConeGeometry(cone.radius, cone.height, 7), index === 0 ? leaf : pal(palette, 'leafDark', '#2F7A45'), {
          pos: [0, base + cone.height / 2, 0],
        }),
      )
      base += cone.height * 0.55
    })
    return [mergeParts(parts)]
  }
  const t = BOARD3D.decor.tree.round
  return [mergeParts([
    part(cyl(t.trunk.radius, t.trunk.height), wood, { pos: [0, t.trunk.height / 2, 0] }),
    part(
      new THREE.SphereGeometry(t.ball.radius, t.ball.widthSegments, t.ball.heightSegments),
      leaf,
      { pos: [0, t.trunk.height + t.ball.radius * 0.7, 0] },
    ),
  ])]
}

/** deadTree: tronco torcido + 3 ramas finas (Pantano). */
export function deadTreeParts(_spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.deadTree
  const wood = pal(palette, 'deadWood', '#4A3B33')
  const parts: PiecePart[] = [
    part(cyl(t.trunk.radius, t.trunk.height), wood, { pos: [0, t.trunk.height / 2, 0], rotZ: 0.1 }),
  ]
  for (let index = 0; index < t.branches; index += 1) {
    const angle = (index / t.branches) * Math.PI * 2 + 0.4
    parts.push(
      part(cyl(t.branch.radius, t.branch.length), wood, {
        pos: [
          Math.cos(angle) * 0.12,
          t.trunk.height * (0.6 + 0.15 * index),
          Math.sin(angle) * 0.12,
        ],
        rotZ: 0.7 * Math.cos(angle),
        rotX: 0.7 * Math.sin(angle),
      }),
    )
  }
  return [mergeParts(parts)]
}

/** bush: esfera aplastada. */
export function bushParts(_spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.bush
  return [mergeParts([
    part(
      new THREE.SphereGeometry(t.radius, 8, 6),
      pal(palette, 'leafDark', '#2F7A45'),
      { pos: [0, t.radius * t.squash, 0], scale: [1, t.squash, 1] },
    ),
  ])]
}

/** rock: icosaedro detail 0 (la escala aleatoria la pone el scatter). */
export function rockParts(_spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.rock
  return [mergeParts([
    part(
      new THREE.IcosahedronGeometry(t.radius, t.detail),
      pal(palette, 'rock', '#8C8577'),
      { pos: [0, t.radius * 0.6, 0], scale: [1, 0.75, 1] },
    ),
  ])]
}

/** mountain: cono 5 segmentos con cima nevada (relleno de Montaña). */
export function mountainParts(_spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.mountain
  const capHeight = t.height * t.snowRatio
  return [mergeParts([
    part(new THREE.ConeGeometry(t.radius, t.height, t.segments), pal(palette, 'rock', '#8C8577'), {
      pos: [0, t.height / 2, 0],
    }),
    part(
      new THREE.ConeGeometry(t.radius * t.snowRatio, capHeight, t.segments),
      pal(palette, 'snow', '#F4F7FA'),
      { pos: [0, t.height - capHeight / 2 - 0.02, 0] },
    ),
  ])]
}

/** pond: disco de agua translúcido con brillo (material propio, ≤ 0,12 por
 * T-088/AC-2: nada de discos azules marcados sobre el tablero). */
export function pondParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.pond
  const radius = spec.radius ?? t.radius
  const geometry = new THREE.CircleGeometry(radius, t.segments)
  geometry.rotateX(-Math.PI / 2)
  return [
    {
      geometry,
      material: specialMaterial({
        color: pal(palette, 'water', '#4F8FD6'),
        transparent: true,
        opacity: 0.12,
        roughness: 0.25,
      }),
    },
  ]
}

/** reeds: 3 hojas finas inclinadas (orilla de la Isla). */
export function reedsParts(_spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.reeds
  const parts: PiecePart[] = []
  for (let index = 0; index < t.blades; index += 1) {
    const angle = (index / t.blades) * Math.PI * 2
    parts.push(
      part(new THREE.ConeGeometry(t.radius, t.height, 4), pal(palette, 'leafGreen', '#4E9D5B'), {
        pos: [Math.cos(angle) * 0.03, t.height / 2, Math.sin(angle) * 0.03],
        rotZ: 0.25 * Math.cos(angle),
        rotX: 0.25 * Math.sin(angle),
      }),
    )
  }
  return [mergeParts(parts)]
}

/** grassTuft: 3 pastos finos (Llanura). */
export function grassTuftParts(_spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.grassTuft
  const parts: PiecePart[] = []
  for (let index = 0; index < t.blades; index += 1) {
    const angle = (index / t.blades) * Math.PI * 2
    parts.push(
      part(new THREE.ConeGeometry(t.radius, t.height, 4), pal(palette, 'leafGreen', '#4E9D5B'), {
        pos: [Math.cos(angle) * 0.025, t.height / 2, Math.sin(angle) * 0.025],
        rotZ: 0.3 * Math.cos(angle),
        rotX: 0.3 * Math.sin(angle),
      }),
    )
  }
  return [mergeParts(parts)]
}

/** flowerPatch: tallo + cabeza (color fijo del tema). */
export function flowerPatchParts(_spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.flowerPatch
  return [mergeParts([
    part(cyl(t.stem.radius, t.stem.height, 4), pal(palette, 'leafGreen', '#4E9D5B'), {
      pos: [0, t.stem.height / 2, 0],
    }),
    part(new THREE.SphereGeometry(t.head.radius, 6, 5), t.headColor, {
      pos: [0, t.stem.height + t.head.radius * 0.6, 0],
    }),
  ])]
}

/** lavaPool: disco naranja emisivo (material propio, Montaña). */
export function lavaPoolParts(spec: PieceSpec, _palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.lavaPool
  const radius = spec.radius ?? t.radius
  const geometry = new THREE.CircleGeometry(radius, t.segments)
  geometry.rotateX(-Math.PI / 2)
  return [
    {
      geometry,
      material: specialMaterial({ color: t.color, emissive: t.color, emissiveIntensity: 0.7 }),
    },
  ]
}

/** mist: esfera translúcida baja y suave (Pantano) — T-088/AC-2: opacidad ≤
 * 0,12, sin facetas (smooth shading) ya que el flatShading la hace ver
 * pixelada contra el fondo. */
export function mistParts(_spec: PieceSpec, _palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.mist
  const geometry = new THREE.SphereGeometry(t.radius, 12, 8)
  geometry.scale(1, t.squash, 1)
  geometry.translate(0, t.radius * t.squash * 0.5, 0)
  return [
    {
      geometry,
      material: specialMaterial({
        color: '#EAF2F6',
        transparent: true,
        opacity: t.opacity,
        depthWrite: false,
        flatShading: false,
      }),
    },
  ]
}
