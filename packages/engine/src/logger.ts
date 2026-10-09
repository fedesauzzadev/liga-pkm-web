// Logger inyectado en ctx (ENGINEERING-STANDARDS §5): el motor no imprime;
// registra comandos, eventos y dados en el logger que le den (SPEC-A/T-006/AC-7).
import type { Command } from './commands.ts'
import type { DieRolled, GameEvent } from './events.ts'

export interface Logger {
  command(command: Command): void
  events(events: readonly GameEvent[]): void
  die(die: DieRolled): void
}

/** Default: descarta todo (producción o cuando a nadie le interesa). */
export const NoopLogger: Logger = {
  command: () => undefined,
  events: () => undefined,
  die: () => undefined,
}

export type LogRecord =
  | { readonly kind: 'command'; readonly command: Command }
  | { readonly kind: 'events'; readonly events: readonly GameEvent[] }
  | { readonly kind: 'die'; readonly die: DieRolled }

export interface MemoryLogger extends Logger {
  readonly records: readonly LogRecord[]
}

/** Para tests y el panel de debug (T-030 lo conecta a la UI). */
export function createMemoryLogger(): MemoryLogger {
  const records: LogRecord[] = []
  return {
    records,
    command: (command) => {
      records.push({ kind: 'command', command })
    },
    events: (events) => {
      records.push({ kind: 'events', events: [...events] })
    },
    die: (die) => {
      records.push({ kind: 'die', die })
    },
  }
}
