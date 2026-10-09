// Puerto de BattleOtherAnims.slashattack (Showdown alias `scratch` = slashattack):
// embestida del atacante + retroceso del defensor + arañazo.
import type { ShowdownMoveAnim } from './shim.ts'

export const scratch: ShowdownMoveAnim = (scene) => {
  const { attacker: atk, defender: def } = scene
  atk.anim({ x: def.x, y: def.y + 80, z: def.behind(-30), time: 400 }, 'ballistic')
  atk.anim({ x: def.x, y: def.y + 5, z: def.z, time: 100 })
  atk.anim({ time: 500 }, 'ballistic2Back')
  def.delay(450)
  def.anim({ z: def.behind(20), time: 100 }, 'swing')
  def.anim({ time: 300 }, 'swing')
  scene.showEffect(
    'rightslash',
    { x: def.x, y: def.y, z: def.z, scale: 1, opacity: 1, time: 500 },
    { scale: 3, opacity: 0, time: 800 },
    'linear',
    'fade',
  )
}
