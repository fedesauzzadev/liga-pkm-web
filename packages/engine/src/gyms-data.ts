// Lookups puros de gimnasios sobre Content (T-061): viven acá para que tiles.ts
// pueda usarlos sin ciclo (gyms.ts → battle-core.ts → tiles.ts). Sin estado.
import type { Content, GymLeader, PokemonCard } from '@liga/content'

/** Líder de gyms.json por key del gimnasio (undefined si no hay datos, AC-5). */
export function gymLeaderOf(content: Content, gymKey: string): GymLeader | undefined {
  return content.gyms.find((leader) => leader.id === gymKey)
}

/** Equipo del líder: cartas con `gym.leader` === gymKey, ordenadas por slot (SDD §4). */
export function gymTeamOf(content: Content, gymKey: string): readonly PokemonCard[] {
  return content.cards
    .filter((card) => card.gym?.leader === gymKey)
    .sort((a, b) => (a.gym?.slot ?? 0) - (b.gym?.slot ?? 0))
}

/** Medallas que exige el líder (Giovanni: 7) según gyms.json; undefined = libre. */
export function gymRequiresMedals(content: Content, gymKey: string): number | undefined {
  return gymLeaderOf(content, gymKey)?.requiresMedals
}

/** ¿Se puede desafiar? (menú): datos presentes, sin cerrojo y medalla pendiente. */
export function gymChallengeable(content: Content, medals: readonly string[], gymKey: string): boolean {
  const requires = gymRequiresMedals(content, gymKey)
  if (requires !== undefined && medals.length < requires) return false
  if (medals.includes(gymKey)) return false // la medalla ya se ganó
  if (gymLeaderOf(content, gymKey) === undefined) return false
  return gymTeamOf(content, gymKey).length > 0
}
