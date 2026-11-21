// AC: SPEC-D/T-032a/AC-6 — placas con nombre, barra de HP (tween 600 ms) e íconos de estado.
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { ANIMATION_CONFIG } from '../events/anim.config'
import { es } from '../i18n/es'
import { HpPlate } from './HpPlate'
import { statusViews } from './model'

test('AC: SPEC-D/T-032a/AC-6 - placa con nombre y HP actual/máx con tween de 600 ms', () => {
  expect(ANIMATION_CONFIG.hpTweenMs).toBe(600)
  const html = renderToString(
    <HpPlate name="Squirtle" hpMax={60} damage={10} side="player" />,
  )
  expect(html).toContain('Squirtle')
  expect(html).toContain('data-hp="50/60"')
  expect(html).toContain('transition-duration:600ms') // tween de la barra
  expect(html).toContain('scaleX(0.8333333333333334)') // 50/60 sin layout shift
})

test('AC: SPEC-D/T-032a/AC-6 - íconos de estado con tooltip (title/aria-label)', () => {
  const html = renderToString(
    <HpPlate
      name="Tangela"
      hpMax={80}
      damage={0}
      side="rival"
      statuses={[
        { kind: 'sleep' },
        { kind: 'poison' },
        { kind: 'noAttack' },
        { kind: 'shield', text: '(-10)' },
      ]}
    />,
  )
  expect(html).toContain(`title="${es.battleStatusSleep}"`)
  expect(html).toContain(`title="${es.battleStatusPoison}"`)
  expect(html).toContain(`title="${es.battleStatusNoAttack}"`)
  expect(html).toContain(`title="${es.battleStatusShield}"`)
  expect(html).toContain('(-10)')
})

// AC: visibilidad-estados-combate/AC-5 - íconos nuevos: confundido, drenado y buff.
test('AC: visibilidad-estados-combate/AC-5 - íconos de confundido, drenado y buff (+10)', () => {
  const html = renderToString(
    <HpPlate
      name="Abra"
      hpMax={50}
      damage={10}
      side="player"
      statuses={[
        { kind: 'confused' },
        { kind: 'drain' },
        { kind: 'boost', text: '(+10)' },
      ]}
    />,
  )
  expect(html).toContain(`title="${es.battleStatusConfused}"`)
  expect(html).toContain(`title="${es.battleStatusDrain}"`)
  expect(html).toContain(`title="${es.battleStatusBoost}"`)
  expect(html).toContain('Conf')
  expect(html).toContain('Dren')
  expect(html).toContain('(+10)')
})

// AC: combate-legible/AC-4 - la placa refleja la confusión EN VIVO: las
// conditions del actor del stage (parcheadas por ConditionApplied, no solo al
// entrar) alimentan statusViews y el ícono "Conf" aparece sin esperar un sendOut.
test('AC: combate-legible/AC-4 - conditions vivas del stage encienden el ícono Conf', () => {
  const live = statusViews({ rollGate: { failFaces: [1, 2], outcome: 'selfHit', duration: 'nextTurn' } })
  const html = renderToString(
    <HpPlate name="Abra" hpMax={50} damage={10} side="player" statuses={live} />,
  )
  expect(html).toContain(`title="${es.battleStatusConfused}"`)
  expect(html).toContain('Conf')
})
