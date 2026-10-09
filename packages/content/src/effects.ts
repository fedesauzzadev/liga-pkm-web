// Efectos: unión discriminada por `op`. Canónicos de `docs/EFFECTS.md` §1 (22 primitivas).
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

export const EffectSchema = z.discriminatedUnion('op', [
  // ── Daño
  z.object({ op: z.literal('bonusPerRoll'), faces: FacesSchema, amount: int }),
  z.object({ op: z.literal('bonusPerSelfDamage'), faces: FacesSchema, amount: int, per: int.positive() }),
  z.object({ op: z.literal('selfBoost'), amount: int, max: z.literal(1).optional() }),
  // ── Modificadores de daño
  z.object({ op: z.literal('modifyRivalDamage'), amount: int, duration: DurationSchema, max: z.literal(1).optional() }),
  z.object({
    op: z.literal('flatReduction'),
    amount: int,
    max: z.literal(1).optional(),
    versus: z.enum(['any', 'special']).optional(),
    target: TargetSchema.optional(),
    duration: DurationSchema.optional(),
  }),
  // ── Control de la tirada del rival
  z.object({ op: z.literal('rivalSkipsAttack'), faces: FacesSchema.optional() }),
  z.object({ op: z.literal('rivalSleep'), faces: FacesSchema.optional(), wakeFaces: FacesSchema }),
  z.object({ op: z.literal('rollGate'), failFaces: FacesSchema, outcome: failOutcome, duration: DurationSchema }),
  // ── Vida
  z.object({ op: z.literal('poison'), amount: int }),
  z.object({ op: z.literal('drainNow'), amount: int }),
  z.object({ op: z.literal('drainEachTurn'), amount: int }),
  z.object({ op: z.literal('healSelf'), amount: int }),
  z.object({ op: z.literal('selfDamage'), amount: int }),
  // ── Encadenados
  z.object({ op: z.literal('attackAgain'), faces: FacesSchema }),
  z.object({ op: z.literal('quickAttack'), faces: FacesSchema, attackId: z.string().min(1), requires: z.literal('damaged') }),
  // ── Pasivas (especialidades) o habilidades
  z.object({ op: z.literal('startsFirst') }),
  z.object({ op: z.literal('defendGate'), failFaces: FacesSchema, outcome: failOutcome }),
  z.object({ op: z.literal('dodge'), faces: FacesSchema }),
  z.object({ op: z.literal('rest'), wakeFaces: FacesSchema }),
  z.object({ op: z.literal('transform') }),
  z.object({ op: z.literal('disableRandomAttack'), max: z.literal(1).optional() }),
  // Última opción; requiere ER aprobado. El validador cuenta cuántos hay (digest).
  z.object({ op: z.literal('custom'), handler: z.string().min(1), rawText: z.string().optional() }),
])
export type Effect = z.infer<typeof EffectSchema>
export type EffectOp = Effect['op']
