// AC: SPEC-D/T-032a/AC-4, AC-5, AC-6 — lógica de presentación de combate (pura).
import { parseCardId, parsePkmUid, type Element } from '@liga/content'
import { describe, expect, test } from 'vitest'
import type { PkmConditions, PkmInstance } from '@liga/engine'
import { demoCards } from './demo'
import { es } from '../i18n/es'
import { attackForDie, attackRows, damageLabel, facesLabel, missingCostLabel, statusViews } from './model'

const pkmWith = (cardId: string, elements: readonly Element[]): PkmInstance => ({
  uid: parsePkmUid('p-test'),
  cardId: parseCardId(cardId),
  damage: 0,
  xp: 0,
  equipped: elements.map((element, index) => ({
    id: parseCardId(`element_${element}#${index + 1}`),
    element,
  })),
  multicolor: [],
  fainted: false,
})

describe('attackRows', () => {
  test('AC: SPEC-D/T-032a/AC-4 - sin equipo, todos los ataques apagados con motivo costo', () => {
    const rows = attackRows(demoCards.squirtle, pkmWith('squirtle', []), false)
    expect(rows.length).toBe(3)
    for (const row of rows) {
      expect(row.legal).toBe(false)
      expect(row.reason).toBe('cost')
    }
  })

  test('AC: SPEC-D/T-032a/AC-4 - primer turno con 2 agua: solo el 1.º normal y habilidades', () => {
    const rows = attackRows(demoCards.squirtle, pkmWith('squirtle', ['water', 'water']), true)
    const byId = new Map(rows.map((row) => [row.attack.id, row]))
    // El 1.er ataque de Squirtle es Normal ⇒ en el primer turno solo él (y habilidades).
    expect(byId.get('cabezazo')?.legal).toBe(true)
    expect(byId.get('refugio')?.legal).toBe(true) // habilidad: siempre puede empezar
    expect(byId.get('burbujas')?.legal).toBe(false)
    expect(byId.get('burbujas')?.reason).toBe('firstTurn') // el costo SÍ se paga: es la regla
  })

  test('AC: SPEC-D/T-032a/AC-4 - desde el 2.º turno con 2 agua: todos legales', () => {
    const rows = attackRows(demoCards.squirtle, pkmWith('squirtle', ['water', 'water']), false)
    expect(rows.every((row) => row.legal && row.reason === null)).toBe(true)
  })
})

describe('attackForDie', () => {
  test('AC: SPEC-D/T-032a/AC-5 - el valor del dado attackSelect elige la fila del rival', () => {
    expect(attackForDie(demoCards.poliwag, 4)?.id).toBe('burbujas')
    expect(attackForDie(demoCards.poliwag, 3)?.id).toBe('embestida')
    expect(attackForDie(demoCards.poliwag, 1)?.id).toBe('doble_bofeton')
  })

  test('AC: SPEC-D/T-032a/AC-5 - sin coincidencia (6) ⇒ no ataca', () => {
    expect(attackForDie(demoCards.poliwag, 6)).toBeNull()
  })
})

describe('statusViews', () => {
  test('AC: SPEC-D/T-032a/AC-6 - mapea condiciones a íconos dormido/envenenado/no atacará/(-10)', () => {
    expect(statusViews(undefined)).toEqual([])
    const all: PkmConditions = {
      asleep: { wakeFaces: [5, 6] },
      poison: 10,
      rollGate: { failFaces: [1, 2], outcome: 'noAttack', duration: 'combat' },
      damageModCombat: 10,
    }
    expect(statusViews(all)).toEqual([
      { kind: 'sleep' },
      { kind: 'poison' },
      { kind: 'noAttack' },
      { kind: 'shield', text: '(-10)' },
    ])
    expect(statusViews({ skipNextAttack: true })).toEqual([{ kind: 'noAttack' }])
  })

  // AC: visibilidad-estados-combate/AC-5 — confundido, drenado y buff (+N).
  test('AC: visibilidad-estados-combate/AC-5 - confusión (rollGate selfHit), drenado y buff (+N)', () => {
    const confused: PkmConditions = {
      rollGate: { failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'combat' },
    }
    expect(statusViews(confused)).toEqual([{ kind: 'confused' }])
    const boosted: PkmConditions = { drain: 10, selfBoost: 10 }
    expect(statusViews(boosted)).toEqual([
      { kind: 'drain' },
      { kind: 'boost', text: '(+10)' },
    ])
    // La confusión no muestra además el "no atacará" (es otro outcome del gate).
    expect(statusViews(confused).some((view) => view.kind === 'noAttack')).toBe(false)
  })
})

describe('etiquetas de carta', () => {
  test('AC: SPEC-D/T-032a/AC-3 - facesLabel y damageLabel "(10) 4-5-6 (20)"', () => {
    expect(facesLabel([4, 5])).toBe('4-5')
    expect(facesLabel([1, 2, 3])).toBe('1-2-3')
    const rasgunos = demoCards.charmander.attacks[0]!
    expect(damageLabel(rasgunos)).toBe('(10) 4-5-6 (20)')
    expect(damageLabel(demoCards.poliwag.attacks[0]!)).toBe('(10)')
  })

  // AC: rediseno-combate-max/AC-3 - sin "(0)"/"(00)"/"-0": base 0 y sin ifRoll
  // no muestra nada; con base 0 e ifRoll solo va la parte del dado.
  test('AC: rediseno-combate-max/AC-3 - damageLabel sin "(0)": base 0 ⇒ vacío o solo ifRoll', () => {
    const zeroBase = { ...demoCards.poliwag.attacks[0]!, damage: { base: 0 } }
    expect(damageLabel(zeroBase)).toBe('')
    const zeroWithRoll = {
      ...demoCards.poliwag.attacks[0]!,
      damage: { base: 0, ifRoll: { faces: [4, 5, 6], damage: 20 } },
    }
    expect(damageLabel(zeroWithRoll)).toBe('4-5-6 (20)')
  })

  // AC: rediseno-combate-max/AC-6 - razón de costo faltante estilo "Faltan 2 Normal".
  test('AC: rediseno-combate-max/AC-6 - missingCostLabel: Faltan n Elemento / n de cualquier elemento', () => {
    const texts = {
      missing: es.modalMissingCost,
      missingPlural: es.modalMissingCostPlural,
      missingAny: es.modalMissingCostAny,
      missingAnyPlural: es.modalMissingCostAnyPlural,
      elementNames: es.elementNames,
    }
    const burbujas = demoCards.squirtle.attacks.find((attack) => attack.id === 'burbujas')!
    // Sin equipo: faltan 2 de agua ⇒ "Faltan 2 Agua".
    expect(missingCostLabel(pkmWith('squirtle', []), burbujas, texts)).toBe(
      es.modalMissingCostPlural.replace('{n}', '2').replace('{element}', es.elementNames.water),
    )
    // Con 1 agua falta 1 ⇒ "Falta 1 Agua".
    expect(missingCostLabel(pkmWith('squirtle', ['water']), burbujas, texts)).toBe(
      es.modalMissingCost.replace('{n}', '1').replace('{element}', es.elementNames.water),
    )
    // Costo cubierto ⇒ null.
    expect(missingCostLabel(pkmWith('squirtle', ['water', 'water']), burbujas, texts)).toBeNull()
  })
})
