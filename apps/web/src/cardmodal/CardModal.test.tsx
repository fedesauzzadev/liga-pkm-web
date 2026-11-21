// AC: SPEC-R/T-103 — ventana de carta (proxy SSR renderToString, sin DOM): la
// carta grande dibujada desde datos (sin foto de carta, AC-18), filas por
// ataque con disponibilidad (AC-8/AC-9), pie con etapa/mazo/evolución (AC-10) y
// panel lateral con acciones solo cuando el motor las dictaminó (AC-11..14).
// Esc/fondo/animo/viewport son de cliente: los cubre e2e/t103-card-modal.mjs.
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { parseCardId, parsePkmUid, PokemonCardSchema } from '@liga/content'
import type { ElementCard, PkmInstance } from '@liga/engine'
import { es } from '../i18n/es'
import { CardModal } from './CardModal'
import {
  MULTICOLOR_OPTIONS,
  type CardModalActions,
  type CardModalSpec,
} from './model'
import { cardModalConfig } from './config'
import { cardArtConfig } from '../battle/spriteFit'
import { onArtImageLoad } from '../battle/useArtFit'

/** Carta fixture: ataque gratis, ataque con costo Fuego y habilidad (AC-8/AC-9). */
const card = PokemonCardSchema.parse({
  id: 'fixture-modal',
  dex: 7,
  name: 'Testardor De Nombre Largo',
  stage: 'basic',
  deck: 'isla',
  hp: 60,
  element: 'water',
  attacks: [
    {
      id: 'golpe',
      name: 'Golpe',
      kind: 'attack',
      rollFaces: [4],
      cost: [],
      element: 'normal',
      damage: { base: 10 },
      effects: [],
      rawText: '',
    },
    {
      id: 'lanzallamas',
      name: 'Lanzallamas',
      kind: 'attack',
      rollFaces: [5],
      cost: ['fire', 'fire'],
      element: 'fire',
      damage: { base: 20, ifRoll: { faces: [6], damage: 40 } },
      effects: [],
      rawText: 'Tirá 1 dado: si sale 6, este ataque hace 40 de daño.',
    },
    {
      id: 'refugio',
      name: 'Refugio',
      kind: 'ability',
      rollFaces: [6],
      cost: [],
      element: 'water',
      damage: { base: 0 },
      effects: [],
      rawText: 'Los ataques le hacen (-10).',
    },
  ],
  specialties: [{ op: 'custom', handler: 'TODO_dureza', rawText: 'Dureza: soporta (-10).' }],
  evolvesTo: [{ id: 'charmander', xp: 2 }],
  source: { verified: false },
})

const elementCard = (id: string, element: 'water' | 'fire'): ElementCard => ({
  id: parseCardId(id),
  element,
})

const pkm: PkmInstance = {
  uid: parsePkmUid('p1-starter'),
  cardId: parseCardId('fixture-modal'),
  damage: 12,
  xp: 1,
  equipped: [elementCard('element_water#1', 'water')],
  multicolor: [],
  fainted: false,
}

const spec: CardModalSpec = {
  card,
  pkm,
  active: true,
  readOnly: false,
  notice: null,
  conditions: undefined,
  elements: [elementCard('element_fire#1', 'fire'), elementCard('element_fire#2', 'fire')],
}

const noActions: CardModalActions = {
  equipElementIds: new Set<string>(),
  unequipElementIds: new Set<string>(),
  multicolorOptions: [],
  canUnassignMulticolor: false,
  potions: [],
  evolutions: [],
}

const window = (overrides: Partial<Parameters<typeof CardModal>[0]> = {}): string =>
  renderToString(
    <CardModal
      spec={spec}
      actions={{
        ...noActions,
        equipElementIds: new Set(['element_fire#1', 'element_fire#2']),
        unequipElementIds: new Set(['element_water#1']),
      }}
      artUrl={null}
      itemCounts={{ potion: 2, super_potion: 0 }}
      multicolorFree={1}
      onCommand={() => undefined}
      onClose={() => undefined}
      {...overrides}
    />,
  )

// AC: SPEC-R/T-103/AC-1 - la ventana abre con ESA carta: testid del config,
// uid y nombre completo (el ajuste de letra es de cliente/e2e).
test('AC: SPEC-R/T-103/AC-1 - ventana con testid del config, uid y nombre completo', () => {
  const html = window()
  expect(html).toContain(`data-testid="${cardModalConfig.modal.testid}"`)
  expect(html).toContain('data-uid="p1-starter"')
  expect(html).toContain('Testardor De Nombre Largo')
  expect(html).toContain('data-card-modal="true"')
})

