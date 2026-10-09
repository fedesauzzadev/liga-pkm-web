// Tablero: grafo no dirigido. La verificación con overlay y los chequeos de
// conectividad/conteos son de T-003; acá solo forma y referencias básicas.
import { z } from 'zod'
import { DeckIdSchema } from './cards.ts'

export const NodeShapeSchema = z.enum(['round', 'square', 'none'])
export type NodeShape = z.infer<typeof NodeShapeSchema>

export const NodeTypeSchema = z.enum([
  'start', 'deck', 'mercado', 'centro', 'oak', 'gym', 'duelo', 'sorpresa', 'liga', 'empty', 'junction',
])
export type NodeType = z.infer<typeof NodeTypeSchema>

export const BoardStatusSchema = z.enum(['DRAFT_UNVERIFIED', 'EDITED_PENDING_REVIEW', 'VERIFIED'])
export type BoardStatus = z.infer<typeof BoardStatusSchema>

export const GymDefSchema = z.object({
  city: z.string().min(1),
  medal: z.string().min(1),
  verified: z.boolean(),
  requiresMedals: z.number().int().min(0).optional(), // Giovanni: 7
})
export type GymDef = z.infer<typeof GymDefSchema>

export const BoardNodeSchema = z
  .object({
    id: z.string().min(1),
    type: NodeTypeSchema,
    shape: NodeShapeSchema,
    x: z.number(),
    y: z.number(),
    label: z.string().optional(),
    deck: DeckIdSchema.optional(),
    gym: z.string().min(1).optional(), // key de `gyms`
  })
  .superRefine((n, ctx) => {
    if (n.type === 'deck' && n.deck === undefined) {
      ctx.addIssue({ code: 'custom', message: 'nodo de mazo requiere "deck"', path: ['deck'] })
    }
    if (n.type !== 'deck' && n.deck !== undefined) {
      ctx.addIssue({ code: 'custom', message: '"deck" solo en nodos de mazo', path: ['deck'] })
    }
    if (n.type === 'gym' && n.gym === undefined) {
      ctx.addIssue({ code: 'custom', message: 'nodo de gimnasio requiere "gym"', path: ['gym'] })
    }
  })
export type BoardNode = z.infer<typeof BoardNodeSchema>

export const BoardGraphSchema = z.object({
  meta: z.object({
    id: z.string().min(1),
    status: BoardStatusSchema,
    source: z.string().optional(),
    imageSize: z.tuple([z.number(), z.number()]).optional(),
    note: z.string().optional(),
  }),
  gyms: z.record(z.string().min(1), GymDefSchema),
  nodes: z.array(BoardNodeSchema).min(1),
  edges: z.array(z.tuple([z.string().min(1), z.string().min(1)])), // no dirigidas
})
export type BoardGraph = z.infer<typeof BoardGraphSchema>
