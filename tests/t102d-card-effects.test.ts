// AC: SPEC-S/T-102d — mapeador texto → efectos del lector de cartas:
// carga de content/cards/effect-patterns.json (con (F) y marcadores $faces/
// $int/$neg/$optFaces/$self), normalización del texto, varios efectos por
// texto sin reusar fragmento consumido (setsFlag/alsoSets), custom con el
// texto restante para lo que no encaja (prohibido inventar primitivas) y
// validación de cada efecto con el esquema Zod de packages/content. Puro.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import {
  compileEffectPattern,
  countUnmatched,
  loadEffectPatterns,
  mapEffects,
  normalizeEffectText,
  type MappedEffects,
} from '../tools/cards-scan/effects.ts'
import type { Effect } from '../packages/content/src/effects.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const patterns = loadEffectPatterns(ROOT)

interface MapOpts {
  readonly attackId?: string | undefined
  readonly selfName?: string | undefined
  readonly pats?: readonly ReturnType<typeof compileEffectPattern>[] | undefined
}
const map = (text: string, o: MapOpts = {}): MappedEffects =>
  mapEffects(text, { patterns: o.pats ?? patterns, attackId: o.attackId ?? 'test', selfName: o.selfName })

// AC: SPEC-S/T-102d/AC-1 — carga effect-patterns.json (orden por prioridad,
// ids únicos), normaliza el texto (minúsculas, tildes, espacios, guiones
// largos), expande (F) a caras de dado y convierte los marcadores ($self).
test('AC: SPEC-S/T-102d/AC-1 patrones cargados, texto normalizado y marcadores convertidos', () => {
  expect(patterns.length).toBeGreaterThanOrEqual(25)
  const prios = patterns.map((p) => p.priority)
  expect([...prios].sort((a, b) => a - b)).toEqual(prios)
  expect(new Set(patterns.map((p) => p.id)).size).toBe(patterns.length)

  // Normalización: minúsculas, sin tildes, espacios colapsados, — → -
  expect(normalizeEffectText('Atacá  RÁPIDO—ÉL')).toBe('ataca rapido-el')
  expect(normalizeEffectText('Podés… ¡Sí!')).toBe('podes… ¡si!')

  // (F) → grupo de caras: Lianas "5-6 tu rival no atacará" (EFFECTS §4)
  expect(map('5-6 tu rival no atacará').effects).toEqual([{ op: 'rivalSkipsAttack', faces: [5, 6] }])

  // $self → id del ataque (Ataque rápido, EFFECTS §1)
  const qa = map('ataque rápido: si Snorlax está dañado puede hacer este ataque después de atacar con 4-5-6', {
    attackId: 'ataque-rapido',
  })
  expect(qa.effects).toEqual([{ op: 'quickAttack', faces: [4, 5, 6], attackId: 'ataque-rapido', requires: 'damaged' }])
})

// AC: SPEC-S/T-102d/AC-2 — un texto puede producir varios efectos (Chillido
// = nextAttackBonus + attackAgain; Agilidad de Dratini = startsFirst +
// attackAgain en orden de aparición), el fragmento consumido no se reusa,
// setsFlag marca canOpen en el ataque y alsoSets fija damage.base (Explosión).
test('AC: SPEC-S/T-102d/AC-2 varios efectos por texto, fragmento consumido, setsFlag y alsoSets', () => {
  const ch = map('el próximo ataque hará (+30). 4-5-6 atacá de nuevo')
  expect(ch.effects).toEqual([
    { op: 'nextAttackBonus', amount: 30 },
    { op: 'attackAgain', faces: [4, 5, 6] },
  ])
  expect(ch.patternIds).toEqual(['nextAttackBonus', 'attackAgain'])
  expect(ch.custom).toBe(false)

  // Orden por aparición en el texto, no por prioridad (carta de oro Dratini).
  const ag = map('Dratini empieza atacando cada combate. 4-5-6 atacá de nuevo.', { selfName: 'Dratini' })
  expect(ag.effects).toEqual([{ op: 'startsFirst' }, { op: 'attackAgain', faces: [4, 5, 6] }])

  const open = map('podés empezar con este ataque')
  expect(open.effects).toEqual([])
  expect(open.canOpen).toBe(true)
  expect(open.custom).toBe(false)

  const ex = map('tu rival se hace (50) daños. Onix se hace (20)')
  expect(ex.effects).toEqual([{ op: 'selfDamage', amount: 20 }])
  expect(ex.damageBase).toBe(50)
})

