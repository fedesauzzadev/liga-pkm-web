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
  type ConditionApplied,
  type ConditionCleared,
  type ConditionName,
  type DamageTaken,
  type DeckEmpty,
  type ElementEquipped,
  type ElementUnequipped,
  type EnergyGained,
  type GameEvent,
  type GameStarted,
  type GameWon,
  type GymAlreadyWon,
  type GymLocked,
  type Healed,
  type Landed,
  type MedalWon,
  type MoveStep,
  type NoAttack,
  type NoAttackCause,
  type NoAttackReason,
  type OakSwapped,
  type PartyHealed,
  type PkmEvolved,
  type PkmRetired,
  type PkmSentOut,
  type PokemonCaptured,
  type PokemonFainted,
  type PrizePkmWon,
  type RivalSentOut,
  type SelfHit,
  type TileInfo,
  type TileResolved,
  type UnsupportedEffect,
  type MulticolorAssigned,
  type MulticolorUnassigned,
  type TeamReordered,
  type TrainerAppeared,
  type WokeUp,
  type XpGained,
} from './events.ts'
export { type Command, resolvesPending } from './commands.ts'
export {
  elementOfCardId,
  ELEMENT_CARD_PREFIX,
  pushToBottom,
} from './tiles.ts'
export { canAssignMulticolor, canUse, legalAttacks } from './equipment.ts'
export { computeDamage, flatReductionFor, type DamageInput } from './battle.ts'
export {
  registerCustomEffectHandler,
  type CustomEffectHandler,
  type CustomEffectInput,
} from './battle.ts'
export {
  BAG_ITEMS,
  createInitialState,
  type BagItem,
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
export { newGame, STARTER_BY_DECK, type NewGameOptions } from './setup.ts'
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
