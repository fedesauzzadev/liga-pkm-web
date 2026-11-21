// Lado izquierdo de la ventana de carta (SPEC-R/T-103/AC-6..AC-10): encabezado
// con nombre completo (autoajuste hasta el mínimo px), elemento y HP con barra;
// arte grande con fallback; especialidades en mayúsculas; una fila por ataque
// con caras/daño/costo/texto y su estado para ESTE PKM (misma attackRows del
// combate, AC-9); pie con etapa, mazo y evoluciones con barra de XP.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Element } from '@liga/content'
import type { Command } from '@liga/engine'
import { CostRow, EnergyIcon } from '../energy/EnergyIcon'
import { attackRows, damageLabel, facesLabel } from '../battle/model'
import { cardArtConfig } from '../battle/spriteFit'
import { useArtFit } from '../battle/useArtFit'
import { es } from '../i18n/es'
import { cardOf } from '../game/content'
import { cardModalConfig } from './config'
import { costGaps, type CardModalSpec } from './model'
import styles from './CardModal.module.css'

export interface CardFaceProps {
  readonly spec: CardModalSpec
  readonly artUrl: string | null
  readonly style?: CSSProperties
  /** AC-12 (drag): drop de una energía disponible sobre la carta la equipa. */
  readonly onCommand?: (command: Command) => void
}

const NAME_BASE_PX = 26

/** layout-carta-modal/AC-5: nombre de evolución capitalizado (el fallback
 *  entry.id llega en minúscula, p. ej. "charizard" → "Charizard"). */
function capitalizeName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Etiqueta de lo que falta para pagar el costo (AC-9): "Falta 1 Fuego". */
function gapLabel(gaps: readonly { readonly element: Element | 'any'; readonly missing: number }[]): string {
  const parts = gaps.map((gap) => {
    if (gap.element === 'any') {
      return gap.missing === 1
        ? es.modalMissingCostAny.replace('{n}', String(gap.missing))
        : es.modalMissingCostAnyPlural.replace('{n}', String(gap.missing))
    }
    const name = es.elementNames[gap.element]
    const template = gap.missing === 1 ? es.modalMissingCost : es.modalMissingCostPlural
    return template.replace('{n}', String(gap.missing)).replace('{element}', name)
  })
  return parts.join(', ')
}

