// Hook del arte de la carta (SPEC-U/T-105/AC-4/AC-5): mide la caja `.art` con
// un ref (no se asume) y en `onLoad` del sprite aplica `fitSprite` como tamaño
// inline. Antes de medir (SSR/primer paint) no hay tamaño inline: rige el
// fallback CSS (max-width/max-height 100%, contain) y no hay salto de layout.
import { useEffect, useRef, useState, type RefObject, type SyntheticEvent } from 'react'
import { fitSprite, type SpriteFitScale, type SpriteSize } from './spriteFit'

/** Lo que se mide del <img> al cargar (HTMLImageElement lo satisface). */
export interface MeasuredImage {
  readonly naturalWidth: number
  readonly naturalHeight: number
}

/** Lo que se mide de la caja .art con el ref (HTMLElement lo satisface). */
export interface MeasuredBox {
  readonly clientWidth: number
  readonly clientHeight: number
}

/** onLoad puro (testeable sin DOM): null si no hay caja o el sprite no midió. */
export function onArtImageLoad(
  img: MeasuredImage,
  box: MeasuredBox | null,
  cfg: SpriteFitScale,
): SpriteSize | null {
  if (box === null || img.naturalWidth <= 0 || img.naturalHeight <= 0) return null
  return fitSprite(
    { width: img.naturalWidth, height: img.naturalHeight },
    { width: box.clientWidth, height: box.clientHeight },
    cfg,
  )
}

export interface ArtFit {
  readonly artRef: RefObject<HTMLDivElement | null>
  readonly size: SpriteSize | null
  readonly onImgLoad: (event: SyntheticEvent<HTMLImageElement>) => void
}

/**
 * `resetKey` = artUrl: al cambiar de sprite se descarta la medida vieja hasta
 * que el nuevo dispare su onLoad (fallback CSS en el interín).
 */
export function useArtFit(cfg: SpriteFitScale, resetKey: string): ArtFit {
  const artRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<SpriteSize | null>(null)
  useEffect(() => {
    setSize(null)
  }, [resetKey])
  return {
    artRef,
    size,
    onImgLoad: (event) => {
      const next = onArtImageLoad(event.currentTarget, artRef.current, cfg)
      if (next !== null) setSize(next)
    },
  }
}
