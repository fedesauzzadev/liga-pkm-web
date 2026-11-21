// Puerto de BattleOtherAnims.contactattack: embestida del atacante + sacudida del
// defensor. Lo reusan tackle (alias slam) y headbutt. Sin `scene.wait` (el final del
// spike lo omite: waitAll cubre la finalización de las cadenas).
import type { ShowdownMoveAnim } from './shim.ts'

export const contactattack: ShowdownMoveAnim = (scene) => {
  const { attacker: atk, defender: def } = scene
  atk.anim({ x: def.x, y: def.y + 80, z: def.behind(-30), time: 400 }, 'ballistic')
  atk.anim({ x: def.x, y: def.y + 5, z: def.z, time: 100 })
  atk.anim({ time: 500 }, 'ballistic2Back')
  def.delay(450)
  def.anim({ z: def.behind(20), time: 100 }, 'swing')
  def.anim({ time: 300 }, 'swing')
}
