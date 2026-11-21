// Contenedor del flujo de partida (SPEC-D/T-034): título → setup → juego,
// con guardado automático (AC-2) y ajustes (AC-3). El storage se inyecta para
// tests; en navegador es localStorage. Los demos lazy viven acá, fuera del
// bundle inicial.
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import type { DeckId } from '@liga/content'
import { recordSeed } from '../debug/session'
import type { PlaybackSpeed } from '../events/anim.config'
import { useGameStore } from '../events/store'
import { es } from '../i18n/es'
import { contentHash, gameContent, starterOptions } from './content'
import { devSeed } from './devmode'
import { PlayScreen } from './PlayScreen'
import {
  createMemoryStorage,
  readSave,
  writeSave,
  type SaveRead,
  type StorageLike,
} from './save'
import { restoreSession, saveFromSession, startSession, type GameSession } from './session'
import { createBrowserStorage, readSettings, writeSettings, type GameSettings } from './settings'
import { SettingsScreen } from './SettingsScreen'
import { SetupScreen } from './SetupScreen'
import { TitleScreen } from './TitleScreen'
import styles from './game.module.css'

const BattleDemo = lazy(async () => {
  const [{ ChoreographedBattle }, { demoBattleScript, demoChoreoDeps }] = await Promise.all([
    import('../battle/ChoreographedBattle'),
    import('../battle/demo'),
  ])
  const Demo = ({ speed }: { readonly speed: PlaybackSpeed }): ReactNode => (
    <ChoreographedBattle deps={demoChoreoDeps} script={demoBattleScript} speed={speed} />
  )
  return { default: Demo }
})

const TeamDemo = lazy(async () => ({ default: (await import('../team/TeamDemo')).TeamDemo }))

type Screen = 'title' | 'setup' | 'play' | 'settings'

const warningForSave = (read: SaveRead): string | null => {
  if (read.kind === 'unknown-version') {
    return es.saveUnknownVersion.replace('{version}', String(read.found))
  }
  if (read.kind === 'invalid') return es.saveInvalid
  // T-048/AC-6: el contenido (con ediciones de la casa) cambió respecto del
  // save ⇒ aviso; Continuar sigue habilitado (stateHash verifica el replay).
  if (read.kind === 'ok' && read.save.contentHash !== undefined && read.save.contentHash !== contentHash) {
    return es.saveContentMismatch
  }
  return null
}

export interface GameAppProps {
  readonly storage?: StorageLike
}

export function GameApp({ storage }: GameAppProps) {
  const [store] = useState<StorageLike>(
    () => storage ?? createBrowserStorage() ?? createMemoryStorage(),
  )
  const [screen, setScreen] = useState<Screen>('title')
  const [saveRead, setSaveRead] = useState<SaveRead>(() => readSave(store))
  const [saveWarning, setSaveWarning] = useState<string | null>(() => warningForSave(readSave(store)))
  const [settings, setSettings] = useState<GameSettings>(() => readSettings(store))
  // T-061/AC-4: ?seed=<n> (solo dev) precarga la semilla del setup.
  const [seedInput, setSeedInput] = useState(() => {
    const forced = devSeed()
    return forced === null ? '' : String(forced)
  })
  const [session, setSession] = useState<GameSession | null>(null)
  const [battleDemo, setBattleDemo] = useState(false)
  const [teamDemo, setTeamDemo] = useState(false)
  const eventQueue = useGameStore((state) => state.eventQueue)
  const speed = useGameStore((state) => state.speed)
  const isPlaying = useGameStore((state) => state.isPlaying)
  const setSpeed = useGameStore((state) => state.setSpeed)
  const setReducedMotion = useGameStore((state) => state.setReducedMotion)
  const playNext = useGameStore((state) => state.playNext)

  useEffect(() => {
    setSpeed(settings.speed)
    setReducedMotion(settings.reducedMotion)
  }, [settings, setSpeed, setReducedMotion])

  useEffect(() => {
    if (eventQueue.length > 0 && !isPlaying) {
      void playNext()
    }
  }, [eventQueue.length, isPlaying, playNext])

  const startGame = (deck: DeckId): void => {
    const parsed = Number.parseInt(seedInput, 10)
    const seed = Number.isInteger(parsed) && parsed >= 0
      ? parsed
      : Math.floor(Math.random() * 0x7fffffff)
    const started = startSession({ seed, starterDeck: deck }, gameContent)
    if (!started.ok) {
      setSaveWarning(started.error.message)
      setScreen('title')
      return
    }
    recordSeed(seed)
    writeSave(store, saveFromSession(started.value, contentHash))
    setSaveRead(readSave(store))
    setSaveWarning(null)
    setSession(started.value)
    setScreen('play')
  }

  const continueGame = (): void => {
    if (saveRead.kind !== 'ok') return
    const restored = restoreSession(saveRead.save, gameContent)
    if (!restored.ok) {
      setSaveWarning(
        restored.error.code === 'hash'
          ? es.saveHashMismatch
          : restored.error.code === 'corrupt'
            ? es.saveCorruptLog
            : restored.error.message,
      )
      return
    }
    recordSeed(saveRead.save.seed)
    setSession(restored.value.session)
    setScreen('play')
  }

  const exitToTitle = (): void => {
    const next = readSave(store)
    setSaveRead(next)
    setSaveWarning(warningForSave(next))
    setScreen('title')
  }

  const changeSettings = (next: GameSettings): void => {
    setSettings(next)
    writeSettings(store, next)
  }

  const visibleSeed =
    session?.seed ?? (saveRead.kind === 'ok' ? saveRead.save.seed : null)

  return (
    <>
      {screen === 'title' ? (
        <TitleScreen
          hasSave={saveRead.kind === 'ok'}
          saveWarning={saveWarning}
          onNewGame={() => setScreen('setup')}
          onContinue={continueGame}
          onOpenSettings={() => setScreen('settings')}
        />
      ) : null}
      {screen === 'setup' ? (
        <SetupScreen
          options={starterOptions}
          seedInput={seedInput}
          onSeedInput={setSeedInput}
          onStart={startGame}
          onBack={() => setScreen('title')}
        />
      ) : null}
      {screen === 'settings' ? (
        <SettingsScreen
          settings={settings}
          seed={visibleSeed}
          onChange={changeSettings}
          onBack={() => setScreen('title')}
        />
      ) : null}
      {screen === 'play' && session !== null ? (
        <PlayScreen
          session={session}
          storage={store}
          onExit={exitToTitle}
          boardMode={settings.board}
          settings={settings}
          onSettingsChange={changeSettings}
        />
      ) : null}
      {screen === 'title' ? (
        <section className={styles.screen}>
          <p className={styles.note}>{es.titleDemoSection}</p>
          <div className={styles.demos}>
            <button
              type="button"
              className={styles.demosButton}
              onClick={() => {
                setBattleDemo(!battleDemo)
                setTeamDemo(false)
              }}
            >
              {es.battleDemoToggle}
            </button>
            <button
              type="button"
              className={styles.demosButton}
              onClick={() => {
                setTeamDemo(!teamDemo)
                setBattleDemo(false)
              }}
            >
              {es.teamDemoToggle}
            </button>
          </div>
          {battleDemo ? (
            <Suspense fallback={<p className={styles.note}>{es.loading}</p>}>
              <BattleDemo speed={speed} />
            </Suspense>
          ) : null}
          {teamDemo ? (
            <Suspense fallback={<p className={styles.note}>{es.loading}</p>}>
              <TeamDemo />
            </Suspense>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
