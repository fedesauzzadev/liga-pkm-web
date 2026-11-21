// Popup de encuentro salvaje (plan unificar-popup-encuentro): UN solo popup
// para la decisión FightOrRelease — carta grande de T-101 (CardFace, solo
// lectura) a la izquierda y decisión (pelear/dejar ir) a la derecha. Caja
// centrada en el safeArea sin tapar el HUD (geometría de encounter-model.ts);
// presentacional: los comandos llegan del estado y vuelven al motor.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { Command, PokemonCard } from '@liga/engine'
import { parseCardId, parsePkmUid } from '@liga/content'
import { CardFace } from '../cardmodal/CardFace'
import type { CardModalSpec } from '../cardmodal/model'
import { es } from '../i18n/es'
import { uiLayout } from '../shell/layout'
import { encounterConfig, encounterGeometry, preloadSprite } from './encounter-model'
import styles from './EncounterPopup.module.css'

/** Un PKM sano del equipo ofrecido para pelear (AC-4). */
export interface EncounterFightOption {
  readonly uid: string
  readonly name: string
  readonly hpCur: number
  readonly hpMax: number
  /** true ⇒ va primero y resaltado (el activo del equipo). */
  readonly active: boolean
}

export interface EncounterPopupProps {
  readonly card: PokemonCard
  /** Nombre visible del mazo de donde salió (es.tileDeckNames[…]). */
  readonly deckName: string
  readonly options: readonly EncounterFightOption[]
  /** Sprite de frente del manifest; null ⇒ recuadro con el nombre (AC-3). */
  readonly artUrl: string | null
  readonly onCommand: (command: Command) => void
}

interface Viewport {
  readonly vw: number
  readonly vh: number
}

const viewportOf = (): Viewport =>
  typeof window === 'undefined' ? { vw: 1280, vh: 720 } : { vw: window.innerWidth, vh: window.innerHeight }

/** Instancia sintética de solo lectura del salvaje (AC-3): sin estado propio. */
const wildSpec = (card: PokemonCard): CardModalSpec => ({
  card,
  pkm: {
    uid: parsePkmUid(`wild-${card.id}`),
    cardId: parseCardId(card.id),
    damage: 0,
    xp: 0,
    equipped: [],
    multicolor: [],
    fainted: false,
  },
  active: true,
  readOnly: true,
  notice: null,
  conditions: undefined,
  elements: [],
})

export function EncounterPopup({
  card,
  deckName,
  options,
  artUrl,
  onCommand,
}: EncounterPopupProps): ReactNode {
  const [viewport, setViewport] = useState<Viewport>(viewportOf)
  // AC-3: el sprite se precarga (máx. preloadTimeoutMs) antes de mostrarse;
  // si falla o no hay manifest queda el recuadro con el nombre + warn.
  const [artReady, setArtReady] = useState(artUrl === null)

  useEffect(() => {
    const onResize = (): void => setViewport(viewportOf())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let alive = true
    void preloadSprite(artUrl, encounterConfig.preloadTimeoutMs).then((result) => {
      if (alive && result.ok) setArtReady(true)
    })
    return () => {
      alive = false
    }
  }, [artUrl])

  const geo = encounterGeometry(viewport.vw, viewport.vh, encounterConfig, uiLayout)
  const title = es.playWildAppeared.replace('{name}', card.name)
  const subtitle = es.tileMsgCardDrawn.replace('{card}', card.name).replace('{deck}', deckName)
  const safe = uiLayout.safeArea
  const backdropStyle: CSSProperties = {
    left: `${String(safe.x * 100)}%`,
    top: `${String(safe.y * 100)}%`,
    width: `${String(safe.w * 100)}%`,
    height: `${String(safe.h * 100)}%`,
    backgroundColor: `rgba(8, 10, 20, ${String(encounterConfig.backdropOpacity)})`,
  }
  const windowStyle: CSSProperties = {
    left: `${String(Math.round(geo.window.x))}px`,
    top: `${String(Math.round(geo.window.y))}px`,
    width: `${String(Math.round(geo.window.w))}px`,
    height: `${String(Math.round(geo.window.h))}px`,
    gap: `${String(encounterConfig.gapPx)}px`,
    '--encounter-pad': `${String(encounterConfig.padPx)}px`,
    '--encounter-anim-ms': `${String(encounterConfig.animMs)}ms`,
    '--encounter-button-h': `${String(encounterConfig.buttons.minHeightPx)}px`,
    '--encounter-button-gap': `${String(encounterConfig.buttons.gapPx)}px`,
  } as CSSProperties
  const faceStyle: CSSProperties = {
    width: `${String(Math.round(geo.cardW))}px`,
    height: `${String(Math.round(geo.cardH))}px`,
    flex: '0 0 auto',
  }
  const sideStyle: CSSProperties = { width: `${String(Math.round(geo.sideW))}px` }

  return (
    <div className={styles.layer} data-encounter-popup="true">
      {/* AC-2: el fondo atenuado cubre SOLO el safeArea (el HUD queda visible). */}
      <div className={styles.backdrop} style={backdropStyle} aria-hidden="true" />
      <section
        className={styles.window}
        style={windowStyle}
        data-testid={encounterConfig.testid}
        data-covers-panel={geo.coversPanel ? 'true' : 'false'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <CardFace spec={wildSpec(card)} artUrl={artReady ? artUrl : null} style={faceStyle} />
        <div className={styles.side} style={sideStyle}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>
          {options.length === 0 ? (
            <p className={styles.noHealthy} data-testid="encounter-no-healthy">
              {es.encounterNoHealthy}
            </p>
          ) : null}
          <div className={styles.buttons}>
            {options.map((option, index) => (
              <button
                key={option.uid}
                type="button"
                className={option.active ? `${styles.fight} ${styles.fightActive}` : styles.fight}
                data-testid={`btn-fight-${option.uid}`}
                data-command="FightEncounter"
                data-pkm-uid={option.uid}
                data-active={option.active ? 'true' : 'false'}
                autoFocus={index === 0}
                onClick={() => onCommand({ type: 'FightEncounter', pkmUid: option.uid })}
              >
                <span className={styles.fightName}>{es.tileFightWith.replace('{name}', option.name)}</span>
                <span className={styles.fightHp}>
                  {es.encounterHpLabel
                    .replace('{cur}', String(option.hpCur))
                    .replace('{max}', String(option.hpMax))}
                </span>
              </button>
            ))}
            <button
              type="button"
              className={styles.release}
              data-testid="btn-release"
              data-command="ReleaseWild"
              autoFocus={options.length === 0}
              onClick={() => onCommand({ type: 'ReleaseWild' })}
            >
              {es.playReleaseWild}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
