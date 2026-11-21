// add-deck-nodes (deck4) — agrega un 4.º nodo a cada mazo de terreno en
// content/board/kanto.json partiendo la arista interna MÁS LARGA de la tirada
// por su punto medio. Detección por campo `deck` (no por id). Idempotente,
// --dry-run por defecto / --apply escribe. Sin dependencias nuevas.
// Escala uniforme ≤ 1,15 solo si alguna tirada queda a < 65 px entre
// consecutivos (todos los nodos + deck-stacks.json + meta.imageSize).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIN_SEP = 65
const MAX_SCALE = 1.15
const APPLY = process.argv.includes('--apply')

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const BOARD_PATH = join(repoRoot, 'content', 'board', 'kanto.json')
const STACKS_PATH = join(repoRoot, 'content', 'board', 'deck-stacks.json')

const board = JSON.parse(readFileSync(BOARD_PATH, 'utf8'))
const stacks = JSON.parse(readFileSync(STACKS_PATH, 'utf8'))
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Tiradas por campo `deck`, en orden de aparición en el archivo.
const runIds = new Map()
for (const n of board.nodes) {
  if (n.type === 'deck' && typeof n.deck === 'string') {
    if (!runIds.has(n.deck)) runIds.set(n.deck, [])
    runIds.get(n.deck).push(n.id)
  }
}

const allIds = new Set(board.nodes.map((n) => n.id))
const byId = new Map(board.nodes.map((n) => [n.id, n]))

/** Distancia mínima entre consecutivos de la tirada (sus aristas internas). */
const minSepOf = (ids, edges, idMap) => {
  const set = new Set(ids)
  let min = Number.POSITIVE_INFINITY
  for (const [a, b] of edges) {
    if (set.has(a) && set.has(b)) min = Math.min(min, dist(idMap.get(a), idMap.get(b)))
  }
  return min
}

const plans = []
const rows = []
for (const [deck, ids] of runIds) {
  const set = new Set(ids)
  const internal = board.edges.filter(([a, b]) => set.has(a) && set.has(b))

  if (ids.length === 4) {
    rows.push({ deck, ids, note: 'ya tiene 4 nodos — no se toca (idempotente)' })
    continue
  }
  if (ids.length !== 3) {
    console.warn(`AVISO mazo "${deck}": ${ids.length} nodo(s) conectados, se esperaban 3 — se saltea`)
    continue
  }

  const before = minSepOf(ids, board.edges, byId)
  // Arista interna más larga (empate → primera en orden del JSON, determinista).
  let longest = null
  let longestLen = -1
  for (const e of internal) {
    const len = dist(byId.get(e[0]), byId.get(e[1]))
    if (len > longestLen) {
      longestLen = len
      longest = e
    }
  }

  // Prefijo común sin el número final; si no hay prefijo claro, <deck>_N.
  const prefixes = new Set(ids.map((id) => id.replace(/\d+$/, '')))
  const prefix = prefixes.size === 1 ? [...prefixes][0] : `${deck}_`
  let n = 1
  while (allIds.has(`${prefix}${n}`)) n += 1
  const newId = `${prefix}${n}`
  if (allIds.has(newId)) throw new Error(`id nuevo "${newId}" choca con uno existente`)

  const [aId, bId] = longest
  const a = byId.get(aId)
  const b = byId.get(bId)
  const x = Math.round((a.x + b.x) / 2)
  const y = Math.round((a.y + b.y) / 2)

  plans.push({ deck, ids, edge: [aId, bId], newId, x, y, before })
  allIds.add(newId)
}

if (plans.length === 0 && runIds.size > 0) {
  console.log('Nada que hacer: ningún mazo requiere un 4.º nodo.')
  for (const r of rows) console.log(`  ${r.deck}: ${r.note}`)
  process.exit(0)
}

// ── Aplica los planes sobre una copia (también en dry-run, para verificar).
const clone = (value) => JSON.parse(JSON.stringify(value))
const out = clone(board)
const outById = new Map(out.nodes.map((nd) => [nd.id, nd]))
for (const p of plans) {
  const idx = out.nodes.findIndex((nd) => nd.id === p.ids[p.ids.length - 1])
  out.nodes.splice(idx + 1, 0, { id: p.newId, type: 'deck', shape: 'round', x: p.x, y: p.y, deck: p.deck })
  outById.set(p.newId, out.nodes[idx + 1])
  const e = out.edges.findIndex(([a, b]) => (a === p.edge[0] && b === p.edge[1]) || (a === p.edge[1] && b === p.edge[0]))
  out.edges.splice(e, 1, [p.edge[0], p.newId], [p.newId, p.edge[1]])
  p.ids.push(p.newId) // la tirada pasa a 4 nodos para la verificación
}

