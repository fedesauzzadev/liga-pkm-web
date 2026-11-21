// Bandera de gimnasio por líder (SPEC-H/T-068/AC-2): gyms.json mapea ciudad →
// medalla; el color vive en theme §decor.medalColors. Validado con Zod en la
// frontera (patrón stacks.ts); solo lo consume el chunk 3D.
import { GymsFileSchema } from '@liga/content'
import gymsJson from '../../../../content/gyms.json'
import { BOARD3D } from '../theme/board3d'

const parsed = GymsFileSchema.parse(gymsJson)

/** Medalla del líder de la ciudad (nodo) o undefined si no hay gimnasio. */
export function medalOfCity(nodeId: string): string | undefined {
  const leader = Object.values(parsed.leaders).find((entry) => entry.city === nodeId)
  return leader?.medal
}

/** Color de bandera del líder del gimnasio `nodeId` (default: color gym). */
export function leaderFlagColor(nodeId: string): string {
  const medal = medalOfCity(nodeId)
  if (medal === undefined) return BOARD3D.nodeColors.gym
  const colors = BOARD3D.decor.medalColors
  return colors[medal as keyof typeof colors] ?? BOARD3D.nodeColors.gym
}