// AC: SPEC-R/T-103/AC-6 - encabezado: nombre, ícono de elemento y HP con barra.
test('AC: SPEC-R/T-103/AC-6 - nombre, elemento y HP actual/máximo con barra', () => {
  const html = window()
  expect(html).toContain(`aria-label="${es.elementNames.water}"`)
  expect(html).toContain('data-hp="48/60"')
  expect(html).toMatch(/data-hp-ratio="0\.80"/)
})

// AC: SPEC-R/T-103/AC-7 - arte: sprite si hay manifest, fallback con el nombre.
test('AC: SPEC-R/T-103/AC-7 - arte con fallback al nombre cuando falta el sprite', () => {
  expect(window()).toContain('data-missing="true"')
  const withArt = window({ artUrl: '/sprites/7.gif' })
  expect(withArt).toContain('src="/sprites/7.gif"')
})

// AC: SPEC-R/T-103/AC-8 - una fila por ataque en orden, con caras, daño, costo
// (íconos), texto; habilidades marcadas y especialidades arriba en mayúsculas.
test('AC: SPEC-R/T-103/AC-8 - filas de ataque completas + especialidades en mayúsculas', () => {
  const html = window()
  expect(html).toContain('data-testid="card-attack-golpe"')
  expect(html).toContain('data-testid="card-attack-lanzallamas"')
  expect(html).toContain('data-testid="card-attack-refugio"')
  // Orden de la carta.
  expect(html.indexOf('card-attack-golpe')).toBeLessThan(html.indexOf('card-attack-lanzallamas'))
  expect(html.indexOf('card-attack-lanzallamas')).toBeLessThan(html.indexOf('card-attack-refugio'))
  // Caras, daño (con ifRoll) y costo con íconos.
  expect(html).toContain('4_')
  expect(html).toContain('5_')
  expect(html).toContain('(20) 6 (40)')
  expect(html).toContain('data-cost-row="2"')
  // Habilidad marcada (AC-8: se marcan como tales; React escapa " en texto).
  expect(html).toContain('data-kind="ability"')
  expect(html).toContain('&quot;Refugio&quot;')
  // Especialidad arriba (mayúsculas) y texto de efecto.
  expect(html).toContain('DUREZA: SOPORTA (-10).')
  expect(html.indexOf('DUREZA')).toBeLessThan(html.indexOf('card-attack-golpe'))
})

// AC: SPEC-R/T-103/AC-9 - estado por ataque con la MISMA función del combate:
// disponible vs "Falta N Fuego" (mismo criterio que canUse).
test('AC: SPEC-R/T-103/AC-9 - disponibilidad por ataque con motivo del costo', () => {
  const html = window()
  expect(html).toContain('data-available="true"')
  expect((html.match(/data-available="true"/g) ?? []).length).toBe(2) // golpe + refugio
  expect(html).toContain('data-available="false"')
  expect(html).toContain(`✖ ${es.modalMissingCostPlural.replace('{n}', '2').replace('{element}', es.elementNames.fire)}`)
})

// AC: SPEC-R/T-103/AC-10 - pie: etapa, mazo y "Evoluciona a X (n)" con barra xp/necesaria.
test('AC: SPEC-R/T-103/AC-10 - pie con etapa, mazo y barra de experiencia', () => {
  const html = window()
  expect(html).toContain(es.modalStageNames.basic)
  expect(html).toContain(es.modalDeckNames.isla)
  expect(html).toContain(es.modalEvolvesTo.replace('{name}', 'Charmander').replace('{xp}', '2'))
  expect(html).toContain('data-xp="1/2"')
})

// AC: SPEC-R/T-103/AC-11 - secciones del panel lateral (config.sections):
// estado, equipadas, disponibles con contador (no lista), multicolor, pociones.
test('AC: SPEC-R/T-103/AC-11 - panel lateral con secciones y grilla con contador', () => {
  const html = window()
  expect(html).toContain(`data-testid="${cardModalConfig.sidePanel.testid}"`)
  expect(html).toContain(es.modalStatusTitle)
  expect(html).toContain(es.hudActiveBadge)
  expect(html).toContain('data-testid="card-energy-equipped"')
  expect(html).toContain('data-testid="card-energy-available"')
  expect(html).toContain('data-count="2"') // contador del grupo fuego
  expect(html).toContain('data-element="fire"')
  expect(html).toContain(es.teamMulticolorTitle)
  expect(html).toContain(es.modalPotionsTitle)
})

