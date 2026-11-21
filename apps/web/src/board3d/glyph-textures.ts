// Texturas de glifos (SPEC-H/T-067/AC-2): una CanvasTexture 128×128 por glifo,
// creada UNA sola vez y cacheada a nivel módulo (AC-6) — sobrevive a remontes
// del tablero (StrictMode). Runtime puro: usa document (patrón Die3D); los
// tests la verifican con un stub de canvas.
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { paintGlyph, type GlyphId } from './glyph'

const cache = new Map<GlyphId, THREE.Texture>()

/** AC-2/AC-6: textura del glifo, cacheada (la primera llamada la crea). */
export function makeGlyphTexture(id: GlyphId): THREE.Texture {
  const hit = cache.get(id)
  if (hit !== undefined) return hit
  const px = BOARD3D.glyph.px
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (ctx !== null) {
    paintGlyph(ctx, id, px, BOARD3D.glyph.ink, BOARD3D.node.stoneColor)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  cache.set(id, texture)
  return texture
}
