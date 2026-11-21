import { defineConfig } from 'vite'
import { adminCardsPlugin } from './src/admin/server.ts'
import { modelsDevPlugin } from './src/dev/models-server.ts'

// ADR-8: three/R3F/drei viven SOLO en el chunk `board3d`, que se carga con
// import() al entrar a la partida. El JS inicial mantiene su presupuesto.
const isBoard3D = (id: string): boolean =>
  id.includes('/board3d/') ||
  id.includes('/theme/board3d') ||
  /[\\/](three|three-stdlib|@react-three|troika-three-text|troika-worker-utils|maath|@use-gesture|camera-controls|biso)[\\/]/.test(
    id,
  )

export default defineConfig({
  plugins: [adminCardsPlugin(), modelsDevPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (isBoard3D(id) ? 'board3d' : undefined),
      },
    },
  },
})
