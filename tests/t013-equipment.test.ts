// AC: SPEC-B/T-013 — Equipamiento, costos, inventario: Equip/Unequip/AssignMulticolor,
// canUse (costos por ataque) y legalAttacks (regla de primer ataque). Un test por AC.
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Attack, CostSlot } from '../packages/content/src/cards.ts'
import type { Element } from '../packages/content/src/index.ts'
import { parseCardId, parsePkmUid } from '../packages/content/src/ids.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  canAssignMulticolor,
  canUse,
  EngineError,
  legalAttacks,
  legalCommands,
  newGame,
  type Command,
  type CommandOk,
  type Ctx,
  type GameState,
  type PlayerState,
  type PkmInstance,
  type Result,
} from '../packages/engine/src/index.ts'

const content = loadContent(join(process.cwd(), 'content'))

/** Carta del contenido por id (falla explícito si no existe). */
function card(id: string) {
  const found = content.cards.find((c) => c.id === id)
  if (found === undefined) throw new Error(`carta "${id}" no está en el contenido`)
  return found
}

/** PKM sintético con elementos equipados y cartas Multicolor asignadas (ids de instancia). */
function pkm(equipped: readonly Element[], multicolor: readonly Element[] = []): PkmInstance {
  return {
    uid: parsePkmUid('p1-starter'),
    cardId: parseCardId('poliwag'),
    damage: 0,
    xp: 0,
    equipped: equipped.map((element, i) => ({
      id: parseCardId(`element_${element}#${i + 1}`),
      element,
    })),
    multicolor,
    fainted: false,
  }
}

/** Ataque sintético: solo importa el costo (RULES §3). */
const atk = (cost: readonly CostSlot[]): Attack => ({
  id: `atk_${cost.join('-')}`,
  name: `Ataque ${cost.join('-')}`,
  kind: 'attack',
  rollFaces: [4, 5],
  cost: [...cost],
  element: 'normal',
  damage: { base: 10 },
  effects: [],
  rawText: '',
})

