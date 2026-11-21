// Registro del adaptador (Strategy + Registry): un archivo <id>.ts por movimiento y una
// entrada acá; sin switch gigante (ENGINEERING-STANDARDS §1). Los ids son los de PS
// (`doubleslap`); el adaptador normaliza los de PokeAPI (`double-slap`).
import { absorb } from './absorb.ts'
import { bubble } from './bubble.ts'
import { doubleslap } from './doubleslap.ts'
import { firespin } from './firespin.ts'
import { flamethrower } from './flamethrower.ts'
import { headbutt } from './headbutt.ts'
import { scratch } from './scratch.ts'
import type { ShowdownMoveAnim } from './shim.ts'
import { stunspore } from './stunspore.ts'
import { tackle } from './tackle.ts'
import { thunderbolt } from './thunderbolt.ts'
import { vinewhip } from './vinewhip.ts'
import { withdraw } from './withdraw.ts'

export type { ShowdownMoveAnim } from './shim.ts'

export const SPIKE_MOVE_IDS = ['bubble', 'flamethrower', 'scratch', 'vinewhip', 'thunderbolt', 'doubleslap'] as const

/** Todos los movimientos portados (spike T-032c0 + portado T-032c2). */
export const SHOWDOWN_MOVE_IDS = [
  ...SPIKE_MOVE_IDS,
  'tackle',
  'headbutt',
  'withdraw',
  'firespin',
  'stunspore',
  'absorb',
] as const

export type ShowdownMoveId = (typeof SHOWDOWN_MOVE_IDS)[number]

export const showdownFx: ReadonlyMap<string, ShowdownMoveAnim> = new Map<string, ShowdownMoveAnim>([
  ['bubble', bubble],
  ['flamethrower', flamethrower],
  ['scratch', scratch],
  ['vinewhip', vinewhip],
  ['thunderbolt', thunderbolt],
  ['doubleslap', doubleslap],
  ['tackle', tackle],
  ['headbutt', headbutt],
  ['withdraw', withdraw],
  ['firespin', firespin],
  ['stunspore', stunspore],
  ['absorb', absorb],
])

/** Assets que requiere cada movimiento (AC-3 T-032c2): si falta alguno, el
 * adaptador devuelve `false` y `playMoveFx` cae al arquetipo sin error. */
export const showdownMoveAssets: Readonly<Record<string, readonly string[]>> = {
  bubble: ['iceball'],
  flamethrower: ['fireball'],
  scratch: ['rightslash'],
  vinewhip: ['energyball', 'leaf1', 'leaf2'],
  thunderbolt: ['lightning'],
  doubleslap: ['wisp'],
  tackle: [],
  headbutt: [],
  withdraw: ['shell'],
  firespin: ['fireball'],
  stunspore: ['purplewisp'],
  absorb: ['energyball'],
}