// AC: SPEC-S/T-102d/AC-3 — lo que no encaja (o encaja solo en parte) sale
// {op:'custom', handler:'TODO', rawText} con el texto restante y
// needsReview; los textos sin patrón se agrupan y cuentan para el reporte.
// Nunca se inventan primitivas (los nuevos patrones/ER los aprueba el jefe).
test('AC: SPEC-S/T-102d/AC-3 lo que no encaja queda custom con el texto restante', () => {
  const a = map('hace (+10) por cada energía')
  expect(a.effects).toEqual([{ op: 'custom', handler: 'TODO', rawText: 'hace (+10) por cada energia' }])
  expect(a.customRawText).toBe('hace (+10) por cada energia')
  expect(a.needsReview).toBe(true)

  const b = map('5-6 tu rival no atacará. además flota')
  expect(b.effects).toEqual([
    { op: 'rivalSkipsAttack', faces: [5, 6] },
    { op: 'custom', handler: 'TODO', rawText: 'ademas flota' },
  ])

  // Agrupado y contado para el reporte (T-102e): sin nulos ni vacíos.
  expect(countUnmatched([null, 'a b', 'a b', 'c', ''])).toEqual([
    { text: 'a b', count: 2 },
    { text: 'c', count: 1 },
  ])
})

// AC: SPEC-S/T-102d/AC-4 — cada efecto emitido se valida con el esquema Zod
// de packages/content; un efecto inválido se descarta con aviso y su
// fragmento NO se consume ⇒ pasa a custom.
test('AC: SPEC-S/T-102d/AC-4 efecto inválido: descartado con aviso y pasado a custom', () => {
  // Emit incompleto (sin wakeFaces): Zod lo rechaza.
  const sinWake = compileEffectPattern({ id: 'testSinWake', priority: 1, regex: 'dormir', emit: { op: 'rivalSleep' } })
  const r1 = map('dormir', { pats: [sinWake] })
  expect(r1.effects).toEqual([{ op: 'custom', handler: 'TODO', rawText: 'dormir' }])
  expect(r1.notes.join(' ')).toMatch(/no validó/)

  // Caras ilegibles (grupo que no son caras 1-6): no se consume ⇒ custom.
  const malasCaras = compileEffectPattern({
    id: 'testCaras',
    priority: 1,
    regex: '(\\S+) raro',
    emit: { op: 'rivalSkipsAttack', faces: '$faces:1' },
  })
  const r2 = map('xyz raro', { pats: [malasCaras] })
  expect(r2.effects).toEqual([{ op: 'custom', handler: 'TODO', rawText: 'xyz raro' }])
  expect(r2.needsReview).toBe(true)
})

