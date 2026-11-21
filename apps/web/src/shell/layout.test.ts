// AC: SPEC-I/T-071/AC-3, AC-4 — layout.json: fracciones, clamps y
// no-solapamiento (excepto popups). Geometría pura; las cajas reales del DOM
// las mide e2e/t071-shell.mjs.
import { expect, test } from 'vitest'
import { boxesOverlap, crossCheckLayout, panelPx, UiLayoutSchema, UI_PANEL_KEYS } from '@liga/content'
import { FOCUS_ORDER, isPopupKey, panelCss, shellPanels, uiLayout, viewportFits } from './layout'

test('AC: SPEC-I/T-071/AC-3 - layout.json valida y pasa los chequeos cruzados', () => {
  expect(UiLayoutSchema.safeParse(uiLayout).success).toBe(true)
  expect(crossCheckLayout(uiLayout)).toEqual([])
})

test('AC: SPEC-I/T-071/AC-3 - los 13 paneles existen con testid único', () => {
  const entries = Object.entries(uiLayout.panels)
  expect(entries.length).toBe(13)
  const testids = entries.map(([, panel]) => panel.testid)
  expect(new Set(testids).size).toBe(13)
  for (const key of FOCUS_ORDER) expect(uiLayout.panels[key]).toBeDefined()
  for (const key of ['cardPopup', 'battlePopup']) expect(uiLayout.panels[key]).toBeDefined()
})

// AC: SPEC-N/AC-1 — la pestaña del equipo en layout.json: pegada arriba de team
// (bottom 0,80 exacto), clamp de 44 px y en UI_PANEL_KEYS / FOCUS_ORDER.
test('AC: SPEC-N/AC-1 - teamTab en layout.json, UI_PANEL_KEYS y FOCUS_ORDER', () => {
  const tab = shellPanels.teamTab
  const team = shellPanels.team
  expect(tab.testid).toBe('btn-team-tab')
  expect(tab.x).toBeCloseTo(team.x, 6)
  expect(tab.y).toBeCloseTo(0.7266, 6)
  expect(tab.w).toBeCloseTo(team.w, 6)
  expect(tab.h).toBeCloseTo(0.0734, 6)
  expect(tab.minH).toBe(44)
  expect(UI_PANEL_KEYS).toContain('teamTab')
  expect(FOCUS_ORDER).toContain('teamTab')
  expect(crossCheckLayout(uiLayout)).toEqual([])
  // Toca el borde superior de team sin solaparlo y mide ≥ 44 px a 1024×600.
  expect(tab.y + tab.h).toBeCloseTo(team.y, 6)
  expect(panelPx(tab, 1024, 600).h).toBeGreaterThanOrEqual(44)
  for (const key of ['team', 'oakButton', 'menuButton'] as const) {
    const overlap = boxesOverlap(panelPx(tab, 1024, 600), panelPx(shellPanels[key], 1024, 600))
    expect(overlap, `teamTab vs ${key}`).toBe(false)
  }
})

// AC: SPEC-N/T-092/AC-1 — panel-dice en la columna izquierda, encima de
// panel-turn, sin solapes y dentro de pantalla a 1280×720, 1366×768 y 1920×1080
// (geometría pura con los rects de layout.json; el DOM lo mide e2e/t092-dice.mjs).
test('AC: SPEC-N/T-092/AC-1 - panel-dice a la izquierda, encima de turn, sin solapes', () => {
  const dice = shellPanels.dice
  const turn = shellPanels.turn
  expect(dice.testid).toBe('panel-dice')
  // Misma columna que panel-turn y terminando por encima de su borde superior.
  expect(dice.x).toBe(turn.x)
  expect(dice.y).toBeGreaterThan(0)
  expect(dice.y + dice.h).toBeLessThanOrEqual(turn.y)
  for (const [vw, vh] of [
    [1280, 720],
    [1366, 768],
    [1920, 1080],
  ] as const) {
    const box = panelPx(dice, vw, vh)
    expect(box.x, `x a ${String(vw)}×${String(vh)}`).toBeGreaterThanOrEqual(0)
    expect(box.y, `y a ${String(vw)}×${String(vh)}`).toBeGreaterThanOrEqual(0)
    expect(box.x + box.w, `der a ${String(vw)}×${String(vh)}`).toBeLessThanOrEqual(vw)
    expect(box.y + box.h, `abajo a ${String(vw)}×${String(vh)}`).toBeLessThanOrEqual(vh)
    for (const key of FOCUS_ORDER) {
      if (key === 'dice') continue
      const overlap = boxesOverlap(box, panelPx(shellPanels[key], vw, vh))
      expect(overlap, `dice vs ${key} a ${String(vw)}×${String(vh)}`).toBe(false)
    }
  }
})