/** Partida real en `organize` con el jugador customizado (inventario/equipo a mano). */
const organizing = (player?: (p: PlayerState) => PlayerState): { state: GameState; ctx: Ctx } => {
  const started = newGame({ seed: 7, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const base = started.value.state
  const p = base.players[0]!
  const rng = { d6: () => 6, int: () => 0, snapshot: () => 0 }
  if (player === undefined) return { state: base, ctx: { content, rng } }
  return {
    state: { ...base, players: [{ ...player(p), id: p.id, position: p.position }] },
    ctx: { content, rng },
  }
}

const run = (state: GameState, command: Command, ctx: Ctx): Result<CommandOk, EngineError> =>
  applyCommand(state, command, ctx)

/** Segundo PKM del equipo para probar cartas Multicolor e intercambios. */
const squirtle: PkmInstance = {
  uid: parsePkmUid('p1-squirtle'),
  cardId: parseCardId('squirtle'),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
}

// AC: SPEC-B/T-013/AC-1 — canUse: elemento específico cubierto + total ≥ cost.length,
// cada ataque se evalúa solo (Krabby con 2 de Agua usa sus 3 ataques).
test('AC-1 canUse cumple RULES §3 por ataque y sin sumar costos entre ataques', () => {
  // Krabby (RULES §3): con 2 de Agua equipadas usa sus 3 ataques.
  const krabby = pkm(['water', 'water'])
  const ataquesKrabby = [atk(['water', 'water']), atk(['any']), atk(['any', 'any'])]
  for (const ataque of ataquesKrabby) {
    expect(canUse(krabby, ataque), ataque.id).toBe(true)
  }

  // Requerido del mismo elemento: 1 sola Agua no paga [water,water].
  expect(canUse(pkm(['water']), atk(['water', 'water']))).toBe(false)
  // Total: 2 equipadas no alcanzan para 3 slots.
  expect(canUse(pkm(['water', 'water']), atk(['water', 'water', 'water']))).toBe(false)
  expect(canUse(pkm(['water', 'water']), atk(['any', 'any', 'any']))).toBe(false)
  // Elemento equivocado: 2 Fuego no pagan un Agua.
  expect(canUse(pkm(['fire', 'fire']), atk(['water']))).toBe(false)
  // Cada ataque se evalúa SOLO (los costos no se suman entre ataques):
  // con 1 Agua + 1 Fuego puede usar un ataque de Agua y otro de Fuego.
  const mixto = pkm(['water', 'fire'])
  expect(canUse(mixto, atk(['water']))).toBe(true)
  expect(canUse(mixto, atk(['fire']))).toBe(true)
  expect(canUse(mixto, atk(['water', 'fire']))).toBe(true) // 1 de cada uno cubre ambos slots
  // Costo vacío (salvajes/líderes): siempre usable.
  expect(canUse(pkm([]), atk([]))).toBe(true)
})

// AC: plan costo-normal-any/AC-3 — el costo "energía normal" es `any` (D-24):
// ["any","any"] se paga con 2 energías cualesquiera; con 1 sola, no.
test('AC-3 (costo-normal-any) ["any","any"] se paga con 2 energías cualesquiera; con 1 sola, no', () => {
  // AC: plan costo-normal-any/AC-3 — 2 del mismo color.
  expect(canUse(pkm(['fire', 'fire']), atk(['any', 'any']))).toBe(true)
  // AC: plan costo-normal-any/AC-3 — 2 de colores distintos.
  expect(canUse(pkm(['fire', 'water']), atk(['any', 'any']))).toBe(true)
  // AC: plan costo-normal-any/AC-3 — 1 equipada + 1 Multicolor asignado.
  expect(canUse(pkm(['fire'], ['water']), atk(['any', 'any']))).toBe(true)
  // AC: plan costo-normal-any/AC-3 — 1 sola no alcanza (equipped o Multicolor).
  expect(canUse(pkm(['fire']), atk(['any', 'any']))).toBe(false)
  expect(canUse(pkm([], ['fire']), atk(['any', 'any']))).toBe(false)
})

// AC: plan costo-normal-any/AC-4 — costo mixto ["fire","any"]: exige 1 Fuego
// específico + 1 cualquiera; el slot any NO exige Fuego (regresión).
test('AC-4 (costo-normal-any) ["fire","any"] exige 1 Fuego específico + 1 cualquiera', () => {
  // AC: plan costo-normal-any/AC-4 — el Agua cubre el slot any (no exige Fuego).
  expect(canUse(pkm(['fire', 'water']), atk(['fire', 'any']))).toBe(true)
  expect(canUse(pkm(['fire', 'fire']), atk(['fire', 'any']))).toBe(true)
  // Multicolor asignado a Fuego cubre el slot específico.
  expect(canUse(pkm(['water'], ['fire']), atk(['fire', 'any']))).toBe(true)
  // AC: plan costo-normal-any/AC-4 — sin Fuego no paga el slot específico…
  expect(canUse(pkm(['water', 'water']), atk(['fire', 'any']))).toBe(false)
  // …y 1 sola carta no paga 2 slots.
  expect(canUse(pkm(['fire']), atk(['fire', 'any']))).toBe(false)
})

// AC: SPEC-B/T-013/AC-2 — un carta Multicolor cuenta como 1 elemento, el asignado.
test('AC-2 un carta Multicolor vale como 1 elemento del tipo asignado y se asigna/reasigna en Organize', () => {
  // Costo: como elemento asignado y como slot "cualquiera".
  expect(canUse(pkm(['water'], ['water']), atk(['water', 'water']))).toBe(true)
  expect(canUse(pkm(['fire'], ['fire']), atk(['fire', 'fire']))).toBe(true)
  expect(canUse(pkm([], ['water']), atk(['any']))).toBe(true)
  expect(canUse(pkm([], ['water']), atk(['any', 'any']))).toBe(false) // 1 carta Multicolor = 1 solo elemento
  expect(canUse(pkm(['fire'], ['water']), atk(['water']))).toBe(true) // el carta Multicolor cubre el Agua

  // Comando: asignar un carta Multicolor del inventario al inicial del equipo.
  const game = organizing((p) => ({ ...p, team: [p.team[0]!, squirtle] }))
  const assigned = run(game.state, { type: 'AssignMulticolor', pkmUid: 'p1-starter', element: 'fire' }, game.ctx)
  expect(assigned.ok).toBe(true)
  if (!assigned.ok) throw new Error(assigned.error.message)
  expect(assigned.value.state.players[0]!.team[0]!.multicolor).toEqual(['fire'])
  expect(assigned.value.state.players[0]!.multicolor).toBe(2) // la carta no se gasta (RULES §4 p.91)
  expect(assigned.value.events).toContainEqual({ type: 'MulticolorAssigned', player: 'p1', pkmUid: 'p1-starter', element: 'fire' })

  // Reasignar reemplaza (uno a la vez por PKM); la segunda carta Multicolor va a otro PKM.
  const reasignado = run(assigned.value.state, { type: 'AssignMulticolor', pkmUid: 'p1-starter', element: 'water' }, game.ctx)
  expect(reasignado.ok).toBe(true)
  if (!reasignado.ok) throw new Error(reasignado.error.message)
  expect(reasignado.value.state.players[0]!.team[0]!.multicolor).toEqual(['water'])
  const alSegundo = run(reasignado.value.state, { type: 'AssignMulticolor', pkmUid: 'p1-squirtle', element: 'fire' }, game.ctx)
  expect(alSegundo.ok).toBe(true)
  if (!alSegundo.ok) throw new Error(alSegundo.error.message)
  expect(alSegundo.value.state.players[0]!.team[1]!.multicolor).toEqual(['fire'])
  expect(canAssignMulticolor(alSegundo.value.state.players[0]!, 'p1-starter')).toBe(true) // reasignar el propio

  // Sin cartas Multicolor libres y sin una previa en el PKM ⇒ no se puede asignar.
  const tercero: PkmInstance = { ...squirtle, uid: parsePkmUid('p1-tercero') }
  const sinLibres = {
    ...alSegundo.value.state,
    players: [
      { ...alSegundo.value.state.players[0]!, team: [...alSegundo.value.state.players[0]!.team, tercero] },
    ],
  }
  expect(canAssignMulticolor(sinLibres.players[0]!, 'p1-tercero')).toBe(false)
  const agotado = run(sinLibres, { type: 'AssignMulticolor', pkmUid: 'p1-tercero', element: 'fire' }, game.ctx)
  expect(agotado.ok).toBe(false)
  if (!agotado.ok) expect(agotado.error.code).toBe('ILLEGAL_COMMAND')
})

// AC: SPEC-B/T-013/AC-3 — solo se puede equipar/reasignar en Organize (no en combate).
test('AC-3 Equip/Unequip/AssignMulticolor solo en fase organize; Equip y Unequip mueven la carta', () => {
  const game = organizing((p) => ({
    ...p,
    elements: [{ id: parseCardId('element_fire#2'), element: 'fire' }],
  }))
  expect(game.state.phase).toBe('organize')

  // Equip: la carta pasa del inventario al PKM; evento ElementEquipped.
  const equipado = run(game.state, { type: 'Equip', pkmUid: 'p1-starter', elementId: 'element_fire#2' }, game.ctx)
  expect(equipado.ok).toBe(true)
  if (!equipado.ok) throw new Error(equipado.error.message)
  expect(equipado.value.state.players[0]!.elements).toEqual([])
  expect(equipado.value.state.players[0]!.team[0]!.equipped).toEqual([
    { id: 'element_fire#1', element: 'fire' },
    { id: 'element_fire#2', element: 'fire' },
  ])
  expect(equipado.value.events).toContainEqual({ type: 'ElementEquipped', player: 'p1', pkmUid: 'p1-starter', elementId: 'element_fire#2' })

  // Unequip: la carta vuelve al inventario; evento ElementUnequipped.
  const desequipado = run(equipado.value.state, { type: 'Unequip', pkmUid: 'p1-starter', elementId: 'element_fire#2' }, game.ctx)
  expect(desequipado.ok).toBe(true)
  if (!desequipado.ok) throw new Error(desequipado.error.message)
  expect(desequipado.value.state.players[0]!.elements).toEqual([{ id: 'element_fire#2', element: 'fire' }])
  expect(desequipado.value.state.players[0]!.team[0]!.equipped).toEqual([{ id: 'element_fire#1', element: 'fire' }])
  expect(desequipado.value.events).toContainEqual({ type: 'ElementUnequipped', player: 'p1', pkmUid: 'p1-starter', elementId: 'element_fire#2' })

  // legalCommands en organize ofrece equipar/desequipar/asignar además de RollMove.
  const menu = legalCommands(game.state, game.ctx)
  expect(menu).toContainEqual({ type: 'RollMove' })
  expect(menu).toContainEqual({ type: 'Equip', pkmUid: 'p1-starter', elementId: 'element_fire#2' })
  expect(menu).toContainEqual({ type: 'Unequip', pkmUid: 'p1-starter', elementId: 'element_fire#1' })
  expect(menu).toContainEqual({ type: 'AssignMulticolor', pkmUid: 'p1-starter', element: 'water' })

  // Fuera de organize (p.ej. resolviendo casillero, y a futuro en combate) ⇒ ilegal.
  const enResolucion = { ...equipado.value.state, phase: 'tileResolution' as const, stepsLeft: 0 }
  for (const comando of [
    { type: 'Equip', pkmUid: 'p1-starter', elementId: 'element_fire#2' },
    { type: 'Unequip', pkmUid: 'p1-starter', elementId: 'element_fire#1' },
    { type: 'AssignMulticolor', pkmUid: 'p1-starter', element: 'water' },
  ] as const) {
    const fuera = run(enResolucion, comando, game.ctx)
    expect(fuera.ok, comando.type).toBe(false)
    if (!fuera.ok) expect(fuera.error.code).toBe('ILLEGAL_COMMAND')
  }
  expect(legalCommands(enResolucion, game.ctx).some((c) => c.type === 'Equip')).toBe(false)
})

// AC: SPEC-B/T-013/AC-4 — legalAttacks aplica la regla de primer ataque (RULES §4).
test('AC-4 legalAttacks filtra por costo y regla de primer ataque; desde el 2.º turno, todos', () => {
  const ids = (ataques: readonly Attack[]): string[] => ataques.map((a) => a.id)

  // Squirtle: 1er ataque Normal (cabezazo) ⇒ hay que usar ese; "refugio" (habilidad)
  // puede empezar pero cuesta 2 ⇒ con 1 Agua no entra; burbujas (2 Agua) tampoco.
  const squirtleCard = card('squirtle')
  const squirtle1Agua: PkmInstance = {
    ...squirtle,
    equipped: [{ id: parseCardId('element_water#1'), element: 'water' }],
  }
  expect(ids(legalAttacks(squirtleCard, squirtle1Agua, true))).toEqual(['cabezazo'])
  // Con 2 Agua: cabezazo + la habilidad (una habilidad puede usarse para empezar).
  const squirtle2Agua: PkmInstance = {
    ...squirtle,
    equipped: [
      { id: parseCardId('element_water#1'), element: 'water' },
      { id: parseCardId('element_water#2'), element: 'water' },
    ],
  }
  expect(ids(legalAttacks(squirtleCard, squirtle2Agua, true))).toEqual(['cabezazo', 'refugio'])

  // Poliwag: 1er ataque Especial (burbujas, Agua) ⇒ 1er ataque de cada elemento
  // (burbujas + embestida); el 2.º ataque Normal (doble_bofeton) queda afuera.
  const poliwagCard = card('poliwag')
  const poliwag1Agua: PkmInstance = {
    ...squirtle,
    cardId: parseCardId('poliwag'),
    uid: parsePkmUid('p1-starter'),
    equipped: [{ id: parseCardId('element_water#1'), element: 'water' }],
  }
  expect(ids(legalAttacks(poliwagCard, poliwag1Agua, true))).toEqual(['burbujas', 'embestida'])
  // Sin elementos equipados no se paga ni el [any] de embestida: nada legal.
  expect(ids(legalAttacks(poliwagCard, { ...poliwag1Agua, equipped: [] }, true))).toEqual([])

  // Charmander (1er ataque Normal): en el 1.º turno solo rasguños; desde el 2.º,
  // todos los que paguen (giro_fuego y lanzallamas con 2 Fuego).
  const charmanderCard = card('charmander')
  const charmander2Fuego: PkmInstance = {
    ...squirtle,
    cardId: parseCardId('charmander'),
    uid: parsePkmUid('p1-starter'),
    equipped: [
      { id: parseCardId('element_fire#1'), element: 'fire' },
      { id: parseCardId('element_fire#2'), element: 'fire' },
    ],
  }
  expect(ids(legalAttacks(charmanderCard, charmander2Fuego, true))).toEqual(['rasgunos'])
  expect(ids(legalAttacks(charmanderCard, charmander2Fuego, false))).toEqual(['rasgunos', 'giro_fuego', 'lanzallamas'])
})

// Extra (sin AC): guardas de ilegalidad de los comandos nuevos.
test('guardas: Equip sin la carta en el inventario, Unequip sin equipar y PKM inexistente devuelven EngineError', () => {
  const game = organizing()
  const conEquipo = organizing((p) => ({ ...p, team: [p.team[0]!, squirtle] }))

  // Equip: la carta no está en el inventario (está equipada por el setup) / PKM fuera del equipo.
  const cartaAjena = run(game.state, { type: 'Equip', pkmUid: 'p1-starter', elementId: 'element_fire#1' }, game.ctx)
  expect(cartaAjena.ok).toBe(false)
  if (!cartaAjena.ok) expect(cartaAjena.error.code).toBe('ILLEGAL_COMMAND')
  const pkmInexistente = run(game.state, { type: 'Equip', pkmUid: 'no-esta', elementId: 'element_fire#2' }, game.ctx)
  expect(pkmInexistente.ok).toBe(false)
  if (!pkmInexistente.ok) expect(pkmInexistente.error.code).toBe('ILLEGAL_COMMAND')

  // Unequip de una carta que el PKM no tiene equipada.
  const sinEquipar = run(game.state, { type: 'Unequip', pkmUid: 'p1-starter', elementId: 'element_fire#9' }, game.ctx)
  expect(sinEquipar.ok).toBe(false)
  if (!sinEquipar.ok) expect(sinEquipar.error.code).toBe('ILLEGAL_COMMAND')

  // AssignMulticolor sin cartas Multicolor en el inventario.
  const sinMulticolor = run(
    { ...conEquipo.state, players: [{ ...conEquipo.state.players[0]!, multicolor: 0 }] },
    { type: 'AssignMulticolor', pkmUid: 'p1-starter', element: 'fire' },
    conEquipo.ctx,
  )
  expect(sinMulticolor.ok).toBe(false)
  if (!sinMulticolor.ok) expect(sinMulticolor.error.code).toBe('ILLEGAL_COMMAND')
})