// AC: SPEC-R/T-103/AC-12 - tocar una disponible emite Equip (data-command) y
// una equipada emite Unequip; sin acciones legales quedan atenuadas con motivo.
test('AC: SPEC-R/T-103/AC-12 - chips Equip/Unequip; atenuadas con motivo corto', () => {
  const html = window()
  expect(html).toMatch(/<button[^>]*data-element="fire"[^>]*data-command="Equip"/)
  expect(html).toMatch(/<button[^>]*data-element-id="element_water#1"[^>]*data-command="Unequip"/)
  const blocked = window({ actions: noActions })
  const equipButtons = blocked.match(/<button[^>]*data-command="Equip"[^>]*>/g) ?? []
  for (const tag of equipButtons) expect(tag).toContain('disabled=""')
  expect(blocked).toContain(es.modalChipBlocked)
})

// AC: SPEC-R/T-103/AC-12 - Multicolor abre el selector de 13 energías.
test('AC: SPEC-R/T-103/AC-12 - selector Multicolor con las 13 energías', () => {
  const html = window({
    actions: { ...noActions, multicolorOptions: MULTICOLOR_OPTIONS },
  })
  expect(html).toContain('data-testid="btn-multicolor-open"')
  expect(html).toContain(es.modalAssignMulticolor)
})

// AC: SPEC-R/T-103/AC-13 - "Usar poción" y "Evolucionar" solo cuando son
// legales; con varias evoluciones ofrece una por opción (Eevee).
test('AC: SPEC-R/T-103/AC-13 - poción y evolución solo legales; una opción por evolución', () => {
  const none = window()
  expect(none).not.toContain('data-testid="btn-potion"')
  expect(none).not.toContain('data-testid="btn-evolve"')

  const withActions = window({
    actions: {
      ...noActions,
      potions: [{ item: 'potion' }],
      evolutions: [
        { id: 'wartortle', name: 'Wartortle', xp: 2 },
        { id: 'fixture-b', name: 'OtraForma', xp: 2 },
      ],
    },
  })
  expect(withActions).toContain('data-testid="btn-potion"')
  expect(withActions).toContain('data-command="UsePotion"')
  const evolveButtons = withActions.match(/data-testid="btn-evolve"/g) ?? []
  expect(evolveButtons).toHaveLength(2)
  expect(withActions).toContain('data-to-id="fixture-b"')
})

// AC: SPEC-R/T-103/AC-14 - solo lectura: sin acciones y con aviso "Solo lectura".
test('AC: SPEC-R/T-103/AC-14 - modo solo lectura sin botones de acción', () => {
  const html = window({
    spec: { ...spec, readOnly: true, notice: 'rival', active: false },
    actions: noActions,
  })
  expect(html).toContain('data-testid="card-read-only"')
  expect(html).toContain(es.modalReadOnly)
  for (const command of ['Equip', 'Unequip', 'UsePotion', 'Evolve', 'AssignMulticolor']) {
    expect(html).not.toContain(`data-command="${command}"`)
  }
})

// AC: SPEC-T/T-104/AC-6 - el Multicolor asignado en "Equipadas" pasa a botón
// quitar (data-command="UnassignMulticolor") con estados habilitado/atenuado
// con motivo corto; en solo lectura no hay acciones (SPEC-R/AC-14 intacto).
test('AC: SPEC-T/T-104/AC-6 - ficha Multicolor interactiva; atenuada si es ilegal; solo lectura sin acción', () => {
  const withMulticolor = { ...spec, pkm: { ...pkm, multicolor: ['fire' as const] } }
  const enabled = window({
    spec: withMulticolor,
    actions: { ...noActions, canUnassignMulticolor: true },
  })
  expect(enabled).toMatch(/<button[^>]*data-testid="card-multicolor-equipped"[^>]*data-command="UnassignMulticolor"/)
  expect(enabled).toContain('data-multicolor="fire"')

  // Ilegal (fuera de Organize): botón atenuado con motivo corto, como las energías.
  const blocked = window({ spec: withMulticolor, actions: noActions })
  const chip = blocked.match(/<button[^>]*data-command="UnassignMulticolor"[^>]*>/)![0]!
  expect(chip).toContain('disabled=""')
  expect(blocked).toContain(es.modalChipBlocked)

  // Solo lectura (pila de Oak, rival, combate): ficha no interactiva, sin data-command.
  const readOnly = window({
    spec: { ...withMulticolor, readOnly: true, notice: 'oak', active: false },
    actions: noActions,
  })
  expect(readOnly).toContain('data-testid="card-multicolor-equipped"')
  expect(readOnly).not.toContain('data-command="UnassignMulticolor"')
})

