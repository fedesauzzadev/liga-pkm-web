// Layout del HUD inmersivo (content/ui/layout.json, SPEC-I/T-071). Fracciones
// de ventana (0-1) para cada panel de "vidrio" sobre el canvas 3D; clamps
// minW/minH en px para pantallas chicas. La cámara (T-076) usa ui/camera.json.
// Chequeos cruzados puros (sin node:fs): los consume validate.ts y los tests
// de la UI.
import { z } from 'zod'

const FracSchema = z.number().min(0).max(1)

/** Caja en fracciones de la ventana; opcionalmente clamp de mínimos en px. */
export const PanelBoxSchema = z.object({
  x: FracSchema,
  y: FracSchema,
  w: FracSchema,
  h: FracSchema,
  minW: z.number().int().positive().optional(),
  minH: z.number().int().positive().optional(),
})
export type PanelBox = z.infer<typeof PanelBoxSchema>

/** Panel del HUD: caja + testid + extras que consumen las tareas de UI. */
export const UiPanelSchema = PanelBoxSchema.extend({
  testid: z.string().min(1),
  rows: z.number().int().positive().optional(),
  slots: z.number().int().positive().optional(),
  gap: FracSchema.optional(),
  autoDismissMs: z.number().int().positive().optional(),
  expanded: z.object({ x: FracSchema, y: FracSchema, w: FracSchema, h: FracSchema }).optional(),
})
export type UiPanel = z.infer<typeof UiPanelSchema>

/** Claves requeridas en layout.json (SPEC-I mapa de pantalla; SPEC-N suma teamTab y dice; ocultar-hud suma hudToggle; probar-encuentro-abra suma devEncounter). */
export const UI_PANEL_KEYS = [
  'history',
  'backpack',
  'oakButton',
  'menuButton',
  'hudToggle',
  'devEncounter',
  'dice',
  'turn',
  'players',
  'teamTab',
  'team',
  'cardPopup',
  'battlePopup',
] as const
export type UiPanelKey = (typeof UI_PANEL_KEYS)[number]

/** Popups: se dibujan encima y pueden solaparse con el resto (SPEC-I/AC-4). */
export const POPUP_PANEL_KEYS = ['cardPopup', 'battlePopup'] as const
export type PopupPanelKey = (typeof POPUP_PANEL_KEYS)[number]

export const UiLayoutSchema = z.object({
  _status: z.string().optional(),
  viewport: z.object({
    minWidth: z.number().int().positive(),
    minHeight: z.number().int().positive(),
    orientation: z.string(),
    target: z.string().optional(),
  }),
  safeArea: PanelBoxSchema.extend({ note: z.string().optional() }),
  panels: z.record(z.string(), UiPanelSchema),
  style: z.object({
    panelOpacity: z.number().min(0).max(1),
    radius: z.number().min(0),
    blurPx: z.number().min(0),
    borderPx: z.number().min(0),
  }),
})
export type UiLayout = z.infer<typeof UiLayoutSchema>

// ── Presets de cámara inmersiva (content/ui/camera.json, SPEC-I/T-076) ──
// SPEC-M/T-085: elevationDeg = PICADA (pitch) = ángulo entre la dirección de
// mirada y el plano horizontal (0° horizontal, 90° cenital). El polar de
// three se convierte como polar = 90 − picada; los rangos por modo son
// pitchDegRange (antes polarDegRange, ya no existe) y pitchClampDeg es el
// clamp duro que ningún modo supera (ni al arrastrar ni con la rueda).

const DegSchema = z.number().min(0).max(89)
const FovSchema = z.number().min(20).max(100)
const PositiveRange = z.tuple([z.number().positive(), z.number().positive()])
const AzimuthRange = z.tuple([z.number().min(-180).max(180), z.number().min(-180).max(180)])
const PitchRange = z.tuple([DegSchema, DegSchema])

