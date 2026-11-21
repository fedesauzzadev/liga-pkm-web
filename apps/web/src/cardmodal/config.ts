// Config de la ventana de carta (content/ui/card-modal.json, SPEC-R/T-103):
// se valida con Zod en la frontera (patrón de shell/layout.ts con layout.json).
// Nada de medidas hardcodeadas: todo sale de este archivo.
import { CardModalSchema, type CardModal } from '@liga/content'
import cardModalJson from '../../../../content/ui/card-modal.json'

export const cardModalConfig: CardModal = CardModalSchema.parse(cardModalJson)
