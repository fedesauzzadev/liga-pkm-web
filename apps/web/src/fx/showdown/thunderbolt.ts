// Puerto de BattleMoveAnims.thunderbolt: fondo oscuro + 3 rayos que crecen en Y.
import type { ShowdownMoveAnim } from './shim.ts'

export const thunderbolt: ShowdownMoveAnim = (scene) => {
  const { defender: def } = scene
  scene.backgroundEffect('#000000', 600, 0.2)
  const bolt = (dx: number, time: number): void => {
    scene.showEffect(
      'lightning',
      { x: def.x + dx, y: def.y + 150, z: def.z, yscale: 0, xscale: 2, time },
      { y: def.y + 50, yscale: 1, xscale: 1.5, opacity: 0.8, time: time + 200 },
      'linear',
      'fade',
    )
  }
  bolt(0, 0)
  bolt(-15, 200)
  bolt(15, 400)
}
