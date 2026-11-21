// Capturas del cierre visual del MVP (SPEC-N/T-093/AC-1): vista cenital de
// orientación (solo revisión) + las cuatro zonas del dueño. Corredores con
// dependencias inyectadas desde e2e/t066-shots.mjs (newShotContext/
// waitBoard3dReady/takeShot/sceneDump) para no duplicar el driver; la cámara se
// apunta con window.__debug.aimCamera (DEV) y el encuadre se verifica con el
// sceneDump (NO-VISION): fit determinista de distancia + orientación validada
// contra los extremos geográficos de kanto.json.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cameraJson = JSON.parse(readFileSync(join(ROOT, 'content', 'ui', 'camera.json'), 'utf8'))

/** Picada de las capturas de zona: la del explore (picada normal del juego). */
const ZONE_ELEVATION_DEG = cameraJson.explore.elevationDeg
/** Picada de la captura de orientación: cenital práctica (evita el gimbal de up=(0,1,0)). */
const ORIENTATION_ELEVATION_DEG = 89
const ORIENTATION_MIN_PITCH_DEG = 85

/** Zonas del dueño (SPEC-N/T-093/AC-1): nodos a encuadrar por captura. */
export const CLOSE_ZONES = [
  { scene: 'zone-oeste', title: 'oeste (Isla Canela/Plateada)', nodes: ['canela', 'plateada'] },
  { scene: 'zone-sur', title: 'fila sur (Centro + Verde + Oak)', nodes: ['centro_b', 'verde', 'oak_b'] },
  { scene: 'zone-este', title: 'este (Azulona + Liga)', nodes: ['azulona', 'liga'] },
  { scene: 'zone-centro', title: 'centro (Fucsia + Centro R)', nodes: ['fucsia', 'centro_r'] },
]

/** Extremos geográficos del tablero (px de kanto.json) para validar la orientación. */
export function extremesOf(board) {
  let east = board.nodes[0]
  let west = board.nodes[0]
  let north = board.nodes[0]
  let south = board.nodes[0]
  for (const node of board.nodes) {
    if (node.x > east.x) east = node
    if (node.x < west.x) west = node
    if (node.y < north.y) north = node
    if (node.y > south.y) south = node
  }
  return { east: east.id, west: west.id, north: north.id, south: south.id }
}

const nodeEntry = (dump, id) => dump.objects.find((entry) => entry.name === `node:${id}`)

/** Objetos de edificio de un nodo: el modelo nuevo (model:*, T-091, que oculta
 * al procedural al cargar) o el procedural todavía visible. */
export function buildingEntriesOf(dump, id) {
  return dump.objects.filter(
    (entry) =>
      (entry.name.startsWith('model:') && entry.nodeId === id) ||
      (entry.name.startsWith(`landmark:${id}:`) && entry.visible),
  )
}

/** Hitos de zona: nodos + sus edificios (modelo o procedural visible). */
export function zoneFits(dump, zone) {
  for (const id of zone.nodes) {
    const node = nodeEntry(dump, id)
    if (node === undefined || !node.inViewport) return false
    const buildings = buildingEntriesOf(dump, id)
    if (buildings.length === 0) return false
    for (const building of buildings) {
      if (!building.inViewport) return false
    }
  }
  return true
}

/** ¿La vista reproduce la foto (norte arriba, este a la derecha)? */
export function orientationOk(dump, extremes) {
  const east = nodeEntry(dump, extremes.east)
  const west = nodeEntry(dump, extremes.west)
  const north = nodeEntry(dump, extremes.north)
  const south = nodeEntry(dump, extremes.south)
  if (east === undefined || west === undefined || north === undefined || south === undefined) return false
  return east.screenPos[0] > west.screenPos[0] && north.screenPos[1] < south.screenPos[1]
}

const allNodesIn = (dump) =>
  dump.objects.filter((entry) => entry.name.startsWith('node:')).every((entry) => entry.inViewport)

