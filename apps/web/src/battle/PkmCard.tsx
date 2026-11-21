// Carta TCG de combate (rediseno-combate-max/AC-4): tamaño exterior FIJO
// 340×540 y grilla interna proporcional (encabezado 11 %, arte 30 %, ataques
// 50 % divididos en partes iguales entre 1-4 ataques, pie 9 %). El texto se
// adapta (useFitText hasta 14 px de diseño; el resumen de efecto es de tamaño
// fijo con 2 líneas + elipsis): la forma NUNCA cambia; seleccionar ataque,
// cambiar HP o estados solo realza con contorno. Sin "EFECTO"/"Usar" dentro
// de la carta (viven en battle-actions, AC-5) y sin "(0)" en filas sin daño
// (AC-3).
import { useRef, type CSSProperties } from 'react'
import type { Face } from '@liga/content'
import type { PokemonCard } from '@liga/engine'
import { CostIcons, ElementIcon } from './icons'
import { damageLabel, facesLabel, type AttackRowState } from './model'
import { useFitText } from './useFitText'
import styles from './PkmCard.module.css'

export interface PkmCardProps {
  readonly card: PokemonCard
  readonly damage: number
  /** Sprite estático del manifest; null ⇒ tarjeta con el nombre. */
  readonly artUrl: string | null
  readonly mode: 'own' | 'rival'
  /** Filas con legalidad (modo propio); se calculan con `attackRows` desde la escena. */
  readonly rows?: readonly AttackRowState[]
  /** Realce de la fila elegida: SOLO contorno (AC-4). */
  readonly selectedAttackId?: string | null
  readonly litAttackId?: string | null
  readonly litValue?: Face | null
  readonly raised?: boolean
  /** Aviso sobre la carta (p. ej. "no ataca" del rival). */
  readonly notice?: string | null
}

/** Fila de la zona de ataques: caras + nombre + daño (si hay) + costo y UNA
 * línea de resumen de efecto de tamaño fijo (la caja nunca crece). */
function AttackRow({
  row,
  selected,
  lit,
  litValue,
}: {
  readonly row: AttackRowState
  readonly selected: boolean
  readonly lit: boolean
  readonly litValue: Face | null
}) {
  const label = damageLabel(row.attack)
  const state = !row.legal ? 'disabled' : selected ? 'selected' : 'normal'
  return (
    <li
      className={styles.attackItem}
      data-testid="card-attack-row"
      data-state={state}
      data-lit={lit ? 'true' : undefined}
    >
      <div className={styles.attackLine}>
        <span className={styles.faces}>{facesLabel(row.attack.rollFaces)}_</span>
        <span
          className={`${styles.attackName} ${row.attack.kind === 'ability' ? styles.ability : ''}`}
        >
          {row.attack.kind === 'ability' ? `"${row.attack.name}"` : row.attack.name}
        </span>
        {label.length > 0 ? <span className={styles.damage}>{label}</span> : null}
        <CostIcons slots={row.attack.cost} />
        {lit && litValue !== null ? <span className={styles.litChip}>{litValue}</span> : null}
      </div>
      <p className={styles.effectSummary} data-empty={row.attack.rawText.length === 0 ? 'true' : undefined}>
        {row.attack.rawText}
      </p>
    </li>
  )
}

export function PkmCard({
  card,
  damage,
  artUrl,
  mode,
  rows,
  selectedAttackId = null,
  litAttackId = null,
  litValue = null,
  raised = false,
  notice = null,
}: PkmCardProps) {
  const current = Math.max(0, card.hp - damage)
  const ownRows: readonly AttackRowState[] =
    rows ?? card.attacks.map((attack) => ({ attack, legal: true, reason: null }))
  const nameRef = useRef<HTMLHeadingElement | null>(null)
  const nameFit = useFitText(nameRef, { base: 18, min: 14 })

  return (
    <article
      className={styles.card}
      data-deck={card.deck}
      data-mode={mode}
      data-raised={raised ? 'true' : undefined}
    >
      <header className={styles.header}>
        <h3
          className={styles.name}
          ref={nameRef}
          style={{ fontSize: `${String(nameFit.fontSize)}px` } as CSSProperties}
        >
          {card.name}
        </h3>
        <ElementIcon element={card.element} />
        <span className={styles.hp} data-hp={`${current}/${card.hp}`}>
          {current}/{card.hp}
        </span>
      </header>

      <div className={styles.art}>
        {artUrl === null ? (
          <div className={styles.artFallback} data-missing="true">
            {card.name}
          </div>
        ) : (
          <img className={styles.artImg} src={artUrl} alt={card.name} />
        )}
      </div>

      <ul
        className={styles.attacks}
        data-count={String(ownRows.length)}
        style={{ gridTemplateRows: `repeat(${String(Math.min(4, Math.max(1, ownRows.length)))}, 1fr)` }}
      >
        {ownRows.map((row) => (
          <AttackRow
            key={row.attack.id}
            row={row}
            selected={row.attack.id === selectedAttackId}
            lit={row.attack.id === litAttackId}
            litValue={row.attack.id === litAttackId ? litValue : null}
          />
        ))}
      </ul>

      <footer className={styles.footer}>
        {notice !== null ? <span className={styles.notice}>{notice}</span> : null}
      </footer>
    </article>
  )
}