export function CardFace({ spec, artUrl, style, onCommand }: CardFaceProps): ReactNode {
  const { card, pkm } = spec
  const nameRef = useRef<HTMLHeadingElement | null>(null)
  // AC-6: si el nombre es largo, la letra baja hasta el mínimo (13 px).
  // layout-carta-modal: re-ajusta al cambiar el ancho de la carta (viewport),
  // no solo al abrir la ventana (ResizeObserver; el resize no re-renderiza).
  const [namePx, setNamePx] = useState(NAME_BASE_PX)
  useEffect(() => {
    const el = nameRef.current
    if (el === null) return
    const fit = (): void => {
      let px = NAME_BASE_PX
      el.style.fontSize = `${String(px)}px`
      while (px > cardModalConfig.card.fontMinPx && el.scrollWidth > el.clientWidth) {
        px -= 1
        el.style.fontSize = `${String(px)}px`
      }
      setNamePx(px)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [card.id])

  const rows = attackRows(card, pkm, false)
  const hpCurrent = Math.max(0, card.hp - pkm.damage)
  const hpRatio = card.hp <= 0 ? 1 : hpCurrent / card.hp
  // SPEC-U/T-105: mismo fitSprite con config modal; la caja .art se mide (ref).
  const art = useArtFit(cardArtConfig.modal, artUrl ?? '')

  return (
    <article
      className={styles.card}
      style={style}
      data-testid={cardModalConfig.card.testid}
      data-uid={pkm.uid}
      data-deck={card.deck}
      data-name-px={String(namePx)}
      onDragOver={onCommand === undefined ? undefined : (event) => event.preventDefault()}
      onDrop={
        onCommand === undefined
          ? undefined
          : (event) => {
              const payload = event.dataTransfer.getData('text/plain')
              if (!payload.startsWith('equip:')) return
              event.preventDefault()
              onCommand({ type: 'Equip', pkmUid: pkm.uid, elementId: payload.slice('equip:'.length) })
            }
      }
    >
      <header className={styles.cardHeader} data-testid="card-header">
        <div className={styles.cardHeaderRow}>
          <h3 className={styles.cardName} ref={nameRef} style={{ fontSize: `${String(namePx)}px` }}>
            {card.name}
          </h3>
          <EnergyIcon type={card.element} size={32} />
          <span className={styles.cardHp} data-hp={`${hpCurrent}/${card.hp}`}>
            {hpCurrent}/{card.hp}
          </span>
          <span className={styles.hpBar} data-hp-ratio={hpRatio.toFixed(2)}>
            <span className={styles.hpFill} style={{ width: `${String(Math.round(hpRatio * 100))}%` }} />
          </span>
        </div>

        {/* layout-carta-modal/AC-8: specialties como segunda fila DEL header
            (mismo contenido y orden visual, sin huecos contra el arte). */}
        {card.specialties.length > 0 ? (
          <section className={styles.specialties} aria-label={es.modalSpecialtiesTitle}>
            {card.specialties.map((effect, index) => (
              <p key={index} className={styles.specialty}>
                {(effect.op === 'custom' && effect.rawText !== undefined
                  ? effect.rawText
                  : effect.op
                ).toUpperCase()}
              </p>
            ))}
          </section>
        ) : null}
      </header>

      {/* layout-carta-modal/AC-3: sin boxHeightPx en el config no hay tope
          inline; la caja crece con flex y su mínimo lo pone el CSS (140 px). */}
      <div
        className={styles.art}
        data-testid="card-art"
        ref={art.artRef}
        style={
          cardArtConfig.modal.boxHeightPx === undefined
            ? undefined
            : { maxHeight: `${String(cardArtConfig.modal.boxHeightPx)}px` }
        }
      >
        {artUrl === null ? (
          <div className={styles.artFallback} data-missing="true">
            {card.name}
          </div>
        ) : (
          <img
            className={styles.artImg}
            src={artUrl}
            alt={card.name}
            onLoad={art.onImgLoad}
            style={
              art.size === null
                ? undefined
                : { width: `${String(art.size.width)}px`, height: `${String(art.size.height)}px` }
            }
            data-art-w={art.size === null ? undefined : String(art.size.width)}
            data-art-h={art.size === null ? undefined : String(art.size.height)}
          />
        )}
      </div>

      <ul className={styles.attacks} data-testid="card-attacks">
        {rows.map((row) => {
          const gaps = row.legal ? [] : costGaps(pkm, row.attack)
          return (
            <li
              key={row.attack.id}
              className={styles.attack}
              data-testid={`card-attack-${row.attack.id}`}
              data-state={row.legal ? 'available' : 'blocked'}
              data-kind={row.attack.kind}
            >
              <div className={styles.attackRow}>
                <span className={styles.faces}>{`${facesLabel(row.attack.rollFaces)}_`}</span>
                <span
                  className={`${styles.attackName} ${row.attack.kind === 'ability' ? styles.ability : ''}`}
                >
                  {row.attack.kind === 'ability' ? `"${row.attack.name}"` : row.attack.name}
                </span>
                <span className={styles.damage}>{damageLabel(row.attack)}</span>
                <CostRow cost={row.attack.cost} size={24} />
              </div>
              {row.attack.rawText.length > 0 ? (
                <p className={styles.rawText}>{row.attack.rawText}</p>
              ) : null}
              <p
                className={row.legal ? styles.availableLabel : styles.blockedLabel}
                data-available={row.legal ? 'true' : 'false'}
              >
                {row.legal
                  ? `✔ ${es.modalAttackAvailable}`
                  : row.reason === 'firstTurn'
                    ? `✖ ${es.battleReasonFirstTurn}`
                    : `✖ ${gapLabel(gaps)}`}
              </p>
            </li>
          )
        })}
      </ul>

      <footer className={styles.cardFooter} data-testid="card-footer">
        <span className={styles.stage} data-stage={card.stage}>
          {es.modalStageNames[card.stage]}
        </span>
        <span className={styles.deckBadge} data-deck={card.deck}>
          {es.modalDeckNames[card.deck]}
        </span>
        {card.evolvesTo.length === 0 ? null : card.evolvesTo.map((entry) => {
          const target = cardOf(entry.id)
          const ratio = Math.min(1, pkm.xp / entry.xp)
          return (
            <span key={entry.id} className={styles.evolve} data-evolve-to={entry.id}>
              <span className={styles.evolveName}>
                {es.modalEvolvesTo
                  .replace('{name}', capitalizeName(target?.name ?? entry.id))
                  .replace('{xp}', String(entry.xp))}
              </span>
              <span className={styles.xpBar} data-xp={`${String(pkm.xp)}/${String(entry.xp)}`}>
                <span className={styles.xpFill} style={{ width: `${String(Math.round(ratio * 100))}%` }} />
              </span>
            </span>
          )
        })}
      </footer>
    </article>
  )
}
