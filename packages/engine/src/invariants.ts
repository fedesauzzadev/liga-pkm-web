// Invariantes del estado (ENGINEERING-STANDARDS §2): el reductor las verifica
// tras cada comando cuando los checks están habilitados (SPEC-A/T-006/AC-6).
// Cada tarea que agrega estado registra las suyas (T-010: setup/jugadores/mazos).
import { DECK_KEYS } from '@liga/content'
import { EngineError } from './errors.ts'
import { elementOfCardId } from './tiles.ts'
import type { GameState, PkmInstance } from './state.ts'

export type Invariant = (state: GameState) => void

export class InvariantError extends EngineError {
  readonly invariant: string

  constructor(invariant: string, message: string) {
    super('INVARIANT_VIOLATED', `invariante "${invariant}" violada: ${message}`)
    this.name = 'InvariantError'
    this.invariant = invariant
  }
}

// Registry (estándar §1): una entrada por invariante; prohibido el if gigante.
const registry = new Map<string, Invariant>()

export function registerInvariant(name: string, invariant: Invariant): void {
  if (registry.has(name)) throw new Error(`invariante duplicada: ${name}`)
  registry.set(name, invariant)
}

export function listInvariants(): readonly string[] {
  return [...registry.keys()]
}

/** Corre todas las invariantes registradas; lanza `InvariantError` si alguna falla. */
export function assertInvariants(state: GameState): void {
  for (const [name, invariant] of registry) {
    try {
      invariant(state)
    } catch (cause) {
      if (cause instanceof InvariantError) throw cause
      const message = cause instanceof Error ? cause.message : String(cause)
      throw new InvariantError(name, message)
    }
  }
}

// Habilitadas por defecto salvo en producción. Se lee `globalThis.process`
// sin tipos de Node: el motor no conoce su entorno (estándar §4).
let enabled = readNodeEnv() !== 'production'

function readNodeEnv(): string | undefined {
  const proc = (globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } }).process
  return proc?.env?.NODE_ENV
}

/** La UI puede desactivarlas en producción (SDD §7: performance). */
export function setInvariantChecksEnabled(value: boolean): void {
  enabled = value
}

export function invariantChecksEnabled(): boolean {
  return enabled
}

// Invariantes del estado base de T-004. Las de cartas/equipo llegan con T-010.
registerInvariant('estado/version-valida', (state) => {
  if (!Number.isInteger(state.version) || state.version < 1) {
    throw new Error(`version=${String(state.version)}`)
  }
})
registerInvariant('estado/turno-valido', (state) => {
  if (!Number.isInteger(state.turn) || state.turn < 0) {
    throw new Error(`turn=${String(state.turn)}`)
  }
})
registerInvariant('estado/dado-log-valido', (state) => {
  for (const die of state.dieLog) {
    if (die.value < 1 || die.value > 6) throw new Error(`cara fuera de rango: ${String(die.value)}`)
  }
})

// ── Invariantes de T-010 (SPEC-B). Aplican solo con jugadores presentes. ──

/** Todos los PKM del jugador (equipo + pila de Oak). */
function allPkm(state: GameState): readonly PkmInstance[] {
  return state.players.flatMap((p) => [...p.team, ...p.oakPile])
}

registerInvariant('setup/un-jugador-activo', (state) => {
  if (state.players.length === 0) return // pre-setup (createInitialState)
  if (state.players.length !== 1) {
    throw new Error(`MVP-0: 1 jugador, hay ${state.players.length}`)
  }
  const only = state.players[0]
  if (only === undefined) throw new Error('jugador inaccesible')
  if (state.activePlayerId !== only.id) throw new Error('activePlayerId no coincide con el jugador')
})

registerInvariant('setup/posicion-coherente', (state) => {
  for (const p of state.players) {
    if (p.position === '') throw new Error(`posicion vacia (${String(p.id)})`)
    if (p.cameFrom !== null && p.cameFrom === p.position) {
      throw new Error(`cameFrom igual a position (${String(p.position)})`)
    }
  }
})