// ── Separación mínima por tirada DESPUÉS de insertar.
const minAfter = new Map()
for (const [deck, ids] of runIds) {
  minAfter.set(deck, minSepOf(ids, out.edges, outById))
}

// ── Factor de escala uniforme mínimo (solo si hace falta).
let factor = 1
for (const min of minAfter.values()) {
  if (min < MIN_SEP) factor = Math.max(factor, MIN_SEP / min)
}
let scaled = false
if (factor > 1) {
  if (factor > MAX_SCALE) {
    console.error('FALLA: con factor ≤ 1,15 no se cumple la separación de 65 px:')
    for (const [deck, min] of minAfter) {
      if (min < MIN_SEP) console.error(`  ${deck}: ${min.toFixed(1)} px (necesita factor ${((MIN_SEP / min)).toFixed(3)})`)
    }
    process.exit(1)
  }
  // Escala respecto del centro: multiplicar por f equivale a escalar centrado y
  // reencuadrar con imageSize×f (el centro del tablero no cambia de lugar).
  const [w, h] = out.meta.imageSize ?? [1176, 1600]
  for (const nd of out.nodes) {
    nd.x = Math.round(nd.x * factor)
    nd.y = Math.round(nd.y * factor)
  }
  out.meta.imageSize = [Math.round(w * factor), Math.round(h * factor)]
  for (const st of Object.values(stacks.stacks)) {
    st.x = Math.round(st.x * factor)
    st.y = Math.round(st.y * factor)
    st.w = Math.round(st.w * factor)
    st.h = Math.round(st.h * factor)
  }
  scaled = true
}

// ── Verificación de grafo: conexo, +N nodos y +N aristas.
const seen = new Set([out.nodes[0].id])
const queue = [out.nodes[0].id]
const adj = new Map(out.nodes.map((nd) => [nd.id, []]))
for (const [a, b] of out.edges) {
  adj.get(a)?.push(b)
  adj.get(b)?.push(a)
}
while (queue.length > 0) {
  const id = queue.pop()
  for (const next of adj.get(id) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next) }
}
if (seen.size !== out.nodes.length) {
  console.error(`FALLA: el grafo quedó NO conexo (inalcanzables: ${out.nodes.filter((nd) => !seen.has(nd.id)).map((nd) => nd.id).join(', ')})`)
  process.exit(1)
}
if (out.nodes.length !== board.nodes.length + plans.length || out.edges.length !== board.edges.length + plans.length) {
  console.error('FALLA: el delta de nodos/aristas no coincide con los planes')
  process.exit(1)
}

// ── meta.status + registro de fecha y factor.
const status = String(out.meta.status)
if (!status.endsWith('+deck4')) out.meta.status = `${status}+deck4`
out.meta.deck4 = { date: new Date().toISOString().slice(0, 10), scale: Math.round(factor * 1000) / 1000 }

// ── Reporte.
console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN'} (${plans.length} mazo(s)):`)
for (const p of plans) {
  const after = scaled ? minAfter.get(p.deck) * factor : minAfter.get(p.deck)
  console.log(
    `  ${p.deck.padEnd(8)} tirada ${p.ids.join('-')}  parte ${p.edge[0]}—${p.edge[1]} ` +
      `→ nuevo ${p.newId} @(${p.x},${p.y})  sep ${p.before.toFixed(1)} → ${after.toFixed(1)} px`,
  )
}
for (const r of rows) console.log(`  ${r.deck}: ${r.note}`)
console.log(`  factor de escala: ${scaled ? factor.toFixed(3) : '1 (no necesario)'} · grafo conexo · +${plans.length} nodos / +${plans.length} aristas`)

if (!APPLY) {
  console.log('Dry-run: no se escribió nada (usá --apply para aplicar).')
  process.exit(0)
}

writeFileSync(BOARD_PATH, `${JSON.stringify(out, null, 1)}\n`, 'utf8')
if (scaled) writeFileSync(STACKS_PATH, `${JSON.stringify(stacks, null, 2)}\n`, 'utf8')
console.log(`Escrito: content/board/kanto.json${scaled ? ' + content/board/deck-stacks.json' : ''}`)
