// Motor de reglas puro: sin DOM, sin azar propio (Rng inyectada), estado JSON.
// SPEC-A/T-002 AC-5: los tipos de dominio son los canónicos de @liga/content.
export const ENGINE_NAME = 'liga-pkm-engine' as const
export { createBoardIndex, boardIndexFor, UnknownNodeError, type BoardIndex } from './board.ts'
export { createRng, type Rng } from './rng.ts'
export { EngineError, type EngineErrorCode, type Result } from './errors.ts'
export { InvariantError } from './invariants.ts'
export {
  assertInvariants,
  invariantChecksEnabled,
  listInvariants,
  registerInvariant,
  setInvariantChecksEnabled,
  type Invariant,
} from './invariants.ts'
export { NoopLogger, createMemoryLogger, type LogRecord, type Logger, type MemoryLogger } from './logger.ts'
export {
  type DiePurpose,
  type DieRolled,
  type AttackDodged,
  type AttackUsed,
  type BattleEnded,
  type BattleStarted,
  type CardDrawn,
  type CardToBottom,
  type DamageTaken,
  type DeckEmpty,
  type ElementEquipped,
  type ElementUnequipped,
  type GameEvent,
  type GameStarted,
  type GameWon,
  type GymLocked,
  type Healed,
  type Landed,
  type MedalWon,
  type MoveStep,
  type NoAttack,
  type NoAttackReason,
  type OakSwapped,
  type PkmEvolved,
  type PkmRetired,
  type PkmSentOut,
  type PokemonCaptured,
  type PokemonFainted,
  type PrizePkmWon,
  type RivalSentOut,
  type TeamHealed,
  type UnsupportedEffect,
  type WildcardAssigned,
  type WokeUp,
  type XpGained,
} from './events.ts'
export { type Command } from './commands.ts'
export {
  elementOfCardId,
  ELEMENT_CARD_PREFIX,
  pushToBottom,
} from './tiles.ts'
export { canAssignWildcard, canUse, legalAttacks } from './equipment.ts'
export { computeDamage, flatReductionFor, type DamageInput } from './battle.ts'
export {
  registerCustomEffectHandler,
  type CustomEffectHandler,
  type CustomEffectInput,
} from './battle.ts'
export {
  createInitialState,
  type BattleState,
  type Decision,
  type DeckStacks,
  type ElementCard,
  type GameState,
  type GymBattle,
  type ItemBag,
  type Phase,
  type PkmConditions,
  type PkmInstance,
  type PlayerState,
  type RivalPkm,
  type WildBattle,
} from './state.ts'
export { newGame, type NewGameOptions } from './setup.ts'
export { legalCommands } from './legal.ts'
export { GYM_DEFEATS_TO_LOSE } from './battle.ts'
export {
  gymChallengeable,
  gymLeaderOf,
  gymRequiresMedals,
  gymTeamOf,
} from './gyms.ts'
export {
  applyCommand,
  replay,
  type CommandOk,
  type Ctx,
  type ReplayOk,
} from './engine.ts'
export { buildAdjacency, reachableFrom, type Adjacency } from '@liga/content'
export type {
  Attack,
  BoardGraph,
  Content,
  DeckId,
  DeckList,
  Effect,
  Element,
  FxArchetype,
  GymLeader,
  GymPrize,
  Item,
  PokemonCard,
  Ruleset,
} from '@liga/content'
