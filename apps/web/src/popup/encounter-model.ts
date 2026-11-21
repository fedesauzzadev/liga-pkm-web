// Modelo del popup de encuentro salvaje (plan unificar-popup-encuentro):
// geometría pura (estilo cardModalGeometry) + precarga del sprite de frente.
// Medidas de content/ui/encounter-popup.json (validado con Zod en la frontera);
// obstáculos = TODOS los paneles del HUD de layout.json. Sin DOM (jsdom/e2e
// replican lo mismo por data-testid).
import type { EncounterPopup, PxBox, UiLayout, UiPanel } from '@liga/content'
import { EncounterPopupSchema, POPUP_PANEL_KEYS, boxesOverlap, panelPx } from '@liga/content'
import encounterPopupJson from '../../../../content/ui/encounter-popup.json'

export const encounterConfig: EncounterPopup = EncounterPopupSchema.parse(encounterPopupJson)

export interface EncounterGeometry {
  readonly window: PxBox
  readonly cardW: number
  readonly cardH: number
  readonly sideW: number
  /** AC-2: true si quedó encima de un panel pese al achicado (no pasa en los tamaños soportados). */
  readonly coversPanel: boolean
}

/** Paneles del HUD como cajas px (obstáculos a esquivar, AC-2). Los popups de
 * layout.json (cardPopup/battlePopup) NO son HUD: son cajas de popups. */
export function encounterObstacles(layout: UiLayout, vw: number, vh: number): readonly PxBox[] {
  const popups = POPUP_PANEL_KEYS as readonly string[]
  return Object.entries(layout.panels)
    .filter(([key]) => !popups.includes(key))
    .map(([, panel]) => panelPx(panel as UiPanel, vw, vh))
}

/** Caja del rectángulo permitido: safeArea con margen por lado (AC-2). */
export function encounterAllowedRect(
  vw: number,
  vh: number,
  config: EncounterPopup,
  layout: UiLayout,
): PxBox {
  const margin = config.safeAreaMarginPx
  const safe = layout.safeArea
  return {
    x: safe.x * vw + margin,
    y: safe.y * vh + margin,
    w: safe.w * vw - margin * 2,
    h: safe.h * vh - margin * 2,
  }
}

interface EncounterDims {
  readonly w: number
  readonly cardW: number
  readonly cardH: number
  readonly sideW: number
}

/** Ancho total y piezas para un alto de ventana (null si no entra en el rect). */
function dimsOf(height: number, rect: PxBox, config: EncounterPopup): EncounterDims | null {
  const cardH = height - config.padPx * 2
  if (cardH <= 0) return null
  const cardW = cardH * config.aspect
  const sideAvail = rect.w - config.padPx * 2 - cardW - config.gapPx
  if (sideAvail < config.buttons.minPx) return null
  const sideW = Math.min(config.buttons.maxPx, sideAvail)
  return { w: config.padPx * 2 + cardW + config.gapPx + sideW, cardW, cardH, sideW }
}

/**
 * AC-2: caja centrada en el rectángulo safeArea−12px, alto = min(760, rect),
 * ancho = carta (alto interno × aspecto) + gap + columna clamp(min..max). Si la
 * caja centrada tapa un panel del HUD, se achica el alto (la carta mantiene el
 * aspecto) hasta esquivar todos los paneles; si no logra, queda la más chica
 * posible con `coversPanel: true` (no ocurre en los viewports soportados).
 */
export function encounterGeometry(
  vw: number,
  vh: number,
  config: EncounterPopup,
  layout: UiLayout,
): EncounterGeometry {
  const rect = encounterAllowedRect(vw, vh, config, layout)
  const obstacles = encounterObstacles(layout, vw, vh)
  const fits = (box: PxBox): boolean => !obstacles.some((obstacle) => boxesOverlap(box, obstacle))
  const center = (w: number, h: number): PxBox => ({
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    w,
    h,
  })
  const maxH = Math.min(config.maxHeightPx, rect.h)
  let smallest: EncounterGeometry | null = null
  for (let h = Math.floor(maxH); h >= config.minHeightPx; h -= 1) {
    const dims = dimsOf(h, rect, config)
    if (dims === null || dims.w > rect.w) continue
    const geo: EncounterGeometry = {
      window: center(dims.w, h),
      cardW: dims.cardW,
      cardH: dims.cardH,
      sideW: dims.sideW,
      coversPanel: false,
    }
    if (fits(geo.window)) return geo
    smallest = { ...geo, coversPanel: true }
  }
  if (smallest !== null) return smallest
  // Viewport irrecuperable (menor al mínimo soportado): la caja ES el rect.
  return {
    window: rect,
    cardW: Math.max(config.aspect * 100, rect.h * config.aspect),
    cardH: Math.max(100, rect.h - config.padPx * 2),
    sideW: config.buttons.minPx,
    coversPanel: true,
  }
}

// ── Precarga del sprite de frente (AC-3) ──

export interface SpritePreloadResult {
  readonly ok: boolean
  readonly reason: string
}

/** Imagen mínima que necesita la precarga (tests la inyectan). */
export interface SpriteImage {
  set src(url: string)
  onload: (() => void) | null
  onerror: (() => void) | null
}
/** Fábrica inyectable del elemento imagen (tests); null ⇒ sin Image (SSR). */
export type ImageFactory = () => SpriteImage | null

const browserImageFactory: ImageFactory = () =>
  typeof Image === 'undefined' ? null : (new Image() as unknown as SpriteImage)

/**
 * AC-3: precarga el sprite con un timeout; devuelve ok=false con el motivo si
 * falla, expira o no hay manifest. Avisa por `warn` (console.warn por defect)
 * para que el recuadro con el nombre quede explicado en consola.
 */
export async function preloadSprite(
  url: string | null,
  timeoutMs: number,
  warn: (message: string) => void = console.warn,
  makeImage: ImageFactory = browserImageFactory,
): Promise<SpritePreloadResult> {
  if (url === null) {
    const reason = 'sin manifest de sprites (pnpm assets)'
    warn(`[popup-encounter] sprite no disponible: ${reason}`)
    return { ok: false, reason }
  }
  const image = makeImage()
  if (image === null) return { ok: true, reason: '' }
  return await new Promise<SpritePreloadResult>((resolve) => {
    let settled = false
    const finish = (result: SpritePreloadResult): void => {
      if (settled) return
      settled = true
      if (!result.ok) warn(`[popup-encounter] sprite no disponible: ${result.reason}`)
      resolve(result)
    }
    const timer = setTimeout(() => finish({ ok: false, reason: `timeout de ${String(timeoutMs)} ms` }), timeoutMs)
    image.onload = () => {
      clearTimeout(timer)
      finish({ ok: true, reason: '' })
    }
    image.onerror = () => {
      clearTimeout(timer)
      finish({ ok: false, reason: `falló cargar ${url}` })
    }
    image.src = url
  })
}
