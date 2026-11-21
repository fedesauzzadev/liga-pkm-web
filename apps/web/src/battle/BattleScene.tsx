// Escena de combate (rediseno-combate-max): lienzo FIJO 1440×810 escalado
// uniformemente (BattleStageView) con 3 columnas — carta mía + dado / recuadro
// Game Boy 690×460 + pestañas + acciones / carta enemiga + dado. Recuadro con
// internos ≈ +25 % (AC-1); dado por lado que SIEMPRE rueda (AC-2); pestañas y
// panel de acciones con Aceptar/Cancelar (AC-6). La UI solo muestra y emite
// callbacks (animación ≠ lógica); la legalidad la dicta el motor (ADR-1).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { Face } from '@liga/content'
import type { Command, PkmConditions, PkmInstance, PokemonCard } from '@liga/engine'
import { ANIMATION_CONFIG } from '../events/anim.config'
import { es } from '../i18n/es'
import { diePurposeLabel } from '../hud/DicePanel'
import { BattleDie, type BattleDieHandle, type BattleDieSpeed, type BattleDieValue } from './BattleDie'
import { BattleStageView } from './BattleStage'
import { BattleTabs } from './BattleTabs'
import { BattleActions } from './BattleActions'
import {
  attackOptions,
  bagOptions,
  commandOfSelection,
  switchOptions,
  type BagContext,
  type BattleTab,
  type Selection,
  type TeamPkmView,
} from './controls'
import { HpPlate } from './HpPlate'
import { PkmCard } from './PkmCard'
import { clampDieValue } from '../board/Die3D'
import { attackForDie, attackRows, statusViews } from './model'
import type { BattleDiePurpose, CaptureVisual } from './choreo/stage'
import { useSprites, spriteUrl, trainerUrl } from './sprites'
import type { SpritesManifest, TrainersManifest } from './sprites'
import styles from './BattleScene.module.css'

export interface BattlePlayerActor {
  readonly card: PokemonCard
  readonly pkm: PkmInstance
  readonly firstTurn: boolean
  readonly conditions?: PkmConditions
}

export interface BattleRivalActor {
  readonly card: PokemonCard
  readonly damage: number
  readonly conditions?: PkmConditions
}

export interface BattleFloaterView {
  readonly id: number
  readonly side: 'player' | 'rival'
  readonly text: string
  readonly tone: 'damage' | 'heal' | 'xp'
}

/** Visuales transitivos que la coreografía (T-032d) conduce por evento. */
export interface BattleVisuals {
  readonly sweep?: boolean
  readonly entranceSides?: readonly ('player' | 'rival')[]
  readonly blinkSide?: 'player' | 'rival' | null
  readonly raisedSide?: 'player' | 'rival' | null
  readonly faintedSides?: readonly ('player' | 'rival')[]
  readonly trainerAppeared?: string | null
  readonly flash?: string | null
  readonly capture?: CaptureVisual | null
  readonly evolve?: {
    readonly side: 'player' | 'rival'
    readonly phase: 'pulse' | 'reveal'
    readonly pulse: number
  } | null
  readonly floaters?: readonly BattleFloaterView[]
  /** rediseno-combate-max/AC-2: última tirada de combate, por lado. */
  readonly die?: BattleDieView | null
}

export interface BattleDieView {
  readonly value: Face
  readonly purpose: BattleDiePurpose
  /** Lado que juega esta tirada: ese dado rueda (battle-die-mine/enemy). */
  readonly side: 'player' | 'rival'
  /** Contador de tiradas (seed determinista + fuerza tirada repetida). */
  readonly nonce: number
  /** Encadenadas (Doble bofetón): 2+ muestra "Tirada n". */
  readonly chain: number
}

