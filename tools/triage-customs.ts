// triage-customs (.opencode/plan/triage-customs.md) — resolución de los efectos
// {op:'custom'} de content/pokemon (canónico + _staging): los agrupa por texto
// normalizado, aplica los mapeos confirmados a primitivas de docs/EFFECTS.md
// (--apply: custom → primitiva, conservando el rawText del ataque y dejando la
// carta sin verificar) y controla la invariante customs restantes == ER
// pendientes (docs/effect-requests/). Los grupos sin mapeo NO se programan:
// se piden como ER-nnn (los aprueba el jefe).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { EffectSchema, type Effect } from '../packages/content/src/effects.ts'

// ── Texto normalizado: sin mayúsculas, diacríticos, espacios extra ni cierre. ──
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '')
}

// ── Mapeos confirmados (pila A): texto normalizado → primitiva de EFFECTS §1/§4.
// Un solo mapeo por grupo: todas las copias del mismo texto quedan unificadas.
export const MAPPINGS: Readonly<Record<string, Effect>> = {
  // Abra/Hipno-rayo — manual p.71-72: "1-2-3 se auto-ataca" ⇒ rollGate selfHit
  // nextTurn; esta carta usa caras 1-2.
  'si tu rival saca 1-2 se auto-ataca': {
    op: 'rollGate', failFaces: [1, 2], outcome: 'selfHit', duration: 'nextTurn',
  },
  // Abra/Confusión — canonizado en EFFECTS §4: "4-5-6 cada turno si tu rival
  // saca 1-2-3 se auto-ataca" ⇒ rollGate selfHit combat onRoll [4,5,6]
  // (duda Q-029 de docs/OPEN-QUESTIONS.md: la dueña confirma contra la física).
  '4-5-6 cada turno si tu rival saca 1-2-3 se auto-ataca': {
    op: 'rollGate', failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'combat', onRoll: [4, 5, 6],
  },
  // Bulbasaur/Lianas — manual: "5-6 tu rival no atacará" ⇒ rivalSkipsAttack.
  '5-6 tu rival no atacara': {
    op: 'rivalSkipsAttack', faces: [5, 6],
  },
  // Koffing de Koga/Pantalla de humo — canon textual de EFFECTS §4 (fila
  // "Polvo de esporas", mismo texto): "cada turno si sacás 1-2-3 tu PKM no
  // ataca" ⇒ rollGate noAttack combat.
  'cada turno si sacas 1-2-3 tu pkm no ataca': {
    op: 'rollGate', failFaces: [1, 2, 3], outcome: 'noAttack', duration: 'combat',
  },
  // Koffing de Koga/Explosión — canon EFFECTS §4 ("Explosión: damage.base 50 +
  // selfDamage 20"); el JSON ya tiene damage.base 50 ⇒ falta el selfDamage.
  'tu pkm se hace (50). koffing se hace (20)': {
    op: 'selfDamage', amount: 20,
  },
  // Raichu de Surge/Attack-trueno — carta del manual p.60 (scaneada a 300dpi,
  // OCR verificado): "cada turno si sacás 2 tu PKM no ataca" ⇒ misma forma que
  // Polvo de esporas (EFFECTS §4) con cara 2 y duración combate.
  '4-5_ attack-trueno: cada turno si sacas 2 tu pkm no ataca': {
    op: 'rollGate', failFaces: [2], outcome: 'noAttack', duration: 'combat',
  },
  // Raichu de Surge/DOBLE EQUIPO — canon textual EFFECTS §4 ("Raichu DOBLE
  // EQUIPO '3-4 tu PKM no ataca'"); texto completo confirmado en manual p.60.
  'doble equipo: cuando ataques a raichu tira el dado. si sacas 3-4 tu pkm no ataca': {
    op: 'defendGate', failFaces: [3, 4], outcome: 'noAttack',
  },
}

export function mappingFor(key: string): Effect | undefined {
  return MAPPINGS[key]
}

// ── Colecta de customs sobre JSON crudo (canónico + _staging): tolera archivos
// a medio revisar; solo exige que el archivo sea JSON.
export interface CustomInstance {
  readonly file: string
  readonly cardId: string
  readonly attackId: string | null
  readonly handler: string
  readonly rawText: string
}
export interface CustomGroup {
  readonly key: string
  readonly instances: readonly CustomInstance[]
}
export interface CustomsReport {
  readonly instances: readonly CustomInstance[]
  readonly invalidFiles: readonly string[]
}

