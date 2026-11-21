# Parche 3: tablero jugable + tablero 3D
1. Descomprimilo encima del proyecto (aceptá reemplazar).
2. `node tools/merge-backlog.mjs` (conserva tus estados; agrega T-060…T-066).
3. En opencode: `/diagnostica tablero`  →  `/ejecuta T-061`  →  `/ejecuta T-062` … `T-066`.
4. Dependencias nuevas (three, @react-three/fiber, @react-three/drei, @types/three): aprobadas por docs/adr/ADR-8-board-3d.md, solo dentro del chunk 3D.
