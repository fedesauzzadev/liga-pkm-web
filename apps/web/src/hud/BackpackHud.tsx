// Mochila cableada al juego (SPEC-I/T-073): panel + capa de arrastre. Resuelve
// los drops con `resolveDrop` (espejo de las reglas) y despacha el comando por
// `send`; si el MOTOR lo rechaza, la sacudida vuelve a la fila y el motivo queda
// en el error del shell (AC-3). También consume los "tap" de destino (AC-4).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Command, GameState, PlayerState } from '@liga/engine'
import { es } from '../i18n/es'
import { EnergyIcon } from '../energy/EnergyIcon'
import { BackpackPanel } from './BackpackPanel'
import { MULTICOLOR_ELEMENTS, backpackReasonText, resolveDrop, type CardOf, type DragPayload, type DropTarget } from './backpack'
import { DRAG_THRESHOLD_PX, carryOf, isClickSuppressed, suppressClick, useCarryStore } from './carry'
import styles from './backpack.module.css'

export interface BackpackHudProps {
  /** Jugador propio (el activo: la mochila ajena queda oculta, D-28). */
  readonly player: PlayerState
  readonly state: GameState
  readonly cardOf: CardOf
  readonly viewingOwn: boolean
  readonly send: (command: Command) => boolean
}

/** Lee el `[data-drop-target]` bajo el puntero (puro sobre la interfaz mínima). */
export function targetFromElement(
  element: { readonly getAttribute: (name: string) => string | null } | null,
): DropTarget {
  const kind = element?.getAttribute('data-drop-target')
  if (kind === 'pkm') return { kind: 'pkm', uid: element?.getAttribute('data-uid') ?? '' }
  if (kind === 'rival') return { kind: 'rival' }
  if (kind === 'backpack') return { kind: 'backpack' }
  return { kind: 'none' }
}

function ghostLabel(payload: DragPayload): { readonly icon: Parameters<typeof EnergyIcon>[0]['type'] | null; readonly text: string } {
  switch (payload.kind) {
    case 'element':
      return { icon: payload.element, text: es.elementNames[payload.element] }
    case 'multicolor':
      return { icon: 'multicolor', text: es.tileItemNames.multicolor }
    case 'potion':
      return { icon: null, text: es.tileItemNames[payload.item] }
    case 'ball':
      return { icon: null, text: es.tileItemNames[payload.ball] }
    case 'unequip':
      return { icon: payload.element, text: es.elementNames[payload.element] }
    case 'oportunidad':
      return { icon: null, text: es.tileItemNames.oportunidad }
    default:
      return { icon: null, text: '' }
  }
}

/** Ghost que sigue al puntero (AC-1) + drop por elementFromPoint; tap ⇒ select. */
function CarryLayer({ onDrop }: { readonly onDrop: (payload: DragPayload, target: DropTarget) => void }): ReactNode {
  const carried = useCarryStore((store) => store.carried)
  const pointer = useCarryStore((store) => store.pointer)
  const onDropRef = useRef(onDrop)
  useEffect(() => {
    onDropRef.current = onDrop
  }, [onDrop])

  useEffect(() => {
    if (carried === null || carried.mode !== 'drag') return
    const onMove = (event: globalThis.PointerEvent): void => carryOf().move(event.clientX, event.clientY)
    const onUp = (event: globalThis.PointerEvent): void => {
      const store = carryOf()
      const current = store.carried
      if (current === null || current.mode !== 'drag') return
      const origin = store.origin
      const distance =
        origin === null
          ? Number.MAX_SAFE_INTEGER
          : Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
      if (distance < DRAG_THRESHOLD_PX && current.payload.kind !== 'unequip') {
        store.convertToSelect() // AC-4: sin arrastrar, la carta queda seleccionada
        return
      }
      suppressClick()
      const element = document.elementFromPoint(event.clientX, event.clientY)
      const drop = element?.closest('[data-drop-target]') ?? null
      onDropRef.current(current.payload, targetFromElement(drop))
    }
    const onCancel = (): void => carryOf().end()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [carried])

  // Esc suelta la carta (drag o selección) sin efectos.
  useEffect(() => {
    if (carried === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') carryOf().end()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [carried])

  if (carried === null || carried.mode !== 'drag' || pointer === null) return null
  const ghost = ghostLabel(carried.payload)
  const node = (
    <div
      className={styles.ghost}
      data-testid="drag-ghost"
      data-ghost-kind={carried.payload.kind}
      style={{ left: `${String(pointer.x)}px`, top: `${String(pointer.y)}px` }}
    >
      {ghost.icon === null ? null : <EnergyIcon type={ghost.icon} size={24} />}
      <span>{ghost.text}</span>
    </div>
  )
  // El panel tiene overflow hidden: el ghost viaja al body para cruzar paneles.
  return typeof document === 'undefined' ? node : createPortal(node, document.body)
}

export function BackpackHud({ player, state, cardOf, viewingOwn, send }: BackpackHudProps): ReactNode {
  const [note, setNote] = useState<string | null>(null)
  const [multicolorChoice, setMulticolorChoice] = useState<{ readonly pkmUid: string; readonly pkmName: string } | null>(null)
  const tap = useCarryStore((store) => store.tap)

  useEffect(() => {
    if (note === null) return
    const timer = setTimeout(() => setNote(null), 2_500)
    return () => clearTimeout(timer)
  }, [note])

  const handleCarryDrop = useCallback(
    (payload: DragPayload, target: DropTarget): void => {
      const resolution = resolveDrop(payload, target, state, cardOf)
      carryOf().end()
      if (resolution.ok) {
        if ('chooseElementFor' in resolution) {
          const pkm = state.players
            .find((candidate) => candidate.id === state.activePlayerId)
            ?.team.find((candidate) => candidate.uid === resolution.chooseElementFor)
          if (pkm !== undefined) {
            setMulticolorChoice({ pkmUid: pkm.uid, pkmName: cardOf(pkm.cardId)?.name ?? String(pkm.cardId) })
          }
          return
        }
        if (!send(resolution.command)) carryOf().reject()
        return
      }
      setNote(es.backpackDropInvalid.replace('{reason}', backpackReasonText(resolution.reason)))
      carryOf().reject()
    },
    [state, cardOf, send],
  )

  // AC-4: con una carta seleccionada, tocar el destino aplica el mismo camino.
  useEffect(() => {
    if (tap === null) return
    carryOf().clearTap()
    const current = carryOf().carried
    if (current === null || isClickSuppressed()) return
    handleCarryDrop(current.payload, tap.target)
  }, [tap, handleCarryDrop])

  if (!viewingOwn) {
    return (
      <p className={styles.hidden} data-testid="backpack-hidden">
        {es.backpackHidden}
      </p>
    )
  }
  return (
    <>
      <BackpackPanel
        player={player}
        state={state}
        note={note}
        multicolorChoice={
          multicolorChoice === null
            ? null
            : {
                pkmName: multicolorChoice.pkmName,
                elements: MULTICOLOR_ELEMENTS,
                onPick: (element) => {
                  const pkmUid = multicolorChoice.pkmUid
                  setMulticolorChoice(null)
                  send({ type: 'AssignMulticolor', pkmUid, element })
                },
                onCancel: () => setMulticolorChoice(null),
              }
        }
        onCommand={send}
      />
      <CarryLayer onDrop={handleCarryDrop} />
    </>
  )
}