const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

function customsOfDoc(raw: unknown, file: string, out: CustomInstance[]): void {
  if (!isRec(raw) || !Array.isArray(raw.cards)) return
  // SPEC-S/T-102e: los archivos del lector (fromScanner) son pre-revisión;
  // sus customs se listan en scan-reports/report.html, no en el triage
  // (recién cuentan cuando el dueño los cura y los guarda sin la marca).
  if (raw.fromScanner === true) return
  for (const c of raw.cards) {
    if (!isRec(c) || typeof c.id !== 'string') continue
    const zones: readonly { list: readonly unknown[]; attackId: string | null }[] = [
      { list: Array.isArray(c.attacks) ? c.attacks : [], attackId: null },
      { list: Array.isArray(c.specialties) ? c.specialties : [], attackId: null },
    ]
    for (const zone of zones) {
      for (const a of zone.list) {
        if (!isRec(a)) continue
        const attackId = typeof a.id === 'string' ? a.id : zone.attackId
        // Especialidades: efectos directos (sin `effects` anidado) — misma
        // forma de contar que countCustomEffects de validate.ts.
        if (a.op === 'custom' && typeof a.handler === 'string') {
          out.push({
            file, cardId: c.id, attackId, handler: a.handler,
            rawText: typeof a.rawText === 'string' ? a.rawText : '',
          })
        }
        if (!Array.isArray(a.effects)) continue
        for (const e of a.effects) {
          if (isRec(e) && e.op === 'custom' && typeof e.handler === 'string') {
            out.push({
              file, cardId: c.id, attackId, handler: e.handler,
              rawText: typeof e.rawText === 'string' ? e.rawText : '',
            })
          }
        }
      }
    }
  }
}

/** Archivos de cartas a triagar: canónico + _staging (relativos a contentDir). */
function cardFiles(contentDir: string): { rel: string; full: string }[] {
  const out: { rel: string; full: string }[] = []
  const addDir = (relDir: string): void => {
    const full = join(contentDir, relDir)
    if (!existsSync(full)) return
    for (const e of readdirSync(full, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isFile() && e.name.endsWith('.json')) out.push({ rel: `${relDir}/${e.name}`, full: join(full, e.name) })
    }
  }
  addDir('pokemon')
  addDir('pokemon/_staging')
  return out
}

export function collectCustoms(contentDir: string): CustomsReport {
  const instances: CustomInstance[] = []
  const invalidFiles: string[] = []
  for (const f of cardFiles(contentDir)) {
    try {
      customsOfDoc(JSON.parse(readFileSync(f.full, 'utf8')) as unknown, f.rel, instances)
    } catch {
      invalidFiles.push(f.rel)
    }
  }
  return { instances, invalidFiles }
}

export function groupCustoms(instances: readonly CustomInstance[]): CustomGroup[] {
  const byKey = new Map<string, CustomInstance[]>()
  for (const i of instances) {
    const key = normalizeText(i.rawText)
    const list = byKey.get(key) ?? []
    list.push(i)
    byKey.set(key, list)
  }
  return [...byKey.entries()]
    .map(([key, list]) => ({ key, instances: list }))
    .sort((a, b) => b.instances.length - a.instances.length || a.key.localeCompare(b.key))
}

// ── Aplicación de mapeos (pila A): custom → primitiva IN PLACE en el JSON,
// conservando el orden; el rawText literal queda en el ataque; la carta pasa a
// needsReview para que la dueña la verifique contra la física en /admin/cards.
export interface ApplyResult {
  readonly changedFiles: readonly string[]
  readonly applied: number
}

function mapEffectsInPlace(effects: unknown[], keyOf: (rawText: string) => Effect | undefined): number {
  let applied = 0
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i]
    if (isRec(e) && e.op === 'custom') {
      const rawText = typeof e.rawText === 'string' ? e.rawText : ''
      const mapping = keyOf(normalizeText(rawText))
      if (mapping !== undefined) {
        const check = EffectSchema.safeParse(mapping)
        if (!check.success) throw new Error(`triage: mapeo inválido para "${rawText}": ${check.error.message}`)
        effects[i] = mapping
        applied++
      }
    }
  }
  return applied
}

