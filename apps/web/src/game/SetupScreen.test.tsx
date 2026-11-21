// AC: SPEC-D/T-034/AC-1 — setup: elegir 1 de 5 iniciales con carta y
// descripción (elemento, PS, ataques) y semilla opcional.
import { DECK_IDS, PokemonFileSchema } from '@liga/content'
import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import samples from '../../../../content/pokemon/_samples.json'
import { es } from '../i18n/es'
import { SetupScreen } from './SetupScreen'
import type { StarterOption } from './content'

const squirtle = PokemonFileSchema.parse(samples).cards.find((card) => card.id === 'squirtle')
if (squirtle === undefined) throw new Error('fixture squirtle ausente en _samples.json')

/** 5 opciones: cuatro con carta real, una (llanura) sin carta en el contenido. */
const options: readonly StarterOption[] = DECK_IDS.map((deck) => ({
  deck,
  card: deck === 'llanura' ? null : squirtle,
}))

const props = {
  options,
  seedInput: '',
  onSeedInput: () => undefined,
  onStart: () => undefined,
  onBack: () => undefined,
}

test('AC: SPEC-D/AC-1 - muestra los 5 iniciales con carta y descripción', () => {
  const html = renderToString(<SetupScreen {...props} />)
  for (const deck of DECK_IDS) {
    expect(html).toContain(`data-deck="${deck}"`)
    expect(html).toContain(es.setupDeckNames[deck])
  }
  expect(html).toContain('Squirtle')
  // renderToString separa expresiones con <!-- -->: se asserts por partes.
  expect(html).toContain(es.setupElement)
  expect(html).toContain(es.elementNames.water)
  expect(html).toContain(es.setupHp)
  expect(html).toContain(String(squirtle.hp))
  for (const attack of squirtle.attacks) {
    expect(html).toContain(attack.name)
    expect(html).toContain(String(attack.damage.base))
  }
})

test('AC: SPEC-D/AC-1 - el inicial sin carta en el contenido queda deshabilitado con aviso', () => {
  const html = renderToString(<SetupScreen {...props} />)
  const at = html.indexOf('data-deck="llanura"')
  expect(at).toBeGreaterThanOrEqual(0)
  expect(html.slice(at, at + 40)).toContain('disabled')
  expect(html).toContain(es.setupStarterMissing)
})

test('AC: SPEC-D/AC-3 - semilla opcional visible en el setup para repetir la partida', () => {
  const html = renderToString(<SetupScreen {...props} seedInput="4242" />)
  expect(html).toContain(es.setupSeedLabel)
  expect(html).toContain('data-setup="seed"')
  expect(html).toContain('value="4242"')
})

const css = readFileSync(new URL('./game.module.css', import.meta.url), 'utf8')
const sprites = { [String(squirtle.dex)]: { front: '/sprites/7.gif', back: null } }

// AC: N-0020/AC-1 — cada mazo disponible muestra el sprite de su inicial y la
// grilla queda centrada (el SSR no hace layout ⇒ CSS fuente + captura mirada).
test('AC: N-0020/AC-1 - sprite del inicial en cada mazo disponible y grilla centrada', () => {
  const html = renderToString(<SetupScreen {...props} sprites={sprites} />)
  expect(html.match(/<img[^>]*src="\/sprites\/7\.gif"/g)).toHaveLength(4)
  expect(css).toMatch(/\.cards\s*\{[^}]*justify-content:\s*center/s)
})

// AC: N-0020/AC-2 — sin carta: deshabilitado (no clickeable), con etiqueta y
// estilo propio; los disponibles tienen hover/foco visible.
test('AC: N-0020/AC-2 - mazo sin carta deshabilitado y marcado; hover/foco en los disponibles', () => {
  const html = renderToString(<SetupScreen {...props} sprites={sprites} />)
  const at = html.indexOf('data-deck="llanura"')
  const button = html.slice(at, html.indexOf('</button>', at))
  expect(button).toContain('disabled=""')
  expect(button).toContain(es.setupUnavailable)
  expect(button).not.toContain('<img')
  expect(css).toMatch(/\.card:disabled\s*\{[^}]*border-style:\s*dashed/s)
  expect(css).toMatch(/\.card:not\(:disabled\):hover/)
  expect(css).toMatch(/\.card:focus-visible/)
})

// AC: N-0020/AC-4 — el setup usa la marca del lobby ⇒ el shell no suma margen
// (sin scroll de página); el resto se mira en capturas 1440×810 y 1024×768.
test('AC: N-0020/AC-4 - setup marcado como pantalla de lobby (shell sin margen)', () => {
  expect(renderToString(<SetupScreen {...props} />)).toContain('data-title-screen')
})
