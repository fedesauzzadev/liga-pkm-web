/// <reference types="vite/client" />
// Layout del HUD (SPEC-I/T-071): content/ui/layout.json parseado con Zod en la
// frontera (patrón de game/content.ts: la UI carga sus JSON por su cuenta) y
// helpers de geometría que replican el CSS del shell (max(minPx, fracción)).
import type { CSSProperties } from 'react'
import {
  POPUP_PANEL_KEYS,
  UI_PANEL_KEYS,
  UiLayoutSchema,
  type PanelBox,
  type PopupPanelKey,
  type UiLayout,
  type UiPanel,
  type UiPanelKey,
} from '@liga/content'
import layoutJson from '../../../../content/ui/layout.json'

export const uiLayout: UiLayout = UiLayoutSchema.parse(layoutJson)

/** Panel requerido (crossCheckLayout garantiza que existen; acá falla rápido). */
function requiredPanel(key: UiPanelKey): UiPanel {
  const panel = uiLayout.panels[key]
  if (panel === undefined) throw new Error(`layout.json: falta el panel "${key}"`)
  return panel
}

export const shellPanels: Readonly<Record<UiPanelKey, UiPanel>> = Object.fromEntries(
  UI_PANEL_KEYS.map((key) => [key, requiredPanel(key)]),
) as Record<UiPanelKey, UiPanel>

export type { PopupPanelKey, UiPanel }
export { POPUP_PANEL_KEYS }

export const isPopupKey = (key: string): key is PopupPanelKey =>
  (POPUP_PANEL_KEYS as readonly string[]).includes(key)

/** Orden lógico de Tab (AC-7): anteojitos (ocultar-hud) → dev-encounter (dev) → dado (T-092) → acción principal → equipo (+ su pestaña, T-089) → resto → menú. */
export const FOCUS_ORDER = [
  'hudToggle',
  'devEncounter',
  'dice',
  'turn',
  'team',
  'teamTab',
  'players',
  'history',
  'backpack',
  'oakButton',
  'menuButton',
] as const
export type FocusPanelKey = (typeof FOCUS_ORDER)[number]

const pct = (frac: number): string => `${(frac * 100).toFixed(3)}%`

/** Caja de un panel con los clamps px del panel base (compartido normal/expandido). */
function boxCss(box: PanelBox, panel: UiPanel): CSSProperties {
  return {
    left: pct(box.x),
    top: pct(box.y),
    width: panel.minW === undefined ? pct(box.w) : `max(${String(panel.minW)}px, ${pct(box.w)})`,
    height: panel.minH === undefined ? pct(box.h) : `max(${String(panel.minH)}px, ${pct(box.h)})`,
  }
}

/** Estilo de posicionamiento del panel: fracciones de la ventana + clamp px. */
export function panelCss(panel: UiPanel): CSSProperties {
  return boxCss(panel, panel)
}

/** T-075/AC-2: caja "Ampliar" del popup (layout.json › expanded); sin expanded, la normal. */
export function expandedPanelCss(panel: UiPanel): CSSProperties {
  return boxCss(panel.expanded ?? panel, panel)
}

/** ¿La ventana cumple el mínimo de layout.json y es horizontal? (AC-5). */
export function viewportFits(vw: number, vh: number): boolean {
  const { minWidth, minHeight } = uiLayout.viewport
  return vw >= minWidth && vh >= minHeight && vw >= vh
}

/** layoutDebug=1 en la URL: placeholders medibles de TODOS los panels (e2e). */
export const layoutDebugFromUrl = (): boolean =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('layoutDebug')
