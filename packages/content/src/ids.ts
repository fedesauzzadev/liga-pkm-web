// Ids con marca (ENGINEERING-STANDARDS §2): CardId ≠ NodeId ≠ PkmUid ≠ PlayerId.
// Mezclar dos tipos de id es un error de compilación, no un bug en runtime.
import { z } from 'zod'

export const CardIdSchema = z.string().min(1).brand<'CardId'>()
export type CardId = z.infer<typeof CardIdSchema>
export function parseCardId(raw: string): CardId {
  return CardIdSchema.parse(raw)
}

export const NodeIdSchema = z.string().min(1).brand<'NodeId'>()
export type NodeId = z.infer<typeof NodeIdSchema>
export function parseNodeId(raw: string): NodeId {
  return NodeIdSchema.parse(raw)
}

export const PkmUidSchema = z.string().min(1).brand<'PkmUid'>()
export type PkmUid = z.infer<typeof PkmUidSchema>
export function parsePkmUid(raw: string): PkmUid {
  return PkmUidSchema.parse(raw)
}

export const PlayerIdSchema = z.string().min(1).brand<'PlayerId'>()
export type PlayerId = z.infer<typeof PlayerIdSchema>
export function parsePlayerId(raw: string): PlayerId {
  return PlayerIdSchema.parse(raw)
}
