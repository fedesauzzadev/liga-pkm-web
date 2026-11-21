// Shell de pantalla completa (SPEC-I/T-071): el tablero ES la pantalla (mundo
// 3D a pantalla completa) y el HUD son paneles de vidrio posicionados por
// content/ui/layout.json. Este componente NO conoce el estado del juego: solo
// ordena capas, recibe el contenido de cada panel (T-072..T-075 lo llenan), el
// menú con Pantalla completa (AC-5) y el teclado (AC-7). T-074: contenido de
// paneles, btn-oak controlado y menú del juego (Continuar/Guardar/Ajustes/…).
// T-089/SPEC-N: pestaña btn-team-tab que colapsa panel-team (el menú vive en
// MenuPopover.tsx para respetar el tope de 400 líneas por archivo).
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { es } from '../i18n/es'
import {
  FOCUS_ORDER,
  expandedPanelCss,
  layoutDebugFromUrl,
  panelCss,
  shellPanels,
  uiLayout,
  viewportFits,
  type FocusPanelKey,
} from './layout'
import { MenuPopover, type ShellMenu } from './MenuPopover'
import { HudToggle } from './HudToggle'
import { DevEncounterButton } from './DevEncounterButton'
import styles from './GameShell.module.css'

export interface ShellHud {
  /** T-092: panel-dice (DicePanel, dado de tablero; el de combate vive en el popup). */
  readonly dice?: ReactNode
  /** T-074: panel-turn (TurnPanel). */
  readonly turn?: ReactNode
  /** T-074: panel-team (TeamStrip). */
  readonly team?: ReactNode
  /** T-074: panel-players (PlayersPanel). */
  readonly players?: ReactNode
  /** T-072: panel-history. */
  readonly history?: ReactNode
  /** T-073: panel-backpack. */
  readonly backpack?: ReactNode
}

export interface GameShellProps {
  /** El mundo (BoardHost): su canvas queda fijo a pantalla completa (AC-2). */
  readonly world: ReactNode
  /** Controles del juego: cluster flotante sobre el mundo, con scroll interno. */
  readonly overlay?: ReactNode
  /** T-074: contenido de los paneles del HUD (placeholder si falta). */
  readonly hud?: ShellHud
  /** T-074: btn-oak controlado (abre la Reserva en el área del popup). */
  readonly oakOpen?: boolean
  readonly onOakToggle?: () => void
  /** T-089/SPEC-N: estado de la pestaña del equipo (colapsa panel-team). */
  readonly teamCollapsed?: boolean
  readonly onTeamToggle?: () => void
  /** Plan ocultar-hud: estado INICIAL del toggle (el estado vive en el shell). */
  readonly hudHidden?: boolean
  /** Plan probar-encuentro-abra: botón dev (solo se pasa en DEV); se oculta con el HUD. */
  readonly onDevEncounter?: (() => void) | undefined
  /** T-074: menú del juego (Continuar/Guardar/Ajustes/Pantalla completa/Bug/Salir). */
  readonly menu?: ShellMenu
  /** T-075: contenido del popup de carta obtenida. */
  readonly cardPopup?: ReactNode
  /** unificar-popup-encuentro: popup del encuentro salvaje (debajo del combate). */
  readonly encounterPopup?: ReactNode
  /** T-075: contenido del popup de combate/intercambio. */
  readonly battlePopup?: ReactNode
  /** T-075/AC-2: Ampliar usa la caja `expanded` de layout.json. */
  readonly battlePopupExpanded?: boolean
  /** SPEC-R/T-103: ventana de carta del Pokémon (overlay centrado propio). */
  readonly modal?: ReactNode
  readonly layoutDebug?: boolean
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (typeof HTMLElement === 'undefined' || target === null) return false
  const element = target as HTMLElement
  return (
    element.isContentEditable ||
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT'
  )
}

/** Contenido de un panel del HUD: lo que llega o el placeholder (AC-3). */
function panelContent(
  key: Exclude<FocusPanelKey, 'oakButton' | 'menuButton' | 'teamTab' | 'hudToggle' | 'devEncounter'>,
  hud: ShellHud | undefined,
): ReactNode {
  const node = hud?.[key]
  if (node !== undefined) return node
  return <p className={styles.placeholder}>{PLACEHOLDER_TEXT[key]}</p>
}

const PLACEHOLDER_TEXT: Readonly<
  Record<Exclude<FocusPanelKey, 'oakButton' | 'menuButton' | 'teamTab' | 'hudToggle' | 'devEncounter'>, string>
