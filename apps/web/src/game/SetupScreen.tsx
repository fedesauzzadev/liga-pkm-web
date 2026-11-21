// Setup (SPEC-D/T-034/AC-1): elegir 1 de 5 iniciales con carta y descripción
// (mazo, elemento, PS, ataques) y semilla opcional para repetir la partida.
import type { DeckId } from '@liga/content'
import { es } from '../i18n/es'
import type { StarterOption } from './content'
import styles from './game.module.css'

export interface SetupScreenProps {
  readonly options: readonly StarterOption[]
  readonly seedInput: string
  readonly onSeedInput: (value: string) => void
  readonly onStart: (deck: DeckId) => void
  readonly onBack: () => void
}

export function SetupScreen({ options, seedInput, onSeedInput, onStart, onBack }: SetupScreenProps) {
  return (
    <section className={styles.screen} aria-label={es.setupTitle}>
      <h2 className={styles.screenTitle}>{es.setupTitle}</h2>
      <p className={styles.screenSubtitle}>{es.setupSubtitle}</p>
      <label className={styles.seedRow}>
        <span>{es.setupSeedLabel}</span>
        <input
          className={styles.seedInput}
          data-setup="seed"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={es.setupSeedPlaceholder}
          value={seedInput}
          onChange={(event) => onSeedInput(event.target.value)}
        />
      </label>
      <div className={styles.cards}>
        {options.map((option) => {
          const card = option.card
          return (
            <button
              key={option.deck}
              type="button"
              className={styles.card}
              data-deck={option.deck}
              disabled={card === null}
              onClick={() => onStart(option.deck)}
            >
              <span className={styles.cardDeck}>{es.setupDeckNames[option.deck]}</span>
              {card === null ? (
                <span>{es.setupStarterMissing}</span>
              ) : (
                <>
                  <h3 className={styles.cardName}>{card.name}</h3>
                  <p className={styles.cardFacts}>
                    {es.setupElement}: {es.elementNames[card.element]} · {es.setupHp}: {card.hp}
                  </p>
                  <div className={styles.cardAttacks}>
                    <p className={styles.cardAttack}>{es.setupAttacks}:</p>
                    {card.attacks.map((attack) => (
                      <p className={styles.cardAttack} key={attack.id}>
                        {attack.name} ({attack.damage.base})
                      </p>
                    ))}
                  </div>
                </>
              )}
            </button>
          )
        })}
      </div>
      <p className={styles.note}>{es.setupStartHint}</p>
      <div className={styles.actions}>
        <button type="button" data-action="back" onClick={onBack}>
          {es.setupBack}
        </button>
      </div>
    </section>
  )
}
