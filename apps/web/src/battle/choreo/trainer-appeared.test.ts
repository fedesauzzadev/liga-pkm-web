// AC: fix-sprites-lideres-gimnasio/AC-3, AC-5 — aparición del líder en combate
// de gimnasio: el mensaje usa el nombre real del líder (leaderNameOf resuelto
// desde content/gyms.json; sin dep cae al id, nunca " aparece.") y RivalSentOut
// retira al líder (trainerAppeared → null, no queda pegado todo el combate).
import { parseCardId, parsePlayerId } from '@liga/content'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { BattleChoreoDeps } from './stage'
import { createHarness, playAll, testDeps, uids } from './testkit'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const gymDeps: BattleChoreoDeps = {
  ...testDeps,
  leaderNameOf: (leaderId) => (leaderId === 'misty' ? 'Misty' : undefined),
}

const gymStart = [
  { type: 'TrainerAppeared', trainerId: 'misty' },
  {
    type: 'BattleStarted',
    player: parsePlayerId('p1'),
    kind: 'gym',
    rival: parseCardId('poliwag'),
    active: uids.squirtle,
  },
] as const

// AC: fix-sprites-lideres-gimnasio/AC-5 - el mensaje de aparición muestra el
// nombre real del líder y nunca queda vacío (" aparece.").
test('AC: fix-sprites-lideres-gimnasio/AC-5 - el mensaje de aparición usa el nombre del líder', async () => {
  const h = createHarness({ deps: gymDeps })
  await playAll(h.choreo, gymStart)
  expect(h.stages.some((stage) => stage.message === 'Misty aparece.')).toBe(true)
  expect(h.stages.some((stage) => stage.message === ' aparece.')).toBe(false)
  // Sin leaderNameOf (id desconocido): cae al id del líder, nunca vacío.
  await playAll(h.choreo, [{ type: 'TrainerAppeared', trainerId: 'brock' }])
  expect(h.choreo.stage.message).toBe('brock aparece.')
})

// AC: fix-sprites-lideres-gimnasio/AC-3 - el líder se ve con su pokémon tras
// BattleStarted y RivalSentOut (reponer al caído) lo retira de la escena.
test('AC: fix-sprites-lideres-gimnasio/AC-3 - RivalSentOut limpia trainerAppeared', async () => {
  const h = createHarness()
  await playAll(h.choreo, gymStart)
  expect(h.choreo.stage.trainerAppeared).toBe('misty') // visible junto al rival
  expect(h.choreo.stage.rival?.card.id).toBe('poliwag')
  await playAll(h.choreo, [{ type: 'RivalSentOut', pkmUid: uids.tangela }])
  expect(h.choreo.stage.trainerAppeared).toBe(null)
  expect(h.choreo.stage.rival?.card.id).toBe('tangela_erika')
})
