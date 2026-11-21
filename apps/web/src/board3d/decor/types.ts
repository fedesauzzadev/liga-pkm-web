// Tipos compartidos del catálogo de piezas (SPEC-H/T-068).
/** Paleta de decor.json (record de colores hex). */
export type PiecePalette = Record<string, string>

/** Especificación de una pieza: campos de decor.json que afectan la forma. */
export interface PieceSpec {
  readonly kind: string
  /** tree: 'pine' | 'round'. */
  readonly variant?: 'pine' | 'round' | undefined
  readonly wall?: string | undefined
  readonly roof?: string | undefined
  readonly flag?: string | undefined
  readonly glow?: string | undefined
  /** fence: largo total. */
  readonly length?: number | undefined
  readonly text?: string | undefined
  /** pond/lavaPool: radio. */
  readonly radius?: number | undefined
}

/** Color de la paleta con fallback (los defaults del borrador de decor.json). */
export const pal = (palette: PiecePalette, key: string, fallback: string): string =>
  palette[key] ?? fallback
