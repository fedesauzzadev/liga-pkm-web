// Decoración del mundo continuo (content/board/decor.json, SPEC-H/T-069),
// validada con Zod en la frontera (estándar §2). Solo lo consume el chunk 3D.
import { DecorSchema, type Decor } from '@liga/content'
import decorJson from '../../../../content/board/decor.json'

export const boardDecor: Decor = DecorSchema.parse(decorJson)
