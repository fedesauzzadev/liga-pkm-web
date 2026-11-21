// AC: SPEC-D/T-033 — equipo/inventario, ficha de carta, equipamiento y evolución.
// Proxy SSR (renderToString, sin DOM) como en T-030/T-032a; lo visual lo revisa el dueño.
import {
  ELEMENTS,
  parseCardId,
  parseNodeId,
  parsePlayerId,
  parsePkmUid,
  PokemonCardSchema,
  PokemonFileSchema,
} from '@liga/content'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import type { PlayerState, PokemonCard, PkmInstance } from '@liga/engine'
import { es } from '../i18n/es'
import samples from '../../../../content/pokemon/_samples.json'
import { TeamPanel } from './TeamPanel'

const sampleCards: readonly PokemonCard[] = PokemonFileSchema.parse(samples).cards

/** Carta fixture mínima (AC-3: carta con DOS evoluciones alcanzables). */
const fixtureCard = (id: string, name: string, evolvesTo: readonly { id: string; xp: number }[]): PokemonCard =>
  PokemonCardSchema.parse({
    id,
    dex: 1,
    name,
    stage: 'basic',
    deck: 'bosque',
    hp: 50,
    element: 'grass',
    attacks: [
      {
        id: 'placaje',
        name: 'Placaje',
        kind: 'attack',
        rollFaces: [3],
        cost: ['any'],
        element: 'normal',
        damage: { base: 10 },
        effects: [],
        rawText: '',
      },
    ],
    specialties: [],
    evolvesTo,
    source: { verified: false },
  })

const fixtureCards: readonly PokemonCard[] = [
  fixtureCard('testy', 'Testy', [
    { id: 'testy_a', xp: 1 },
    { id: 'testy_b', xp: 2 },
  ]),
  fixtureCard('testy_a', 'Testy A', []),
  fixtureCard('testy_b', 'Testy B', []),
]

const cardMap = new Map<string, PokemonCard>(
  [...sampleCards, ...fixtureCards].map((card) => [card.id, card]),
)
const cardOf = (cardId: string): PokemonCard | undefined => cardMap.get(cardId)

const pkm = (uid: string, cardId: string, xp: number, equippedIds: readonly string[] = []): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage: 0,
  xp,
  equipped: equippedIds.map((id, i) => ({ id: parseCardId(id), element: i === 0 ? 'water' : 'fire' })),
  multicolor: [],
  fainted: false,
})

const makePlayer = (testyXp: number): PlayerState => ({
  id: parsePlayerId('p1'),
  position: parseNodeId('paleta'),
  cameFrom: null,
  team: [
    { ...pkm('p1-a', 'squirtle', 2, ['element_water#1', 'element_water#2']), damage: 8, multicolor: ['water'] },
    pkm('p1-b', 'testy', testyXp),
  ],
  oakPile: [pkm('p1-oak', 'poliwag', 0)],
  elements: [
    { id: parseCardId('element_fire#1'), element: 'fire' },
    { id: parseCardId('element_water#3'), element: 'water' },
  ],
  multicolor: 2,
  items: { pokeball: 3, potion: 1, oportunidad: 0, super_potion: 0, ultraball: 0, masterball: 0 },
  medals: ['Cascada'],
})

const count = (html: string, needle: string): number => html.split(needle).length - 1

const base = { cardOf, teamLimit: 6, canEdit: true, onCommand: () => undefined } as const

test('AC: SPEC-D/T-033/AC-1 - equipo de 6 slots + pila de Oak + ficha con ataques, costos, efectos y rawText', () => {
  const html = renderToString(<TeamPanel player={makePlayer(2)} {...base} />)
  // Equipo: 2 ocupados + 4 vacíos (≤ 6, AC-1) y pila de Oak con su PKM.
  expect(html).toContain('Squirtle')
  expect(html).toContain('Testy')
  expect(count(html, 'data-empty="true"')).toBe(4)
  expect(html).toContain('data-oak-pile="true"')
  expect(html).toContain('Poliwag')
  // Ficha (seleccionado el primero): HP con daño, ataque con costo en íconos y rawText.
  expect(html).toContain('data-card-sheet="true"')
  expect(html).toContain('data-hp="52/60"') // 60 - 8 de daño
  expect(html).toContain('(20)') // daño de Cabezazo
  expect(html).toContain(es.elementNames.water) // ícono de costo (aria-label)
  expect(html).toContain('el ataque de tu rival hará (-10).') // rawText de Burbujas
})

