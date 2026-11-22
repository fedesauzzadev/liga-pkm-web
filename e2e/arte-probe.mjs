// node probe.mjs '<js expr using S (three scene), G (renderer)>' [out.png]
import { createRequire } from 'node:module'
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
await page.goto('http://localhost:5190/')
await page.getByRole('button', { name: 'Nueva partida' }).click()
await page.getByPlaceholder('Al azar').fill('arte')
await page.getByText('Charmander').click()
await page.waitForSelector('[data-testid=btn-overview]')
await page.waitForTimeout(7000)
await page.locator('[data-testid=tip-f11-close]').click().catch(() => {})
const r = await page.evaluate(([code, aim]) => {
  const { scene: S, gl: G } = globalThis.__debug.three()
  const out = new Function('S', 'G', code)(S, G); globalThis.__debug.aimCamera(aim); return out
}, [process.argv[2], JSON.parse(process.env.AIM ?? '{"x":4.6,"z":6.6,"azimuthDeg":20,"elevationDeg":35,"distance":7}')])
console.log(JSON.stringify(r, null, 1))
if (process.argv[3]) { await page.waitForTimeout(1500); await page.screenshot({ path: process.argv[3] }) }
await browser.close()