export interface BattleSceneProps {
  readonly player: BattlePlayerActor
  readonly rival: BattleRivalActor
  /** Último `DieRolled{purpose:'attackSelect'}` del rival (AC-5). */
  readonly attackSelectValue?: Face | null
  readonly die?: BattleDieView | null
  /** AC-4: skip/reducedMotion muestran el valor final sin animación. */
  readonly dieSpeed?: BattleDieSpeed
  readonly reducedMotion?: boolean
  readonly spritesOverride?: { sprites: SpritesManifest; trainers: TrainersManifest } | null
  readonly message?: string | null
  readonly visuals?: BattleVisuals
  /** ── rediseno-combate-max/AC-6: pestañas y acciones ── */
  readonly legal?: readonly Command[]
  readonly team?: readonly TeamPkmView[]
  readonly activeUid?: string | null
  readonly items?: BagContext['items']
  readonly battleKind?: 'wild' | 'gym' | null
  readonly rivalRemainingHp?: number | null
  readonly capture?: BagContext['capture']
  /** ¿Es mi turno (jugador activo viendo su combate)? */
  readonly myTurn?: boolean
  /** Animaciones corriendo: panel bloqueado. */
  readonly blocked?: boolean
  /** Combate de otro jugador: pestañas deshabilitadas con "Turno de {nombre}". */
  readonly turnOfName?: string | null
  /** reemplazo-tras-desmayo/AC-1: reemplazo pendiente (ChooseReplacement) ⇒
   * pestaña "Cambiar" forzada (inicial y mientras dure el pending). */
  readonly forceSwitch?: boolean
  readonly onCommand?: (command: Command) => void
  /** SPEC-R/T-103/AC-1: clic en la carta del rival abre su ventana (solo lectura). */
  readonly onRivalCardClick?: () => void
}

/** Caja de dado de un lado (AC-0/AC-2): 340×96, dado de 72 px + propósito. */
function DieSlot({
  side,
  die,
  speed,
  reducedMotion,
}: {
  readonly side: 'mine' | 'enemy'
  readonly die: BattleDieView | null
  readonly speed: BattleDieSpeed
  readonly reducedMotion: boolean
}) {
  const ref = useRef<BattleDieHandle>(null)
  const playSide = side === 'mine' ? 'player' : 'rival'
  const [seen, setSeen] = useState<{ label: string; chain: number; value: BattleDieValue } | null>(null)
  // dados-legibles: número del resultado, recién cuando el dado se asienta (no
  // adelanta la tirada). Sobrevive cuando la próxima tirada es del otro lado.
  const [settled, setSettled] = useState<BattleDieValue | null>(null)
  const fireRef = useRef(0)
  // arreglar-dados-combate/AC-2: guard de nonce (una tirada vieja no vuelve a
  // rodar ni roba la cara del otro slot) + replanificación: si cambió
  // speed/reducedMotion a mitad de tirada, la MISMA tirada se re-dispara con el
  // contexto nuevo (corta al instante con skip/reduced; re-planifica con 1x/2x).
  const lastFiredRef = useRef<{ nonce: number; speed: BattleDieSpeed; reducedMotion: boolean } | null>(null)
  useEffect(() => {
    if (die === null || die.side !== playSide) return
    const last = lastFiredRef.current
    if (
      last !== null &&
      last.nonce === die.nonce &&
      last.speed === speed &&
      last.reducedMotion === reducedMotion
    ) {
      return
    }
    lastFiredRef.current = { nonce: die.nonce, speed, reducedMotion }
    const value = clampDieValue(die.value)
    setSeen({ label: diePurposeLabel(die.purpose), chain: die.chain, value })
    const firing = fireRef.current + 1
    fireRef.current = firing
    const roll = ref.current?.rollTo(value, { seed: die.nonce, speed })
    void roll?.then(() => {
      if (fireRef.current === firing) setSettled(value)
    })
  }, [die, playSide, speed, reducedMotion])
  // En SSR (sin efectos) el propósito/contador/cara salen directo de props
  // cuando la tirada es de este lado; si el dado ya pasó al otro lado, persiste
  // lo último visto (el número queda visible tras rodar, AC-1/AC-5).
  const mineValue = die !== null && die.side === playSide ? clampDieValue(die.value) : null
  const current =
    die !== null && die.side === playSide
      ? { label: diePurposeLabel(die.purpose), chain: die.chain, value: mineValue ?? 1 }
      : (seen ?? { label: null as string | null, chain: 1, value: 1 as BattleDieValue })
  return (
    <div
      className={styles.dieBox}
      data-testid={`battle-die-${side}-box`}
      data-purpose={die !== null && die.side === playSide ? die.purpose : ''}
    >
      <BattleDie
        ref={ref}
        value={current.value}
        purpose={current.label ?? (side === 'mine' ? es.battleDieMine : es.battleDieEnemy)}
        size={72}
        reducedMotion={reducedMotion}
        testid={`battle-die-${side}`}
      />
      <div className={styles.dieMeta}>
        <p className={styles.dieSide}>{side === 'mine' ? es.battleDieMine : es.battleDieEnemy}</p>
        <p className={styles.diePurpose} data-testid={`battle-die-${side}-purpose`}>
          {current.label ?? ''}
        </p>
        {current.label !== null && current.chain > 1 ? (
          <p className={styles.dieChain}>{es.battleDieRoll.replace('{n}', String(current.chain))}</p>
        ) : null}
      </div>
      {/* dados-legibles: el número que salió, grande y sin contar puntos. */}
      {settled !== null ? (
        <p className={styles.dieValue} data-testid={`battle-die-${side}-value`} aria-hidden="true">
          {String(settled)}
        </p>
      ) : null}
    </div>
  )
}

