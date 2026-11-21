// @vitest-environment jsdom
// N-0021 (HUD de partida prolijo): tip de F11, historial que se achica y
// variables CSS compartidas. La geometría de AC-1 vive en layout.test.ts; las
// cajas reales y AC-5 se miran en el navegador (capturas del nodo).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { GameShell } from './GameShell'
import { shellPanels } from './layout'

afterEach(cleanup)

// AC: N-0021/AC-2
test('AC: N-0021/AC-2 - el tip de F11 va por encima de la pestaña del equipo', () => {
  render(<GameShell world={<p>w</p>} />)
  const bottom = screen.getByTestId('tip-f11').style.bottom
  // Anclado al borde superior de btn-team-tab (layout.json) + 8 px de aire.
  expect(parseFloat(bottom.replace('calc(', ''))).toBeCloseTo((1 - shellPanels.teamTab.y) * 100, 2)
  expect(bottom).toContain('8px')
})

// AC: N-0021/AC-2
test('AC: N-0021/AC-2 - cerrado el tip, no reaparece tras combate ni al ocultar/mostrar el HUD', () => {
  const { rerender } = render(<GameShell world={<p>w</p>} />)
  fireEvent.click(screen.getByTestId('tip-f11-close'))
  expect(screen.queryByTestId('tip-f11')).toBeNull()
  rerender(<GameShell world={<p>w</p>} battlePopup={<p>combate</p>} />)
  rerender(<GameShell world={<p>w</p>} />)
  expect(screen.queryByTestId('tip-f11')).toBeNull()
  fireEvent.click(screen.getByTestId('btn-hud-toggle'))
  fireEvent.click(screen.getByTestId('btn-hud-toggle'))
  expect(screen.getByTestId('panel-history')).toBeTruthy()
  expect(screen.queryByTestId('tip-f11')).toBeNull()
})

// AC: N-0021/AC-3
test('AC: N-0021/AC-3 - panel-history mide lo que su contenido, con tope en la caja de layout.json', () => {
  render(<GameShell world={<p>w</p>} />)
  const style = screen.getByTestId('panel-history').style
  expect(style.height).toBe('auto')
  expect(style.maxHeight).toContain(`${(shellPanels.history.h * 100).toFixed(3)}%`)
  // Los demás paneles conservan su alto fijo.
  expect(screen.getByTestId('panel-backpack').style.height).not.toBe('auto')
})

// AC: N-0021/AC-4
test('AC: N-0021/AC-4 - sin tamaños de letra, radios ni fondos sueltos repetidos en el CSS tocado', () => {
  for (const file of ['./GameShell.module.css', '../hud/hud.module.css']) {
    const css = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    const seen = new Map<string, number>()
    for (const [, prop, value] of css.matchAll(/^\s*(font-size|border-radius|background):\s*([^;]+);/gm)) {
      // Literales: px o color (rgba/#hex). var(), keywords y 50%/999px (formas) no cuentan.
      if (value === undefined || value.includes('var(') || !/\dpx|rgba?\(|#[0-9a-f]{3,8}/i.test(value)) continue
      if (value === '999px') continue
      const key = `${String(prop)}: ${value}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const repeated = [...seen].filter(([, count]) => count > 1).map(([key]) => key)
    expect(repeated, file).toEqual([])
  }
})
