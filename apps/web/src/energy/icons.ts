// Íconos de energía (SPEC-F/T-047): los 16 SVG originales de
// apps/web/src/assets/energy se importan como URL para que Vite los hashee
// (docs/ENERGY-ICONS.md). Nombres y colores canónicos salen de
// content/energy.json validado con Zod en la frontera (patrón de game/content.ts).
import type { Element, EnergyType } from '@liga/content'
import { EnergyFileSchema } from '@liga/content'
import energyJson from '../../../../content/energy.json'
import bug from '../assets/energy/bug.svg?url'
import dragon from '../assets/energy/dragon.svg?url'
import electric from '../assets/energy/electric.svg?url'
import fighting from '../assets/energy/fighting.svg?url'
import fire from '../assets/energy/fire.svg?url'
import flying from '../assets/energy/flying.svg?url'
import ghost from '../assets/energy/ghost.svg?url'
import grass from '../assets/energy/grass.svg?url'
import ground from '../assets/energy/ground.svg?url'
import ice from '../assets/energy/ice.svg?url'
import multicolor from '../assets/energy/multicolor.svg?url'
import normal from '../assets/energy/normal.svg?url'
import poison from '../assets/energy/poison.svg?url'
import psychic from '../assets/energy/psychic.svg?url'
import rock from '../assets/energy/rock.svg?url'
import water from '../assets/energy/water.svg?url'

/** Tipos dibujables: los 15 elementos + la carta Multicolor (D-23). */
export type EnergyIconType = Element | 'multicolor'

export const ENERGY_ICON_SIZES = [16, 24, 32, 48] as const
export type EnergyIconSize = (typeof ENERGY_ICON_SIZES)[number]

export const energyFile = EnergyFileSchema.parse(energyJson)

/** Tipos con carta de energía (normal/dragon no tienen, D-24). */
export const energyTypes: readonly EnergyType[] = energyFile.types

const ICON_URLS: Readonly<Record<EnergyIconType, string>> = {
  normal,
  fire,
  water,
  grass,
  electric,
  psychic,
  fighting,
  poison,
  ground,
  flying,
  bug,
  ghost,
  ice,
  rock,
  dragon,
  multicolor,
}

const LABELS = new Map<EnergyIconType, string>(
  energyFile.types.map((type): [EnergyIconType, string] => [type.id, type.es]),
)
LABELS.set(energyFile.multicolor.id, energyFile.multicolor.es)

/** Nombre en español desde energy.json (AC-1). */
export const energyLabel = (type: EnergyIconType): string => LABELS.get(type) ?? type

export const energyIconUrl = (type: EnergyIconType): string => ICON_URLS[type]
