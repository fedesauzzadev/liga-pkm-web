import { useEffect, useState } from 'react'

export interface SpriteEntry {
  readonly front: string | null
  readonly back: string | null
}
export type SpritesManifest = Record<string, SpriteEntry | undefined>

export interface TrainerEntry {
  readonly front: string | null
}
export type TrainersManifest = Record<string, TrainerEntry | undefined>

const isSpriteEntry = (value: unknown): value is SpriteEntry => {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const front = record['front']
  const back = record['back']
  return (front === null || typeof front === 'string') && (back === null || typeof back === 'string')
}

export const isSpritesManifest = (value: unknown): value is SpritesManifest =>
  typeof value === 'object' && value !== null && Object.values(value).every(isSpriteEntry)

const isTrainerEntry = (value: unknown): value is TrainerEntry => {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const front = record['front']
  return front === null || typeof front === 'string'
}

export const isTrainersManifest = (value: unknown): value is TrainersManifest =>
  typeof value === 'object' && value !== null && Object.values(value).every(isTrainerEntry)

/** medalla-gimnasio/AC-3: manifest de insignias {medal → ruta servida}. */
export type BadgesManifest = Record<string, string>

export const isBadgesManifest = (value: unknown): value is BadgesManifest =>
  typeof value === 'object' && value !== null && Object.values(value).every((v) => typeof v === 'string')

export const spriteUrl = (
  manifest: SpritesManifest | null | undefined,
  dex: number,
  side: 'front' | 'back',
): string | null => manifest?.[String(dex)]?.[side] ?? null

export const trainerUrl = (
  manifest: TrainersManifest | null | undefined,
  sdId: string,
): string | null => manifest?.[sdId]?.front ?? null

export function useSprites(): {
  sprites: SpritesManifest | null
  trainers: TrainersManifest | null
} {
  const [sprites, setSprites] = useState<SpritesManifest | null>(null)
  const [trainers, setTrainers] = useState<TrainersManifest | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [sRes, tRes] = await Promise.all([
          fetch('/sprites/sprites.json'),
          fetch('/sprites/trainers.json'),
        ])

        if (alive) {
          if (sRes.ok) {
            const sJson: unknown = await sRes.json()
            if (isSpritesManifest(sJson)) setSprites(sJson)
          }
          if (tRes.ok) {
            const tJson: unknown = await tRes.json()
            if (isTrainersManifest(tJson)) setTrainers(tJson)
          }
        }
      } catch {
        // Sin assets: fallback visual
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  return { sprites, trainers }
}

/** medalla-gimnasio/AC-4: insignias de gimnasio (badges.json); sin red o sin
 * manifest queda null y el overlay usa el disco CSS de respaldo. */
export function useBadges(): BadgesManifest | null {
  const [badges, setBadges] = useState<BadgesManifest | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/badges/badges.json')
        if (alive && res.ok) {
          const json: unknown = await res.json()
          if (isBadgesManifest(json)) setBadges(json)
        }
      } catch {
        // Sin assets: fallback visual
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  return badges
}
