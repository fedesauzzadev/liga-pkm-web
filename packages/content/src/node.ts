// Entry solo-Node de @liga/content: validador + loader (usan node:fs).
// Lo consumen la CLI `content:validate`, tests y scripts; la UI nunca (SDD §6).
export {
  checkOfficialMoves,
  countCustomEffects,
  crossCheckCards,
  crossCheckGyms,
  formatIssues,
  validateContent,
  validatePokemonFile,
} from './validate.ts'
export { loadContent } from './loader.ts'
