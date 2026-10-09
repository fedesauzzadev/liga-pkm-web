// Registro del adaptador (Strategy + Registry): un archivo <id>.ts por movimiento y una
// entrada acá; sin switch gigante (ENGINEERING-STANDARDS §1).
import { bubble } from './bubble.ts'
import { doubleslap } from './doubleslap.ts'
import { flamethrower } from './flamethrower.ts'
import { scratch } from './scratch.ts'
import type { ShowdownMoveAnim } from './shim.ts'
import { thunderbolt } from './thunderbolt.ts'
import { vinewhip } from './vinewhip.ts'

export type { ShowdownMoveAnim } from './shim.ts'

export const SPIKE_MOVE_IDS = ['bubble', 'flamethrower', 'scratch', 'vinewhip', 'thunderbolt', 'doubleslap'] as const

export const showdownFx: ReadonlyMap<string, ShowdownMoveAnim> = new Map<string, ShowdownMoveAnim>([
  ['bubble', bubble],
  ['flamethrower', flamethrower],
  ['scratch', scratch],
  ['vinewhip', vinewhip],
  ['thunderbolt', thunderbolt],
  ['doubleslap', doubleslap],
])