export function applyMappings(contentDir: string): ApplyResult {
  const changedFiles: string[] = []
  let applied = 0
  for (const f of cardFiles(contentDir)) {
    let doc: Record<string, unknown>
    try {
      doc = JSON.parse(readFileSync(f.full, 'utf8')) as Record<string, unknown>
    } catch {
      continue // archivo roto: queda para /admin/cards, el triage no lo toca
    }
    if (!isRec(doc) || !Array.isArray(doc.cards)) continue
    let fileApplied = 0
    for (const c of doc.cards) {
      if (!isRec(c) || !Array.isArray(c.attacks)) continue
      let cardApplied = 0
      for (const a of c.attacks) {
        if (isRec(a) && Array.isArray(a.effects)) cardApplied += mapEffectsInPlace(a.effects, mappingFor)
      }
      if (Array.isArray(c.specialties)) cardApplied += mapEffectsInPlace(c.specialties, mappingFor)
      if (cardApplied > 0) {
        c.needsReview = true
        fileApplied += cardApplied
      }
    }
    if (fileApplied > 0) {
      writeFileSync(f.full, `${JSON.stringify(doc, null, 1)}\n`)
      changedFiles.push(f.rel)
      applied += fileApplied
    }
  }
  return { changedFiles, applied }
}

// ── ER pendientes: docs/effect-requests/ER-nnn.md sin "Estado: aprobado".
export function pendingErs(erDir: string): string[] {
  if (!existsSync(erDir)) return []
  return readdirSync(erDir)
    .filter((f) => /^ER-\d{3}\.md$/.test(f))
    .filter((f) => !/^estado:\s*aprobado\b/im.test(readFileSync(join(erDir, f), 'utf8')))
    .sort()
}

// ── CLI: pnpm triage [--apply] — lista grupos + verifica la invariante. ───────
export function renderTriage(report: CustomsReport, pending: readonly string[]): string[] {
  const groups = groupCustoms(report.instances)
  const lines = [
    `triage: ${report.instances.length} custom(s) en ${groups.length} grupo(s) · ER pendientes: ${pending.length}`,
  ]
  for (const [i, g] of groups.entries()) {
    const cards = [...new Set(g.instances.map((x) => `${x.cardId}${x.attackId !== null ? `/${x.attackId}` : ''} (${x.file})`))]
    const dest = mappingFor(g.key) !== undefined ? `MAPEA → ${JSON.stringify(mappingFor(g.key))}` : 'SIN MAPEO → pedir ER'
    lines.push(`  [${i + 1}] «${g.key}» ×${g.instances.length} · ${cards.join(', ')} — ${dest}`)
  }
  if (report.invalidFiles.length > 0) lines.push(`  archivos ilegibles: ${report.invalidFiles.join(', ')}`)
  const ok = report.instances.length === pending.length
  lines.push(`triage: customs restantes (${report.instances.length}) == ER pendientes (${pending.length}): ${ok ? 'OK' : 'FALLA'}`)
  return lines
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const USAGE = 'uso: pnpm triage [--apply] [--content dir] [--er-dir dir]'

export async function cli(argv: readonly string[]): Promise<number> {
  let apply = false
  let content = join(repoRoot, 'content')
  let erDir = join(repoRoot, 'docs', 'effect-requests')
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (arg === '--apply') apply = true
    else if ((arg === '--content' || arg === '--er-dir') && value !== undefined) {
      if (arg === '--content') content = value
      else erDir = value
      i += 1
    } else {
      console.error(`triage: argumento desconocido "${arg ?? ''}"\n${USAGE}`)
      return 2
    }
  }
  if (apply) {
    const res = applyMappings(content)
    console.log(`triage: ${res.applied} mapeo(s) aplicado(s) en ${res.changedFiles.length} archivo(s): ${res.changedFiles.join(', ')}`)
  }
  const report = collectCustoms(content)
  const lines = renderTriage(report, pendingErs(erDir))
  for (const l of lines) console.log(l)
  return report.instances.length === pendingErs(erDir).length ? 0 : 1
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  void cli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