> = {
  dice: es.shellPanelDice,
  turn: es.shellPanelTurn,
  team: es.shellPanelTeam,
  players: es.shellPanelPlayers,
  history: es.shellPanelHistory,
  backpack: es.shellPanelBackpack,
}

/** ¿En qué contenedor vive cada popup? (orden DOM al final, encima de todo). */
function PopupBox({
  panelKey,
  content,
  label,
  debug,
  expanded = false,
}: {
  readonly panelKey: 'cardPopup' | 'battlePopup'
  readonly content: ReactNode
  readonly label: string
  readonly debug: boolean
  /** T-075/AC-2: el popup de combate ampliado cambia a la caja `expanded`. */
  readonly expanded?: boolean
}): ReactNode {
  const panel = shellPanels[panelKey]
  const showPlaceholder = content === null && debug
  if (content === null && !debug) return null
  const base = expanded ? expandedPanelCss(panel) : panelCss(panel)
  const classes = [styles.popup]
  if (panelKey === 'battlePopup') classes.push(styles.popupBattle)
  if (showPlaceholder) classes.push(styles.debugBox)
  return (
    <section
      className={classes.join(' ')}
      style={base}
      data-testid={panel.testid}
      role="region"
      aria-label={label}
    >
      {content ?? <p className={styles.placeholder}>{label}</p>}
    </section>
  )
}

