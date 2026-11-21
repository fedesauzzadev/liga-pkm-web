// Puerto de BattleMoveAnims.firespin: 16 bolas de fuego orbitando al defensor
// (4 tandas × 4 direcciones, escalonadas 200 ms por índice).
import type { ShowdownMoveAnim } from './shim.ts'

export const firespin: ShowdownMoveAnim = (scene) => {
  const { defender: def } = scene
  const orbit = (
    time: number,
    from: { dx: number; dy: number },
    to: { dx: number; dy: number },
  ): void => {
    scene.showEffect(
      'fireball',
      { x: def.x + from.dx, y: def.y + from.dy, z: def.z, scale: 0.5, opacity: 1, time },
      { x: def.x + to.dx, y: def.y + to.dy, z: def.z, scale: 1, opacity: 0.4, time: time + 200 },
      'linear',
      'fade',
    )
  }
  for (let i = 0; i < 4; i++) {
    const t = 200 * i
    orbit(t, { dx: 50, dy: -35 }, { dx: -50, dy: 0 })
    orbit(t, { dx: -50, dy: 35 }, { dx: 50, dy: 0 })
    orbit(t, { dx: 50, dy: 0 }, { dx: -50, dy: -35 })
    orbit(t, { dx: -50, dy: 0 }, { dx: 50, dy: -35 })
  }
}
