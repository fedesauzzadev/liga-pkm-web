// Easings del adaptador Showdown: mismos significados que jQuery + las curvas propias de
// pokemon-showdown-client (battle-animations.ts, Object.assign($.easing, {...}) y posT()).
export type Easing =
  | 'linear'
  | 'swing'
  | 'accel'
  | 'decel'
  | 'ballistic'
  | 'ballistic2'
  | 'ballistic2Back'
  | 'ballistic2Under'

export type EaseFn = (t: number) => number

export const linear: EaseFn = (t) => t
// jQuery swing (default): 0.5 - cos(t·π)/2.
export const swing: EaseFn = (t) => 0.5 - Math.cos(Math.PI * t) / 2
// PS quadDown = t² (arranca lento) y quadUp = 1-(1-t)² (arranca rápido).
export const quadDown: EaseFn = (t) => t * t
export const quadUp: EaseFn = (t) => 1 - (1 - t) * (1 - t)
// PS ballisticUp = -3t²+4t (salto) y su inverso para caer.
export const ballisticUp: EaseFn = (t) => -3 * t * t + 4 * t
export const ballisticDown: EaseFn = (t) => {
  const u = 1 - t
  return 1 - (-3 * u * u + 4 * u)
}

export interface AxisEase {
  readonly h: EaseFn
  readonly v: EaseFn
}

// Mapeo de posT() de Showdown: qué curva se aplica a cada eje según la transición.
// movesUp = el destino queda más arriba (top menor); toBack = el z del destino es > 0.
export function axisEasings(transition: Easing | undefined, movesUp: boolean, toBack: boolean): AxisEase {
  switch (transition) {
    case undefined:
    case 'swing':
      return { h: swing, v: swing }
    case 'accel':
      return { h: quadDown, v: quadDown }
    case 'decel':
      return { h: quadUp, v: quadUp }
    case 'ballistic':
      return { h: linear, v: movesUp ? ballisticUp : ballisticDown }
    case 'ballistic2':
      return { h: linear, v: movesUp ? quadUp : quadDown }
    case 'ballistic2Back':
      return { h: linear, v: toBack ? quadUp : quadDown }
    case 'ballistic2Under':
      return { h: linear, v: movesUp ? quadDown : quadUp }
    case 'linear':
      return { h: linear, v: linear }
  }
}
