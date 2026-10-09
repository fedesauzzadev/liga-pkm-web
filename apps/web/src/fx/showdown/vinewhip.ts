// Puerto de BattleMoveAnims.powerwhip (Showdown alias `vinewhip` = powerwhip):
// 2 bolas de energía + 3 hojas + BattleOtherAnims.contactattack (inline al final).
import type { ShowdownMoveAnim } from './shim.ts'

export const vinewhip: ShowdownMoveAnim = (scene) => {
  const { attacker: atk, defender: def } = scene
  scene.showEffect(
    'energyball',
    { x: def.x, y: def.y, z: def.z, scale: 0, opacity: 1, time: 420 },
    { x: def.leftof(-20), y: def.y, z: def.behind(20), scale: 3, opacity: 0, time: 700 },
    'linear',
  )
  scene.showEffect(
    'energyball',
    { x: def.x, y: def.y, z: def.z, scale: 0, opacity: 1, time: 520 },
    { x: def.leftof(-20), y: def.y, z: def.behind(20), scale: 3, opacity: 0, time: 800 },
    'linear',
  )
  const leaf = (image: 'leaf1' | 'leaf2', dx: number, dy: number): void => {
    scene.showEffect(
      image,
      { x: def.x, y: def.y, z: def.z, scale: 1, opacity: 1, time: 500 },
      { x: def.x + dx, y: def.y + dy, scale: 1.5, opacity: 0, time: 1100 },
      'linear',
      'fade',
    )
  }
  leaf('leaf1', 0, -60)
  leaf('leaf2', 60, 0)
  leaf('leaf1', -60, 0)
  atk.anim({ x: def.x, y: def.y + 80, z: def.behind(-30), time: 400 }, 'ballistic')
  atk.anim({ x: def.x, y: def.y + 5, z: def.z, time: 100 })
  atk.anim({ time: 500 }, 'ballistic2Back')
  def.delay(450)
  def.anim({ z: def.behind(20), time: 100 }, 'swing')
  def.anim({ time: 300 }, 'swing')
}
