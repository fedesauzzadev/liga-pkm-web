# brain/index
Orquestador: sesión principal. Una sesión limpia por nodo, en su worktree/rama. El orquestador integra por tanda y corre `pnpm verify`.

| Nodo | Título | Tanda | Depende | Estado |
|---|---|---|---|---|
| N-0001 | Cámara "Centrar en mí" | 1 | — | verified |
| N-0003 | Ficha distinguible | 1 | — | verified |
| N-0005 | Combate ampliado + tip F11 | 1 | — | verified |
| N-0006 | Bugs chicos HUD/título | 1 | — | verified |
| N-0002 | Oclusión de edificios | 2b | N-0001, N-0008 | planned |
| N-0004 | Vista general | 2 | N-0001 | implemented (AC-3 pasa a N-0009; AC-4 parcial) |
| N-0007 | Animación de ataque + dado | 2 | N-0005 | verified |
| N-0008 | Textura del inicial en la ficha | 2 | — | verified |
| N-0009 | Etiquetas fuera de la barra de cámara | 2b | N-0004 | planned |
| N-0010 | Luz, sombras reales y tone mapping | arte | — | verified |
| N-0011 | Terreno y biomas: 5 zonas con forma propia y agua real | arte | N-0010 | verified |
| N-0012 | Caminos, casilleros y mazos con color pleno | arte | N-0011 | verified |
| N-0013 | Sombras estáticas (rendimiento); gimnasio por ciudad descartado | arte | N-0010 | verified |
| N-0014 | Vegetación por bioma: bosque verde y denso | arte | N-0011 | verified |

Tanda 3 (sin nodo todavía): conectar las animaciones de Showdown a BattleScene (grande, dividir); pulido de HUD y setup; cierre de tareas REVIEW del backlog mirándolas; T-113 split de archivos > 400 líneas.
Paralelo = mismo número de tanda (archivos `owns` disjuntos). Secuencial = `depends_on`.
| N-0015 | Cielo, horizonte y niebla: montañas nevadas con velo | arte | N-0014 | verified |
| N-0016 | Vida: agua que se mece (lago+pantano), mariposas, relleno | arte | N-0015 | verified |
