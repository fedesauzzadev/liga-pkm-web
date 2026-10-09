import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.{ts,tsx}',
    ],
    // La suite tiene archivos pesadísimos (property 1000×200, selftests que
    // corren pnpm lint/depcruise/size/bench): en paralelo el hilo principal se
    // satura y el RPC del worker (onTaskUpdate) expira y tumba la corrida. Un
    // archivo a la vez es estable y no relaja ninguna regla de calidad.
    fileParallelism: false,
    // Q-019: con contención de CPU del sistema, el reporter default (una línea
    // por test en el hilo principal) seguía bloqueando el loop y expirando el
    // RPC del worker al cierre. `dot` corre los MISMOS tests con menos trabajo
    // de render; ver detalle: `npx vitest run <file>`.
    reporters: ['dot'],
  },
})