export function GameShell({
  world,
  overlay,
  hud,
  oakOpen = false,
  onOakToggle,
  teamCollapsed = false,
  onTeamToggle,
  hudHidden = false,
  onDevEncounter,
  menu,
  cardPopup,
  encounterPopup,
  battlePopup,
  battlePopupExpanded = false,
  modal,
  layoutDebug,
}: GameShellProps): ReactNode {
  const debug = layoutDebug ?? layoutDebugFromUrl()
  const [menuOpen, setMenuOpen] = useState(false)
  const [tipOpen, setTipOpen] = useState(true)
  // Plan ocultar-hud: estado local del shell (no toca motor ni sesión).
  const [hudHiddenState, setHudHiddenState] = useState(hudHidden)
  const [fullscreen, setFullscreen] = useState(false)
  // AC-5: ventana menor al mínimo o vertical ⇒ pantalla de aviso (saltable).
  const [fits, setFits] = useState(() => (typeof window === 'undefined' ? true : viewportFits(window.innerWidth, window.innerHeight)))
  const [warningDismissed, setWarningDismissed] = useState(false)

  const toggleFullscreen = useCallback((): void => {
    if (typeof document === 'undefined' || !document.fullscreenEnabled) return
    if (document.fullscreenElement === null) {
      void document.documentElement.requestFullscreen().catch(() => undefined)
    } else {
      void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const onResize = (): void => setFits(viewportFits(window.innerWidth, window.innerHeight))
    const onFullscreenChange = (): void => setFullscreen(document.fullscreenElement !== null)
    const onKey = (event: KeyboardEvent): void => {
      // AC-7: Esc cierra lo abierto (menú, tip; popups no críticos cuando existan).
      if (event.key === 'Escape') {
        setMenuOpen((open) => {
          if (open) return false
          setTipOpen(false)
          return false
        })
        return
      }
      // AC-5: atajo F de pantalla completa (no mientras se escribe).
      if ((event.key === 'f' || event.key === 'F') && !isEditableTarget(event.target)) {
        event.preventDefault()
        toggleFullscreen()
      }
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', onKey)
    }
  }, [toggleFullscreen])

  // Las vars "crudas" (--hud-*) vienen inline desde layout.json; la hoja de
  // estilo las vuelca en --panel-opacity/--blur para que el media query de
  // transparencia reducida (AC-6) pueda ganarle al inline.
  const cssVars = {
    '--hud-opacity': String(uiLayout.style.panelOpacity),
    '--hud-blur': `${String(uiLayout.style.blurPx)}px`,
    '--hud-radius': `${String(uiLayout.style.radius)}px`,
    '--hud-border': `${String(uiLayout.style.borderPx)}px`,
    '--safe-x': `${String(uiLayout.safeArea.x * 100)}%`,
    '--safe-y': `${String(uiLayout.safeArea.y * 100)}%`,
    '--safe-w': `${String(uiLayout.safeArea.w * 100)}%`,
    '--safe-h': `${String(uiLayout.safeArea.h * 100)}%`,
  } as CSSProperties

  const showWarning = !fits && !warningDismissed

  return (
    <div className={styles.root} style={cssVars} data-shell-root="" data-testid="game-shell" aria-label={es.shellAria}>
      <div className={styles.world} data-shell-world="">{world}</div>
      {overlay !== undefined && !hudHiddenState ? (
        <div className={styles.overlay} data-shell-overlay="">
          {overlay}
        </div>
      ) : null}
      <div className={styles.hud} data-shell-hud="">
        {/* ocultar-hud: el toggle queda SIEMPRE visible (AC-2); abre FOCUS_ORDER. */}
        <HudToggle hidden={hudHiddenState} onToggle={() => setHudHiddenState((hidden) => !hidden)} />
        {/* probar-encuentro-abra: botón dev junto al anteojito, oculto con el HUD. */}
        {!hudHiddenState && onDevEncounter !== undefined ? <DevEncounterButton onClick={onDevEncounter} /> : null}
        {!hudHiddenState
          ? FOCUS_ORDER.map((key) => {
              // ocultar-hud: este botón se renderiza aparte (siempre visible).
              if (key === 'hudToggle' || key === 'devEncounter') return null
              const panel = shellPanels[key]
              // T-089/SPEC-N: pestaña fija en ambos estados; solo saca panel-team.
              if (key === 'teamTab') {
                return (
                  <button
                    key={key}
                    type="button"
                    className={styles.panelButton}
                    style={panelCss(panel)}
                    data-testid={panel.testid}
                    aria-expanded={!teamCollapsed}
                    aria-controls="panel-team"
                    onClick={onTeamToggle}
                  >
                    {teamCollapsed ? es.teamExpand : es.teamCollapse}
                  </button>
                )
              }
              if (key === 'oakButton' || key === 'menuButton') {
                const isMenu = key === 'menuButton'
                return isMenu ? (
                  <button
                    key={key}
                    type="button"
                    className={styles.panelButton}
                    style={panelCss(panel)}
                    data-testid={panel.testid}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    {es.shellMenu}
                  </button>
                ) : (
                  <button
                    key={key}
                    type="button"
                    className={styles.panelButton}
                    style={panelCss(panel)}
                    data-testid={panel.testid}
                    aria-expanded={oakOpen}
                    onClick={onOakToggle}
                  >
                    {es.shellBtnOak}
                  </button>
                )
              }
              // T-089/SPEC-N: al colapsar, panel-team sale del DOM (la pestaña queda).
              if (key === 'team' && teamCollapsed) return null
              return (
                <section
                  key={key}
                  className={styles.panel}
                  style={panelCss(panel)}
                  data-testid={panel.testid}
                  id={panel.testid}
                  data-panel={key}
                  tabIndex={0}
                  role="region"
                  aria-label={PLACEHOLDER_TEXT[key]}
                >
                  {panelContent(key, hud)}
                </section>
              )
            })
          : null}
      </div>
      <div className={styles.popups}>
        <PopupBox
          panelKey="cardPopup"
          content={cardPopup ?? null}
          label={es.shellPopupCard}
          debug={debug}
        />
        {/* unificar-popup-encuentro: capa propia, debajo de popup-battle y
            encima del HUD (la caja la posiciona el componente por geometría). */}
        {encounterPopup !== undefined ? encounterPopup : null}
        <PopupBox
          panelKey="battlePopup"
          content={battlePopup ?? null}
          label={es.shellPopupBattle}
          debug={debug}
          expanded={battlePopupExpanded}
        />
      </div>
      {modal !== undefined ? modal : null}
      {menuOpen ? (
        <MenuPopover
          menu={menu}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
      {/* N-0005: con un combate abierto el tip no se muestra (tapaba los ataques). */}
      {tipOpen && !hudHiddenState && (battlePopup ?? null) === null ? (
        <div className={styles.tip} data-testid="tip-f11" role="status">
          <span>{es.shellTipF11}</span>
          <button
            type="button"
            className={styles.tipClose}
            data-testid="tip-f11-close"
            onClick={() => setTipOpen(false)}
          >
            {es.shellTipClose}
          </button>
        </div>
      ) : null}
      {showWarning ? (
        <div className={styles.viewportWarning} data-testid="viewport-warning" role="alertdialog" aria-label={es.shellViewportWarningTitle}>
          <h2 className={styles.warningTitle}>{es.shellViewportWarningTitle}</h2>
          <p className={styles.warningText}>
            {es.shellViewportWarning
              .replace('{min}', `${String(uiLayout.viewport.minWidth)}×${String(uiLayout.viewport.minHeight)}`)}
          </p>
          <button
            type="button"
            className={styles.warningButton}
            data-testid="viewport-warning-dismiss"
            onClick={() => setWarningDismissed(true)}
          >
            {es.shellViewportContinue}
          </button>
        </div>
      ) : null}
    </div>
  )
}
