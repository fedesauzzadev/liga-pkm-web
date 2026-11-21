// AC: triage-customs (.opencode/plan/triage-customs.md) — resolución de efectos
// {op:'custom'}: agrupados por texto normalizado, cada grupo mapeado a una
// primitiva real de docs/EFFECTS.md o cubierto por un ER de docs/effect-requests/;
// nada se programa sin ER aprobado.
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { EffectSchema } from '../packages/content/src/effects.ts'
import { PokemonCardSchema, type PokemonCard } from '../packages/content/src/cards.ts'
import { collect } from '../packages/content/src/validate.ts'
import {
  MAPPINGS, applyMappings, collectCustoms, groupCustoms, mappingFor, pendingErs,
} from '../tools/triage-customs.ts'

const repo = process.cwd()
const contentDir = join(repo, 'content')
const erDir = join(repo, 'docs', 'effect-requests')

/** Carta fixture válida con un solo ataque cuyos effects se pasan por parámetro. */
function cardWithEffects(id: string, attackId: string, effects: unknown[]): Record<string, unknown> {
  return {
    id,
    dex: 63,
    name: id,
    stage: 'basic',
    deck: 'pantano',
    hp: 50,
    element: 'psychic',
    attacks: [{
      id: attackId,
      name: attackId,
      kind: 'attack',
      rollFaces: [4, 5],
      cost: ['psychic'],
      element: 'psychic',
      damage: { base: 10 },
      effects,
      rawText: '4-5_ Ataque: texto literal de la carta.',
      officialMove: 'hypnosis',
      officialMoveStatus: 'proposed',
      fx: 'psychic',
    }],
    specialties: [],
    evolvesTo: [],
    source: { photo: 'photos/Mazos/X/01.jpg', verified: false },
  }
}

function writeStaging(contentRoot: string, name: string, cards: unknown[]): string {
  const dir = join(contentRoot, 'pokemon', '_staging')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  writeFileSync(file, `${JSON.stringify({ photo: `${name}.jpg`, cards }, null, 1)}\n`)
  return file
}

function withTmpContent(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'triage-'))
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// AC: triage-customs/AC-1 — todos los customs agrupados por texto normalizado:
// mayúsculas, acentos y punto final no crean grupos nuevos; el informe sabe
// cuántas cartas usan cada grupo y en qué archivo está cada instancia.
test('AC-1 agrupa por texto normalizado con todas las instancias', () => {
  withTmpContent((root) => {
    writeStaging(root, 'a.json', [
      cardWithEffects('abra', 'hipno-rayo', [
        { op: 'custom', handler: 'TODO_a', rawText: 'si tu rival saca 1-2 se auto-ataca' },
      ]),
    ])
    writeStaging(root, 'b.json', [
      cardWithEffects('abra2', 'hipno-rayo', [
        { op: 'custom', handler: 'TODO', rawText: 'SI TU RIVAL SACA 1-2 SE AUTO-ATACA.' },
      ]),
      cardWithEffects('bulba', 'lianas', [
        { op: 'custom', handler: 'TODO', rawText: '5-6 tu rival no atacará.' },
      ]),
    ])
    const { instances } = collectCustoms(root)
    expect(instances).toHaveLength(3)
    const groups = groupCustoms(instances)
    const hipno = groups.find((g) => g.key === 'si tu rival saca 1-2 se auto-ataca')
    expect(hipno?.instances.map((i) => i.cardId).sort()).toEqual(['abra', 'abra2'])
    expect(hipno?.instances.map((i) => i.file)).toContain('pokemon/_staging/a.json')
    expect(groups.find((g) => g.key === '5-6 tu rival no atacara')?.instances).toHaveLength(1)
  })
  // En el repo real: cada instancia cae en exactamente un grupo (sin dobles conteos).
  const repoInstances = collectCustoms(contentDir).instances
  const grouped = groupCustoms(repoInstances).flatMap((g) => g.instances)
  expect(grouped).toHaveLength(repoInstances.length)
})

