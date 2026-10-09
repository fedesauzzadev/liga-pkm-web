// Comandos legales por estado (SDD §3): lo que la UI/tests/IA pueden enviar.
// Vive fuera de engine.ts desde T-012 (límite de 400 líneas por archivo).
import { ELEMENTS, type BoardNode, type NodeType } from '@liga/content'
import type { Command } from './commands.ts'
import { boardIndexFor } from './board.ts'
import { canAssignWildcard, legalAttacks } from './equipment.ts'
import type { Ctx } from './engine.ts'
import { gymChallengeable } from './gyms.ts'
import type { GameState, PlayerState } from './state.ts'

/** Tipo del nodo actual del jugador (null si el tablero no lo tiene). */
function nodeTypeAt(ctx: Ctx, position: string): NodeType | null {
  return nodeAt(ctx, position)?.type ?? null
}

/** Nodo actual del jugador (null si el tablero no lo tiene). */
function nodeAt(ctx: Ctx, position: string): BoardNode | null {
  try {
    return boardIndexFor(ctx.content.board).node(position)
  } catch {
    return null
  }
}

export function legalCommands(state: GameState, ctx: Ctx): Command[] {
  const pending = state.pending
  if (pending !== null) {
    switch (pending.type) {
      case 'ChoosePath':
        if (state.phase !== 'moving') return []
        return pending.options.map((to) => ({ type: 'ChoosePath', to }))
      case 'StopOrContinue':
        if (state.phase !== 'moving') return []
        return [{ type: 'StopHere' }, { type: 'ContinueMoving' }]
      case 'FightOrRelease': {
        // T-020: pelear con cualquier sano; sin sanos solo dejar ir (D-08).
        if (state.phase !== 'tileResolution') return []
        const player = state.players.find((p) => p.id === state.activePlayerId)
        const fight =
          player === undefined
            ? []
            : player.team
                .filter((pkm) => !pkm.fainted)
                .map((pkm) => ({ type: 'FightEncounter', pkmUid: pkm.uid }) as const)
        return [...fight, { type: 'ReleaseWild' } as const]
      }
      case 'ChooseReplacement':
        if (state.phase !== 'battle') return []
        return pending.options.map((pkmUid) => ({ type: 'SendOut', pkmUid }))
      // T-022: capturar gasta una Pokebola (D-12: Ultra/Maestra equivalente).
      case 'CaptureOrRelease': {
        if (state.phase !== 'tileResolution') return []
        const player = state.players.find((p) => p.id === state.activePlayerId)
        const commands: Command[] = [{ type: 'Release' }]
        if (player !== undefined && player.items.pokeball > 0) {
          commands.unshift({ type: 'Capture' })
        }
        return commands
      }
      // Decisiones que todavía no tienen comandos que las resuelvan:
      case 'ChooseAttack':
        return []
    }
  }
  switch (state.phase) {
    case 'idle':
      return [{ type: 'Advance' }, { type: 'Roll' }]
    case 'organize': {
      if (state.ruleset === null || state.players.length === 0) return []
      // T-013: en Organize se puede equipar/desequipar/asignar comodines (AC-3).
      const commands: Command[] = [{ type: 'RollMove' }]
      const player = state.players.find((p) => p.id === state.activePlayerId)
      if (player !== undefined) {
        for (const pkm of player.team) {
          for (const card of player.elements) {
            commands.push({ type: 'Equip', pkmUid: pkm.uid, elementId: card.id })
          }
          for (const card of pkm.equipped) {
            commands.push({ type: 'Unequip', pkmUid: pkm.uid, elementId: card.id })
          }
          if (canAssignWildcard(player, pkm.uid)) {
            for (const element of ELEMENTS) {
              commands.push({ type: 'AssignWildcard', pkmUid: pkm.uid, element })
            }
          }
        }
        evolveOptions(player, ctx, commands)
      }
      return commands
    }
    case 'moving':
      return []
    case 'battle':
      return battleCommands(state, ctx)
    case 'finished':
      return [] // fin de la partida: no hay más decisiones (T-023/AC-4)
    case 'tileResolution': {
      // Oak: el intercambio es opcional y se puede repetir antes de terminar.
      const commands: Command[] = [{ type: 'Advance' }]
      const player = state.players.find((p) => p.id === state.activePlayerId)
      if (player !== undefined && nodeTypeAt(ctx, player.position) === 'oak') {
        for (const teamPkm of player.team) {
          for (const pilePkm of player.oakPile) {
            commands.push({ type: 'SwapWithOak', teamUid: teamPkm.uid, pileUid: pilePkm.uid })
          }
        }
      }
      // T-023: el desafío al líder es opcional (D-17); con cualquier PKM sano.
      if (player !== undefined) {
        const node = nodeAt(ctx, player.position)
        if (
          node !== null && node.type === 'gym' && node.gym !== undefined &&
          gymChallengeable(ctx.content, player.medals, node.gym)
        ) {
          for (const pkm of player.team.filter((candidate) => !candidate.fainted)) {
            commands.push({ type: 'AcceptGymChallenge', pkmUid: pkm.uid })
          }
        }
      }
      // D-06: la evolución también se ofrece al terminar un combate ganado.
      if (player !== undefined) evolveOptions(player, ctx, commands)
      return commands
    }
  }
}

/** T-022/AC-2: Evolve por cada entrada `evolvesTo` con XP suficiente y carta existente. */
function evolveOptions(player: PlayerState, ctx: Ctx, commands: Command[]): void {
  for (const pkm of player.team) {
    const card = ctx.content.cards.find((c) => c.id === pkm.cardId)
    if (card === undefined) continue
    for (const entry of card.evolvesTo) {
      if (pkm.xp < entry.xp) continue
      if (!ctx.content.cards.some((c) => c.id === entry.id)) continue
      commands.push({ type: 'Evolve', pkmUid: pkm.uid, toId: entry.id })
    }
  }
}

/** Menú de batalla en el turno del jugador (SPEC-C/T-020): pociones, retirar, atacar, pasar. */
function battleCommands(state: GameState, ctx: Ctx): Command[] {
  const battle = state.battle
  if (battle === null || battle.won) return []
  if (battle.turnSide === 1) return [{ type: 'Advance' }] // corre el turno del rival
  const player = state.players.find((p) => p.id === state.activePlayerId)
  if (player === undefined) return []
  const uid = battle.active[0]
  const pkm = player.team.find((p) => p.uid === uid)
  const commands: Command[] = [{ type: 'Advance' }] // pasar sin atacar
  const blocked = battle.noAttackThisTurn || battle.conditions[uid]?.skipNextAttack === true
  if (pkm !== undefined && !pkm.fainted && !blocked) {
    const card = ctx.content.cards.find((c) => c.id === pkm.cardId)
    if (card !== undefined) {
      // AC-5: solo legalAttacks (costos + regla de primer ataque); nada se consume.
      for (const attack of legalAttacks(card, pkm, battle.firstTurn.includes(uid))) {
        commands.push({ type: 'Attack', attackId: attack.id })
      }
    }
  }
  if (pkm !== undefined && player.items.potion > 0 && pkm.damage > 0) {
    commands.push({ type: 'UsePotion', pkmUid: uid, target: uid }) // D-11: solo el activo
  }
  for (const other of player.team) {
    if (!other.fainted && other.uid !== uid) commands.push({ type: 'Retire', to: other.uid })
  }
  return commands
}
