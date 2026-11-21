// AC: SPEC-D/T-032a/AC-8 - el código de combate se carga con import() (no está en el
// bundle inicial). El chunk separado lo verifica `pnpm build` + size-limit en verify.
import { expect, test } from 'vitest'

test('AC: SPEC-D/T-032a/AC-8 - la escena de combate se resuelve vía import() dinámico', async () => {
  const mod = await import('./BattleScene')
  expect(typeof mod.BattleScene).toBe('function')
})
