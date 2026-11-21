// AC: rediseno-combate-max/AC-3, AC-4, AC-5 — carta TCG de combate de tamaño
// FIJO 340×540: grilla interna proporcional, fila única de resumen, sin
// "EFECTO"/"Usar" dentro de la carta y sin "(0)". Proxy SSR (renderToString):
// la estabilidad de cajas ± 0,5 px la mide el e2e (navegador real).
import { parseCardId, parsePkmUid } from '@liga/content'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { demoCards } from './demo'
import { es } from '../i18n/es'
import { attackRows } from './model'
import { PkmCard } from './PkmCard'
import type { PkmInstance } from '@liga/engine'

const squirtle: PkmInstance = {
  uid: parsePkmUid('p-demo'),
  cardId: parseCardId('squirtle'),
  damage: 0,
  xp: 0,
  equipped: [
    { id: parseCardId('element_water#1'), element: 'water' },
    { id: parseCardId('element_water#2'), element: 'water' },
  ],
  multicolor: [],
  fainted: false,
}

const ownProps = {
  card: demoCards.squirtle,
  damage: 10,
  artUrl: null as string | null,
  mode: 'own' as const,
  rows: attackRows(demoCards.squirtle, squirtle, true),
}

const cssSource = readFileSync(join(process.cwd(), 'apps/web/src/battle/PkmCard.module.css'), 'utf8')

test('AC: rediseno-combate-max/AC-4 - grilla interna fija 11/30/50/9 y tamaño 340×540 en la CSS', () => {
  expect(cssSource).toContain('grid-template-rows: 11% 30% 50% 9%')
  expect(cssSource).toContain('width: 340px')
  expect(cssSource).toContain('height: 540px')
})

test('AC: SPEC-D/T-032a/AC-3 - se dibuja desde datos: marco por mazo, nombre, HP, elemento, rollFaces, daño y costos', () => {
  const html = renderToString(<PkmCard {...ownProps} />)
  expect(html).toContain('data-deck="isla"') // marco por mazo
  expect(html).toContain('Squirtle')
  expect(html).toContain('data-hp="50/60"') // daño 10 sobre 60
  expect(html).toContain(es.elementNames.water)
  expect(html).toContain('4-5') // rollFaces de Cabezazo
  expect(html).toContain('(20)')
  expect(html).toContain(es.anyElement) // costo [any] con ícono gris
})

test('AC: rediseno-combate-max/AC-3 - ninguna fila contiene "(0)", "(00)" ni "-0"', () => {
  const html = renderToString(<PkmCard {...ownProps} />)
  expect(html).not.toContain('(0)')
  expect(html).not.toContain('(00)')
  expect(html).not.toContain('-0')
})

// AC: rediseno-combate-max/AC-3 - un ataque de efecto puro (base 0) no
// muestra etiqueta de daño pero sí su resumen de efecto.
test('AC: rediseno-combate-max/AC-3 - ataque de efecto puro: sin "(0)", con resumen', () => {
  const refugio = demoCards.squirtle.attacks.find((attack) => attack.id === 'refugio')!
  const effectOnly = { ...refugio, damage: { base: 0 } }
  const card = { ...demoCards.squirtle, attacks: [effectOnly, ...demoCards.squirtle.attacks.slice(1)] }
  const html = renderToString(<PkmCard {...ownProps} card={card} />)
  expect(html).not.toContain('(0)')
  expect(html).toContain('Refugio')
})

test('AC: rediseno-combate-max/AC-4 - cada fila: caras + nombre + daño (si hay) + costo y UNA línea de resumen', () => {
  const html = renderToString(<PkmCard {...ownProps} />)
  expect(html).toContain('data-testid="card-attack-row"')
  expect(html).toContain('los ataques le hacen (-10) a Squirtle') // resumen de Refugio
  expect(html).toContain('el ataque de tu rival hará (-10)') // resumen de Burbujas
})

test('AC: rediseno-combate-max/AC-5 - sin "EFECTO" ni "Usar" dentro de la carta', () => {
  const html = renderToString(<PkmCard {...ownProps} selectedAttackId="refugio" />)
  expect(html).not.toContain(es.battlePreviewTitle)
  expect(html).not.toContain(es.battleUse)
  expect(html).not.toContain(`<button`)
})

test('AC: rediseno-combate-max/AC-4 - realce de selección: solo data-state (contorno en CSS, sin medidas)', () => {
  const html = renderToString(<PkmCard {...ownProps} selectedAttackId="cabezazo" raised />)
  expect(html).toContain('data-state="selected"')
  expect(html).toContain('data-state="disabled"')
  expect(html).toContain('data-raised="true"')
  expect(cssSource).not.toContain('grid-template-rows: auto')
})

test('AC: rediseno-combate-max/AC-4 - con 1-4 ataques la zona se divide en partes iguales (repeat n, 1fr)', () => {
  const html = renderToString(<PkmCard {...ownProps} />)
  expect(html).toMatch(/grid-template-rows:\s*repeat\(3,\s*1fr\)/)
  const oneCard = { ...demoCards.squirtle, attacks: demoCards.squirtle.attacks.slice(0, 1) }
  const one = renderToString(
    <PkmCard {...ownProps} card={oneCard} rows={attackRows(oneCard, squirtle, false)} />,
  )
  expect(one).toMatch(/grid-template-rows:\s*repeat\(1,\s*1fr\)/)
})

test('AC: SPEC-D/T-032a/AC-2 - arte: si falta el sprite, tarjeta con el nombre (sin error)', () => {
  const html = renderToString(<PkmCard {...ownProps} artUrl={null} />)
  expect(html).toContain('data-missing="true"')
  expect(html).toContain('Squirtle')
  const withArt = renderToString(<PkmCard {...ownProps} artUrl="/sprites/7.gif" />)
  expect(withArt).toContain('src="/sprites/7.gif"')
  expect(withArt).not.toContain('data-missing')
})

test('AC: SPEC-D/T-032a/AC-5 - carta rival: fila iluminada con el valor del dado; sin ataque ⇒ "no ataca"', () => {
  const lit = renderToString(
    <PkmCard
      card={demoCards.poliwag}
      damage={20}
      artUrl={null}
      mode="rival"
      litAttackId="burbujas"
      litValue={4}
    />,
  )
  expect(lit).toContain('data-lit="true"')
  expect(lit).toContain('data-hp="30/50"')
  const noAttack = renderToString(
    <PkmCard card={demoCards.poliwag} damage={0} artUrl={null} mode="rival" notice={es.battleNoAttack} />,
  )
  expect(noAttack).toContain(es.battleNoAttack)
})
