// Decoración del tablero 3D (content/board/decor.json, SPEC-H/T-068):
// piezas de decoración (landmarks por nodo/tipo y scatter por zona) + paleta
// de piezas. El look del mundo (terreno, biomas, horizonte, cielo, niebla)
// migró a content/board/style.json (SPEC-J/T-079). T-068 aprieta landmarks y
// scatter contra el catálogo canónico de kinds (DECOR_KINDS). Chequeos
// cruzados puros (sin node:fs): los consume validate.ts y los tests.
import { z } from 'zod'
import { NodeTypeSchema } from './board.ts'

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color hex #rrggbb')

/** Catálogo canónico de piezas (SPEC-H/T-068): kind → builder en apps/web. */
export const DECOR_KINDS = [
  'house', 'pokecenter', 'market', 'lab', 'gym',
  'tree', 'deadTree', 'bush', 'rock', 'mountain', 'pond',
  'reeds', 'grassTuft', 'flowerPatch', 'lavaPool', 'mist',
  'fence', 'sign', 'lamp', 'flag',
] as const
export type DecorKind = (typeof DECOR_KINDS)[number]

export const DecorKindSchema = z.enum(DECOR_KINDS, {
  error: (issue) => `kind de pieza de decor desconocido: "${String(issue.input)}" (catálogo DECOR_KINDS, SPEC-H/T-068)`,
})

/** Pieza colocada relativa a un nodo (SPEC-H/T-068/AC-2). */
export const DecorLandmarkSchema = z.object({
  kind: DecorKindSchema,
  /** [x, z] en unidades de mundo, relativo al centro del nodo. */
  offset: z.tuple([z.number().finite(), z.number().finite()]),
  rotY: z.number().finite().optional(),
  scale: z.number().positive().optional(),
  /** tree: 'pine' | 'round'. */
  variant: z.enum(['pine', 'round']).optional(),
  wall: HexColor.optional(),
  roof: HexColor.optional(),
  flag: HexColor.optional(),
  /** gym: la bandera toma el color de la medalla del líder (gyms.json). */
  flagFromLeader: z.boolean().optional(),
  /** fence: largo total. */
  length: z.number().positive().optional(),
  text: z.string().min(1).optional(),
  glow: HexColor.optional(),
  /** pond/lavaPool: radio opcional (default del tema). */
  radius: z.number().positive().optional(),
})
export type DecorLandmark = z.infer<typeof DecorLandmarkSchema>

/** Relleno de zona (SPEC-H/T-068/AC-3): reparto determinista por seed. */
export const DecorScatterSchema = z.object({
  kind: DecorKindSchema,
  count: z.number().int().min(0),
  seed: z.number().int(),
  variant: z.enum(['pine', 'round']).optional(),
  radius: z.number().positive().optional(),
})
export type DecorScatter = z.infer<typeof DecorScatterSchema>

export const DecorLandmarksSchema = z.object({
  /** Piezas ancladas a nodos concretos (p. ej. Pueblo Paleta). */
  byNodeId: z.record(z.string().min(1), z.array(DecorLandmarkSchema)),
  /** Piezas que se repiten en todo nodo del tipo (centro ⇒ pokecenter…). */
  byNodeType: z.record(z.string().min(1), z.array(DecorLandmarkSchema)),
})
export type DecorLandmarks = z.infer<typeof DecorLandmarksSchema>

/** Zona de relleno (SPEC-H/T-068/AC-3); el color del suelo vive en style.json (T-079). */
export const DecorZoneSchema = z.object({
  panel: z.string().min(1),
  margin: z.number().min(0),
  scatter: z.array(DecorScatterSchema).optional(),
})
export type DecorZone = z.infer<typeof DecorZoneSchema>

/** Estricto (T-079/AC-1): los bloques migrados a style.json se rechazan si vuelven. */
export const DecorSchema = z
  .object({
    _status: z.string().optional(),
    palette: z.record(z.string(), HexColor),
    landmarks: DecorLandmarksSchema.optional(),
    zones: z.record(z.string().min(1), DecorZoneSchema),
    budgets: z.object({
      maxDrawCalls: z.number().int().positive(),
      maxTriangles: z.number().int().positive(),
      maxModelsMB: z.number().positive(),
    }),
    clearance: z.object({
      fromNodeCenter: z.number().min(0),
      fromEdge: z.number().min(0),
    }),
  })
  .strict()
export type Decor = z.infer<typeof DecorSchema>

/**
 * Chequeos cruzados de decor.json (SPEC-H/T-068): el look del mundo ya no
 * vive acá (migrado a style.json en T-079); quedan los tipos de byNodeType.
 */
export function crossCheckDecor(decor: Decor): string[] {
  const errors: string[] = []
  // T-068/AC-2: los tipos de byNodeType tienen que existir en el tablero.
  const nodeTypes = new Set<string>(NodeTypeSchema.options)
  for (const type of Object.keys(decor.landmarks?.byNodeType ?? {})) {
    if (!nodeTypes.has(type)) {
      errors.push(`content/board/decor.json: landmarks.byNodeType "${type}" no es un tipo de nodo válido`)
    }
  }
  return errors
}
