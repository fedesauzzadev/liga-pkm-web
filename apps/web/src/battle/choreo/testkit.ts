// Kit de prueba de la coreografía (SPEC-D/T-032d): coreógrafo con puertos fake
// (FX sin DOM) + grabador de estados para verificar orden con temporizadores falsos.
import { vi } from 'vitest'
import { parseCardId, parsePkmUid, PokemonCardSchema, type PokemonCard } from '@liga/content'
import type { PkmUid } from '@liga/content'
import type { GameEvent } from '@liga/engine'
import type { PlaybackSpeed } from '../../events/anim.config'
import samples from '../../../../../content/pokemon/_samples.json'
import { BattleChoreographer } from './BattleChoreographer'
import type { BattleChoreoDeps, BattleStage, ChoreoActorInput } from './stage'

export interface FxPortCall {
  readonly moveId: string | null
  readonly side: 'player' | 'rival'
  /** Lado que recibe el golpe (selfHit ⇒ el propio atacante, AC-4). */
  readonly target: 'player' | 'rival'
}

export interface Harness {
  readonly choreo: BattleChoreographer
  readonly stages: readonly BattleStage[]
  readonly fx: readonly FxPortCall[]
  readonly trace: () => string[]
}

const sampleCards: readonly PokemonCard[] = (samples as { cards: unknown[] }).cards.map((card) =>
  PokemonCardSchema.parse(card),
)

const wartortle: PokemonCard = PokemonCardSchema.parse({
  id: 'wartortle',
  dex: 8,
  name: 'Wartortle',
  stage: 'evolution',
  deck: 'isla',
  hp: 80,
  element: 'water',
  attacks: sampleCards[0]?.attacks ?? [],
  specialties: [],
  evolvesTo: [],
  source: { verified: true },
})

export const cardMap: ReadonlyMap<string, PokemonCard> = new Map(
  [...sampleCards, wartortle].map((card) => [card.id, card]),
)

export const uids = {
  squirtle: parsePkmUid('p-squirtle'),
  charmander: parsePkmUid('p-charmander'),
  poliwag: parsePkmUid('r-poliwag'),
  tangela: parsePkmUid('r-tangela'),
} satisfies Record<string, PkmUid>

const inputs: readonly ChoreoActorInput[] = [
  { uid: uids.squirtle, cardId: parseCardId('squirtle'), damage: 0 },
  { uid: uids.charmander, cardId: parseCardId('charmander'), damage: 10 },
  { uid: uids.poliwag, cardId: parseCardId('poliwag'), damage: 0 },
  { uid: uids.tangela, cardId: parseCardId('tangela_erika'), damage: 0 },
]

export const testDeps: BattleChoreoDeps = {
  cardOf: (cardId) => cardMap.get(cardId),
  actorOf: (uid) => inputs.find((input) => input.uid === uid),
  rivalEntry: () => inputs[2],
}

const sideLabel = (stage: BattleStage, uid: string): string =>
  stage.player?.uid === uid ? 'player' : stage.rival?.uid === uid ? 'rival' : uid

const traceOf = (stage: BattleStage): string =>
  JSON.stringify({
    st: stage.started,
    kd: stage.kind,
    sw: stage.sweep,
    en: stage.entrance,
    ra: stage.raised,
    bl: stage.blink,
    fl: stage.floaters.map((floater) => `${sideLabel(stage, floater.uid)}:${floater.text}`),
    fs: stage.flash,
    cp: stage.capture,
    ev: stage.evolve,
    di: stage.attackSelectValue,
    dp: stage.diePurpose,
    dv: stage.dieValue,
    ed: stage.ended,
    pc: stage.player === null ? null : { c: stage.player.card.id, d: stage.player.damage, f: stage.player.fainted },
    rc: stage.rival === null ? null : { c: stage.rival.card.id, d: stage.rival.damage, f: stage.rival.fainted },
    ms: stage.message,
  })

export function createHarness(options?: {
  readonly speed?: PlaybackSpeed
  readonly reducedMotion?: boolean
  /** combate-legible/AC-5: deps propias (guion real del motor); default testDeps. */
  readonly deps?: BattleChoreoDeps
}): Harness {
  const stages: BattleStage[] = []
  const fx: FxPortCall[] = []
  const choreo = new BattleChoreographer({
    deps: options?.deps ?? testDeps,
    speed: options?.speed ?? '1x',
    reducedMotion: options?.reducedMotion ?? false,
    fxPort: (attack, side, target) => {
      fx.push({ moveId: attack.officialMove ?? null, side, target })
      return Promise.resolve()
    },
    onStage: (stage) => {
      stages.push(stage)
    },
  })
  return { choreo, stages, fx, trace: () => states2Trace(stages) }
}

const states2Trace = (stages: readonly BattleStage[]): string[] => stages.map(traceOf)

/** Reproduce eventos avanzando el reloj falso hasta agotar cada animación. */
export async function playAll(choreo: BattleChoreographer, events: readonly GameEvent[]): Promise<void> {
  for (const event of events) {
    const run = choreo.play(event)
    await vi.advanceTimersByTimeAsync(120_000)
    await run
  }
}

/** Bandera para verificar que una promesa de animación aún no resolvió. */
export function resolution(promise: Promise<void>): { isDone: () => boolean } {
  let done = false
  void promise.then(
    () => {
      done = true
    },
    () => {
      done = true
    },
  )
  return { isDone: () => done }
}