export const UiCameraSchema = z.object({
  _status: z.string().optional(),
  /** Clamp duro de picada (SPEC-M/T-085/AC-1): ningún modo lo supera. */
  pitchClampDeg: DegSchema,
  overview: z.object({
    fov: FovSchema,
    elevationDeg: DegSchema,
    /** Rango de picada permitido en overview (SPEC-M/T-085/AC-1). */
    pitchDegRange: PitchRange,
    fit: z.literal('board'),
    margin: z.number().min(0).max(0.5),
    zoomRange: PositiveRange,
    panLimit: z.number().min(0).max(1),
    azimuthDegRange: AzimuthRange,
  }),
  /**
   * SPEC-J/T-077: modo de exploración (por defecto). Con
   * `targetFollowsToken: false` (camara-libre-sin-ficha) el objetivo queda
   * anclado al tablero: ninguna ficha mueve la cámara; el centrado es
   * explícito con buttons/keys `centerOnMe`.
   */
  explore: z.object({
    fov: FovSchema,
    elevationDeg: DegSchema,
    distance: z.number().positive(),
    distanceRange: PositiveRange,
    /** Rango de picada del explore (SPEC-M/T-085/AC-1; antes polarDegRange). */
    pitchDegRange: PitchRange,
    azimuthDegRange: AzimuthRange,
    targetFollowsToken: z.boolean(),
    damping: z.number().min(0.01).max(1),
    panSpeed: z.number().positive(),
    rotateSpeed: z.number().positive(),
    /** camara-libre-3d/AC-2: distancia por notch de rueda (zoom continuo). */
    wheelZoomStep: z.number().positive(),
    /** camara-libre-3d/AC-3: grados de órbita por pixel de arrastre. */
    dragRotateDegPerPx: z.number().min(0.01).max(5),
  }),
  follow: z.object({
    fov: FovSchema,
    elevationDeg: DegSchema,
    distance: z.number().positive(),
    lookAhead: z.number().min(0),
    damping: z.number().min(0.01).max(1),
    minHeight: z.number().positive(),
  }),
  fork: z.object({
    elevationDeg: DegSchema,
    distance: z.number().positive(),
  }),
  /** SPEC-J/T-077/AC-4: destino de la cámara al cerrar el turno. */
  afterTurn: z.enum(['explore', 'overview']),
  buttons: z.object({
    /** camara-libre-sin-ficha: "Centrar en mí" (modo destino al centrar). */
    centerOnMe: z.enum(['explore', 'overview']),
    overview: z.literal('overview'),
  }),
  keys: z.object({
    rotateLeft: z.string().min(1),
    rotateRight: z.string().min(1),
    pan: z.array(z.string().min(1)).length(4),
    zoomIn: z.string().min(1),
    zoomOut: z.string().min(1),
    overview: z.string().min(1),
    centerOnMe: z.string().min(1),
  }),
  transitions: z.object({
    overviewToFollowMs: z.number().int().positive(),
    followToOverviewMs: z.number().int().positive(),
    easing: z.literal('easeInOutCubic'),
    holdAfterTurnMs: z.number().int().min(0),
  }),
  perf: z.object({
    dpr: z.tuple([z.number().min(1).max(4), z.number().min(1).max(4)]),
    lowFpsThreshold: z.number().int().positive(),
    lowFpsSeconds: z.number().int().positive(),
  }),
})
export type UiCamera = z.infer<typeof UiCameraSchema>

/**
 * Chequeos cruzados de camera.json (SPEC-I/T-076 + SPEC-J/T-077 +
 * SPEC-M/T-085): rangos crecientes, picadas por defecto dentro de sus
 * pitchDegRange, clamp duro respetado por todos los modos y transiciones
 * consistentes con la easing soportada por el rig.
 */
