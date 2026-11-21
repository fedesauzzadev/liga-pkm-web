// AC: SPEC-D/T-032d/AC-1 - la vista coreografiada monta dentro del chunk de
// combate; en SSR (antes del encuentro) muestra el placeholder sin romper.
import { renderToString } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import type { GameEvent } from '@liga/engine'
import { cardOf } from '../game/content'
import { demoBattleScript, demoChoreoDeps } from './demo'
import { DIE_ROLL_SETTLE_MS, dieRollWaitMs, rollDurationMs } from './dieTiming'
import { BattleChoreographer } from './choreo/BattleChoreographer'
import { createStage } from './choreo/stage'
import { resumeStage } from './choreo/resume'
import { fixedChoreoDeps, restoredWildBattleSession } from './choreo/resume.fixtures'
import { ChoreographedBattle, eventsToPlay, playQueue, visualsOf } from './ChoreographedBattle'

test('SSR sin encuentro: placeholder de espera, sin escena aún', () => {
  const html = renderToString(
    <ChoreographedBattle deps={demoChoreoDeps} script={demoBattleScript.slice(0, 0)} />,
  )
  expect(html).toContain('data-battle-wait')
})

// AC: fix-combate-refresco/AC-1 - guion vacío + stage inicial de reanudación:
// la escena monta YA con los PKM y su daño actual (sin placeholder congelado).
test('AC: fix-combate-refresco/AC-1 - initialStage monta la escena reanudada con guion vacío', () => {
  const session = restoredWildBattleSession()
  const battle = session.state.battle!
  const stage = resumeStage(session.state, fixedChoreoDeps(session.state))
  if (stage === null) throw new Error('resumeStage devolvió null con batalla viva')
  const html = renderToString(
    <ChoreographedBattle deps={fixedChoreoDeps(session.state)} script={[]} initialStage={stage} />,
  )
  expect(html).not.toContain('data-battle-wait')
  expect(html).toContain('Abra')
  const rival = battle.rival.find((candidate) => candidate.uid === battle.active[1]) ?? battle.rival[0]!
  const rivalHp = cardOf(rival.cardId)?.hp ?? 0
  expect(html).toContain(`data-hp="${String(rivalHp - rival.damage)}/${String(rivalHp)}"`)
})

// AC: fix-combate-refresco/AC-2 - el coreógrafo sigue parcheando sobre el
// stage reanudado: los eventos NUEVOS (post-restore) actualizan la escena.
test('AC: fix-combate-refresco/AC-2 - eventos nuevos parchean sobre el stage reanudado', async () => {
  const session = restoredWildBattleSession()
  const deps = fixedChoreoDeps(session.state)
  const stage = resumeStage(session.state, deps)!
  const choreo = new BattleChoreographer({ deps, initialStage: stage, speed: 'skip' })
  expect(choreo.stage.rival?.damage).toBe(stage.rival?.damage)
  await choreo.play({ type: 'DamageTaken', pkmUid: stage.rival!.uid, amount: 10, cause: 'attack' })
  expect(choreo.stage.rival?.damage).toBe(stage.rival!.damage + 10)
})

test('la vista se resuelve vía import() dinámico junto a la escena (chunk de combate)', async () => {
  const mod = await import('./ChoreographedBattle')
  expect(typeof mod.ChoreographedBattle).toBe('function')
})

// AC: SPEC-I/T-075/AC-2 - el popup alimenta la escena por incrementos: cada
// comando nuevo agrega eventos sin repetir los ya reproducidos.
test('AC: SPEC-I/T-075/AC-2 - eventsToPlay: solo la cola no reproducida del script', () => {
  const script: readonly GameEvent[] = [
    { type: 'TurnAdvanced', turn: 2 },
    { type: 'DieRolled', purpose: 'move', value: 3 },
  ]
  expect(eventsToPlay(script, 0)).toEqual(script)
  expect(eventsToPlay(script, 1)).toEqual([{ type: 'DieRolled', purpose: 'move', value: 3 }])
  expect(eventsToPlay(script, script.length)).toEqual([])
})

