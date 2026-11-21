// Puerto de BattleMoveAnims.withdraw: caparazón + el atacante se esconde y vuelve
// (anim final al hogar: scale/opacity se restauran por defecto, como en PS).
import type { ShowdownMoveAnim } from './shim.ts'

export const withdraw: ShowdownMoveAnim = (scene) => {
  const { attacker: atk } = scene
  scene.showEffect(
    'shell',
    { x: atk.x, y: atk.y, z: atk.z, scale: 1, opacity: 0.5, time: 0 },
    { scale: 0.8, opacity: 0.8, time: 400 },
    'linear',
    'fade',
  )
  atk.anim({ scale: 0.4, opacity: 0, time: 400 }, 'linear')
  atk.delay(75)
  atk.anim({ x: atk.x, time: 75 })
}
