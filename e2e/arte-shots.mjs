// node shots.mjs <outDir> [probe]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const out = process.argv[2]; mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 200)) })
await page.goto('http://localhost:5190/')
await page.getByRole('button', { name: 'Nueva partida' }).click()
await page.getByPlaceholder('Al azar').fill('arte')
await page.getByText('Charmander').click()
await page.waitForSelector('[data-testid=btn-overview]')
await page.waitForTimeout(7000)
await page.locator('[data-testid=tip-f11-close]').click().catch(() => {})
const shot = async (name) => { await page.waitForTimeout(2500); await page.screenshot({ path: join(out, name + '.png') }) }
if (process.argv[3] === 'probe') {
  const d = await page.evaluate(() => { const d = globalThis.__debug.sceneDump(); return { camera: d.camera, keys: Object.keys(d), sample: d.objects.slice(0, 3), names: d.objects.map((o) => o.name).slice(0, 80), n: d.objects.length } })
  console.log(JSON.stringify(d, null, 1)); await browser.close(); process.exit(0)
}
const pos = await page.evaluate(() => Object.fromEntries(globalThis.__debug.sceneDump().objects.filter((o) => o.position || o.worldPos).map((o) => [o.name, o.position ?? o.worldPos])))
const P = (id) => { const k = Object.keys(pos).find((k) => k.includes(id)); return pos[k] }
const aim = (a) => page.evaluate((a) => globalThis.__debug.aimCamera(a), a)
await shot('2a-inicio')
await page.locator('[data-testid=btn-overview]').click(); await shot('1-general')
const at = async (id, az, el, dist, name, dx = 0, dz = 0) => { const p = P(id); await aim({ x: p[0] + dx, z: p[2] + dz, azimuthDeg: az, elevationDeg: el, distance: dist }); await shot(name) }
await at('paleta', 20, 35, 5, '2-ficha-paleta')
await at('celeste', 0, 40, 6, '3-ciudad-celeste')
await at('verde', -25, 30, 6, '3b-ciudad-verde')
await at(process.env.CROSS ?? 'duelo', 0, 45, 8, '4-cruce-eventos')
await at('azafran', 0, 18, 9, '5-borde-horizonte')
await at('fucsia', 30, 8, 7, '6-rasante')
await at('fucsia', 0, 89, 22, '0-cenital', 0, 1.5)
console.log(JSON.stringify(Object.keys(pos).slice(0, 200)))
await browser.close()
