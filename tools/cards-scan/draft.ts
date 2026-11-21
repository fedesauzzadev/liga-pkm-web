// cards-scan/draft (SPEC-S/T-102b/AC-5..7) — arma el borrador de carta a
// partir de las regiones OCR: valida (HP, daño, caras, cantidad de ataques,
// pisado de caras), corrige lo obvio (5O→50 vía fixDigits) y agrega
// confidence por campo + needsReview. Puro: sin OCR ni IO.
import {
  analyzeAttack,
  analyzeFooter,
  analyzeGymHeader,
  analyzeSpecialty,
  canonicalName,
  fixDigits,
  normalizeText,
  slugify,
  snapNameToPokeapi,
  type CardGroup,
  type RegionOcr,
  type StageKind,
} from './analyze.ts'
import type { SpeciesOut } from '../pokeapi.ts'
import type { ConfidenceConfig, ValidationConfig } from './config.ts'
import { attackElementOf, DECK_CLASSES, ELEMENT_CLASSES, type CardIconClasses, type IconClassResult } from './iclassify.ts'

export interface DraftField<T> {
  readonly value: T
  readonly confidence: number
  readonly note?: string | undefined
}

export interface DraftAttack {
  readonly rollFaces: readonly number[] | null
  readonly name: string
  readonly kind: 'attack' | 'ability'
  readonly damageBase: number | null
  readonly ifRoll: { readonly faces: readonly number[]; readonly damage: number } | null
  readonly rawText: string
  readonly effectText: string
  readonly cost: readonly string[] | null
  readonly element: string | null
  readonly confidence: number
  readonly notes: readonly string[]
}

export interface DraftSpecialty {
  readonly key: string
  readonly rawText: string
  readonly confidence: number
}

export interface DraftGym {
  readonly slot: number
  readonly name: string
  readonly leaderOrTrainer: string
  readonly city: string
}

export interface DraftCard {
  readonly group: CardGroup
  readonly name: DraftField<string>
  readonly dex: DraftField<number | null>
  readonly hp: DraftField<number | null>
  readonly element: DraftField<string | null>
  readonly deck: DraftField<string | null>
  readonly stage: DraftField<StageKind | null>
  readonly evolvesTo: readonly { readonly id: string; readonly name: string; readonly xp: number }[]
  readonly chances: number | null
  readonly attacks: readonly DraftAttack[]
  readonly specialties: readonly DraftSpecialty[]
  readonly gym: DraftGym | null
  readonly leagueTrainer: string | null
  readonly warnings: readonly string[]
  readonly needsReview: boolean
  readonly confidence: number
}

/** Datos leídos del nombre del archivo (SPEC-T/T-104/AC-1): mandan sobre el
 * OCR; el OCR del encabezado queda SOLO como verificación (AC-2). */
export interface FileCardInfo {
  readonly name: string
  readonly dex: number | null
  readonly deck: string | null
  readonly leaderOrTrainer: string | null
  readonly variant: string | null
}

