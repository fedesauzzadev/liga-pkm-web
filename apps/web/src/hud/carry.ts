// Carry (SPEC-I/T-073/AC-1, AC-4): estado global de la carta "en mano" que la
// mochila arrastrra/selecciona y los slots del equipo consumen. Vive afuera de
// los componentes para que el drag cruce paneles (mochila ↔ equipo) sin acoplar
// GameShell al juego. Sin lógica de reglas: solo transporte (ADR-1).
import { create } from 'zustand'
import type { DragPayload, DropTarget } from './backpack'
import { samePayload } from './backpack'

export interface CarriedItem {
  readonly payload: DragPayload
  readonly mode: 'drag' | 'select'
}

export interface CarryState {
  readonly carried: CarriedItem | null
  /** Última posición del puntero durante un drag (el ghost la sigue, AC-1). */
  readonly pointer: { readonly x: number; readonly y: number } | null
  /** Dónde arrancó el drag: umbral tap (<6px) ⇒ seleccionar (AC-4). */
  readonly origin: { readonly x: number; readonly y: number } | null
  /** Nonce de rechazo: la mochila sacude la fila al volver (AC-3). */
  readonly rejected: number
  /** Pedido de "tocar destino" con una carta seleccionada (AC-4). */
  readonly tap: { readonly target: DropTarget; readonly nonce: number } | null
  readonly startDrag: (payload: DragPayload, x: number, y: number) => void
  readonly move: (x: number, y: number) => void
  readonly select: (payload: DragPayload) => void
  readonly convertToSelect: () => void
  readonly end: () => void
  readonly reject: () => void
  readonly tapTarget: (target: DropTarget) => void
  readonly clearTap: () => void
}

export const DRAG_THRESHOLD_PX = 6

export const useCarryStore = create<CarryState>((set, get) => ({
  carried: null,
  pointer: null,
  origin: null,
  rejected: 0,
  tap: null,
  startDrag: (payload, x, y) => set({ carried: { payload, mode: 'drag' }, pointer: { x, y }, origin: { x, y }, tap: null }),
  move: (x, y) => set({ pointer: { x, y } }),
  select: (payload) => {
    const current = get().carried
    set({
      carried:
        current !== null && current.mode === 'select' && samePayload(current.payload, payload)
          ? null
          : { payload, mode: 'select' },
    })
  },
  convertToSelect: () => {
    const current = get().carried
    if (current === null || current.mode !== 'drag') return
    set({ carried: { payload: current.payload, mode: 'select' }, pointer: null, origin: null })
  },
  end: () => set({ carried: null, pointer: null, origin: null }),
  reject: () => set((state) => ({ rejected: state.rejected + 1 })),
  tapTarget: (target) => set((state) => ({ tap: { target, nonce: state.tap === null ? 1 : state.tap.nonce + 1 } })),
  clearTap: () => set({ tap: null }),
}))

/** Acceso imperativo (handlers de pointer/teclado, sin re-render). */
export const carryOf = (): CarryState => useCarryStore.getState()

/**
 * Carried actual: del store en la app; `override` lo fija desde afuera (SSR
 * proxy: renderToString lee el snapshot inicial del store, no los setState).
 */
export function useCarried(override?: CarriedItem | null): CarriedItem | null {
  const fromStore = useCarryStore((store) => store.carried)
  return override === undefined ? fromStore : override
}

let clickSuppressed = false

/** Tras un drag real, el click sintético posterior no debe abrir fichas. */
export const suppressClick = (): void => {
  clickSuppressed = true
  setTimeout(() => {
    clickSuppressed = false
  }, 0)
}

export const isClickSuppressed = (): boolean => clickSuppressed

/** Resetea el store entre tests. */
export const resetCarryForTests = (): void =>
  useCarryStore.setState({ carried: null, pointer: null, origin: null, rejected: 0, tap: null })
