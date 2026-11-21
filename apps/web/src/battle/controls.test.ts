// AC: rediseno-combate-max/AC-6 - modelo puro de pestañas y acciones:
// botones de ataque (4 slots, mismo orden que la carta), cambiar (debilitados
// con "Debilitado"), mochila (usable ahora + motivos) y el comando que
// "Aceptar" despacha por selección. La legalidad la dicta el motor (ADR-1).
import { parseCardId, parsePkmUid } from '@liga/content'
import type { Command, PkmInstance } from '@liga/engine'
import { expect, test } from 'vitest'
import { demoCards } from './demo'
import { es } from '../i18n/es'
import { attackRows } from './model'
import {
  attackOptions,
  bagOptions,
  commandOfSelection,
  switchOptions,
  type BagContext,
  type TeamPkmView,
} from './controls'

const squirtle: PkmInstance = {
  uid: parsePkmUid('p-demo'),
  cardId: parseCardId('squirtle'),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
}

test('AC: rediseno-combate-max/AC-6 - attackOptions: 4 slots fijos, mismo orden que la carta, vacíos deshabilitados', () => {
  const rows = attackRows(demoCards.squirtle, squirtle, false)
  const options = attackOptions(rows, squirtle)
  expect(options.length).toBe(4)
  expect(options[0]!.testid).toBe('btn-attack-1')
  expect(options[3]!.attack).toBeNull() // Squirtle tiene 3: el 4.º va vacío
  expect(options.slice(0, 3).map((option) => option.attack?.id)).toEqual(
    demoCards.squirtle.attacks.map((attack) => attack.id),
  )
})

test('AC: rediseno-combate-max/AC-6 - ataque ilegal por costo: motivo "Faltan 2 Agua" en la opción', () => {
  const rows = attackRows(demoCards.squirtle, squirtle, false) // sin equipo: todo por costo
  const options = attackOptions(rows, squirtle)
  const burbujas = options.find((option) => option.attack?.id === 'burbujas')!
  expect(burbujas.legal).toBe(false)
  expect(burbujas.reason).toBe(
    es.modalMissingCostPlural.replace('{n}', '2').replace('{element}', es.elementNames.water),
  )
})

test('AC: rediseno-combate-max/AC-6 - switchOptions: banca sin el activo; debilitado con "Debilitado"', () => {
  const A = parsePkmUid('p1-a')
  const B = parsePkmUid('p1-b')
  const C = parsePkmUid('p1-c')
  const team: readonly TeamPkmView[] = [
    { uid: A, name: 'Squirtle', hpMax: 60, damage: 0, fainted: false },
    { uid: B, name: 'Weedle', hpMax: 40, damage: 40, fainted: true },
    { uid: C, name: 'Poliwag', hpMax: 50, damage: 10, fainted: false },
  ]
  const legal: readonly Command[] = [{ type: 'Retire', to: C }]
  const options = switchOptions(team, A, legal)
  expect(options.map((option) => option.uid)).toEqual([B, C])
  const weedle = options[0]!
  expect(weedle.fainted).toBe(true)
  expect(weedle.reason).toBe(es.battleSwitchFainted)
  expect(weedle.legal).toBe(false)
  expect(weedle.testid).toBe('btn-switch-' + String(B))
  expect(options[1]!.hp).toBe('40/50')
  expect(options[1]!.legal).toBe(true)
})

// ── reemplazo-tras-desmayo: con el activo caído el motor ofrece SendOut, no Retire ──

// AC: reemplazo-tras-desmayo/AC-2 — cada opción de banca SANA sale legal con
// comandos SendOut y "Aceptar" despacha `{ type: 'SendOut', pkmUid }` (antes
// solo se reconocía Retire: no se podía aceptar el reemplazo).
test('AC: reemplazo-tras-desmayo/AC-2 - la banca sana queda legal con SendOut y Aceptar lo despacha', () => {
  const A = parsePkmUid('p1-a')
  const B = parsePkmUid('p1-b')
  const C = parsePkmUid('p1-c')
  const team: readonly TeamPkmView[] = [
    { uid: A, name: 'Charmander', hpMax: 60, damage: 60, fainted: true },
    { uid: B, name: 'Weedle', hpMax: 40, damage: 0, fainted: false },
    { uid: C, name: 'Poliwag', hpMax: 50, damage: 10, fainted: false },
  ]
  const legal: readonly Command[] = [
    { type: 'SendOut', pkmUid: B },
    { type: 'SendOut', pkmUid: C },
  ]
  const options = switchOptions(team, A, legal)
  expect(options.every((option) => option.legal)).toBe(true)
  expect(commandOfSelection({ kind: 'switch', uid: C }, legal)).toEqual({
    type: 'SendOut',
    pkmUid: C,
  })
  // Fuera del reemplazo pendiente (solo Retire) el mapeo sigue igual (AC-6).
  expect(commandOfSelection({ kind: 'switch', uid: C }, [{ type: 'Retire', to: C }])).toEqual({
    type: 'Retire',
    to: C,
  })
})