registerInvariant('setup/equipo-limite', (state) => {
  if (state.ruleset === null) return
  for (const p of state.players) {
    if (p.team.length > state.ruleset.teamLimit) {
      throw new Error(`equipo de ${String(p.id)}: ${p.team.length} > ${state.ruleset.teamLimit}`)
    }
  }
})

registerInvariant('setup/uid-unicos', (state) => {
  const seen = new Set<string>()
  for (const pkm of allPkm(state)) {
    if (seen.has(pkm.uid)) throw new Error(`uid duplicado: ${String(pkm.uid)}`)
    seen.add(pkm.uid)
  }
})

registerInvariant('setup/valores-no-negativos', (state) => {
  for (const p of state.players) {
    if (p.wildcards < 0) throw new Error(`comodines < 0 (${String(p.id)})`)
    if (p.items.pokeball < 0 || p.items.potion < 0) {
      throw new Error(`items < 0 (${String(p.id)})`)
    }
    for (const pkm of allPkm(state)) {
      if (pkm.damage < 0) throw new Error(`damage < 0 (${String(pkm.uid)})`)
      if (pkm.xp < 0) throw new Error(`xp < 0 (${String(pkm.uid)})`)
    }
  }
})

registerInvariant('setup/mazos-presentes', (state) => {
  for (const key of DECK_KEYS) {
    if (!Array.isArray(state.decks[key])) throw new Error(`falta la pila del mazo ${key}`)
  }
})

// ── Invariantes de T-011 (SPEC-B: movimiento). ──

registerInvariant('movimiento/stepsLeft-valido', (state) => {
  if (!Number.isInteger(state.stepsLeft) || state.stepsLeft < 0) {
    throw new Error(`stepsLeft=${String(state.stepsLeft)}`)
  }
  if (state.stepsLeft > 0 && state.phase !== 'moving') {
    throw new Error(`stepsLeft=${String(state.stepsLeft)} fuera de fase "moving" (${state.phase})`)
  }
})

registerInvariant('movimiento/decision-en-moving', (state) => {
  const pending = state.pending
  if (
    pending !== null &&
    (pending.type === 'ChoosePath' || pending.type === 'StopOrContinue') &&
    state.phase !== 'moving'
  ) {
    throw new Error(`pending ${pending.type} en fase ${state.phase}`)
  }
  if (pending?.type === 'ChoosePath') {
    if (pending.options.length < 2) {
      throw new Error(`ChoosePath con ${String(pending.options.length)} opción(es)`)
    }
    // AC-3: nunca se ofrece volver a cameFrom durante el movimiento.
    const player = state.players.find((p) => p.id === state.activePlayerId)
    if (player !== undefined && player.cameFrom !== null && pending.options.includes(player.cameFrom)) {
      throw new Error(`opciones incluyen cameFrom (${String(player.cameFrom)})`)
    }
  }
})

registerInvariant('movimiento/aterrizaje-limpio', (state) => {
  if (state.phase === 'tileResolution' && state.stepsLeft !== 0) {
    throw new Error(`aterrizó con stepsLeft=${String(state.stepsLeft)}`)
  }
  if (state.phase === 'moving' && state.pending === null) {
    throw new Error('fase "moving" sin decisión pendiente')
  }
})

// ── Invariantes de T-012 (SPEC-B: casilleros y mazos). ──

/** Los PKM que pasan a la pila de Oak se curan: la pila siempre está sana (AC-2). */
registerInvariant('casillero/pila-de-oak-sana', (state) => {
  for (const p of state.players) {
    for (const pkm of p.oakPile) {
      if (pkm.damage !== 0) throw new Error(`"${String(pkm.uid)}" llegó dañado a la pila`)
      if (pkm.fainted) throw new Error(`"${String(pkm.uid)}" llegó derrotado a la pila`)
    }
  }
})

