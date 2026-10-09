// board-render (t003-verificar-tablero) — evidencia gráfica del grafo para el
// reporte T-003 (AC-4 de SPEC-A/T-003) y el gate G0. Lee content/board/kanto.json
// y escribe tasks/reports/assets/t003-kanto-graph.svg con el mismo criterio de
// colores/formas que tools/board-overlay.html. Sin foto de fondo (regla de
// privacidad), cero dependencias, determinista (orden de nodos/aristas del JSON).
// Regenerar: node tools/board-render.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(repoRoot, 'content', 'board', 'kanto.json')
const OUT = join(repoRoot, 'tasks', 'reports', 'assets', 't003-kanto-graph.svg')

// Mismos colores que el overlay (constante COL de tools/board-overlay.html).
const COL = {
  deck: '#4aa3ff',
  centro: '#ff4d6d',
  mercado: '#ffd23f',
  oak: '#b05cff',
  duelo: '#ff8c1a',
  gym: '#2ecc71',
  empty: '#ddd',
  start: '#fff',
  sorpresa: '#f0f',
  liga: '#0ff',
  junction: '#888',
}

const board = JSON.parse(readFileSync(SRC, 'utf8'))
const [W, H] = board.meta.imageSize ?? [1200, 1600]
const byId = new Map(board.nodes.map((n) => [n.id, n]))

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Conectividad (misma lógica que facts() del overlay) para el encabezado.
const adj = new Map(board.nodes.map((n) => [n.id, []]))
for (const [a, b] of board.edges) {
  adj.get(a)?.push(b)
  adj.get(b)?.push(a)
}
const seen = new Set()
const queue = [board.nodes[0]?.id]
while (queue.length > 0) {
  const id = queue.pop()
  if (id === undefined || seen.has(id)) continue
  seen.add(id)
  for (const next of adj.get(id) ?? []) {
    if (!seen.has(next)) queue.push(next)
  }
}
const connected = seen.size === board.nodes.length

const svg = []
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">`)
svg.push(`<rect width="${W}" height="${H}" fill="#222"/>`)
// Aristas primero (mismo color/grosor que el overlay).
svg.push('<g stroke="rgba(255,230,0,.85)" stroke-width="4">')
for (const [a, b] of board.edges) {
  const na = byId.get(a)
  const nb = byId.get(b)
  if (!na || !nb) continue
  svg.push(`<line x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}"/>`)
}
svg.push('</g>')
// Nodos: cuadrado 28×28; redondo r=14 (junction r=6); id con contorno como en canvas.
for (const n of board.nodes) {
  const fill = COL[n.type] ?? '#fff'
  if (n.shape === 'square') {
    svg.push(
      `<rect x="${n.x - 14}" y="${n.y - 14}" width="28" height="28" fill="${fill}" stroke="#000" stroke-width="3"/>`,
    )
  } else {
    const r = n.type === 'junction' ? 6 : 14
    svg.push(`<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${fill}" stroke="#000" stroke-width="3"/>`)
  }
  svg.push(
    `<text x="${n.x + 16}" y="${n.y + 5}" font-size="15" font-weight="bold" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${esc(n.id)}</text>`,
  )
}
// Encabezado con el resumen del validador + leyenda de colores por tipo.
svg.push('<g font-size="15" fill="#eee">')
svg.push(
  `<text x="16" y="28" font-weight="bold">kanto.json — ${esc(board.meta.status)} · ${board.nodes.length} nodos / ${board.edges.length} aristas · conexo: ${connected ? 'SÍ' : 'NO'}</text>`,
)
let lx = 16
for (const [type, color] of Object.entries(COL)) {
  svg.push(`<rect x="${lx}" y="${H - 34}" width="12" height="12" fill="${color}" stroke="#000"/>`)
  svg.push(`<text x="${lx + 16}" y="${H - 23}">${type}</text>`)
  lx += 16 + type.length * 8 + 24
}
svg.push('</g>')
svg.push('</svg>')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, svg.join('\n') + '\n', 'utf8')
console.log(`${OUT} — ${board.nodes.length} nodos, ${board.edges.length} aristas, conexo: ${connected}`)
