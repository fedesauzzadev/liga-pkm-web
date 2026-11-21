// Puerto de BattleMoveAnims.tackle = alias de `slam` = BattleOtherAnims.contactattack.
import type { ShowdownMoveAnim } from './shim.ts'
import { contactattack } from './contactattack.ts'

export const tackle: ShowdownMoveAnim = contactattack
