// AC: SPEC-J/T-082/AC-1..AC-4 — pulido del HUD: panel-turn que no corta el
// botón (geometría de layout.json), sin duplicados ni panel vacío de
// inventario, tamaños mínimos (letra ≥ 13 px, fila de mochila ≥ 28 px) y
// contraste AA sobre el vidrio. Los checks de píxeles reales (scrollHeight,
// botón ≥ 44 px, solapamientos, nombres sin cortar) viven en e2e/t082-hud.mjs.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { crossCheckLayout, parseCardId, parseNodeId, parsePkmUid, parsePlayerId } from '@liga/content'
import type { PlayerState, PkmInstance, PokemonCard, Result } from '@liga/engine'
import { BoardView } from '../board/Board'
import { es } from '../i18n/es'
import { createMemoryStorage } from '../game/save'
import { startSession } from '../game/session'
import { gameContent } from '../game/content'
import { PlayScreen } from '../game/PlayScreen'
import { shellPanels, uiLayout as uiLayoutParsed } from '../shell/layout'
import { TeamStrip } from './TeamStrip'

/** CSS como texto (node:fs): los valores (px, min-height) son parte del AC. */
const readCss = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf-8')
const hudCss = readCss('./hud.module.css')
const backpackCss = readCss('./backpack.module.css')
const globalCss = readCss('../styles/global.css')

function must<T>(result: Result<T, { readonly message: string }>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

// AC-1: layout.json manda — panel-turn sube y agranda; players queda abajo.
test('AC: SPEC-J/T-082/AC-1 - panel-turn en y 0.65 / h 0.14 (N-0021) sin solapamientos', () => {
  const turn = shellPanels.turn
  expect(turn.y).toBeCloseTo(0.65, 5)
  expect(turn.h).toBeCloseTo(0.14, 5)
  expect(shellPanels.players.y).toBeCloseTo(0.8, 5)
  // El botón de tirada mide ≥ 44 px (min-height del CSS del panel).
  const rollButton = /\.rollButton\{[^}]*\}/.exec(hudCss.replace(/\s/g, ''))?.[0] ?? ''
  expect(rollButton).toContain('min-height:44px')
  // crossCheckLayout (mismo chequeo que content:validate) sin errores.
  expect(crossCheckLayout(uiLayoutParsed)).toEqual([])
})

// AC-2: sin duplicados ni panel vacío — un solo "Tirar dado" (panel-turn), sin
// botón de inventario y sin "Tirar" en el tablero (2D SSR; el 3D lo cubre e2e).
test('AC: SPEC-J/T-082/AC-2 - un solo botón de tirada y sin panel de inventario', () => {
  const started = must(startSession({ seed: 7, starterDeck: 'isla' }, gameContent))
  const html = renderToString(
    <PlayScreen session={started} storage={createMemoryStorage()} onExit={() => undefined} />,
  )
  expect((html.match(/data-testid="btn-roll"/g) ?? []).length).toBe(1)
  expect(html).not.toContain('btn-inventory')
  expect(html).not.toContain('>Inventario<')
  expect(html).toContain(es.hudRollButton)
  // El tablero 2D muestra el dado del motor, sin botón propio de tirada.
  const board = renderToString(<BoardView position="paleta" pending={null} />)
  expect(board).not.toContain('>Tirar<')
  expect(board).not.toContain(es.board3dCenterOnMe)
  // Las claves retiradas no vuelven al diccionario.
  expect('board3dRoll' in es).toBe(false)
  expect('playInventory' in es).toBe(false)
})

// AC-3: letra ≥ 13 px en los paneles, fila de mochila ≥ 28 px y contraste AA
// del texto (tinta y secundario) sobre el vidrio en su peor caso garantizado
// (panel opaco: reduced-transparency apaga la transparencia).
const fontSizesPx = (css: string): readonly number[] =>
  [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]))
const fontSizesRem = (css: string): readonly number[] =>
  [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((match) => Number(match[1]) * 16)

const channel = (hex: string, index: 0 | 1 | 2): number => {
  const raw = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
  return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string): number =>
  0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2)
