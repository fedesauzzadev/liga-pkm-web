// SPEC-E/T-040 — vista previa de FX de un ataque en edición: mini-escena con
// sprites (por dex si hay manifest) y playMoveFx con {officialMove, fx, element}.
// Nunca lanza ni decide resultados (FX-ADAPTER); si faltan assets, placeholders.
// Escala fija 0.5 de la escena 640×360 del shim (contrato data-fx-stage).
import { useEffect, useRef, useState } from 'react'
import { playMoveFx, setShowdownAdapter, type MoveFxAttack } from '../fx/playMoveFx'
import { createShowdownFxAdapter } from '../fx/showdown/adapter.ts'
import { createWebHost, wrapDomElement } from '../fx/showdown/webHost.ts'
import type { FxDomNode } from '../fx/fxDom.ts'
import { es } from '../i18n/es'
import styles from './cards-admin.module.css'

type SpritesManifest = Record<string, { front: string | null; back: string | null } | undefined>
type FxManifest = Record<string, string>

/** Defensor de ejemplo para la preview (Squirtle, como los fixtures del manual). */
const PREVIEW_DEF_DEX = 7

export function FxPreview({
  name,
  dex,
  attack,
  trigger,
}: {
  readonly name: string
  readonly dex: number | null
  readonly attack: MoveFxAttack
  readonly trigger: number
}) {
  const [sprites, setSprites] = useState<SpritesManifest | null>(null)
  const [playing, setPlaying] = useState(false)
  const layerRef = useRef<HTMLDivElement | null>(null)
  const atkRef = useRef<HTMLDivElement | null>(null)
  const defRef = useRef<HTMLDivElement | null>(null)
  const attackRef = useRef(attack)
  attackRef.current = attack

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [fx, s] = await Promise.all([
          fetch('/fx/fx.json').then((r) => (r.ok ? r.json() : null)),
          fetch('/sprites/sprites.json').then((r) => (r.ok ? r.json() : null)),
        ])
        if (!alive) return
        setSprites(s as SpritesManifest | null)
        if (fx !== null) {
          // Eslabón 1 de FX-ADAPTER si hay assets; si no, solo arquetipos.
          setShowdownAdapter(
            createShowdownFxAdapter({
              manifest: fx as FxManifest,
              hostOf: (layer) =>
                createWebHost({ fx: layer as unknown as HTMLElement, bg: layer as unknown as HTMLElement }),
              wrap: (node) => wrapDomElement(node as unknown as HTMLElement),
            }),
          )
        }
      } catch {
        if (alive) setSprites(null)
      }
    })()
    return () => {
      alive = false
      setShowdownAdapter(null)
    }
  }, [])

  // `trigger` cambia cuando el usuario pide la preview (tecla f o botón).
  useEffect(() => {
    if (trigger === 0) return
    const layer = layerRef.current
    const atk = atkRef.current
    const def = defRef.current
    if (layer === null || atk === null || def === null || playing) return
    setPlaying(true)
    void (async () => {
      try {
        const attack = attackRef.current
        await playMoveFx(attack, {
          attacker: atk as unknown as FxDomNode,
          defender: def as unknown as FxDomNode,
          layer: layer as unknown as FxDomNode,
          ...(attack.element !== undefined ? { element: attack.element } : {}),
          speed: 1,
        })
      } finally {
        setPlaying(false)
      }
    })()
  }, [trigger, playing])

  const atkUrl = dex === null ? null : sprites?.[String(dex)]?.back ?? null
  const defUrl = sprites?.[String(PREVIEW_DEF_DEX)]?.front ?? null

  return (
    <div className={styles.fxPreview}>
      <div className={styles.fxViewport}>
        <div className={styles.fxStage}>
          <div className={styles.fxSprite} data-testid="admin-fx-atk" ref={atkRef}>
            {atkUrl === null ? (
              <span className={styles.fxCard}>{name}</span>
            ) : (
              <img className={styles.fxImg} src={atkUrl} alt={name} />
            )}
          </div>
          <div className={`${styles.fxSprite} ${styles.fxDef}`} data-testid="admin-fx-def" ref={defRef}>
            {defUrl === null ? (
              <span className={styles.fxCard}>Rival</span>
            ) : (
              <img className={styles.fxImg} src={defUrl} alt="Rival" />
            )}
          </div>
          <div className={styles.fxLayer} data-fx-stage="showdown" ref={layerRef} />
        </div>
      </div>
      <span className={styles.fxNote}>{playing ? es.adminFxPlaying : es.adminFxHint}</span>
    </div>
  )
}