// AC: popup-solo-en-combate/AC-4 — la caja normal del popup de combate se
// achica y deja de pisar el HUD: fracciones exactas (min/clamps y `expanded`
// sin cambios), márgenes ≥ 0.009 contra la columna derecha (x=0.829) y ≥ 0.016
// contra teamTab (y=0.7266), sin solape con ningún panel a 1280×720 y al
// mínimo 1024×600 (geometría pura; ~538×475 px, antes 563×562).
test('AC: popup-solo-en-combate/AC-4 - battlePopup normal: caja nueva, chica y sin solaparse con el HUD', () => {
  const battle = shellPanels.battlePopup
  expect(battle.x).toBeCloseTo(0.4, 6)
  expect(battle.y).toBeCloseTo(0.05, 6)
  expect(battle.w).toBeCloseTo(0.42, 6)
  expect(battle.h).toBeCloseTo(0.66, 6)
  expect(battle.minW).toBe(200)
  expect(battle.minH).toBe(320)
  // rediseno-combate-max/nota n.º 8: la caja ampliada es la ventana completa
  // (x:0, y:0, w:1, h:1); el header de 56 px se descuenta dentro del popup.
  expect(battle.expanded).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  // Márgenes (fracciones) contra la columna derecha y la pestaña del equipo
  // (epsilon por ruido de flotantes del borde compartido).
  expect(shellPanels.history.x - (battle.x + battle.w)).toBeGreaterThanOrEqual(0.009 - 1e-9)
  expect(shellPanels.teamTab.y - (battle.y + battle.h)).toBeGreaterThanOrEqual(0.016 - 1e-9)
  for (const [vw, vh] of [
    [1280, 720],
    [1024, 600],
  ] as const) {
    const box = panelPx(battle, vw, vh)
    for (const key of FOCUS_ORDER) {
      const overlap = boxesOverlap(box, panelPx(shellPanels[key], vw, vh))
      expect(overlap, `battlePopup vs ${key} a ${String(vw)}×${String(vh)}`).toBe(false)
    }
  }
  // Tamaño a 1280×720: ~538×475 px (antes 563×562: ~13 % menos área).
  const box = panelPx(battle, 1280, 720)
  expect(box.w).toBeCloseTo(537.6, 1)
  expect(box.h).toBeCloseTo(475.2, 1)
})

test('AC: SPEC-I/T-071/AC-3 - clamps dormants a 1024×600: la caja es la fracción exacta', () => {
  const vw = 1024
  const vh = 600
  for (const [key, panel] of Object.entries(uiLayout.panels)) {
    const box = panelPx(panel, vw, vh)
    expect(box.w, `${key} w`).toBeCloseTo(panel.w * vw, 0)
    expect(box.h, `${key} h`).toBeCloseTo(panel.h * vh, 0)
  }
})

test('AC: SPEC-I/T-071/AC-3 - en ventana chica el clamp de mínimos se activa', () => {
  const menu = shellPanels.menuButton
  expect(menu.minH).toBeDefined()
  // 0.05 × 500 = 25 < minH 28 ⇒ gana el clamp.
  expect(panelPx(menu, 1024, 500).h).toBe(menu.minH)
  const history = shellPanels.history
  expect(history.minW).toBeDefined()
  expect(panelPx(history, 900, 600).w).toBe(history.minW)
})

test('AC: SPEC-I/T-071/AC-3 - panelCss: % de ventana + max(minPx, %) cuando hay clamp', () => {
  const turn = panelCss(shellPanels.turn)
  expect(turn.left).toBe('0.600%')
  expect(turn.width).toContain('max(108px')
  const { minW: _mw, minH: _mh, ...plainTurn } = shellPanels.turn
  const plain = panelCss(plainTurn)
  expect(plain.width).toBe('16.500%')
})

test('AC: SPEC-I/T-071/AC-4 - sin solapamiento entre paneles normales (popups exceptuados)', () => {
  for (const [vw, vh] of [
    [1024, 600],
    [1920, 1080],
    [3840, 2160],
  ] as const) {
    const entries = Object.entries(uiLayout.panels)
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [keyA, panelA] = entries[i] as [string, (typeof entries)[number][1]]
        const [keyB, panelB] = entries[j] as [string, (typeof entries)[number][1]]
        if (isPopupKey(keyA) || isPopupKey(keyB)) continue
        const a = panelPx(panelA, vw, vh)
        const b = panelPx(panelB, vw, vh)
        expect(boxesOverlap(a, b), `${keyA} vs ${keyB} a ${String(vw)}×${String(vh)}`).toBe(false)
      }
    }
  }
})

test('AC: SPEC-I/T-071/AC-5 - mínimo de viewport: 1024×600 horizontal', () => {
  expect(viewportFits(1024, 600)).toBe(true)
  expect(viewportFits(1023, 600)).toBe(false)
  expect(viewportFits(1024, 599)).toBe(false)
  expect(viewportFits(800, 1280)).toBe(false)
  expect(viewportFits(2560, 1080)).toBe(true)
})

// AC: N-0021/AC-1 — a 1440×810 cada panel del HUD queda a ≥ 8 px de los bordes
// y de los demás (la pestaña del equipo va pegada a panel-team a propósito).
test('AC: N-0021/AC-1 - separación ≥ 8 px entre paneles y contra los bordes a 1440×810', () => {
  const [vw, vh, min] = [1440, 810, 8]
  const boxes = FOCUS_ORDER.map((key) => [key, panelPx(shellPanels[key], vw, vh)] as const)
  for (const [key, box] of boxes) {
    expect(box.x, `${key} izq`).toBeGreaterThanOrEqual(min)
    expect(box.y, `${key} arriba`).toBeGreaterThanOrEqual(min)
    expect(vw - box.x - box.w, `${key} der`).toBeGreaterThanOrEqual(min)
    expect(vh - box.y - box.h, `${key} abajo`).toBeGreaterThanOrEqual(min)
  }
  for (const [keyA, a] of boxes) {
    for (const [keyB, b] of boxes) {
      if (keyA >= keyB || (keyA === 'team' && keyB === 'teamTab')) continue
      const gap = Math.max(a.x - b.x - b.w, b.x - a.x - a.w, a.y - b.y - b.h, b.y - a.y - a.h)
      expect(gap, `${keyA} vs ${keyB}`).toBeGreaterThanOrEqual(min)
    }
  }
})
