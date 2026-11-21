# brain/index
Orquestador: sesión principal. Una sesión limpia por nodo, en su worktree/rama. El orquestador integra por tanda y corre `pnpm verify`.

| Nodo | Título | Tanda | Depende | Estado |
|---|---|---|---|---|
| N-0001 | Cámara "Centrar en mí" | 1 | — | planned |
| N-0003 | Ficha distinguible | 1 | — | planned |
| N-0005 | Combate ampliado + tip F11 | 1 | — | planned |
| N-0006 | Bugs chicos HUD/título | 1 | — | planned |
| N-0002 | Oclusión de edificios | 2 | N-0001 | planned |
| N-0004 | Vista general | 2 | N-0001 | planned |
| N-0007 | Animación de ataque + dado | 2 | N-0005 | planned |

Tanda 3 (sin nodo todavía): pulido de HUD y setup; cierre de tareas REVIEW del backlog mirándolas; T-113 split de archivos > 400 líneas.
Paralelo = mismo número de tanda (archivos `owns` disjuntos). Secuencial = `depends_on`.
