// @liga/content — esquemas Zod, tipos canónicos, loader y validador de content/.
// Motor y UI consumen los tipos de acá (SPEC-A/T-002 AC-5).
// `loadContent`/`validateContent` usan node:fs ⇒ solo Node (CLI, tests, scripts).
export const CONTENT_NAME = 'liga-pkm-content' as const
export {
  EffectSchema,
  FaceSchema,
  FacesSchema,
  DurationSchema,
  TargetSchema,
  type Duration,
  type Effect,
  type EffectOp,
  type Face,
  type Faces,
  type Target,
} from './effects.ts'
export {
  ELEMENTS,
  DECK_IDS,
  FX_ARCHETYPES,
  AttackSchema,
  CardGroupSchema,
  CostSlotSchema,
  DeckIdSchema,
  ElementSchema,
  FxArchetypeSchema,
  OfficialMoveStatusSchema,
  PokemonCardSchema,
  PokemonFileSchema,
  StageSchema,
  type Attack,
  type CardGroup,
  type CostSlot,
  type DeckId,
  type Element,
  type FxArchetype,
  type PokemonCard,
  type PokemonFile,
  type Stage,
} from './cards.ts'
export { RulesetSchema, type Ruleset } from './ruleset.ts'
export {
  GymLeaderSchema,
  GymPrizeSchema,
  GymsFileSchema,
  type GymLeader,
  type GymPrize,
  type GymsFile,
} from './gyms.ts'
export {
  BoardGraphSchema,
  BoardNodeSchema,
  BoardStatusSchema,
  GymDefSchema,
  NodeShapeSchema,
  NodeTypeSchema,
  type BoardGraph,
  type BoardNode,
  type BoardStatus,
  type GymDef,
  type NodeShape,
  type NodeType,
} from './board.ts'
export {
  buildAdjacency,
  reachableFrom,
  type Adjacency,
} from './graph.ts'
export {
  boardFacts,
  crossCheckBoard,
  EXPECTED_CLASSIC_COUNTS,
  type BoardCheckResult,
  type BoardFacts,
} from './board-checks.ts'
export {
  DECK_KEYS,
  DeckEntrySchema,
  DeckKeySchema,
  DeckListSchema,
  DeckSpecSchema,
  type DeckEntry,
  type DeckKey,
  type DeckList,
  type DeckSpec,
} from './decks.ts'
export {
  ItemSchema,
  ItemKindSchema,
  ItemsFileSchema,
  type Item,
  type ItemKind,
  type ItemsFile,
} from './items.ts'
export {
  CardIdSchema,
  NodeIdSchema,
  PlayerIdSchema,
  PkmUidSchema,
  parseCardId,
  parseNodeId,
  parsePlayerId,
  parsePkmUid,
  type CardId,
  type NodeId,
  type PlayerId,
  type PkmUid,
} from './ids.ts'
// Barrel browser-safe: `validate.ts`/`loader.ts` usan node:fs y viven en el
// subpath "./node" (SDD §6: la UI carga sus JSON por su cuenta). T-006.
export type {
  Content,
  PokemonFileLoaded,
  ValidationReport,
  ValidationStats,
} from './validate.ts'