// AC: SPEC-T/T-104/AC-7 - al quitar: la ficha desaparece de "Equipadas", el
// contador "Multicolor libres" queda expuesto para subir y las filas de ataque
// se recalculan (el ataque que pagaba con el Multicolor muestra ✖ con motivo).
test('AC: SPEC-T/T-104/AC-7 - sin la ficha, fila ✖ con "Falta 1 Fuego" y contador libre visible', () => {
  // Lanzallamas (Fuego×2) se paga con 1 Fuego equipada + Multicolor Fuego.
  const paying = {
    ...spec,
    pkm: { ...pkm, equipped: [elementCard('element_fire#1', 'fire')], multicolor: ['fire' as const] },
  }
  const withIt = window({
    spec: paying,
    actions: { ...noActions, canUnassignMulticolor: true },
  })
  expect(withIt).toContain('data-testid="card-multicolor-equipped"')
  expect(withIt).toContain('data-testid="multicolor-free"') // contador para el paso e2e en vivo
  expect((withIt.match(/data-available="true"/g) ?? []).length).toBe(3) // los 3 ataques pagan

  // Estado tras el UnassignMulticolor: misma vista, multicolor = [].
  const withoutIt = window({
    spec: { ...paying, pkm: { ...paying.pkm, multicolor: [] } },
    actions: noActions,
  })
  expect(withoutIt).not.toContain('data-testid="card-multicolor-equipped"')
  expect((withoutIt.match(/data-available="true"/g) ?? []).length).toBe(2) // golpe + refugio
  expect(withoutIt).toContain('data-available="false"')
  expect(withoutIt).toContain(
    `✖ ${es.modalMissingCost.replace('{n}', '1').replace('{element}', es.elementNames.fire)}`,
  )
})

// AC: SPEC-R/T-103/AC-17 - ninguna regla se calcula en la UI: el modal solo
// declara data-command (los handlers son del motor); claves i18n completas.
test('AC: SPEC-R/T-103/AC-17 - solo data-command; textos i18n definidos', () => {
  const html = window()
  expect(html).not.toContain('onClick="')
  for (const label of [
    es.modalCardTitle,
    es.modalReadOnly,
    es.modalAttackAvailable,
    es.modalMissingCost,
    es.modalChipBlocked,
    es.modalEvolvesTo,
  ]) {
    expect(label.length).toBeGreaterThan(0)
  }
})

// AC: SPEC-R/T-103/AC-18 - la imagen principal es el sprite del manifest, no
// la foto recortada de la carta (fallback con el nombre si falta).
test('AC: SPEC-R/T-103/AC-18 - sin fotos de cartas: sprite o fallback', () => {
  const html = window({ artUrl: '/sprites/7.gif' })
  const imgs = html.match(/<img[^>]*src="([^"]*)"/g) ?? []
  for (const tag of imgs) expect(tag).not.toMatch(/photo|crop|cards\//)
  expect(window()).toContain('data-missing="true"')
})

// AC: layout-carta-modal/AC-3 - sin boxHeightPx en el config modal, la caja
// .art no recibe tope inline de alto: absorbe el sobrante de la carta
// (flex 1 1 auto + mínimo 140 px en el CSS), en sprite y fallback.
test('AC: layout-carta-modal/AC-3 - sin tope inline de alto en .art', () => {
  expect(cardArtConfig.modal.boxHeightPx).toBeUndefined()
  const artTag = (html: string): string => html.match(/<div[^>]*data-testid="card-art"[^>]*>/)?.[0] ?? ''
  expect(artTag(window({ artUrl: '/sprites/7.gif' }))).not.toContain('max-height')
  const html = window()
  expect(html).toContain('data-missing="true"')
  expect(artTag(html)).not.toContain('max-height')
})

// AC: SPEC-U/T-105/AC-5 - misma regla fitSprite en la carta grande con su
// config modal: la caja se mide (onArtImageLoad recibe clientWidth/Height del
// ref, no un valor asumido) y antes de medir rige el fallback CSS.
test('AC: SPEC-U/T-105/AC-5 - CardFace: fitSprite con config modal y caja medida', () => {
  const withArt = window({ artUrl: '/sprites/7.gif' })
  expect(withArt).toContain('src="/sprites/7.gif"')
  expect(withArt).not.toContain('data-art-w') // SSR/primer paint ⇒ fallback CSS

  // Caja medida en runtime (la da el ref de .art): un chico sube al tope modal.
  const chico = onArtImageLoad(
    { naturalWidth: 31, naturalHeight: 57 },
    { clientWidth: 460, clientHeight: 300 },
    cardArtConfig.modal,
  )
  expect(chico).toEqual({ width: 93, height: 171 }) // fitScale 300/57≈5.26 → tope 3

  // Uno grande no desborda la caja medida, la que sea.
  const grande = onArtImageLoad(
    { naturalWidth: 200, naturalHeight: 220 },
    { clientWidth: 460, clientHeight: 300 },
    cardArtConfig.modal,
  )
  expect(grande !== null && grande.width <= 460 && grande.height <= 300).toBe(true)
})