/** Apunta la cámara y espera a que el dump la refleje (modo shot + picada). */
async function aimAndWait(page, sceneDump, aim, targetPitch) {
  await page.evaluate((value) => globalThis.window.__debug?.aimCamera?.(value), aim)
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const dump = await sceneDump(page)
    if (
      dump?.camera != null &&
      dump.camera.mode === 'shot' &&
      Math.abs(dump.camera.pitchDeg - targetPitch) < 1.5
    ) {
      return dump
    }
    await sleep(60)
  }
  throw new Error(`aimCamera no aplicó (aim ${JSON.stringify(aim)})`)
}

/** AC-1 — captura de zona: cámara a picada normal sobre el centroide, distancia
 * mínima que encuadra nodos + edificios (fit determinista por hitos). */
export async function runZoneShot(deps, browser, size, zone) {
  const { newShotContext, waitBoard3dReady, takeShot, sceneDump, boardSelector } = deps
  const { context, page, consoleErrors } = await newShotContext(browser, {
    size,
    speed: 'skip',
    reducedMotion: true,
  })
  await waitBoard3dReady(page)
  const first = await sceneDump(page)
  const anchors = zone.nodes.map((id) => nodeEntry(first, id))
  if (anchors.some((entry) => entry === undefined)) {
    throw new Error(`nodos faltantes en el dump para ${zone.scene}`)
  }
  const cx = anchors.reduce((sum, entry) => sum + entry.worldPos[0], 0) / anchors.length
  const cz = anchors.reduce((sum, entry) => sum + entry.worldPos[2], 0) / anchors.length

  let aim = { x: cx, z: cz, azimuthDeg: 0, elevationDeg: ZONE_ELEVATION_DEG, distance: 2.5 }
  let dump = null
  for (let step = 0; step < 10; step += 1) {
    dump = await aimAndWait(page, sceneDump, aim, ZONE_ELEVATION_DEG)
    if (zoneFits(dump, zone)) break
    aim = { ...aim, distance: Math.min(aim.distance * 1.35, 16) }
  }
  await sleep(450)
  dump = await sceneDump(page)
  const record = await takeShot(page, consoleErrors, {
    scene: zone.scene,
    size,
    boardSelector,
    milestones: [{ name: `${zone.scene} (${zone.title})`, inViewport: dump !== null && zoneFits(dump, zone) }],
  })
  await context.close()
  return record
}

/** AC-1 — captura de orientación: cenital sobre el centro del tablero, girada
 * al azimut que reproduce la foto (norte arriba, este a la derecha). */
export async function runOrientationShot(deps, browser, size, board) {
  const { newShotContext, waitBoard3dReady, takeShot, sceneDump, boardSelector } = deps
  const extremes = extremesOf(board)
  const { context, page, consoleErrors } = await newShotContext(browser, {
    size,
    speed: 'skip',
    reducedMotion: true,
  })
  await waitBoard3dReady(page)

  let best = null
  for (const azimuthDeg of [0, 180]) {
    let aim = { x: 0, z: 0, azimuthDeg, elevationDeg: ORIENTATION_ELEVATION_DEG, distance: 8 }
    for (let step = 0; step < 10; step += 1) {
      const dump = await aimAndWait(page, sceneDump, aim, ORIENTATION_ELEVATION_DEG)
      const oriented = orientationOk(dump, extremes)
      const fits = allNodesIn(dump)
      if (oriented && fits) {
        best = { azimuthDeg, dump }
        break
      }
      const next = Math.min(aim.distance * 1.3, 60)
      if (next === aim.distance) break
      aim = { ...aim, distance: next }
    }
    if (best !== null) break
  }
  if (best === null) {
    throw new Error(`la vista cenital no reproduce la orientación de la foto (${JSON.stringify(extremes)})`)
  }
  await sleep(450)
  const dump = await sceneDump(page)
  const record = await takeShot(page, consoleErrors, {
    scene: 'board-orientation',
    size,
    boardSelector,
    milestones: [
      { name: `cenital (pitch ≥ ${String(ORIENTATION_MIN_PITCH_DEG)}°)`, inViewport: (dump?.camera?.pitchDeg ?? 0) >= ORIENTATION_MIN_PITCH_DEG },
      { name: `orientación de la foto (azimut ${String(best.azimuthDeg)}°: norte arriba, este a la derecha)`, inViewport: orientationOk(dump, extremes) },
      { name: 'nodos del tablero en viewport', inViewport: allNodesIn(dump) },
    ],
  })
  await context.close()
  return record
}