export function BattleScene({
  player,
  rival,
  attackSelectValue = null,
  die = null,
  dieSpeed = '1x',
  reducedMotion = false,
  spritesOverride: spOverride,
  message = null,
  visuals,
  legal = [],
  team = [],
  activeUid = null,
  items = { potion: 0, super_potion: 0, ultraball: 0, masterball: 0 },
  battleKind = null,
  rivalRemainingHp = null,
  capture = { ultraball: { timing: 'duringBattle' }, masterball: { timing: 'duringBattle' } },
  myTurn = false,
  blocked = false,
  turnOfName = null,
  forceSwitch = false,
  onCommand,
  onRivalCardClick,
}: BattleSceneProps) {
  // fix-dados-combate-wiring/AC-2: la tirada vive en visuals.die (visualsOf del
  // stage de coreografía); el prop `die` queda como entrada directa (tests/SSR).
  const dieView = visuals?.die ?? die
  const fetched = useSprites()
  const sprites = spOverride?.sprites ?? fetched.sprites
  const trainers = spOverride?.trainers ?? fetched.trainers
  const [tab, setTab] = useState<BattleTab>(forceSwitch ? 'switch' : 'attack')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [reason, setReason] = useState<string | null>(null)

  // reemplazo-tras-desmayo/AC-1: mientras penda el reemplazo la pestaña
  // "Cambiar" es inicial y única salida (no se puede cambiar de pestaña).
  useEffect(() => {
    if (forceSwitch) setTab('switch')
  }, [forceSwitch])
  const selectTab = useCallback(
    (next: BattleTab): void => {
      if (forceSwitch) return
      setTab(next)
    },
    [forceSwitch],
  )

  const rows = useMemo(
    () => attackRows(player.card, player.pkm, player.firstTurn),
    [player.card, player.pkm, player.firstTurn],
  )
  const rivalAttack =
    attackSelectValue === null ? null : attackForDie(rival.card, attackSelectValue)
  const rivalNotice =
    attackSelectValue !== null && rivalAttack === null ? es.battleNoAttack : null

  const attacks = useMemo(() => attackOptions(rows, player.pkm), [rows, player.pkm])
  const switches = useMemo(
    () => switchOptions(team, activeUid, legal),
    [team, activeUid, legal],
  )
  const bag = useMemo(
    () =>
      bagOptions({
        items,
        legal,
        battleKind,
        rivalRemainingHp,
        activeDamaged: player.pkm.damage > 0,
        capture,
      }),
    [items, legal, battleKind, rivalRemainingHp, player.pkm.damage, capture],
  )

  const selectedAttackId = selection?.kind === 'attack' ? selection.attackId : null
  const acceptCommand = commandOfSelection(selection, legal)
  const controlsBlocked = blocked || !myTurn

  const effectText = useMemo(() => {
    if (reason !== null) return reason
    if (selection === null) return null
    if (selection.kind === 'attack') {
      const row = rows.find((candidate) => candidate.attack.id === selection.attackId)
      const text = row?.attack.rawText ?? ''
      return text.length > 0 ? text : es.battleNoEffectText
    }
    if (selection.kind === 'item') {
      return bag.find((option) => option.id === selection.id)?.description ?? null
    }
    return null
  }, [bag, reason, rows, selection])

  const pickAttack = useCallback(
    (option: (typeof attacks)[number]): void => {
      if (!option.legal || option.attack === null) {
        setSelection(null)
        setReason(option.attack === null ? null : option.reason)
        return
      }
      setReason(null)
      setSelection({ kind: 'attack', attackId: option.attack.id })
    },
    [],
  )
  const pickSwitch = useCallback(
    (option: (typeof switches)[number]): void => {
      if (!option.legal) {
        setSelection(null)
        setReason(option.reason)
        return
      }
      setReason(null)
      setSelection({ kind: 'switch', uid: option.uid })
    },
    [],
  )
  const pickItem = useCallback(
    (option: (typeof bag)[number]): void => {
      if (!option.legal) {
        setSelection(null)
        setReason(option.reason)
        return
      }
      setReason(null)
      setSelection({ kind: 'item', id: option.id })
    },
    [],
  )
  const accept = useCallback(() => {
    if (acceptCommand !== null) onCommand?.(acceptCommand)
    setSelection(null)
    setReason(null)
  }, [acceptCommand, onCommand])
  const cancel = useCallback(() => {
    setSelection(null)
    setReason(null)
  }, [])

  const entrance = (side: 'player' | 'rival'): boolean =>
    visuals?.entranceSides?.includes(side) === true
  const fainted = (side: 'player' | 'rival'): boolean =>
    visuals?.faintedSides?.includes(side) === true
  const evolving = (side: 'player' | 'rival'): 'pulse' | 'reveal' | null =>
    visuals?.evolve != null && visuals.evolve.side === side ? visuals.evolve.phase : null
  const evolveVars =
    visuals?.evolve != null
      ? ({
          '--evolve-pulse-ms': `${String(ANIMATION_CONFIG.evolvePulseMs)}ms`,
          '--evolve-reveal-ms': `${String(ANIMATION_CONFIG.evolveRevealMs)}ms`,
        } as CSSProperties)
      : undefined
  const releaseText = es.battleReleaseConfirm.replace(
    '{name}',
    team.find((member) => member.uid === activeUid)?.name ?? player.card.name,
  )

  return (
    <BattleStageView>
      <section className={styles.scene} aria-label={es.battleSceneLabel} style={evolveVars} data-battle-scene>
        {/* Columna izquierda: carta mía + dado debajo (AC-0). */}
        <div className={styles.sideCol}>
          <div className={styles.cardSlot} data-testid="battle-card-mine">
            <PkmCard
              card={player.card}
              damage={player.pkm.damage}
              artUrl={spriteUrl(sprites, player.card.dex, 'front')}
              mode="own"
              rows={rows}
              raised={visuals?.raisedSide === 'player'}
              selectedAttackId={selectedAttackId}
            />
          </div>
          <DieSlot side="mine" die={dieView} speed={dieSpeed} reducedMotion={reducedMotion} />
        </div>

        {/* Columna central: recuadro Game Boy + pestañas + acciones (AC-0). */}
        <div className={styles.centerCol}>
          <div className={styles.arena} data-testid="battle-arena">
            <div className={styles.background} data-layer="background" />
            <div className={styles.sprites} data-layer="sprites">
              <SpriteSlot
                side="rival"
                name={rival.card.name}
                url={spriteUrl(sprites, rival.card.dex, 'front')}
                entering={entrance('rival')}
                blinking={visuals?.blinkSide === 'rival'}
                fainted={fainted('rival')}
                evolving={evolving('rival')}
                {...(visuals?.evolve != null ? { evolvePulse: visuals.evolve.pulse } : {})}
              />
              {visuals?.trainerAppeared != null ? (
                <SpriteSlot
                  side="trainer"
                  name={visuals.trainerAppeared}
                  url={trainerUrl(trainers, visuals.trainerAppeared)}
                  entering={entrance('rival')}
                />
              ) : null}
              <SpriteSlot
                side="player"
                name={player.card.name}
                url={spriteUrl(sprites, player.card.dex, 'back')}
                entering={entrance('player')}
                blinking={visuals?.blinkSide === 'player'}
                fainted={fainted('player')}
                evolving={evolving('player')}
                {...(visuals?.evolve != null ? { evolvePulse: visuals.evolve.pulse } : {})}
              />
            </div>
            {/* Capa de FX: overlay sin clicks (ADR-6); coreografía (T-032d) + playMoveFx. */}
            <div className={styles.fx} data-layer="fx" style={{ pointerEvents: 'none' }}>
              {visuals?.sweep === true ? <div className={styles.sweep} data-sweep="true" /> : null}
              {visuals?.flash != null && visuals.flash.length > 0 ? (
                <div className={styles.flashOverlay} data-flash={visuals.flash} />
              ) : null}
              {visuals?.capture != null ? (
                <div
                  className={styles.captureBall}
                  key={`${visuals.capture.phase}-${visuals.capture.shakes}`}
                  data-capture={visuals.capture.phase}
                  data-shakes={visuals.capture.shakes}
                />
              ) : null}
              {(visuals?.floaters ?? []).map((floater) => (
                <span
                  key={floater.id}
                  className={styles.floater}
                  data-side={floater.side}
                  data-tone={floater.tone}
                  data-floater={floater.text}
                >
                  {floater.text}
                </span>
              ))}
            </div>
            <div className={styles.hud} data-layer="hud">
              <div className={styles.rivalPlate}>
                <HpPlate
                  name={rival.card.name}
                  hpMax={rival.card.hp}
                  damage={rival.damage}
                  side="rival"
                  statuses={statusViews(rival.conditions)}
                />
              </div>
              <div className={styles.playerPlate}>
                <HpPlate
                  name={player.card.name}
                  hpMax={player.card.hp}
                  damage={player.pkm.damage}
                  side="player"
                  statuses={statusViews(player.conditions)}
                />
              </div>
              <p className={styles.textbox}>{message ?? es.battleTextboxDefault}</p>
            </div>
          </div>
          <BattleTabs active={tab} disabled={controlsBlocked} onSelect={selectTab} />
          <BattleActions
            tab={tab}
            attackOptions={attacks}
            switchOptions={switches}
            bagOptions={bag}
            releaseText={releaseText}
            effectText={effectText}
            canAccept={acceptCommand !== null}
            blocked={controlsBlocked}
            selectedAttackId={selectedAttackId}
            selectedSwitchUid={selection?.kind === 'switch' ? selection.uid : null}
            selectedItemId={selection?.kind === 'item' ? selection.id : null}
            onPickAttack={pickAttack}
            onPickSwitch={pickSwitch}
            onPickItem={pickItem}
            onAccept={accept}
            onCancel={cancel}
          />
          {turnOfName !== null ? (
            <p className={styles.turnOf} data-testid="battle-turn-of">
              {es.hudTurnOf.replace('{name}', turnOfName)}
            </p>
          ) : null}
        </div>

        {/* Columna derecha: carta enemiga + dado debajo (AC-0). */}
        <div className={styles.sideCol}>
          <div
            className={styles.cardSlot}
            data-testid="battle-card-enemy"
            data-drop-target="rival"
            {...(onRivalCardClick !== undefined
              ? {
                  role: 'button',
                  tabIndex: 0,
                  onClick: onRivalCardClick,
                  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (event.key === 'Enter' || event.key === ' ') onRivalCardClick()
                  },
                }
              : {})}
          >
            <PkmCard
              card={rival.card}
              damage={rival.damage}
              artUrl={spriteUrl(sprites, rival.card.dex, 'front')}
              mode="rival"
              raised={visuals?.raisedSide === 'rival'}
              litAttackId={rivalAttack?.id ?? null}
              litValue={attackSelectValue}
              notice={rivalNotice}
            />
          </div>
          <DieSlot side="enemy" die={dieView} speed={dieSpeed} reducedMotion={reducedMotion} />
        </div>
      </section>
    </BattleStageView>
  )
}

function SpriteSlot({
  side,
  name,
  url,
  entering,
  blinking,
  fainted,
  evolving,
  evolvePulse,
}: {
  readonly side: 'player' | 'rival' | 'trainer'
  readonly name: string
  readonly url: string | null
  readonly entering?: boolean
  readonly blinking?: boolean
  readonly fainted?: boolean
  readonly evolving?: 'pulse' | 'reveal' | null
  readonly evolvePulse?: number
}) {
  return (
    <div
      className={
        side === 'rival' ? styles.rival : side === 'trainer' ? styles.trainer : styles.player
      }
      data-side={side}
      {...(entering === true ? { 'data-enter': 'true' } : {})}
      {...(blinking === true ? { 'data-blink': 'true' } : {})}
      {...(fainted === true ? { 'data-fainted': 'true' } : {})}
      {...(evolving != null ? { 'data-evolve': evolving, 'data-pulse': evolvePulse ?? 0 } : {})}
    >
      {url === null ? (
        <div className={styles.spriteFallback} data-missing="true">
          {name}
        </div>
      ) : (
        <img className={styles.sprite} src={url} alt={name} />
      )}
    </div>
  )
}
