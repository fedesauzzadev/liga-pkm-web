// Tipos de energía (content/energy.json, SPEC-F/T-002b). 'normal' y 'dragon'
// NO tienen carta de energía (D-24): normal = 'any' en costos; 'multicolor'
// es una carta de ítem que vale como 1 energía de cualquier tipo (D-23).
import { z } from 'zod'
import { ElementSchema } from './cards.ts'

export const EnergyTypeSchema = z.object({
  id: ElementSchema,
  es: z.string().min(1),
  color: z.string().min(1), // variable CSS / tinte del ícono
  icon: z.string().min(1), // archivo en apps/web/src/assets/energy/ (T-047)
  energyCard: z.boolean(), // false ⇒ solo es elemento de PKM/costo, no carta
})
export type EnergyType = z.infer<typeof EnergyTypeSchema>

export const MulticolorDefSchema = z.object({
  id: z.literal('multicolor'),
  es: z.string().min(1),
  icon: z.string().min(1),
})
export type MulticolorDef = z.infer<typeof MulticolorDefSchema>

export const EnergyFileSchema = z.object({
  _comment: z.string().optional(),
  types: z.array(EnergyTypeSchema).min(1),
  multicolor: MulticolorDefSchema,
})
export type EnergyFile = z.infer<typeof EnergyFileSchema>