const contrastRatio = (a: string, b: string): number => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const cssVar = (name: string): string => {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(globalCss)
  if (match === null) throw new Error(`falta --${name} en global.css`)
  return match[1] as string
}

test('AC: SPEC-J/T-082/AC-3 - letra ≥ 13 px, fila de mochila ≥ 28 px y contraste AA', () => {
  for (const css of [hudCss, backpackCss]) {
    expect([...fontSizesPx(css), ...fontSizesRem(css)].every((size) => size >= 13)).toBe(true)
  }
  const row = /\.row\{[^}]*\}/.exec(backpackCss.replace(/\s/g, ''))?.[0] ?? ''
  expect(row).toMatch(/min-height:(2[8-9]|[3-9]\d)px/)
  // Vidrio worst-case garantizado: panel opaco #e8f0e0 (rgba(232,240,224,1)).
  const glass = '#e8f0e0'
  expect(contrastRatio(cssVar('color-ink'), glass)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(cssVar('color-muted'), glass)).toBeGreaterThanOrEqual(4.5)
})

// AC-4: el slot del equipo muestra el nombre entero (13 px), barra de vida y
// etiqueta de activo; el nombre entra sin cortarse a los anchos del panel.
const longNameCard = {
  id: 'kangaskhan',
  dex: 115,
  name: 'Kangaskhan',
  hp: 90,
  element: 'colorless',
} as unknown as PokemonCard

const cardOf = (cardId: string): PokemonCard | undefined =>
  cardId === 'kangaskhan' ? longNameCard : undefined

test('AC: SPEC-J/T-082/AC-4 - slot con nombre, barra de vida y etiqueta de activo', () => {
  const pkm: PkmInstance = {
    uid: parsePkmUid('p1-a'),
    cardId: parseCardId('kangaskhan'),
    damage: 0,
    xp: 0,
    equipped: [],
    multicolor: [],
    fainted: false,
  }
  const player: PlayerState = {
    id: parsePlayerId('p1'),
    position: parseNodeId('paleta'),
    cameFrom: null,
    team: [pkm],
    oakPile: [],
    elements: [],
    multicolor: 0,
    items: { pokeball: 0, potion: 0, oportunidad: 0, super_potion: 0, ultraball: 0, masterball: 0 },
    medals: [],
  }
  const html = renderToString(
    <TeamStrip
      player={player}
      cardOf={cardOf}
      sprites={null}
      battle={null}
      slots={6}
      reorderable={false}
      onSelect={() => undefined}
      onReorder={() => undefined}
    />,
  )
  // Nombre completo en su span (10 caracteres: el más largo de Kanto).
  expect(html).toContain('data-testid="slot-name"')
  expect(html.match(/data-testid="slot-name"[^>]*>([^<]*)</)?.[1]).toBe('Kangaskhan')
  expect(html).toContain('data-hp="90/90"')
  expect(html).toContain('data-active="true"')
  expect(html).toContain(es.hudActiveBadge)
})

// AC-5 (unidad): sin botón de inventario, el vuelo de la carta robada apunta
// al panel de la mochila (DrawnCard › panel-backpack); el detalle de equipo se
// abre por slot y cierra con btn-team-close del overlay.
test('AC: SPEC-J/T-082/AC-5 - destino del vuelo: panel-backpack (mochila) presente', () => {
  const started = must(startSession({ seed: 7, starterDeck: 'isla' }, gameContent))
  const html = renderToString(
    <PlayScreen session={started} storage={createMemoryStorage()} onExit={() => undefined} />,
  )
  expect(html).toContain('data-testid="panel-backpack"')
  expect(html).not.toContain('data-testid="btn-inventory"')
  // Con el panel de equipo abierto (slot clickeado), el cierre vive en el overlay.
  expect(html).toContain('data-testid="team-slot-open"')
  expect(html).not.toContain('data-testid="btn-team-close"')
})
