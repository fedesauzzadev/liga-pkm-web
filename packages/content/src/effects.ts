// Efectos: unión discriminada por `op`. Canónicos de `docs/EFFECTS.md` §1 (24 primitivas).
// Regla dura: NO se agregan primitivas sin ER aprobado (docs/effect-requests/ER-xxx.md).
import { z } from 'zod'

export const FaceSchema = z.number().int().min(1).max(6)
export type Face = z.infer<typeof FaceSchema>

export const FacesSchema = z.array(FaceSchema).min(1)
export type Faces = z.infer<typeof FacesSchema>

export const DurationSchema = z.enum(['nextTurn', 'combat'])
export type Duration = z.infer<typeof DurationSchema>
// 'combat' = hasta que el PKM afectado sea retirado o derrotado

export const TargetSchema = z.enum(['rival', 'self'])
export type Target = z.infer<typeof TargetSchema>

const int = z.number().int()
const failOutcome = z.enum(['noAttack', 'selfHit'])

/** EFFECTS §1: todo efecto aplicado admite `onRoll?: Faces` (solo aplica si el
 * dado de efecto cae en esas caras). */
const onRoll = { onRoll: FacesSchema.optional() } as const

export const EffectSchema = z.discriminatedUnion('op', [
  // ── Daño
  z.object({ op: z.literal('bonusPerRoll'), faces: FacesSchema, amount: int, ...onRoll }),
  z.object({ op: z.literal('fixedRolls'), rolls: z.union([z.literal(2), z.literal(3)]), faces: FacesSchema, amount: int, ...onRoll }),
  z.object({ op: z.literal('nextAttackBonus'), amount: int, ...onRoll }),
  z.object({ op: z.literal('bonusPerSelfDamage'), faces: FacesSchema, amount: int, per: int.positive(), ...onRoll }),
  z.object({ op: z.literal('selfBoost'), amount: int, max: z.literal(1).optional(), ...onRoll }),
  // ── Modificadores de daño
  z.object({ op: z.literal('modifyRivalDamage'), amount: int, duration: DurationSchema, max: z.literal(1).optional(), ...onRoll }),
  z.object({
    op: z.literal('flatReduction'),
    amount: int,
    max: z.literal(1).optional(),
    versus: z.enum(['any', 'special']).optional(),
    target: TargetSchema.optional(),
    duration: DurationSchema.optional(),
    ...onRoll,
  }),
  // ── Control de la tirada del rival
  z.object({ op: z.literal('rivalSkipsAttack'), faces: FacesSchema.optional(), ...onRoll }),
  z.object({ op: z.literal('rivalSleep'), faces: FacesSchema.optional(), wakeFaces: FacesSchema, ...onRoll }),
  z.object({ op: z.literal('rollGate'), failFaces: FacesSchema, outcome: failOutcome, duration: DurationSchema, ...onRoll }),
  // ── Vida
  z.object({ op: z.literal('poison'), amount: int, ...onRoll }),
  z.object({ op: z.literal('drainNow'), amount: int, ...onRoll }),
  z.object({ op: z.literal('drainEachTurn'), amount: int, ...onRoll }),
  z.object({ op: z.literal('healSelf'), amount: int, ...onRoll }),
  z.object({ op: z.literal('selfDamage'), amount: int, ...onRoll }),
  // ── Encadenados
  z.object({ op: z.literal('attackAgain'), faces: FacesSchema, ...onRoll }),
  z.object({ op: z.literal('quickAttack'), faces: FacesSchema, attackId: z.string().min(1), requires: z.literal('damaged'), ...onRoll }),
  // ── Pasivas (especialidades) o habilidades
  z.object({ op: z.literal('startsFirst'), ...onRoll }),
  z.object({ op: z.literal('defendGate'), failFaces: FacesSchema, outcome: failOutcome, ...onRoll }),
  z.object({ op: z.literal('dodge'), faces: FacesSchema, ...onRoll }),
  z.object({ op: z.literal('rest'), wakeFaces: FacesSchema, ...onRoll }),
  z.object({ op: z.literal('transform'), ...onRoll }),
  z.object({ op: z.literal('disableRandomAttack'), max: z.literal(1).optional(), ...onRoll }),
  // Última opción; requiere ER aprobado. El validador cuenta cuántos hay (digest).
  z.object({ op: z.literal('custom'), handler: z.string().min(1), rawText: z.string().optional(), ...onRoll }),
])
export type Effect = z.infer<typeof EffectSchema>
export type EffectOp = Effect['op']