test('AC: SPEC-D/T-033/AC-2 - equipar/desequipar y Multicolor por botones; sin canEdit quedan deshabilitados', () => {
  const html = renderToString(<TeamPanel player={makePlayer(2)} {...base} />)
  expect(html).toContain('data-command="Unequip" data-element-id="element_water#1"')
  expect(html).toContain('data-command="Equip" data-element-id="element_fire#1"')
  expect(html).toContain('data-command="Equip" data-element-id="element_water#3"')
  // Multicolor: un botón por elemento (reasignable); ya hay 1 asignado y queda 1 libre.
  expect(count(html, 'data-command="AssignMulticolor"')).toBe(ELEMENTS.length)
  expect(html).toContain(`aria-label="${es.teamAssignMulticolor}`)

  const locked = renderToString(
    <TeamPanel player={makePlayer(2)} {...base} canEdit={false} />,
  )
  expect(locked).toContain('data-command="Unequip" data-element-id="element_water#1" disabled=""')
  expect(locked).toContain('data-command="Equip" data-element-id="element_fire#1" disabled=""')
  expect(locked).toContain(es.teamNotEditable)
})

test('AC: SPEC-D/T-033/AC-3 - evolucionar desde la ficha con XP cumplido; un botón por evolución posible', () => {
  const html = renderToString(<TeamPanel player={makePlayer(2)} {...base} selectedUid="p1-b" />)
  expect(html).toContain('data-command="Evolve" data-to-id="testy_a"')
  expect(html).toContain('data-command="Evolve" data-to-id="testy_b"')
  expect(html).toContain(`${es.teamEvolve} Testy A`)
  expect(html).toContain(`${es.teamEvolve} Testy B`)

  // Sin XP suficiente no se ofrece; con el destino ausente en content, tampoco.
  const noXp = renderToString(<TeamPanel player={makePlayer(0)} {...base} selectedUid="p1-b" />)
  expect(noXp).not.toContain('data-command="Evolve"')
  const missingTarget = renderToString(<TeamPanel player={makePlayer(2)} {...base} selectedUid="p1-a" />)
  expect(missingTarget).not.toContain('data-command="Evolve"') // wartortle está en pending
})

test('AC: SPEC-D/T-033/AC-4 - medallas (8 espacios) y contador de ítems y Multicolor', () => {
  const html = renderToString(<TeamPanel player={makePlayer(2)} {...base} />)
  expect(count(html, 'data-medal-slot=')).toBe(8)
  expect(count(html, 'data-filled="true"')).toBe(1)
  expect(html).toContain('title="Cascada"') // medalla ganada visible con su nombre
  expect(html).toContain('data-item="pokeball"')
  expect(html).toContain(`${es.teamPokeball}: 3`)
  expect(html).toContain('data-item="potion"')
  expect(html).toContain(`${es.teamPotion}: 1`)
  expect(html).toContain('data-multicolor-free="1"') // 2 - 1 asignado
})

// AC: SPEC-T/T-104/AC-9 - la ficha completa (CardSheet) ofrece quitar el
// Multicolor asignado con el mismo gating que Equip/Unequip (solo Organize).
test('AC: SPEC-T/T-104/AC-9 - CardSheet ofrece quitar el Multicolor asignado (mismo gating)', () => {
  const html = renderToString(<TeamPanel player={makePlayer(2)} {...base} />)
  expect(html).toContain('data-command="UnassignMulticolor" data-multicolor="water"')

  // Fuera de Organize (canEdit=false): botón presente pero deshabilitado, como el resto.
  const locked = renderToString(<TeamPanel player={makePlayer(2)} {...base} canEdit={false} />)
  expect(locked).toMatch(/<button[^>]*data-command="UnassignMulticolor"[^>]*data-multicolor="water"[^>]*disabled=""/)
})
