// Popup de encuentro salvaje (content/ui/encounter-popup.json, plan
// unificar-popup-encuentro): medidas para la caja centrada en el safeArea
// (carta grande de T-101 a la izquierda + decisión a la derecha). Esquema Zod
// en la frontera (patrón de ui.ts con card-modal.json); sin node:fs.
import { z } from 'zod'

/** Medidas del popup de encuentro (todo en px, salvo el aspecto de la carta). */
export const EncounterPopupSchema = z.object({
  _status: z.string().optional(),
  testid: z.string().min(1),
  /** Margen por lado dentro del rectángulo safeArea de layout.json. */
  safeAreaMarginPx: z.number().int().positive(),
  maxHeightPx: z.number().int().positive(),
  /** Piso del achicado por obstáculos: por debajo la caja queda marcada. */
  minHeightPx: z.number().int().positive(),
  /** Padding interno de la ventana (chrome vertical/horizontal de la caja). */
  padPx: z.number().int().min(0),
  /** Aspecto (w/h) de la carta de la columna izquierda. */
  aspect: z.number().min(0.3).max(1.5),
  /** Aire entre la carta y la columna de botones. */
  gapPx: z.number().int().min(0),
  buttons: z.object({
    minPx: z.number().int().positive(),
    maxPx: z.number().int().positive(),
    /** Alto mínimo de cada botón (touch). */
    minHeightPx: z.number().int().positive(),
    gapPx: z.number().int().min(0),
  }),
  /** Fondo atenuado que cubre SOLO el safeArea (el HUD queda visible). */
  backdropOpacity: z.number().min(0).max(1),
  /** Entrada: fundido + escala 0,96→1 (0 con prefers-reduced-motion). */
  animMs: z.number().int().min(0),
  /** Cota de la transición hacia popup-battle (sin dos popups a la vez). */
  transitionMs: z.number().int().min(0),
  /** Precarga del sprite de frente: máx. esto antes de caer al recuadro. */
  preloadTimeoutMs: z.number().int().positive(),
})
export type EncounterPopup = z.infer<typeof EncounterPopupSchema>

/** Chequeos cruzados de encounter-popup.json: coherencia numérica. */
export function crossCheckEncounterPopup(config: EncounterPopup): string[] {
  const errors: string[] = []
  if (config.buttons.minPx >= config.buttons.maxPx) {
    errors.push('content/ui/encounter-popup.json: buttons.minPx debe ser < buttons.maxPx')
  }
  if (config.minHeightPx >= config.maxHeightPx) {
    errors.push('content/ui/encounter-popup.json: minHeightPx debe ser < maxHeightPx')
  }
  if (config.padPx * 2 >= config.minHeightPx) {
    errors.push('content/ui/encounter-popup.json: el padding se come el alto mínimo de la ventana')
  }
  return errors
}
