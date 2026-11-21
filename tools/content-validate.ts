// content:validate — valida content/** con esquemas Zod + chequeos cruzados (T-002).
// Corre con type-stripping nativo de Node (>= 22.18); sin paso de build.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateContent } from '../packages/content/src/validate.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const report = validateContent(join(repoRoot, 'content'))

for (const w of report.warnings) console.warn(`WARN ${w}`)

if (!report.ok) {
  console.error(`content:validate FALLA — ${report.errors.length} error(es):`)
  for (const e of report.errors) console.error(`  ${e}`)
  process.exit(1)
}

const s = report.stats
const boardInfo =
  s.board !== undefined
    ? `, tablero ${s.board.nodes} nodos/${s.board.edges} aristas` +
      ` (${s.board.connected ? 'conexo' : 'NO conexo'}, ${s.board.status})`
    : ''
// SPEC-F/T-002b AC-4: totales por mazo (energías + PKM cargados).
if (s.decks !== undefined) {
  for (const t of s.decks) {
    console.log(
      `  mazo ${t.deck.padEnd(8)} ${String(t.energy).padStart(2)} energía + ${String(t.pkm).padStart(2)} PKM = ${String(t.total).padStart(2)}/${t.expected}`,
    )
  }
}
const itemDeck = s.decks !== undefined ? ' e ítems = 60' : ''
console.log(
  `content:validate OK — ${s.files} archivo(s), ${s.cards} carta(s) ` +
    `(${s.verifiedCards} verificadas, ${s.unverifiedCards} sin verificar)${boardInfo}, ` +
    `${s.customEffects} efecto(s) custom (docs/effect-requests/), ` +
    `${report.warnings.length} warning(s)${itemDeck}`,
)