/** El encuentro solo vive en la resolución del casillero y nunca es un elemento (AC-1). */
registerInvariant('casillero/encuentro-coherente', (state) => {
  const pending = state.pending
  if (pending?.type !== 'FightOrRelease') return
  if (state.phase !== 'tileResolution') {
    throw new Error(`FightOrRelease en fase ${state.phase}`)
  }
  if (elementOfCardId(pending.card) !== null) {
    throw new Error('un encuentro nunca es una carta de elemento')
  }
})

/** Cada carta de elemento en poder del jugador tiene id de instancia único. */
registerInvariant('casillero/elementos-con-id-unico', (state) => {
  const seen = new Set<string>()
  for (const p of state.players) {
    for (const card of [...p.elements, ...p.team.flatMap((pkm) => pkm.equipped)]) {
      if (seen.has(card.id)) throw new Error(`carta de elemento duplicada: ${String(card.id)}`)
      seen.add(card.id)
    }
  }
})

// ── Invariantes de T-013 (SPEC-B: equipamiento y comodines). ──

/** Comodines: máx 1 por PKM y nunca más asignados que comodines tiene el jugador (AC-2). */
registerInvariant('equipamiento/comodines-coherentes', (state) => {
  for (const p of state.players) {
    let assigned = 0
    for (const pkm of p.team) {
      if (pkm.wildcards.length > 1) {
        throw new Error(`"${String(pkm.uid)}" tiene ${String(pkm.wildcards.length)} comodines (máx 1)`)
      }
      assigned += pkm.wildcards.length
    }
    if (assigned > p.wildcards) {
      throw new Error(`${String(p.id)}: ${String(assigned)} asignados > ${String(p.wildcards)} comodines`)
    }
  }
})

// ── Invariantes de T-020 (SPEC-C: batalla). ──

/** Fase `battle` ⇔ hay batalla; activos existentes; won ⇒ rival caído; condiciones sobre uids válidos. */
registerInvariant('batalla/coherente', (state) => {
  const { battle, phase } = state
  if ((phase === 'battle') !== (battle !== null)) {
    throw new Error(`fase ${String(phase)} con battle=${battle === null ? 'null' : 'activa'}`)
  }
  if (battle === null) return
  if (state.stepsLeft !== 0) throw new Error(`batalla con stepsLeft=${String(state.stepsLeft)}`)
  const player = state.players.find((p) => p.id === state.activePlayerId)
  if (player === undefined) throw new Error('batalla sin jugador activo')
  if (!player.team.some((pkm) => pkm.uid === battle.active[0])) {
    throw new Error(`activo propio "${String(battle.active[0])}" no está en el equipo`)
  }
  if (!battle.rival.some((rival) => rival.uid === battle.active[1])) {
    throw new Error(`activo rival "${String(battle.active[1])}" no está en la batalla`)
  }
  if (battle.won && !battle.rival.every((rival) => rival.fainted)) {
    throw new Error('batalla ganada con rival sano')
  }
  const uids = new Set<string>([...player.team.map((pkm) => pkm.uid), ...battle.rival.map((r) => r.uid)])
  for (const uid of Object.keys(battle.conditions)) {
    if (!uids.has(uid)) throw new Error(`condiciones para uid ajeno: ${uid}`)
  }
  for (const uid of [...battle.firstTurn, ...battle.participants]) {
    if (!player.team.some((pkm) => pkm.uid === uid)) {
      throw new Error(`"${uid}" en firstTurn/participants no es propio`)
    }
  }
  for (const rival of battle.rival) {
    if (rival.damage < 0) throw new Error(`daño rival < 0 (${String(rival.uid)})`)
  }
})