export function crossCheckCamera(camera: UiCamera): string[] {
  const errors: string[] = []
  const increasing = (
    range: readonly [number, number],
    label: string,
  ): void => {
    if (range[0] >= range[1]) {
      errors.push(`content/ui/camera.json: ${label} debe ser [mín, máx] creciente`)
    }
  }
  increasing(camera.overview.zoomRange, 'overview.zoomRange')
  increasing(camera.overview.azimuthDegRange, 'overview.azimuthDegRange')
  increasing(camera.overview.pitchDegRange, 'overview.pitchDegRange')
  increasing(camera.perf.dpr, 'perf.dpr')
  increasing(camera.explore.distanceRange, 'explore.distanceRange')
  increasing(camera.explore.pitchDegRange, 'explore.pitchDegRange')
  increasing(camera.explore.azimuthDegRange, 'explore.azimuthDegRange')
  const [exploreMinDistance, exploreMaxDistance] = camera.explore.distanceRange
  if (camera.explore.distance < exploreMinDistance || camera.explore.distance > exploreMaxDistance) {
    errors.push('content/ui/camera.json: explore.distance debe caer dentro de explore.distanceRange')
  }
  if (camera.explore.wheelZoomStep >= exploreMaxDistance - exploreMinDistance) {
    errors.push(
      'content/ui/camera.json: explore.wheelZoomStep debería ser menor al span de explore.distanceRange (zoom continuo, no saltos)',
    )
  }
  const [exploreMinPitch, exploreMaxPitch] = camera.explore.pitchDegRange
  if (
    camera.explore.elevationDeg < exploreMinPitch ||
    camera.explore.elevationDeg > exploreMaxPitch
  ) {
    errors.push(
      'content/ui/camera.json: explore.elevationDeg (picada) debe caer dentro de explore.pitchDegRange',
    )
  }
  const [overviewMinPitch, overviewMaxPitch] = camera.overview.pitchDegRange
  if (
    camera.overview.elevationDeg < overviewMinPitch ||
    camera.overview.elevationDeg > overviewMaxPitch
  ) {
    errors.push(
      'content/ui/camera.json: overview.elevationDeg (picada) debe caer dentro de overview.pitchDegRange',
    )
  }
  // SPEC-M/T-085/AC-1: ningún modo supera el clamp duro de picada.
  const pitches: ReadonlyArray<readonly [string, number]> = [
    ['overview.elevationDeg', camera.overview.elevationDeg],
    ['overview.pitchDegRange máx', overviewMaxPitch],
    ['explore.elevationDeg', camera.explore.elevationDeg],
    ['explore.pitchDegRange máx', exploreMaxPitch],
    ['follow.elevationDeg', camera.follow.elevationDeg],
    ['fork.elevationDeg', camera.fork.elevationDeg],
  ]
  for (const [label, pitch] of pitches) {
    if (pitch > camera.pitchClampDeg) {
      errors.push(
        `content/ui/camera.json: ${label} (${pitch}°) supera pitchClampDeg (${camera.pitchClampDeg}°)`,
      )
    }
  }
  if (camera.fork.distance <= camera.follow.distance) {
    errors.push('content/ui/camera.json: fork.distance debería superar a follow.distance')
  }
  return errors
}

// ── Ventana de carta del Pokémon (content/ui/card-modal.json, SPEC-R/T-103) ──

export const CARD_MODAL_SECTIONS = [
  'status',
  'energiesEquipped',
  'energiesAvailable',
  'multicolor',
  'potions',
  'evolution',
] as const
export type CardModalSection = (typeof CARD_MODAL_SECTIONS)[number]

/** Medidas de la ventana de carta (SPEC-R/T-103): fracciones de la ventana y px. */
export const CardModalSchema = z.object({
  _status: z.string().optional(),
  modal: z.object({
    testid: z.string().min(1),
    heightVh: z.number().min(0.3).max(1),
    maxHeightPx: z.number().int().positive(),
    minHeightPx: z.number().int().positive(),
    center: z.literal(true),
    backdropOpacity: z.number().min(0).max(1),
    animationMs: z.number().int().min(0),
    closeOnEsc: z.boolean(),
    closeOnBackdropClick: z.boolean(),
  }),
  card: z.object({
    testid: z.string().min(1),
    aspect: z.number().min(0.3).max(1.5),
    aspectTolerance: z.number().min(0),
    fontMinPx: z.number().int().positive(),
  }),
  sidePanel: z.object({
    testid: z.string().min(1),
    widthPx: z.number().int().positive(),
    gapPx: z.number().int().min(0),
    scroll: z.literal('internal-only'),
  }),
  sections: z.array(z.enum(CARD_MODAL_SECTIONS)).min(1),
  equipChip: z.object({ minHeightPx: z.number().int().positive(), minWidthPx: z.number().int().positive() }),
  responsive: z.object({
    minViewport: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    stackBelowPx: z.number().int().positive(),
  }),
})
export type CardModal = z.infer<typeof CardModalSchema>

