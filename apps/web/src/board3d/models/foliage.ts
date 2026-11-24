// Paleta Kenney → paleta del juego. El nature-kit trae un verde turquesa
// (tono ~160°: los árboles parecían cristales celestes), roca salmón y trigo
// casi blanco; acá se corren al verde hoja, a piedra parda y a dorado.
// Idempotente: un color ya corregido cae fuera del rango que lo dispara.
import * as THREE from 'three'

const TEAL: readonly [number, number] = [0.37, 0.53]
const WHEAT = ['#E2BE55', '#F0D77E'] as const
const hsl = { h: 0, s: 0, l: 0 }

export function naturalizeFoliage(materials: readonly THREE.Material[], kind: string): void {
  for (const material of materials) {
    const color = (material as THREE.Material & { color?: THREE.Color }).color
    if (color === undefined) continue
    color.getHSL(hsl)
    if (hsl.h >= TEAL[0] && hsl.h <= TEAL[1]) {
      color.setHSL(0.29 + (hsl.h - TEAL[0]) * 0.25, hsl.s * 0.8, hsl.l * 0.85)
      continue
    }
    // Roca y trigo se miden en sRGB (el tono turquesa ya se midió en lineal).
    color.getHSL(hsl, THREE.SRGBColorSpace)
    if (kind === 'rock' && hsl.h < 0.12 && hsl.s > 0.4 && hsl.l > 0.6) {
      color.setHSL(hsl.h, 0.16, hsl.l * 0.72, THREE.SRGBColorSpace)
    } else if (kind === 'grassTuft' && hsl.l > 0.9) {
      color.set(hsl.s > 0.1 ? WHEAT[0] : WHEAT[1])
    }
  }
}
