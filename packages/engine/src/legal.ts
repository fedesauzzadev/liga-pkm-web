// Comandos legales por estado (SDD §3): lo que la UI/tests/IA pueden enviar.
// Vive fuera de engine.ts desde T-012 (límite de 400 líneas por archivo).
import { ELEMENTS } from '@liga/content'
import type { Command } from './commands.ts'
import { canAssignMulticolor, legalAttacks } from './equipment.ts'
import type { Ctx } from './engine.ts'
import type { GameState, PlayerState } from './state.ts'

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
      // T-061: intercambio opcional en el casillero de Oak (repetible; Advance termina).
      case 'OakSwap': {
        if (state.phase !== 'tileResolution') return []
        const player = state.players.find((p) => p.id === state.activePlayerId)
        if (player === undefined) return [{ type: 'Advance' }]
        const commands: Command[] = [{ type: 'Advance' }]
        for (const teamPkm of player.team) {
          for (const pilePkm of player.oakPile) {
            commands.push({ type: 'SwapWithOak', teamUid: teamPkm.uid, pileUid: pilePkm.uid })
          }
        }
        return commands
      }
      // T-061/T-023: desafío opcional al líder (D-17); Advance lo saltea.
      case 'ChallengeGym': {
        if (state.phase !== 'tileResolution') return []
        const player = state.players.find((p) => p.id === state.activePlayerId)
        if (player === undefined) return [{ type: 'Advance' }]
        const commands: Command[] = [{ type: 'Advance' }]
        for (const pkm of player.team.filter((candidate) => !candidate.fainted)) {
          commands.push({ type: 'AcceptGymChallenge', pkmUid: pkm.uid })
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
      // T-013: en Organize se puede equipar/desequipar/asignar Multicolor (AC-3).
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
          if (canAssignMulticolor(player, pkm.uid)) {
            for (const element of ELEMENTS) {
              commands.push({ type: 'AssignMulticolor', pkmUid: pkm.uid, element })
            }
          }
          // T-104 (SPEC-T/D-30): quitar el Multicolor asignado, mismo gating que Unequip.
          if (pkm.multicolor.length > 0) {
            commands.push({ type: 'UnassignMulticolor', pkmUid: pkm.uid })
          }
        }
        // T-074 (SPEC-I/AC-1): reordenar el equipo en Organize.
        player.team.forEach((pkm, from) => {
          for (let to = 0; to < player.team.length; to++) {
            if (to !== from) commands.push({ type: 'ReorderTeam', uid: pkm.uid, to })
          }
        })
        // T-073 (D-11): fuera de combate la poción cura a cualquier PKM del equipo en Organize.
        for (const pkm of player.team) {
          if (pkm.fainted || pkm.damage <= 0) continue
          if (player.items.potion > 0) commands.push({ type: 'UsePotion', pkmUid: pkm.uid, target: pkm.uid })
          if (player.items.super_potion > 0) {
            commands.push({ type: 'UsePotion', pkmUid: pkm.uid, target: pkm.uid, item: 'super_potion' })
          }
        }
        // T-049 (D-21): sin medallas suficientes no se ofrece (el handler explica el rechazo).
        if (
          player.items.oportunidad > 0 &&
          player.medals.length >= state.ruleset.oportunidad.minMedals
        ) {
          commands.push({ type: 'UseOportunidad' })
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
      // T-061: resolver el casillero; Oak/gym ya dejan pending (ver arriba).
      const commands: Command[] = [{ type: 'Advance' }]
      const player = state.players.find((p) => p.id === state.activePlayerId)
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
  // Red de seguridad (turno-automatico-rival): entre comandos turnSide nunca es 1
  // (invariante batalla/turno-del-jugador-entre-comandos); si un estado corrupto
  // llegara acá, Advance sigue siendo la única salida posible.
  if (battle.turnSide === 1) return [{ type: 'Advance' }]
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
  if (pkm !== undefined && pkm.damage > 0) {
    if (player.items.potion > 0) commands.push({ type: 'UsePotion', pkmUid: uid, target: uid }) // D-11: solo el activo
    if (player.items.super_potion > 0) {
      commands.push({ type: 'UsePotion', pkmUid: uid, target: uid, item: 'super_potion' })
    }
  }
  // retirada-solo-inicio-turno (D-32): sin acciones previas este turno; la
  // poción en combate consume la ventana de retiro (no la de atacar, D-11).
  if (!battle.actedThisTurn) {
    for (const other of player.team) {
      if (!other.fainted && other.uid !== uid) commands.push({ type: 'Retire', to: other.uid })
    }
  }
  // T-049 (D-12): Ultra/Master Ball contra PKM sin dueño, en tu turno.
  if (battle.kind === 'wild' && state.ruleset !== null) {
    const rival = battle.rival[0]
    const card = rival === undefined ? undefined : ctx.content.cards.find((c) => c.id === battle.card)
    for (const ball of ['ultraball', 'masterball'] as const) {
      if (player.items[ball] <= 0) continue
      const rule = state.ruleset.capture[ball]
      if (rule.timing !== 'duringBattle') continue
      if (
        rule.maxRemainingHp !== undefined &&
        card !== undefined &&
        rival !== undefined &&
        card.hp - rival.damage > rule.maxRemainingHp
      ) {
        continue
      }
      commands.push({ type: 'ThrowBall', ball })
    }
  }
  return commands
}