/** Chequeos cruzados de card-modal.json (SPEC-R/T-103): coherencia numérica. */
export function crossCheckCardModal(config: CardModal): string[] {
  const errors: string[] = []
  const { modal, card, responsive } = config
  if (modal.minHeightPx >= modal.maxHeightPx) {
    errors.push('content/ui/card-modal.json: modal.minHeightPx debe ser < modal.maxHeightPx')
  }
  if (card.aspectTolerance >= card.aspect) {
    errors.push('content/ui/card-modal.json: card.aspectTolerance debe ser < card.aspect')
  }
  if (responsive.stackBelowPx >= responsive.minViewport[0]) {
    // No es error (el apilado es de respaldo bajo el mínimo soportado), pero avisamos.
    errors.push(
      'content/ui/card-modal.json: responsive.stackBelowPx debería ser < responsive.minViewport[0]',
    )
  }
  const seen = new Set<string>()
  for (const section of config.sections) {
    if (seen.has(section)) {
      errors.push(`content/ui/card-modal.json: sección repetida "${section}"`)
    }
    seen.add(section)
  }
  for (const required of CARD_MODAL_SECTIONS) {
    if (!seen.has(required)) {
      errors.push(`content/ui/card-modal.json: falta la sección "${required}"`)
    }
  }
  return errors
}

// ── Geometría pura (la replican el CSS del shell y los tests/e2e) ──

export interface PxBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** Caja en px del panel a un tamaño de ventana (clamp = CSS max(minPx, frac)). */
export function panelPx(panel: UiPanel, vw: number, vh: number): PxBox {
  return {
    x: panel.x * vw,
    y: panel.y * vh,
    w: Math.max(panel.w * vw, panel.minW ?? 0),
    h: Math.max(panel.h * vh, panel.minH ?? 0),
  }
}

/**
 * Tolerancia de redondeo (px): dos cajas que se TOCAN no se solapan y el
 * ruido de flotantes de un borde compartido (SPEC-N: la pestaña del equipo
 * cierra exacto en 0,80 = borde superior de team) no cuenta como solape.
 */
const OVERLAP_EPS_PX = 1e-6

export const boxesOverlap = (a: PxBox, b: PxBox): boolean =>
  a.x < b.x + b.w - OVERLAP_EPS_PX &&
  b.x < a.x + a.w - OVERLAP_EPS_PX &&
  a.y < b.y + b.h - OVERLAP_EPS_PX &&
  b.y < a.y + a.h - OVERLAP_EPS_PX

/**
 * Chequeos de layout (SPEC-I/T-071/AC-3/AC-4): todos los paneles requeridos
 * presentes, testids únicos y sin solapamiento entre paneles normales a los
 * tamaños de referencia (con clamps aplicados). Los popups pueden solaparse
 * con todo.
 */
export function crossCheckLayout(layout: UiLayout): string[] {
  const errors: string[] = []
  for (const key of UI_PANEL_KEYS) {
    if (layout.panels[key] === undefined) errors.push(`content/ui/layout.json: falta el panel "${key}"`)
  }
  const seen = new Map<string, string>()
  for (const [key, panel] of Object.entries(layout.panels)) {
    const prev = seen.get(panel.testid)
    if (prev !== undefined) {
      errors.push(`content/ui/layout.json: testid duplicado "${panel.testid}" (${prev} y ${key})`)
    }
    seen.set(panel.testid, key)
  }
  const sizes: ReadonlyArray<readonly [number, number]> = [
    [layout.viewport.minWidth, layout.viewport.minHeight],
    [1920, 1080],
  ]
  for (const [vw, vh] of sizes) {
    const entries = Object.entries(layout.panels)
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [keyA, panelA] = entries[i] as [string, UiPanel]
        const [keyB, panelB] = entries[j] as [string, UiPanel]
        const isPopup =
          (POPUP_PANEL_KEYS as readonly string[]).includes(keyA) ||
          (POPUP_PANEL_KEYS as readonly string[]).includes(keyB)
        if (isPopup) continue
        if (boxesOverlap(panelPx(panelA, vw, vh), panelPx(panelB, vw, vh))) {
          errors.push(
            `content/ui/layout.json: "${keyA}" y "${keyB}" se solapan a ${String(vw)}×${String(vh)}`,
          )
        }
      }
    }
  }
  return errors
}
