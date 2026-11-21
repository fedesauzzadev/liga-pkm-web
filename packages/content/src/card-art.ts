// Arte de la carta (content/ui/card-art.json, SPEC-U/T-105): medidas para
// normalizar el sprite del PKM dentro del recuadro de arte. Los componentes no
// tienen medidas mágicas: todo sale de este archivo (validado con Zod).
import { z } from 'zod'

/**
 * Regla de escala por caja (SPEC-U/T-105): `fill` < 1 deja margen (el chip de
 * aviso va abajo a la derecha y no debe tapar al PKM); `maxScale` > 1 es el
 * tope de agrandado para sprites chicos (anti-pixelado extremo, ≤ 10).
 */
export const CardArtFitSchema = z.object({
  fill: z.number().gt(0).lt(1),
  maxScale: z.number().gt(1).lte(10),
})

/** Medidas del sprite en la carta (SPEC-U/T-105/AC-1). */
export const CardArtSchema = z.object({
  _status: z.string().optional(),
  pkmCard: CardArtFitSchema.extend({ boxHeightPx: z.number().int().positive() }),
  // boxHeightPx opcional (achicar-arte-modal-carta/AC-1): sin tope ⇒ la caja
  // .art ocupa el alto sobrante (comportamiento anterior).
  modal: CardArtFitSchema.extend({ boxHeightPx: z.number().int().positive().optional() }),
})
export type CardArt = z.infer<typeof CardArtSchema>
