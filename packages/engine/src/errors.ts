// Errores tipados del motor (ENGINEERING-STANDARDS §5: nunca se tragan en silencio).
export type EngineErrorCode =
  | 'PENDING_DECISION'
  | 'ILLEGAL_COMMAND'
  | 'INVARIANT_VIOLATED'
  | 'INVALID_SETUP'
  | 'INVALID_CONTENT'

export class EngineError extends Error {
  readonly code: EngineErrorCode

  constructor(code: EngineErrorCode, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }
