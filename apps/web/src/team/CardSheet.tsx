// Ficha de carta del equipo (SPEC-D/T-033/AC-1..AC-3): ataques con costos en
// íconos, efectos (rawText), equipamiento, Multicolor y evolución. Presentacional:
// solo emite comandos del motor (ADR-1); fuera de Organize los botones se apagan.
import type { Element, PkmInstance, PokemonCard } from '@liga/engine'
import { es } from '../i18n/es'
import { CostIcons, ElementIcon } from '../battle/icons'
import { damageLabel, facesLabel } from '../battle/model'
import type { EvolveChoice, TeamCommand } from './model'
import styles from './TeamPanel.module.css'

export interface CardSheetProps {
  readonly card: PokemonCard
  readonly pkm: PkmInstance
  /** true solo en fase Organize (equipo propio); la pila de Oak es solo lectura. */
  readonly editable: boolean
  readonly equipOptions: readonly { readonly id: string; readonly element: Element }[]
  readonly multicolorOptions: readonly Element[]
  readonly evolveOptions: readonly EvolveChoice[]
  readonly onCommand: (command: TeamCommand) => void
}

export function CardSheet({
  card,
  pkm,
  editable,
  equipOptions,
  multicolorOptions,
  evolveOptions,
  onCommand,
}: CardSheetProps) {
  const hp = `${Math.max(0, card.hp - pkm.damage)}/${card.hp}`
  return (
    <article className={styles.sheet} data-card-sheet="true" data-uid={pkm.uid}>
      <header className={styles.sheetHeader}>
        <h3 className={styles.sheetName}>{card.name}</h3>
        <ElementIcon element={card.element} />
        <span className={styles.hp} data-hp={hp}>{hp}</span>
        <span className={styles.xp} data-xp={pkm.xp}>{`${es.teamXp}: ${pkm.xp}`}</span>
        {pkm.fainted ? <span className={styles.fainted}>{es.teamFainted}</span> : null}
      </header>

      <ul className={styles.attackList}>
        {card.attacks.map((attack) => (
          <li key={attack.id} className={styles.attackItem} data-attack-id={attack.id}>
            <div className={styles.attackRow}>
              <span className={styles.faces}>{`${facesLabel(attack.rollFaces)}_`}</span>
              <span
                className={`${styles.attackName} ${attack.kind === 'ability' ? styles.ability : ''}`}
              >
                {attack.kind === 'ability' ? `"${attack.name}"` : attack.name}
              </span>
              <span className={styles.damage}>{damageLabel(attack)}</span>
              <CostIcons slots={attack.cost} />
            </div>
            <p className={styles.rawText} data-raw-text="true">
              {attack.rawText.length > 0 ? attack.rawText : es.battleNoEffectText}
            </p>
          </li>
        ))}
      </ul>

      <section className={styles.section} aria-label={es.teamEquippedTitle}>
        <h4 className={styles.sectionTitle}>{es.teamEquippedTitle}</h4>
        {pkm.equipped.length === 0 ? (
          <p className={styles.hint}>—</p>
        ) : (
          <ul className={styles.chipList}>
            {pkm.equipped.map((elementCard) => (
              <li key={elementCard.id}>
                <button
                  type="button"
                  className={styles.chipButton}
                  data-command="Unequip"
                  data-element-id={elementCard.id}
                  disabled={!editable}
                  onClick={() =>
                    onCommand({ type: 'Unequip', pkmUid: pkm.uid, elementId: elementCard.id })
                  }
                >
                  <ElementIcon element={elementCard.element} small />
                  {es.teamUnequip}
                </button>
              </li>
            ))}
          </ul>
        )}
        {pkm.multicolor.map((element, index) => (
          <p key={index} className={styles.multicolorBadge}>
            <button
              type="button"
              className={styles.chipButton}
              data-command="UnassignMulticolor"
              data-multicolor={element}
              aria-label={`${es.teamUnassignMulticolor}: ${es.elementNames[element]}`}
              disabled={!editable}
              onClick={() => onCommand({ type: 'UnassignMulticolor', pkmUid: pkm.uid })}
            >
              {es.teamUnassignMulticolor}
              <ElementIcon element={element} small />
            </button>
          </p>
        ))}
      </section>

      <section className={styles.section} aria-label={es.teamInventoryTitle}>
        <h4 className={styles.sectionTitle}>{es.teamInventoryTitle}</h4>
        {equipOptions.length === 0 ? (
          <p className={styles.hint}>—</p>
        ) : (
          <ul className={styles.chipList}>
            {equipOptions.map((elementCard) => (
              <li key={elementCard.id}>
                <button
                  type="button"
                  className={styles.chipButton}
                  data-command="Equip"
                  data-element-id={elementCard.id}
                  disabled={!editable}
                  onClick={() =>
                    onCommand({ type: 'Equip', pkmUid: pkm.uid, elementId: elementCard.id })
                  }
                >
                  <ElementIcon element={elementCard.element} small />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {multicolorOptions.length > 0 ? (
        <section className={styles.section} aria-label={es.teamMulticolorTitle}>
          <h4 className={styles.sectionTitle}>{es.teamMulticolorTitle}</h4>
          <ul className={styles.chipList}>
            {multicolorOptions.map((element) => (
              <li key={element}>
                <button
                  type="button"
                  className={styles.chipButton}
                  data-command="AssignMulticolor"
                  data-element={element}
                  aria-label={`${es.teamAssignMulticolor} ${es.elementNames[element]}`}
                  disabled={!editable}
                  onClick={() => onCommand({ type: 'AssignMulticolor', pkmUid: pkm.uid, element })}
                >
                  <ElementIcon element={element} small />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {evolveOptions.length > 0 ? (
        <section className={styles.section} aria-label={es.teamEvolveTitle}>
          <h4 className={styles.sectionTitle}>{es.teamEvolveTitle}</h4>
          <ul className={styles.chipList}>
            {evolveOptions.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  className={styles.chipButton}
                  data-command="Evolve"
                  data-to-id={choice.id}
                  disabled={!editable}
                  onClick={() => onCommand({ type: 'Evolve', pkmUid: pkm.uid, toId: choice.id })}
                >
                  {`${es.teamEvolve} ${choice.name} (${choice.xp} XP)`}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!editable ? <p className={styles.hint}>{es.teamNotEditable}</p> : null}
    </article>
  )
}