export interface DraftInput {
  readonly group: CardGroup
  readonly name: RegionOcr
  readonly hp: RegionOcr
  readonly blocks: readonly { kind: 'specialty' | 'attack'; text: RegionOcr; damage: RegionOcr | null }[]
  readonly footerStage: RegionOcr
  readonly footerRight: RegionOcr
  readonly species?: readonly SpeciesOut[] | undefined
  readonly icons?: CardIconClasses | undefined
  /** Deck por nombre/ruta del escaneo (Q-081): manda sobre el ícono del pie. */
  readonly deckHint?: string | undefined
  /** Nombre/mazo/líder desde el nombre del archivo (T-104); manda sobre todo. */
  readonly file?: FileCardInfo | undefined
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

function validRange(n: number, r: { min: number; max: number; multipleOf: number }): boolean {
  return n >= r.min && n <= r.max && n % r.multipleOf === 0
}

/** HP: dígitos (con corrección 5O→50) + validación 20-150 múltiplo de 10. */
function draftHp(hp: RegionOcr, v: ValidationConfig): DraftField<number | null> {
  const raw = hp.text.replace(/[^\dOolISsBbGgZz!|q]/g, '')
  const { text, changed } = fixDigits(raw)
  const parsed = text.match(/\d{2,3}/)
  if (parsed === null) return { value: null, confidence: 0, note: `HP ilegible: "${normalizeText(hp.text)}"` }
  const n = Number.parseInt(parsed[0], 10)
  if (validRange(n, v.hp)) return { value: n, confidence: clamp01(hp.confidence) * (changed ? 0.85 : 1), note: changed ? `HP corregido: "${raw}"→${n}` : undefined }
  return { value: n, confidence: 0.4, note: `HP ${n} fuera de rango (${v.hp.min}-${v.hp.max})` }
}

export function analyzeCard(input: DraftInput, validation: ValidationConfig, conf: ConfidenceConfig): DraftCard {
  const warnings: string[] = []
  // Nombre + snap a PokeAPI (AC-6). Con pista del archivo (T-104/AC-1) el
  // nombre/dex salen del nombre del archivo y el OCR solo VERIFICA (AC-2):
  // si difiere se avisa, nunca se usa el leído.
  const nameValue0 = normalizeText(input.name.text)
  let nameValue = nameValue0
  let nameNote: string | undefined
  const nameConf = clamp01(input.name.confidence)
  let dex: number | null = null
  const hasSpecies = validation.snapEnabled && input.species !== undefined && input.species.length > 0
  const file = input.file !== undefined && input.file.name.length > 0 ? input.file : undefined
  if (file !== undefined) {
    // En gimnasio/Liga el encabezado es `#n Nombre de Líder`: se compara el
    // nombre PARSEADO, no el texto crudo.
    const headerParse = input.group === 'gym' || input.group === 'league' ? analyzeGymHeader(input.name) : null
    const readName = headerParse !== null ? headerParse.name : nameValue0
    if (canonicalName(readName) !== canonicalName(file.name)) {
      warnings.push(`nombre leído "${readName}" ≠ nombre del archivo "${file.name}" (se usa el del archivo)`)
    }
    nameValue = file.name
    nameNote = 'nombre por nombre del archivo'
    dex = file.dex
  } else if (hasSpecies && nameValue.length > 0) {
    const snap = snapNameToPokeapi(nameValue, input.species as readonly SpeciesOut[], validation.snapMaxEditDistance)
    if (snap !== null) {
      dex = snap.dex
      if (snap.name !== nameValue) {
        nameNote = `nombre ajustado a PokeAPI: "${nameValue}"→"${snap.name}" (distancia ${snap.distance})`
        nameValue = snap.name
      } else nameNote = `coincide con PokeAPI (dex ${snap.dex})`
    } else nameNote = 'sin coincidencia en PokeAPI'
  }
  const nameField: DraftField<string> = { value: nameValue, confidence: file !== undefined ? 0.98 : nameConf, note: nameNote }
  const dexField: DraftField<number | null> = {
    value: dex,
    confidence: file !== undefined ? (file.dex !== null ? 0.98 : Math.min(nameConf, 0.6)) : dex !== null ? 0.95 : hasSpecies ? Math.min(nameConf, 0.6) : 1,
    note:
      file !== undefined && file.dex === null
        ? 'dex sin confirmar (nombre del archivo sin coincidencia)'
        : dex !== null
          ? undefined
          : hasSpecies
            ? 'dex sin confirmar (sin coincidencia)'
            : undefined,
  }

  const hpField = draftHp(input.hp, validation)

  // Bloques: especialidad (revalidada por regex) + ataques.
  const specialties: DraftSpecialty[] = []
  const attacks: DraftAttack[] = []
  for (const b of input.blocks) {
    if (b.kind === 'specialty') {
      const sp = analyzeSpecialty(b.text)
      if (sp === null) warnings.push('bloque marcado como especialidad sin patrón de MAYÚSCULAS')
      else specialties.push({ ...sp, confidence: clamp01(b.text.confidence) })
      continue
    }
    const a = analyzeAttack(b.text, b.damage, validation.facesDigits)
    if (a.damageBase !== null && !validRange(a.damageBase, validation.damage)) warnings.push(`daño ${a.damageBase} fuera de rango en "${a.name}"`)
    if (a.ifRoll !== null && !validRange(a.ifRoll.damage, validation.damage)) warnings.push(`daño del ifRoll ${a.ifRoll.damage} fuera de rango en "${a.name}"`)
    attacks.push({
      rollFaces: a.rollFaces,
      name: a.name,
      kind: a.kind,
      damageBase: a.damageBase,
      ifRoll: a.ifRoll,
      rawText: a.rawText,
      effectText: a.effectText,
      cost: null,
      element: null,
      confidence: a.confidence,
      notes: a.notes,
    })
  }

  // Cantidad de ataques (AC-5).
  if (attacks.length < validation.attacksPerCard.min || attacks.length > validation.attacksPerCard.max) {
    warnings.push(`cantidad de ataques ${attacks.length} fuera de ${validation.attacksPerCard.min}-${validation.attacksPerCard.max}`)
  }

  // Caras pisadas entre ataques (AC-5: se avisa).
  for (let i = 0; i < attacks.length; i++) {
    for (let j = i + 1; j < attacks.length; j++) {
      const a = attacks[i]
      const b = attacks[j]
      if (a === undefined || b === undefined || a.rollFaces === null || b.rollFaces === null) continue
      if (a.rollFaces.some((f) => b.rollFaces?.includes(f))) warnings.push(`caras pisadas entre ataque ${i + 1} y ${j + 1}`)
    }
  }

  // Pie: etapa/evolución/oportunidad (AC-4).
  const footer = analyzeFooter(input.footerStage, input.footerRight)
  warnings.push(...footer.notes)
  let stage: StageKind | null = footer.stage
  if (input.group === 'gym') stage = 'gym'
  else if (input.group === 'league') stage = 'league'
  else if (input.group === 'sorpresa' && footer.chances !== null) stage = 'surprise'
  const evolvesTo = footer.evolvesTo.map((e) => {
    if (hasSpecies && input.species !== undefined) {
      const snap = snapNameToPokeapi(e.name, input.species, validation.snapMaxEditDistance)
      if (snap !== null && snap.name !== e.name) return { id: slugify(snap.name), name: snap.name, xp: e.xp }
    }
    return e
  })
  const stageField: DraftField<StageKind | null> = {
    value: stage,
    confidence: stage === null ? 0.3 : clamp01(input.footerStage.confidence),
    note: stage === null ? 'etapa no reconocida' : undefined,
  }

  // Gimnasio/Liga: encabezado `#n nombre de líder` + ciudad del pie (AC-4).
  // T-104: el líder/entrenador del archivo manda; el encabezado se verifica
  // (y sigue dando el slot, que el nombre de archivo no trae).
  let gym: DraftGym | null = null
  let leagueTrainer: string | null = null
  if (input.group === 'gym' || input.group === 'league') {
    const gh = analyzeGymHeader(input.name)
    const city = normalizeText(input.footerRight.text).replace(/gimnasio\s*/i, '').trim()
    const leader = input.file?.leaderOrTrainer ?? null
    if (gh === null) {
      if (input.group === 'league' && leader !== null) leagueTrainer = leader
      else warnings.push('encabezado de gimnasio/liga no reconocido')
    } else {
      if (leader !== null && canonicalName(leader) !== canonicalName(gh.leaderOrTrainer)) {
        warnings.push(`líder/entrenador leído "${gh.leaderOrTrainer}" ≠ nombre del archivo "${leader}" (se usa el del archivo)`)
      }
      if (input.group === 'gym') gym = { slot: gh.slot, name: gh.name, leaderOrTrainer: leader ?? gh.leaderOrTrainer, city }
      else leagueTrainer = leader ?? gh.leaderOrTrainer
    }
  }

  // Íconos (T-102c): element del encabezado y costo/element por ataque. El
  // mazo sale del nombre/ruta del escaneo (Q-081 + T-104: primero el nombre
  // del archivo) y el ícono del pie solo se usa como CHEQUEO CRUZADO: un pie
  // desconocido o sin etiquetas NO penaliza; avisa únicamente si clasifica un
  // mazo concreto distinto al del nombre.
  let elementField: DraftField<string | null> = { value: null, confidence: 1, note: 'íconos sin clasificar (falta icon-labels.json)' }
  let deckField: DraftField<string | null> = { value: null, confidence: 1, note: elementField.note }
  const deckFromFile = input.file?.deck ?? null
  const deckFrom = deckFromFile ?? input.deckHint ?? null
  const deckNote = deckFromFile !== null ? 'mazo por nombre del archivo' : 'mazo por nombre/ruta del escaneo'
  const deckConf = deckFromFile !== null ? 0.98 : 0.95
  let attacksOut = attacks
  if (input.icons !== undefined) {
    const iconField = (res: IconClassResult | null, nombre: string, válidos: ReadonlySet<string> | undefined): DraftField<string | null> => {
      if (res === null) return { value: null, confidence: 0.3, note: `ícono de ${nombre} no encontrado` }
      if (res.label === 'unknown') {
        warnings.push(`ícono de ${nombre} desconocido (distancia ${res.distance.toFixed(2)} > máxima)`)
        return { value: null, confidence: 0.2, note: 'ícono desconocido' }
      }
      if (válidos !== undefined && !válidos.has(res.label)) {
        // Etiqueta fuera de las clases del rol (p.ej. 'any' como elemento):
        // se anula en vez de quedar un dato imposible; el grupo está mal
        // etiquetado en icons.html y se corrige ahí.
        warnings.push(`etiqueta de ${nombre} inesperada: ${res.label}`)
        return { value: null, confidence: 0.2, note: `etiqueta inesperada: ${res.label}` }
      }
      return { value: res.label, confidence: res.confidence }
    }
    elementField = iconField(input.icons.element, 'elemento', ELEMENT_CLASSES)
    const pie = input.icons.deck
    const delPie = pie !== null && pie.label !== 'unknown' && DECK_CLASSES.has(pie.label) ? pie.label : null
    if (deckFrom === null) {
      deckField = iconField(pie, 'mazo', DECK_CLASSES)
    } else {
      if (delPie !== null && delPie !== deckFrom) warnings.push(`mazo del pie (${delPie}) ≠ nombre/ruta del escaneo (${deckFrom})`)
      deckField = {
        value: deckFrom,
        confidence: deckConf,
        note: delPie !== null && delPie !== deckFrom ? `ícono del pie descartado: ${delPie}` : deckNote,
      }
    }
    attacksOut = attacks.map((a, i) => {
      const cc = input.icons?.costs[i]
      if (cc === undefined) return a
      const cost = cc.map((x) => x.label)
      if (cc.length === 0) warnings.push(`costos no detectados (ataque ${i + 1})`)
      if (cost.includes('unknown')) warnings.push(`ícono de costo desconocido (ataque ${i + 1})`)
      const iconConf = cc.length > 0 ? Math.min(...cc.map((x) => x.confidence)) : 0.4
      return { ...a, cost, element: attackElementOf(cost), confidence: Math.min(a.confidence, iconConf) }
    })
  } else if (deckFrom !== null) {
    deckField = { value: deckFrom, confidence: deckConf, note: deckNote }
  }

  const fieldConfs = [
    nameField.confidence,
    hpField.confidence,
    stageField.confidence,
    elementField.confidence,
    deckField.confidence,
    ...attacksOut.map((a) => a.confidence),
    ...specialties.map((s) => s.confidence),
  ]
  const confidence = fieldConfs.length > 0 ? Math.min(...fieldConfs) : 0
  const hasAbility = attacksOut.some((a) => a.kind === 'ability')
  const needsReview =
    fieldConfs.some((c) => c < conf.needsReviewBelow) ||
    hasAbility ||
    attacksOut.some((a) => a.rollFaces === null) ||
    warnings.length > 0
  return {
    group: input.group,
    name: nameField,
    dex: dexField,
    hp: hpField,
    element: elementField,
    deck: deckField,
    stage: stageField,
    evolvesTo,
    chances: footer.chances,
    attacks: attacksOut,
    specialties,
    gym,
    leagueTrainer,
    warnings,
    needsReview,
    confidence,
  }
}
