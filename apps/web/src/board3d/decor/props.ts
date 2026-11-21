// Props del catálogo (SPEC-H/T-068): cerca, cartel, farola y bandera suelta.
import * as THREE from 'three'
import { BOARD3D } from '../../theme/board3d'
import { mergeParts, part, specialMaterial, type PiecePart } from './geometry'
import type { PiecePalette, PieceSpec } from './types'
import { pal } from './types'

const cyl = (r: number, h: number, seg = 6): THREE.CylinderGeometry => new THREE.CylinderGeometry(r, r, h, seg)

/** fence: postes cada `spacing` + 2 rieles a lo largo de `length` (x local). */
export function fenceParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.fence
  const wood = pal(palette, 'wood', '#7A5230')
  const length = spec.length ?? 1
  const posts = Math.max(2, Math.round(length / t.spacing) + 1)
  const step = length / (posts - 1)
  const parts: PiecePart[] = []
  for (let index = 0; index < posts; index += 1) {
    parts.push(part(cyl(t.post.radius, t.post.height), wood, { pos: [-length / 2 + index * step, t.post.height / 2, 0] }))
  }
  for (const y of [t.post.height * 0.35, t.post.height * 0.8]) {
    parts.push(part(new THREE.BoxGeometry(length, t.rail[0], t.rail[1]), wood, { pos: [0, y, 0] }))
  }
  return [mergeParts(parts)]
}

/** sign: poste + cartel de madera (el texto queda en userData, NO-VISION). */
export function signParts(_spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.sign
  const wood = pal(palette, 'wood', '#7A5230')
  return [mergeParts([
    part(cyl(t.post.radius, t.post.height), wood, { pos: [0, t.post.height / 2, 0] }),
    part(new THREE.BoxGeometry(...t.board), pal(palette, 'wall', '#EADBB8'), {
      pos: [0, t.post.height - t.board[1] / 2 + 0.02, 0],
    }),
  ])]
}

/** lamp: poste + bombilla emisiva (material propio). */
export function lampParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.lamp
  const glow = spec.glow ?? BOARD3D.ring.color
  return [
    mergeParts([part(cyl(t.pole.radius, t.pole.height), pal(palette, 'rock', '#8C8577'), {
      pos: [0, t.pole.height / 2, 0],
    })]),
    {
      geometry: new THREE.SphereGeometry(t.bulb.radius, 8, 6).translate(0, t.pole.height, 0),
      material: specialMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.9 }),
    },
  ]
}

/** flag: mástil + paño del color dado (bandera suelta). */
export function flagParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.flag
  return [mergeParts([
    part(cyl(t.pole.radius, t.pole.height), pal(palette, 'wood', '#7A5230'), {
      pos: [0, t.pole.height / 2, 0],
    }),
    part(new THREE.PlaneGeometry(t.plane[0], t.plane[1]), spec.flag ?? BOARD3D.nodeColors.gym, {
      pos: [t.plane[0] / 2, t.pole.height - t.plane[1] / 2, 0],
    }),
  ])]
}
