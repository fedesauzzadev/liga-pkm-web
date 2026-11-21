// AC: SPEC-N/T-092/AC-2..AC-5 — panel-dice del HUD: dado de tablero (move y
// oportunidad), con quién tiró / propósito / último valor, historial de 3 y
// valor directo con reducedMotion o skip. Proxy SSR (renderToString, patrón
// T-074) + chequeo de fuente (NO-VISION) para lo que el SSR no ejercita.
import { readFileSync, readdirSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import type { DiePurpose } from '@liga/engine'
import { es } from '../i18n/es'
import {
  appendDiceRolls,
  diceHistoryText,
  DicePanel,
  diePurposeLabel,
  type DiceRoll,
} from './DicePanel'

const roll = (
  value: DiceRoll['value'],
  nonce: number,
  playerLabel = 'Jugador 1',
  purpose: DiePurpose = 'move',
): DiceRoll => ({ value, purpose, playerLabel, nonce })

// AC: SPEC-N/T-092/AC-2 — el panel contiene el dado con el contrato
// rollTo(value) (T-032b) y muestra quién tiró, propósito y último valor.
test('AC: SPEC-N/T-092/AC-2 - dado con rollTo + quién tiró + propósito + último valor', () => {
  const html = renderToString(<DicePanel rolls={[roll(4, 1)]} />)
  expect(html).toContain('data-testid="dice-panel"')
  expect(html).toContain('data-value="4"')
  expect(html).toContain('data-testid="dice-who"')
  expect(html).toContain('Jugador 1')
  expect(html).toContain('data-testid="dice-purpose"')
  expect(html).toContain(es.hudDiceMove)
  expect(html).toContain('data-testid="dice-value"')
  expect(html).toContain('>4<')
  // Contrato imperativo: el panel manda al dado el valor que dicta el motor.
  const source = readFileSync(new URL('./DicePanel.tsx', import.meta.url), 'utf8')
  expect(source).toContain('rollTo(current.value)')
})

// AC: SPEC-N/T-092/AC-3 (actualizado por rediseno-combate-max) — <Die3D> se
// renderiza SOLO en panel-dice (dado de tablero); el dado de combate es un
// componente propio (BattleDie, dado-de-combate → rediseno-combate-max/AC-2)
// que NO toca Die3D; el valor llega del motor y PlayScreen enruta
// (isBoardDiePriority: move/oportunidad → panel).
test('AC: SPEC-N/T-092/AC-3 - dados oficiales: panel-dice (tablero) y BattleDie (combate)', () => {
  const src = new URL('../', import.meta.url)
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }) as string[]
  const renderers = files
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
    .filter((file) => /<Die3D[\s/>]/.test(readFileSync(new URL(file, src), 'utf8')))
  expect(renderers).toEqual(['hud/DicePanel.tsx'])
  const play = readFileSync(new URL('../game/PlayScreen.tsx', import.meta.url), 'utf8')
  expect(play).toContain("event.type !== 'DieRolled'")
  expect(play).toContain('isBoardDiePurpose')
  expect(play).toContain('appendDiceRolls')
})

// AC: SPEC-N/T-092/AC-4 — dado del jugador activo + historial de las últimas 3
// en texto; la capa del HUD no captura clics (solo la caja del panel).
test('AC: SPEC-N/T-092/AC-4 - historial de las últimas 3 tiradas; clics acotados al panel', () => {
  const current = appendDiceRolls(
    [roll(1, 1), roll(2, 2)],
    [roll(3, 3), roll(4, 4), roll(5, 5)],
  )
  expect(current.map((entry) => entry.value)).toEqual([3, 4, 5])
  expect(appendDiceRolls(current, []).map((entry) => entry.value)).toEqual([3, 4, 5])
  const html = renderToString(<DicePanel rolls={current} />)
  expect(html).toContain('data-testid="dice-history"')
  expect(html).toContain(es.hudDiceHistory.replace('{values}', '5 · 4 · 3'))
  expect(html).toContain('>5<')
  // La capa .hud no captura clics; solo cada panel (GameShell.module.css).
  const css = readFileSync(new URL('../shell/GameShell.module.css', import.meta.url), 'utf8')
  expect(css).toMatch(/\.hud\s*\{[^}]*pointer-events:\s*none/s)
  expect(css).toMatch(/\.panel,\s*\n\s*\.panelButton\s*\{[^}]*pointer-events:\s*auto/s)
})

// AC: SPEC-N/T-092/AC-5 — con reducedMotion o velocidad "skip" el valor se
// muestra directamente (sin rodar): el panel reenvía ambos flags al dado.
test('AC: SPEC-N/T-092/AC-5 - reducedMotion/skip muestran el valor directo', () => {
  const reduced = renderToString(<DicePanel rolls={[roll(6, 1)]} reducedMotion />)
  expect(reduced).toContain('data-value="6"')
  const skip = renderToString(<DicePanel rolls={[roll(2, 2)]} speed="skip" />)
  expect(skip).toContain('data-value="2"')
  const source = readFileSync(new URL('./DicePanel.tsx', import.meta.url), 'utf8')
  expect(source).toContain('reducedMotion={reducedMotion}')
  expect(source).toContain('speed={speed}')
})

// Sin tiradas: estado inicial con el aviso y sin historial (AC-2/AC-4).
test('AC: SPEC-N/T-092/AC-2 - sin tiradas muestra el aviso inicial', () => {
  const html = renderToString(<DicePanel rolls={[]} canRoll />)
  expect(html).toContain(es.hudDiceIdle)
  // AC: N-0006/AC-2 — fuera de la fase de tirada no invita a tirar.
  const blocked = renderToString(<DicePanel rolls={[]} />)
  expect(blocked).not.toContain(es.hudDiceIdle)
  expect(blocked).toContain(es.hudDiceWait)
  expect(html).not.toContain('data-testid="dice-history"')
  expect(diceHistoryText([])).toBeNull()
  expect(diePurposeLabel('gate')).toBe(es.hudDiceGate)
})

// ── dado-clicable: click en el dado de panel-dice tira (RollMove) ──

// AC: dado-clicable/AC-1 — con canRoll el dado es clickeable: botón
// btn-roll-die con data-command="RollMove" y aria-label accesible; el click
// cablea onRoll (contrato por fuente, patrón SSR del repo).
test('AC: dado-clicable/AC-1 - con canRoll el dado es un botón RollMove clickeable', () => {
  const html = renderToString(<DicePanel rolls={[roll(4, 1)]} canRoll onRoll={() => undefined} />)
  expect(html).toMatch(/<button[^>]*data-testid="btn-roll-die"/)
  expect(html).toMatch(/<button[^>]*data-command="RollMove"/)
  expect(html).toContain(`aria-label="${es.hudRollButton}"`)
  const source = readFileSync(new URL('./DicePanel.tsx', import.meta.url), 'utf8')
  expect(source).toContain('onClick={onRoll}')
})

// AC: dado-clicable/AC-2 — sin canRoll no hay botón en panel-dice: el panel
// queda informativo (nada de data-command ⇒ el dado no dispara RollMove).
test('AC: dado-clicable/AC-2 - sin canRoll el panel queda informativo, sin botón', () => {
  const html = renderToString(<DicePanel rolls={[roll(4, 1)]} />)
  expect(html).not.toContain('data-testid="btn-roll-die"')
  expect(html).not.toContain('data-command')
})