// AC: reemplazo-tras-desmayo/AC-3 — los derrotados de la banca siguen
// deshabilitados con motivo "Debilitado": no se puede reponer con un muerto,
// ni siquiera si un comando corrupto los incluyera.
test('AC: reemplazo-tras-desmayo/AC-3 - un derrotado de la banca queda deshabilitado con "Debilitado"', () => {
  const A = parsePkmUid('p1-a')
  const B = parsePkmUid('p1-b')
  const C = parsePkmUid('p1-c')
  const team: readonly TeamPkmView[] = [
    { uid: A, name: 'Charmander', hpMax: 60, damage: 60, fainted: true },
    { uid: B, name: 'Weedle', hpMax: 40, damage: 40, fainted: true },
    { uid: C, name: 'Poliwag', hpMax: 50, damage: 10, fainted: false },
  ]
  const legal: readonly Command[] = [
    { type: 'SendOut', pkmUid: B },
    { type: 'SendOut', pkmUid: C },
  ]
  const options = switchOptions(team, A, legal)
  const weedle = options.find((option) => option.uid === B)!
  expect(weedle.legal).toBe(false)
  expect(weedle.reason).toBe(es.battleSwitchFainted)
  // El sano de la lista sigue elegible.
  expect(options.find((option) => option.uid === C)!.legal).toBe(true)
})

function bagCtx(overrides: Partial<BagContext> = {}): BagContext {
  return {
    items: { potion: 1, super_potion: 0, ultraball: 1, masterball: 1 },
    legal: [],
    battleKind: 'wild',
    rivalRemainingHp: 50,
    activeDamaged: true,
    capture: {
      ultraball: { timing: 'duringBattle', maxRemainingHp: 40 },
      masterball: { timing: 'duringBattle' },
    },
    ...overrides,
  }
}

test('AC: rediseno-combate-max/AC-6 - bagOptions: pociones y bolas legales habilitadas con su comando', () => {
  const uid = parsePkmUid('p1-a')
  const legal: readonly Command[] = [
    { type: 'UsePotion', pkmUid: uid, target: uid },
    { type: 'ThrowBall', ball: 'masterball' },
  ]
  const options = bagOptions(bagCtx({ legal }))
  const potion = options.find((option) => option.id === 'potion')!
  expect(potion.legal).toBe(true)
  expect(potion.command).toEqual(legal[0])
  expect(potion.testid).toBe('btn-item-potion')
  const master = options.find((option) => option.id === 'masterball')!
  expect(master.legal).toBe(true)
})

test('AC: rediseno-combate-max/AC-6 - bagOptions: no usables deshabilitados con el motivo', () => {
  const options = bagOptions(bagCtx({ legal: [] }))
  // Ultra con vida del rival > 40 ⇒ "ball-hp".
  const ultra = options.find((option) => option.id === 'ultraball')!
  expect(ultra.legal).toBe(false)
  expect(ultra.reason).toBe(es.backpackReasons['ball-hp'])
  // Gym ⇒ las bolas no capturan (ball-gym).
  const gym = bagOptions(bagCtx({ legal: [], battleKind: 'gym' }))
  expect(gym.find((option) => option.id === 'masterball')!.reason).toBe(es.backpackReasons['ball-gym'])
  // Poción con el activo sano ⇒ "no tiene daño que curar".
  const healthy = bagOptions(bagCtx({ legal: [], activeDamaged: false }))
  expect(healthy.find((option) => option.id === 'potion')!.reason).toBe(es.backpackReasons['no-damage'])
  // Sin ítems ⇒ lista vacía (la UI muestra "No tenés objetos para usar.").
  expect(bagOptions(bagCtx({ items: { potion: 0, super_potion: 0, ultraball: 0, masterball: 0 } }))).toEqual([])
})

test('AC: rediseno-combate-max/AC-6 - commandOfSelection mapea Aceptar al comando legal correspondiente', () => {
  const uid = parsePkmUid('p1-a')
  const to = parsePkmUid('p1-c')
  const legal: readonly Command[] = [
    { type: 'Attack', attackId: 'cabezazo' },
    { type: 'Retire', to },
    { type: 'UsePotion', pkmUid: uid, target: uid },
    { type: 'ThrowBall', ball: 'ultraball' },
    { type: 'Release' },
  ]
  expect(commandOfSelection({ kind: 'attack', attackId: 'cabezazo' }, legal)).toEqual({ type: 'Attack', attackId: 'cabezazo' })
  expect(commandOfSelection({ kind: 'switch', uid: to }, legal)).toEqual({ type: 'Retire', to })
  expect(commandOfSelection({ kind: 'item', id: 'potion' }, legal)).toEqual(legal[2])
  expect(commandOfSelection({ kind: 'item', id: 'ultraball' }, legal)).toEqual(legal[3])
  expect(commandOfSelection({ kind: 'release' }, legal)).toEqual({ type: 'Release' })
  // Ilegal o sin selección ⇒ Aceptar deshabilitado.
  expect(commandOfSelection({ kind: 'attack', attackId: 'no-existe' }, legal)).toBeNull()
  expect(commandOfSelection(null, legal)).toBeNull()
  expect(commandOfSelection({ kind: 'release' }, [])).toBeNull()
})
