// Setup (SPEC-D/T-034/AC-1): elegir 1 de 5 iniciales con carta y descripción
// (mazo, elemento, PS, ataques) y semilla opcional para repetir la partida.
import type { DeckId } from '@liga/content'
import { spriteUrl, useSprites, type SpritesManifest } from '../battle/sprites'
import { es } from '../i18n/es'
import type { StarterOption } from './content'
import styles from './game.module.css'

export interface SetupScreenProps {
  readonly options: readonly StarterOption[]
  readonly seedInput: string
  readonly onSeedInput: (value: string) => void
  readonly onStart: (deck: DeckId) => void
  readonly onBack: () => void
  /** Manifest inyectado (tests); sin él se usa useSprites(). */
  readonly sprites?: SpritesManifest | null
}

export function SetupScreen({ options, seedInput, onSeedInput, onStart, onBack, sprites }: SetupScreenProps) {
  const fetched = useSprites()
  const manifest = sprites ?? fetched.sprites
  return (
    // N-0020/AC-4: data-title-screen ⇒ el shell quita su margen (sin scroll de página).
    <section className={styles.screen} aria-label={es.setupTitle} data-title-screen="">
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
          const art = card === null ? null : spriteUrl(manifest, card.dex, 'front')
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
                <>
                  <span className={styles.cardArt} aria-hidden="true">?</span>
                  <strong className={styles.cardTag}>{es.setupUnavailable}</strong>
                  <span>{es.setupStarterMissing}</span>
                </>
              ) : (
                <>
                  <span className={styles.cardArt}>
                    {art === null ? null : <img src={art} alt="" draggable={false} />}
                  </span>
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
