// Handlers de daño/curación (SPEC-D/T-032d + rediseno-combate-max/AC-3),
// extraídos de registry.ts para respetar el tope de 400 líneas por archivo.
// AC-3: daño aplicado 0 ⇒ sin número flotante, sin parpadeo del sprite, sin
// animar la barra y sin "recibió 0 de daño"; con base > 0 reducido a 0 por
// modificadores el mensaje es "¡No hizo daño!" (sin número).
import { es } from '../../i18n/es'
import { ANIMATION_CONFIG } from '../../events/anim.config'
import type { BattleEventPlay } from './registry'

const cfg = ANIMATION_CONFIG.battle

/** Daño: parpadeo ×3 + número flotante + barra de HP (AC-1); amount 0 no
 * anima nada (rediseno-combate-max/AC-3). */
export const playDamageTaken: BattleEventPlay = async (event, api) => {
  if (event.type !== 'DamageTaken') return
  if (event.amount <= 0) {
    // "Reducido a 0": el ataque tenía daño base > 0 pero los modificadores lo
    // anularon (nota n.º 6: la distinción sale de la carta ya en el stage).
    if ((api.stage.lastAttackBaseDamage ?? 0) > 0) {
      api.patch({ message: es.battleNoDamage })
      await api.timing.wait(cfg.messageMs)
    }
    return
  }
  const actor = api.actor(event.pkmUid)
  if (actor !== null) {
    api.patchActor(event.pkmUid, { damage: Math.min(actor.card.hp, actor.damage + event.amount) })
  }
  const floaterId = api.pushFloater(event.pkmUid, `-${event.amount}`, 'damage')
  for (let blink = 0; blink < cfg.blinkCount; blink += 1) {
    api.patch({ blink: event.pkmUid })
    await api.timing.wait(cfg.blinkMs)
    api.patch({ blink: null })
    await api.timing.wait(cfg.blinkMs)
  }
  const settle = Math.max(0, cfg.damageSettleMs - cfg.blinkMs * cfg.blinkCount * 2)
  if (settle > 0) await api.timing.wait(settle)
  api.dropFloater(floaterId)
}

/** Curación / drenaje: número verde y daño que baja (AC-1). */
export const playHealed: BattleEventPlay = async (event, api) => {
  if (event.type !== 'Healed') return
  const actor = api.actor(event.pkmUid)
  if (actor !== null) api.patchActor(event.pkmUid, { damage: Math.max(0, actor.damage - event.amount) })
  const floaterId = api.pushFloater(event.pkmUid, `+${event.amount}`, 'heal')
  api.patch({
    message: es.battleMsgHealed.replace('{name}', actor?.card.name ?? '').replace('{amount}', String(event.amount)),
  })
  await api.timing.wait(cfg.healMs)
  api.dropFloater(floaterId)
}
