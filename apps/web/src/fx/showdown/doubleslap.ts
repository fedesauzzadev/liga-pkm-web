// Puerto de BattleOtherAnims.xattack (Showdown alias `doubleslap` = xattack):
// 2 destellos + sacudida del defensor + doble embestida del atacante.
import type { ShowdownMoveAnim } from './shim.ts'

export const doubleslap: ShowdownMoveAnim = (scene) => {
  const { attacker: atk, defender: def } = scene
  scene.showEffect(
    'wisp',
    { x: def.x, y: def.y, z: def.z, scale: 0, opacity: 1, time: 400 },
    { x: def.leftof(-20), y: def.y, z: def.behind(20), scale: 3, opacity: 0, time: 700 },
    'linear',
  )
  scene.showEffect(
    'wisp',
    { x: def.x, y: def.y, z: def.z, scale: 0, opacity: 1, time: 700 },
    { x: def.leftof(-20), y: def.y, z: def.behind(20), scale: 3, opacity: 0, time: 1000 },
    'linear',
  )
  def.delay(480)
  def.anim({ z: def.behind(20), time: 100 }, 'swing')
  def.anim({ time: 200 }, 'swing')
  def.anim({ z: def.behind(20), time: 100 }, 'swing')
  def.anim({ time: 300 }, 'swing')
  atk.anim({ x: def.leftof(-30), y: def.y + 80, z: def.behind(-30), time: 400 }, 'ballistic')
  atk.anim({ x: def.leftof(30), y: def.y + 5, z: def.z, time: 100 })
  atk.anim({ x: def.leftof(30), y: def.y + 80, z: def.behind(-30), time: 200 })
  atk.anim({ x: def.leftof(-30), y: def.y + 5, z: def.z, time: 100 })
  atk.anim({ time: 500 }, 'ballistic2Back')
}
