// AC: fix-sprites-lideres-gimnasio/AC-4 - los 8 líderes de content/gyms.json
// tienen entrada de sprite en tools/assets.config.json (key = sdId): tras
// `pnpm assets`, trainers.json queda con las 8 keys y sprite front (el archivo
// bajado no se commitea; ver docs/PRIVACY-DEPLOY.md).
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

interface TrainerConfigEntry {
  readonly name: string
  readonly sdId: string
}

const config = JSON.parse(
  readFileSync(new URL('../../../../tools/assets.config.json', import.meta.url), 'utf8'),
) as { readonly trainers: readonly TrainerConfigEntry[] }
const gyms = JSON.parse(
  readFileSync(new URL('../../../../content/gyms.json', import.meta.url), 'utf8'),
) as { readonly leaders: Readonly<Record<string, unknown>> }

test('AC: fix-sprites-lideres-gimnasio/AC-4 - la config de assets cubre los 8 líderes de gyms.json', () => {
  const sdIds = new Set(config.trainers.map((trainer) => trainer.sdId))
  for (const leaderId of Object.keys(gyms.leaders)) {
    expect(sdIds.has(leaderId), `falta entrada de sprite para el líder "${leaderId}"`).toBe(true)
  }
  expect(config.trainers.length).toBe(8)
})

// AC: fix-sprites-lideres-gimnasio/AC-2 - la parte de CSS del slot dedicado:
// .trainer tiene posición propia (right 52 %) distinta de .rival (right 8 %),
// sin pisar la clase del rival (la parte DOM del test vive en BattleScene.test).
test('AC: fix-sprites-lideres-gimnasio/AC-2 - .trainer con posición propia, distinta de .rival', () => {
  const css = readFileSync(
    new URL('./BattleScene.module.css', import.meta.url),
    'utf8',
  )
  // El bloque dedicado de .trainer declara right: 52 % (el selector compartido
  // .rival,.player,.trainer solo trae position/display/flex, sin right).
  expect(css).toMatch(/\.trainer\s*\{[^}]*right:\s*52%/)
  expect(css).toMatch(/\.rival\s*\{[^}]*right:\s*8%/)
})
