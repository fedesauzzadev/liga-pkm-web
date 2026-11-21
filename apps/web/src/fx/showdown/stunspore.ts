// Puerto de BattleMoveAnims.stunspore = alias de `spore`: 3 espumas moradas que
// ascienden desde abajo hacia el defensor.
import type { ShowdownMoveAnim } from './shim.ts'

export const stunspore: ShowdownMoveAnim = (scene) => {
  const { defender: def } = scene
  const puff = (dx: number, time: number): void => {
    scene.showEffect(
      'purplewisp',
      { x: def.x + dx, y: def.y + 90, z: def.z, opacity: 0, scale: 0.4, time },
      { y: def.y - 5, opacity: 1, time: time + 500 },
      'decel',
      'fade',
    )
  }
  puff(10, 0)
  puff(30, 150)
  puff(-30, 300)
}
