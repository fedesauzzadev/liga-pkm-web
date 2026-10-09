// Puerto de BattleMoveAnims.bubblebeam (Showdown alias `bubble` = bubblebeam).
import type { ShowdownMoveAnim } from './shim.ts'

export const bubble: ShowdownMoveAnim = (scene) => {
  const { attacker: atk, defender: def } = scene
  const shot = (time: number, dx: number, dy: number): void => {
    scene.showEffect(
      'iceball',
      { x: atk.x, y: atk.y, z: atk.z, scale: 0.5, opacity: 0.7, time },
      { x: def.x + dx, y: def.y + dy, z: def.behind(0), opacity: 0.6, time: time + 400 },
      'decel',
      'explode',
    )
  }
  shot(0, 0, 0)
  shot(100, 20, -10)
  shot(200, -20, 10)
  shot(300, 0, -5)
}