// AC: triage-customs/AC-2 — cada grupo queda en exactamente un estado: mapeado a
// una primitiva real de EffectSchema, cubierto por un ER, o unificado (todas las
// copias comparten el mismo mapeo/ER — ninguna queda sin resolver).
test('AC-2 todo grupo restante tiene mapeo o ER; los mapeos son primitivas reales', () => {
  const erFiles = readdirSync(erDir).filter((f) => /^ER-\d{3}\.md$/.test(f))
  const erText = erFiles.map((f) => readFileSync(join(erDir, f), 'utf8')).join('\n')
  for (const group of groupCustoms(collectCustoms(contentDir).instances)) {
    const mapped = mappingFor(group.key) !== undefined
    const covered = group.instances.some((i) => erText.includes(i.rawText))
    expect(mapped || covered, `grupo sin resolver: ${group.key}`).toBe(true)
  }
  for (const effect of Object.values(MAPPINGS)) {
    const check = EffectSchema.safeParse(effect)
    expect(check.success, JSON.stringify(effect)).toBe(true)
    expect(check.success && check.data.op).not.toBe('custom')
  }
})

// AC: triage-customs/AC-3 — los mapeos se aplican en los JSON: custom → primitiva,
// el rawText del ataque se conserva y la carta queda sin verificar (needsReview).
test('AC-3 applyMappings reemplaza custom, conserva rawText y deja needsReview', () => {
  withTmpContent((root) => {
    const file = writeStaging(root, 'c.json', [
      cardWithEffects('abra', 'hipno-rayo', [
        { op: 'custom', handler: 'TODO_abra_hipno_rayo', rawText: 'si tu rival saca 1-2 se auto-ataca' },
      ]),
    ])
    const res = applyMappings(root)
    expect(res.applied).toBe(1)
    expect(res.changedFiles).toContain('pokemon/_staging/c.json')
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { cards: PokemonCard[] }
    const atk = doc.cards[0]!.attacks[0]!
    expect(atk.rawText).toBe('4-5_ Ataque: texto literal de la carta.')
    expect(atk.effects[0]).toEqual({
      op: 'rollGate', failFaces: [1, 2], outcome: 'selfHit', duration: 'nextTurn',
    })
    expect(doc.cards[0]!.source.verified).toBe(false)
    expect((doc.cards[0] as unknown as { needsReview?: boolean }).needsReview).toBe(true)
    expect(PokemonCardSchema.safeParse(doc.cards[0]).success).toBe(true)
    expect(collectCustoms(root).instances).toHaveLength(0)
  })
})

// AC: triage-customs/AC-4 — no se programa ningún ER: los archivos de
// docs/effect-requests siguen el naming ER-nnn y el motor no registra handlers
// custom de esta tarea.
test('AC-4 ERs con naming ER-nnn y sin handlers TODO registrados en el motor', () => {
  for (const f of readdirSync(erDir)) {
    if (f.endsWith('.md')) expect(f).toMatch(/^ER-\d{3}\.md$/)
  }
  const engineDir = join(repo, 'packages', 'engine', 'src')
  const scan = (dir: string): string[] => {
    const out: string[] = []
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) out.push(...scan(p))
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(readFileSync(p, 'utf8'))
    }
    return out
  }
  for (const src of scan(engineDir)) {
    for (const line of src.split('\n')) {
      if (line.includes('registerCustomEffectHandler(')) {
        expect(line.includes('TODO_'), line.trim()).toBe(false)
      }
    }
  }
})

// AC: triage-customs/AC-5 — content:validate verde y el conteo de customs
// (canónico + _staging) queda igual a la cantidad de ER pendientes.
test('AC-5 content valida y customs restantes == ER pendientes', () => {
  const report = collect(contentDir)
  expect(report.errors, report.errors.join('\n')).toEqual([])
  expect(report.stats.customEffects).toBe(pendingErs(erDir).length)
})

// AC: triage-customs/AC-6 — las dudas de interpretación quedaron registradas en
// docs/OPEN-QUESTIONS.md con el default aplicado.
test('AC-6 dudas de interpretación registradas en OPEN-QUESTIONS', () => {
  const text = readFileSync(join(repo, 'docs', 'OPEN-QUESTIONS.md'), 'utf8')
  expect(text).toContain('triage-customs')
  expect(text).toContain('4-5-6 cada turno')
  expect(text).toContain('onRoll')
})
