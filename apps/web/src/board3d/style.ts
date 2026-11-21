// Look del mundo (content/board/style.json, SPEC-J), validado con Zod en la
// frontera (estándar §2). T-078 consume `labels`; el resto llega con T-079.
import { BoardStyleSchema, type BoardStyle } from '@liga/content'
import styleJson from '../../../../content/board/style.json'

export const boardStyle: BoardStyle = BoardStyleSchema.parse(styleJson)
