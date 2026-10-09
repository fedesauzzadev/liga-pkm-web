// Ítems (content/items.json). RULES §4: Pokebola/Ultra/Maestra, Comodín, Poción, Oportunidad.
import { z } from 'zod'

export const ItemKindSchema = z.enum(['ball', 'potion', 'wildcard', 'opportunity'])
export type ItemKind = z.infer<typeof ItemKindSchema>

export const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ItemKindSchema,
  description: z.string().optional(),
})
export type Item = z.infer<typeof ItemSchema>

export const ItemsFileSchema = z.object({
  _comment: z.string().optional(),
  items: z.array(ItemSchema),
})
export type ItemsFile = z.infer<typeof ItemsFileSchema>