// AC: SPEC-S/T-102d/AC-5 — un caso por patrón con su texto de ejemplo de
// docs/EFFECTS.md §4 y del manual; todo patrón del JSON queda cubierto.
test('AC: SPEC-S/T-102d/AC-5 un ejemplo por patrón (EFFECTS §4 y manual)', () => {
  interface Case {
    readonly id: string
    readonly text: string
    readonly effects: readonly Effect[]
    readonly attackId?: string | undefined
    readonly selfName?: string | undefined
    readonly damageBase?: number | undefined
    readonly canOpen?: boolean | undefined
  }
  const cases: readonly Case[] = [
    { id: 'rivalSleep', text: '4-5-6 no atacará hasta sacar 5-6', effects: [{ op: 'rivalSleep', faces: [4, 5, 6], wakeFaces: [5, 6] }] },
    { id: 'rivalSkipsAttack', text: '5-6 tu rival no atacará', effects: [{ op: 'rivalSkipsAttack', faces: [5, 6] }] },
    { id: 'drainEachTurn', text: 'cada turno tu rival se hace (10) y Weepinbell se cura (10)', effects: [{ op: 'drainEachTurn', amount: 10 }] },
    { id: 'drainNow', text: 'tu rival se hace (20) y Abra se cura (20)', effects: [{ op: 'drainNow', amount: 20 }] },
    { id: 'poison', text: 'tu rival se hace (10) por turno', effects: [{ op: 'poison', amount: 10 }] },
    { id: 'rollGateNoAtkCombat', text: 'cada turno si sacás 1-2-3 tu PKM no ataca', effects: [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'combat' }] },
    { id: 'rollGateSelfHitCombat', text: '4-5-6 cada turno si tu rival saca 1-2-3 se auto-ataca', effects: [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'combat', onRoll: [4, 5, 6] }] },
    { id: 'rollGateNoAtkNext', text: '1-2-3 tu PKM no atacará', effects: [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'nextTurn' }] },
    { id: 'rollGateSelfHitNext', text: '1-2-3 se auto-ataca', effects: [{ op: 'rollGate', failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'nextTurn' }] },
    { id: 'modifyRivalDamageCombat', text: 'los ataques de tu rival hacen (-10). MAX 1', effects: [{ op: 'modifyRivalDamage', amount: -10, duration: 'combat', max: 1 }] },
    { id: 'modifyRivalDamage', text: 'el ataque de tu rival hará (-10)', effects: [{ op: 'modifyRivalDamage', amount: -10, duration: 'nextTurn' }] },
    { id: 'flatReductionSpecial', text: 'los ataques especiales le hacen (-20)', effects: [{ op: 'flatReduction', amount: 20, versus: 'special', target: 'self', duration: 'combat' }] },
    { id: 'flatReductionMax1', text: 'los ataques le hacen (-10) a Onix. MAX 1', effects: [{ op: 'flatReduction', amount: 10, max: 1, target: 'self', duration: 'combat' }] },
    { id: 'flatReduction', text: 'los ataques le hacen (-10)', effects: [{ op: 'flatReduction', amount: 10, target: 'self', duration: 'combat' }] },
    { id: 'selfBoostMax1', text: 'los ataques hacen (+10). MAX 1', effects: [{ op: 'selfBoost', amount: 10, max: 1 }] },
    { id: 'selfBoost', text: 'tus ataques hacen (+10)', effects: [{ op: 'selfBoost', amount: 10 }] },
    { id: 'fixedRolls', text: 'tirá el dado 2 veces. Hacé (+30) por cada 3-4-5-6', effects: [{ op: 'fixedRolls', rolls: 2, faces: [3, 4, 5, 6], amount: 30 }], damageBase: 0 },
    { id: 'bonusPerRoll', text: '(+10) por cada 4-5-6', effects: [{ op: 'bonusPerRoll', faces: [4, 5, 6], amount: 10 }] },
    { id: 'nextAttackBonus', text: 'el próximo ataque de Pinsir hará (+30)', effects: [{ op: 'nextAttackBonus', amount: 30 }] },
    { id: 'attackAgain', text: '4-5-6 atacá de nuevo', effects: [{ op: 'attackAgain', faces: [4, 5, 6] }] },
    { id: 'startsFirst', text: 'empieza atacando cada combate', effects: [{ op: 'startsFirst' }] },
    { id: 'dodge', text: 'cuando un rival ataque a Pikachu, si sacás 4-5-6 su ataque no hace daño ni efecto', effects: [{ op: 'dodge', faces: [4, 5, 6] }] },
    { id: 'dodgeGym', text: 'cuando ataques a Abra, tirá el dado. si sacás 4-5-6 el ataque no hace daño ni efecto', effects: [{ op: 'dodge', faces: [4, 5, 6] }] },
    { id: 'defendGateNoAtk', text: 'cuando ataques a Raichu, tirá el dado. si sacás 3-4 tu PKM no ataca', effects: [{ op: 'defendGate', failFaces: [3, 4], outcome: 'noAttack' }] },
    { id: 'defendGateSelfHit', text: 'cuando ataques a Kadabra, tirá el dado. si sacás 1-2-3 se auto-ataca', effects: [{ op: 'defendGate', failFaces: [1, 2, 3], outcome: 'selfHit' }] },
    { id: 'quickAttack', text: 'ataque rápido: si Snorlax está dañado puede hacer este ataque después de atacar con 4-5-6', effects: [{ op: 'quickAttack', faces: [4, 5, 6], attackId: 'ataque-rapido', requires: 'damaged' }], attackId: 'ataque-rapido' },
    { id: 'healSelf', text: 'Snorlax se cura (30) daños', effects: [{ op: 'healSelf', amount: 30 }] },
    { id: 'explosion', text: 'tu rival se hace (50) daños. Onix se hace (20)', effects: [{ op: 'selfDamage', amount: 20 }], damageBase: 50 },
    { id: 'canOpen', text: 'podés empezar con este ataque', effects: [], canOpen: true },
    // Multi-efecto del manual (Chillido/Intimidar): dos efectos, sin custom.
    { id: 'nextAttackBonus+attackAgain', text: 'el próximo ataque hará (+30). 4-5-6 atacá de nuevo', effects: [{ op: 'nextAttackBonus', amount: 30 }, { op: 'attackAgain', faces: [4, 5, 6] }] },
  ]
  for (const c of cases) {
    const r = map(c.text, { attackId: c.attackId, selfName: c.selfName })
    expect(r.effects, `patrón ${c.id}`).toEqual(c.effects)
    expect(r.custom, `patrón ${c.id}`).toBe(false)
    if (c.damageBase !== undefined) expect(r.damageBase, `patrón ${c.id}`).toBe(c.damageBase)
    if (c.canOpen !== undefined) expect(r.canOpen, `patrón ${c.id}`).toBe(c.canOpen)
  }
  // Cobertura: todo patrón del JSON tiene su caso (el compuesto cubre a ambos).
  const cubiertos = new Set(cases.flatMap((c) => c.id.split('+')))
  for (const p of patterns) expect(cubiertos.has(p.id), `patrón sin caso de test: ${p.id}`).toBe(true)
})

// AC: SPEC-S/T-102d/AC-5 (carta de oro) — los tres ataques de Dratini
// producen EXACTAMENTE los efectos de dratini.expected.json (sin custom).
test('AC: SPEC-S/T-102d/AC-5 carta de oro: los tres ataques de Dratini', () => {
  const golden = JSON.parse(readFileSync(join(ROOT, 'content', 'pokemon', '_golden', 'dratini.expected.json'), 'utf8')) as {
    readonly name: string
    readonly attacks: ReadonlyArray<{ readonly id: string; readonly rawText: string; readonly effects: readonly Effect[] }>
  }
  for (const a of golden.attacks) {
    const r = map(a.rawText, { attackId: a.id, selfName: golden.name })
    expect(r.effects, a.id).toEqual(a.effects)
    expect(r.custom, a.id).toBe(false)
    expect(r.needsReview, a.id).toBe(false)
  }
})