// AC: sync-estado-combate/AC-6 - la tirada de dado de combate es legible a 1x:
// la coreografía espera la duración REAL de la tirada (dieTiming, misma fórmula
// y seed que el dado en pantalla) — el evento no termina antes de que el dado
// termine de rodar, así ningún evento posterior se le adelanta.
test('AC: sync-estado-combate/AC-6 - el dado de combate rueda legible a 1x (espera la duración real)', async () => {
  vi.useFakeTimers()
  try {
    const choreo = new BattleChoreographer({ deps: demoChoreoDeps, speed: '1x' })
    const waitMs = dieRollWaitMs(1, '1x', false)
    expect(waitMs).toBeGreaterThanOrEqual(rollDurationMs(1, '1x') + DIE_ROLL_SETTLE_MS)
    let done = false
    const run = choreo
      .play({ type: 'DieRolled', purpose: 'effect', value: 5 })
      .then(() => {
        done = true
      })
    await vi.advanceTimersByTimeAsync(waitMs - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await run
    expect(done).toBe(true)
  } finally {
    vi.useRealTimers()
  }
})

// AC: fin-de-combate/AC-1 - onPlayed avanza un evento por vez: mientras corre
// la coreografía del golpe final, el progreso NO cubre el guion completo (el
// overlay de resultado espera; Timing usa setTimeout ⇒ fake timers).
test('AC: fin-de-combate/AC-1 - playQueue: a mitad de la coreografía el progreso no llegó al final', async () => {
  vi.useFakeTimers()
  try {
    const choreo = new BattleChoreographer({ deps: demoChoreoDeps, speed: '1x' })
    const progress: number[] = []
    const done = playQueue(choreo, demoBattleScript, 0, () => true, (played) => {
      progress.push(played)
    })
    await vi.advanceTimersByTimeAsync(1)
    expect(progress.at(-1) ?? 0).toBeLessThan(demoBattleScript.length)
    await vi.runAllTimersAsync()
    expect(await done).toBe(demoBattleScript.length)
    // Un onPlayed por evento, estrictamente creciente hasta el final.
    expect(progress.length).toBe(demoBattleScript.length)
    expect(progress.at(-1)).toBe(demoBattleScript.length)
    expect(progress.every((played, index) => played === index + 1)).toBe(true)
  } finally {
    vi.useRealTimers()
  }
})

// AC: fin-de-combate/AC-2 - con speed="skip" la reproducción es instantánea:
// el progreso llega al final sin avanzar el reloj ⇒ overlay inmediato.
test('AC: fin-de-combate/AC-2 - playQueue con skip: progreso completo sin esperar el reloj', async () => {
  vi.useFakeTimers()
  try {
    const choreo = new BattleChoreographer({ deps: demoChoreoDeps, speed: 'skip' })
    const progress: number[] = []
    const final = await playQueue(choreo, demoBattleScript, 0, () => true, (played) => {
      progress.push(played)
    })
    expect(final).toBe(demoBattleScript.length)
    expect(progress.at(-1)).toBe(demoBattleScript.length)
  } finally {
    vi.useRealTimers()
  }
})

// AC: dado-de-combate/AC-1 + rediseno-combate-max/AC-2 - el visual del stage
// pasa a la escena: la tirada alimenta el dado del lado que juega con nonce
// (fuerza rodar aunque el valor repita) y contador de encadenadas.
test('AC: rediseno-combate-max/AC-2 - visualsOf mapea dieValue/dieSide/nonce/chain al dado de la escena', async () => {
  vi.useFakeTimers()
  try {
    const choreo = new BattleChoreographer({ deps: demoChoreoDeps, speed: '1x' })
    expect(visualsOf(createStage()).die).toBeNull()
    const run = choreo.play({ type: 'DieRolled', purpose: 'effect', value: 2 })
    await vi.advanceTimersByTimeAsync(120_000)
    await run
    expect(visualsOf(choreo.stage).die).toEqual({
      value: 2,
      purpose: 'effect',
      side: 'player',
      nonce: 1,
      chain: 1,
    })
    const chained = choreo.play({ type: 'DieRolled', purpose: 'bonus', value: 2 })
    await vi.advanceTimersByTimeAsync(120_000)
    await chained
    expect(visualsOf(choreo.stage).die).toEqual({
      value: 2,
      purpose: 'bonus',
      side: 'player',
      nonce: 2,
      chain: 2,
    })
  } finally {
    vi.useRealTimers()
  }
})