/** El activo propio solo puede estar caído si hay reemplazo pendiente (D-02/AC-7). */
registerInvariant('batalla/activo-sano-o-reemplazo', (state) => {
  const { battle, pending } = state
  if (battle === null || battle.won) return
  const player = state.players.find((p) => p.id === state.activePlayerId)
  const active = player?.team.find((pkm) => pkm.uid === battle.active[0])
  if (active === undefined) throw new Error('activo propio inaccesible')
  if (active.fainted && pending?.type !== 'ChooseReplacement') {
    throw new Error(`activo propio caído sin reemplazo pendiente (${String(active.uid)})`)
  }
  const rivalActive = battle.rival.find((r) => r.uid === battle.active[1])
  if (rivalActive === undefined) throw new Error('activo rival inaccesible')
  if (rivalActive.fainted) throw new Error('activo rival caído sin won=true')
})

/** ChooseReplacement siempre ofrece al menos un reemplazo sano (AC-7). */
registerInvariant('batalla/reemplazo-con-opciones', (state) => {
  const pending = state.pending
  if (pending?.type !== 'ChooseReplacement') return
  if (pending.options.length === 0) throw new Error('ChooseReplacement sin opciones')
  const player = state.players.find((p) => p.id === state.activePlayerId)
  for (const uid of pending.options) {
    const pkm = player?.team.find((candidate) => candidate.uid === uid)
    if (pkm === undefined || pkm.fainted) throw new Error(`opción de reemplazo inválida: ${uid}`)
  }
})

// ── Invariantes de T-022 (SPEC-C: progresión). ──

/** La decisión de captura vive en la resolución del casillero, sin batalla activa. */
registerInvariant('progresion/captura-coherente', (state) => {
  const pending = state.pending
  if (pending?.type !== 'CaptureOrRelease') return
  if (state.phase !== 'tileResolution') {
    throw new Error(`CaptureOrRelease en fase ${state.phase}`)
  }
  if (state.battle !== null) throw new Error('captura pendiente con batalla activa')
})

// ── Invariantes de T-023 (SPEC-C: gimnasios y fin de partida). ──

/** Medallas: sin repetir y nunca más que el objetivo del ruleset. */
registerInvariant('gimnasio/medallas-unicas', (state) => {
  for (const p of state.players) {
    const seen = new Set<string>()
    for (const medal of p.medals) {
      if (seen.has(medal)) throw new Error(`medalla duplicada: ${medal}`)
      seen.add(medal)
    }
    if (state.ruleset !== null && p.medals.length > state.ruleset.medalsToWin) {
      throw new Error(`${String(p.id)}: ${String(p.medals.length)} medallas > objetivo ${String(state.ruleset.medalsToWin)}`)
    }
  }
})

/** Duelo de gimnasio vivo: equipo del líder ≥ 1, snapshot del líder y < 2 caídos propios. */
registerInvariant('gimnasio/duelo-coherente', (state) => {
  const battle = state.battle
  if (battle === null || battle.kind !== 'gym') return
  if (battle.gym === '' || battle.medal === '') throw new Error('snapshot de líder incompleto')
  if (battle.rival.length === 0) throw new Error('duelo de gimnasio sin PKM del líder')
  // 2 caídos ⇒ el líder ya ganó: la batalla no puede seguir viva (AC-2).
  if (battle.lostCount >= 2) throw new Error(`lostCount=${String(battle.lostCount)} con la batalla viva`)
})

/** Fase `finished`: partida terminada — sin batalla ni decisiones, medallas completas. */
registerInvariant('gimnasio/fin-coherente', (state) => {
  if (state.phase !== 'finished') return
  if (state.battle !== null) throw new Error('partida terminada con batalla activa')
  if (state.pending !== null) throw new Error(`partida terminada con decisión pendiente ${state.pending.type}`)
  const player = state.players[0]
  if (state.ruleset !== null && player !== undefined && player.medals.length < state.ruleset.medalsToWin) {
    throw new Error(`fin con ${String(player.medals.length)} medallas < ${String(state.ruleset.medalsToWin)}`)
  }
})
