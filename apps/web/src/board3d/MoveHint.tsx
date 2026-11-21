// "Movés N casilleros" (SPEC-G/T-065/AC-5): aviso DOM del tablero 3D con el
// valor del dado de movimiento (T-092: el dado vive en panel-dice; el motor
// lo dicta y PlayScreen lo enruta como moveHintValue). Vive fuera del Canvas
// y no bloquea nada (NO-VISION: verificación por data-testid/texto).
import type { ReactNode } from 'react'
import { es } from '../i18n/es'
import type { DieValue } from '../board/Die3D'
import styles from './board3d.module.css'

export function moveHintText(value: DieValue): string {
  return value === 1
    ? es.board3dMoveHintOne
    : es.board3dMoveHint.replace('{n}', String(value))
}

export function MoveHint({ value }: { readonly value: DieValue | null }): ReactNode {
  if (value === null) return null
  return (
    <p className={styles.moveHint} data-testid="move-hint" role="status">
      {moveHintText(value)}
    </p>
  )
}
