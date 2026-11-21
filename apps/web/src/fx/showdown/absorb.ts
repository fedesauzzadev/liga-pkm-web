// Puerto de BattleMoveAnims.absorb = BattleOtherAnims.drain: 3 bolas de energía
// que viajan del defensor al atacante (drenaje).
import type { ShowdownMoveAnim } from './shim.ts'

export const absorb: ShowdownMoveAnim = (scene) => {
  const { attacker: atk, defender: def } = scene
  const drain = (time: number, transition: 'ballistic2' | 'ballistic2Under' | 'linear'): void => {
    scene.showEffect(
      'energyball',
      { x: def.x, y: def.y, z: def.z, scale: 0.6, opacity: 0.6, time },
      { x: atk.x, y: atk.y, z: atk.z, time: time + 500, opacity: 0 },
      transition,
    )
  }
  drain(0, 'ballistic2')
  drain(50, 'linear')
  drain(100, 'ballistic2Under')
}
