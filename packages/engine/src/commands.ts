// Comandos que la UI envía al motor (SDD §3: la UI nunca muta estado).
// T-011 agrega la máquina de movimiento; T-020 la batalla (SPEC-C).
import type { Element } from '@liga/content'
import type { Decision } from './state.ts'

export type Command =
  /** Stub T-004: el motor avanza solo cuando no hay decisión pendiente (fase `idle`). */
  | { readonly type: 'Advance' }
  /** Stub T-004 de tirada pre-partida; en una partida real se usa `RollMove`. */
  | { readonly type: 'Roll' }
  /** Tira el dado de movimiento desde `organize` (RULES §1) y arranca el movimiento. */
  | { readonly type: 'RollMove' }
  /** Resuelve un `ChoosePath` pendiente eligiendo uno de los caminos ofertados. */
  | { readonly type: 'ChoosePath'; readonly to: string }
  /** Resuelve un `StopOrContinue` frenando en el cuadrado (descarta los pasos restantes). */
  | { readonly type: 'StopHere' }
  /** Resuelve un `StopOrContinue` siguiendo por los pasos restantes. */
  | { readonly type: 'ContinueMoving' }
  /** Resuelve un `FightOrRelease` dejando ir al PKM: la carta vuelve al FONDO del mazo (D-09). */
  | { readonly type: 'ReleaseWild' }
  /** En el casillero del Prof. Oak: intercambia 1 a 1 un PKM del equipo con uno de la pila. */
  | { readonly type: 'SwapWithOak'; readonly teamUid: string; readonly pileUid: string }
  /** T-013: equipa en un PKM propio la carta de elemento `elementId` (solo en `organize`). */
  | { readonly type: 'Equip'; readonly pkmUid: string; readonly elementId: string }
  /** T-013: desequipa la carta `elementId` y vuelve al inventario (solo en `organize`). */
  | { readonly type: 'Unequip'; readonly pkmUid: string; readonly elementId: string }
  /** T-013: asigna/reasigna un comodín al PKM como `element` (solo en `organize`). */
  | { readonly type: 'AssignWildcard'; readonly pkmUid: string; readonly element: Element }
  // ── Batalla (SPEC-C/T-020) ──
  /** Resuelve un `FightOrRelease` peleando con `pkmUid` (sano, D-08) y arranca la batalla. */
  | { readonly type: 'FightEncounter'; readonly pkmUid: string }
  /** Usa una Poción sobre `target` en combate (solo el activo, D-11; no consume el ataque). */
  | { readonly type: 'UsePotion'; readonly pkmUid: string; readonly target: string }
  /** Retira al activo y pone a `to`: limpia estados, pierde el ataque (AC-6). */
  | { readonly type: 'Retire'; readonly to: string }
  /** Ataca con `attackId` (de `legalAttacks`; costos no se consumen, AC-5). */
  | { readonly type: 'Attack'; readonly attackId: string }
  /** Resuelve un `ChooseReplacement`: el lado que repone actúa (D-02). */
  | { readonly type: 'SendOut'; readonly pkmUid: string }
  // ── Progresión (SPEC-C/T-022) ──
  /** Resuelve un `CaptureOrRelease` capturando: gasta 1 Pokebola y el PKM pasa al equipo/pila (AC-3/AC-4). */
  | { readonly type: 'Capture' }
  /** Resuelve un `CaptureOrRelease` liberando: la carta vuelve al FONDO de su mazo (AC-5, D-09). */
  | { readonly type: 'Release' }
  /** Evoluciona `pkmUid` a la carta `toId` si tiene el XP requerido (AC-2, D-04..D-06). */
  | { readonly type: 'Evolve'; readonly pkmUid: string; readonly toId: string }
  // ── Gimnasios (SPEC-C/T-023) ──
  /** Desafía al líder del gimnasio actual con `pkmUid` (opcional, D-17; AC-1). */
  | { readonly type: 'AcceptGymChallenge'; readonly pkmUid: string }

/** ¿El comando resuelve la decisión pendiente? (sino aplica PENDING_DECISION). */
export function resolvesPending(command: Command, pending: Decision): boolean {
  switch (pending.type) {
    case 'ChoosePath':
      return command.type === 'ChoosePath'
    case 'StopOrContinue':
      return command.type === 'StopHere' || command.type === 'ContinueMoving'
    case 'FightOrRelease':
      return command.type === 'ReleaseWild' || command.type === 'FightEncounter'
    case 'ChooseReplacement':
      return command.type === 'SendOut'
    case 'CaptureOrRelease':
      return command.type === 'Capture' || command.type === 'Release'
    // Decisiones que todavía no tienen comandos que las resuelvan:
    case 'ChooseAttack':
      return false
  }
}
