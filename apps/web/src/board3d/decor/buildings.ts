// Edificios del catálogo (SPEC-H/T-068): house, pokecenter, market, lab, gym.
// Recetas numéricas en theme/board3d.ts §decor; colores en decor.json.
// Cada builder devuelve partes con origen apoyado en y=0 mirando a +Z.
import * as THREE from 'three'
import { BOARD3D } from '../../theme/board3d'
import { mergeParts, part, type PiecePart } from './geometry'
import type { PiecePalette, PieceSpec } from './types'
import { pal } from './types'

const box = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d)
const cyl = (r: number, h: number, seg = 8): THREE.CylinderGeometry => new THREE.CylinderGeometry(r, r, h, seg)

/** house: cuerpo + techo piramidal + puerta (AC-2: Pueblo Paleta). */
export function houseParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.house
  return [mergeParts([
    part(box(...t.body), spec.wall ?? pal(palette, 'wall', '#EADBB8'), { pos: [0, t.body[1] / 2, 0] }),
    part(new THREE.ConeGeometry(t.roof.radius, t.roof.height, t.roof.segments), spec.roof ?? pal(palette, 'roofRed', '#C84B3A'), {
      pos: [0, t.body[1] + t.roof.height / 2, 0],
      rotY: t.roof.rotY,
    }),
    part(box(...t.door), pal(palette, 'wood', '#7A5230'), { pos: [0, t.door[1] / 2, t.body[2] / 2 + 0.01] }),
  ])]
}

/** pokecenter: cuerpo blanco, techo rojo, puerta y cartel con cruz. */
export function pokecenterParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.pokecenter
  const white = pal(palette, 'snow', '#F4F7FA')
  const front = t.body[2] / 2
  return [mergeParts([
    part(box(...t.body), spec.wall ?? white, { pos: [0, t.body[1] / 2, 0] }),
    part(box(...t.roof), t.roofColor, { pos: [0, t.body[1] + t.roof[1] / 2, 0] }),
    part(box(...t.door), pal(palette, 'wood', '#7A5230'), { pos: [0, t.door[1] / 2, front + 0.01] }),
    part(box(t.cross.arm[1], t.cross.arm[0], t.cross.arm[2]), t.roofColor, {
      pos: [0, t.cross.lift, front + 0.02],
    }),
    part(box(t.cross.arm[0], t.cross.arm[1], t.cross.arm[2]), t.roofColor, {
      pos: [0, t.cross.lift, front + 0.02],
    }),
  ])]
}

/** market: mostrador + toldo de listones alternados + 2 postes. */
export function marketParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.market
  const wood = pal(palette, 'wood', '#7A5230')
  const white = pal(palette, 'snow', '#F4F7FA')
  const yellow = '#F2C230'
  const parts: PiecePart[] = [
    part(box(...t.counter), wood, { pos: [0, t.counter[1] / 2, 0.1] }),
  ]
  for (let index = 0; index < t.slats; index += 1) {
    const x = -((t.slats - 1) / 2) * (t.slat[0] + 0.015) + index * (t.slat[0] + 0.015)
    parts.push(part(box(...t.slat), index % 2 === 0 ? yellow : white, {
      pos: [x, t.post.height, -0.06],
      rotX: t.tilt,
    }))
  }
  parts.push(
    part(cyl(t.post.radius, t.post.height), wood, { pos: [-t.counter[0] / 2 + 0.05, t.post.height / 2, -0.1] }),
    part(cyl(t.post.radius, t.post.height), wood, { pos: [t.counter[0] / 2 - 0.05, t.post.height / 2, -0.1] }),
  )
  return [mergeParts(parts)]
}

/** lab (Oak): caja gris clara, techo plano, antena y cartel. */
export function labParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.lab
  const gray = pal(palette, 'rock', '#8C8577')
  return [mergeParts([
    part(box(...t.body), spec.wall ?? gray, { pos: [0, t.body[1] / 2, 0] }),
    part(box(...t.roof), t.roofColor, { pos: [0, t.body[1] + t.roof[1] / 2, 0] }),
    part(cyl(t.antenna.radius, t.antenna.height, 6), gray, {
      pos: [t.body[0] / 2 - 0.15, t.body[1] + t.roof[1] + t.antenna.height / 2, t.body[2] / 2 - 0.15],
    }),
    part(box(...t.sign), pal(palette, 'wood', '#7A5230'), { pos: [0, t.body[1] * 0.7, t.body[2] / 2 + 0.01] }),
  ])]
}

/** gym: caja con techo con borde y bandera del color del líder (flagFromLeader). */
export function gymParts(spec: PieceSpec, palette: PiecePalette): PiecePart[] {
  const t = BOARD3D.decor.gym
  const poleX = -t.body[0] / 2 + 0.08
  const poleBase = t.body[1] + t.roof[1]
  const flagColor = spec.flag ?? BOARD3D.nodeColors.gym
  return [mergeParts([
    part(box(...t.body), spec.wall ?? pal(palette, 'wall', '#EADBB8'), { pos: [0, t.body[1] / 2, 0] }),
    part(box(...t.roof), spec.roof ?? pal(palette, 'roofRed', '#C84B3A'), { pos: [0, t.body[1] + t.roof[1] / 2, 0] }),
    part(cyl(t.flag.pole.radius, t.flag.pole.height, 6), pal(palette, 'wood', '#7A5230'), {
      pos: [poleX, poleBase + t.flag.pole.height / 2, -t.body[2] / 2 + 0.1],
    }),
    part(new THREE.PlaneGeometry(t.flag.plane[0], t.flag.plane[1]), flagColor, {
      pos: [poleX + t.flag.plane[0] / 2, poleBase + t.flag.pole.height - t.flag.plane[1] / 2, -t.body[2] / 2 + 0.1],
    }),
  ])]
}
