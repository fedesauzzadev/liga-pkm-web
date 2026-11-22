# brain/index
Orquestador: sesión principal. Una sesión limpia por nodo, en su worktree/rama. El orquestador integra por tanda y corre `pnpm verify`.

| Nodo | Título | Tanda | Depende | Estado |
|---|---|---|---|---|
| N-0001 | Cámara "Centrar en mí" | 1 | — | verified |
| N-0003 | Ficha distinguible | 1 | — | verified |
| N-0005 | Combate ampliado + tip F11 | 1 | — | verified |
| N-0006 | Bugs chicos HUD/título | 1 | — | verified |
| N-0002 | Oclusión de edificios | 2b | N-0001, N-0008 | implemented (AC-1 parcial: no cubre árboles ni rocas) |
| N-0004 | Vista general | 2 | N-0001 | implemented (AC-3 pasa a N-0009; AC-4 parcial) |
| N-0007 | Animación de ataque + dado | 2 | N-0005 | verified |
| N-0008 | Textura del inicial en la ficha | 2 | — | verified |
| N-0009 | Etiquetas fuera de la barra de cámara | 2b | N-0004 | verified |
| N-0010 | Luz, sombras reales y tone mapping | arte | — | verified |
| N-0011 | Terreno y biomas: 5 zonas con forma propia y agua real | arte | N-0010 | verified |
| N-0012 | Caminos, casilleros y mazos con color pleno | arte | N-0011 | verified |
| N-0013 | Sombras estáticas (rendimiento); gimnasio por ciudad descartado | arte | N-0010 | verified |
| N-0014 | Vegetación por bioma: bosque verde y denso | arte | N-0011 | verified |
| N-0020 | Título y elección de inicial | 3 | — | verified |
| N-0021 | HUD de partida prolijo | 3 | — | verified (tip F11 flota junto a la ficha; popup de encuentro: columna 340→300 px para no tapar el dado a 1024×600) |
| N-0022 | Partir PlayScreen.tsx y rig.ts | 3 | — | verified |

N-0010 a N-0019: reservados para la sesión de arte del tablero (rama claude/tablero-arte-54a1d7).
Después (sin nodo todavía): subir las nubes por encima de la cámara (hoy 7 vs 9: pueden cruzarse mirando desde el norte); oclusión del scatter instanciado (árboles/rocas); conectar las animaciones de Showdown a BattleScene (grande, dividir); cierre de tareas REVIEW del backlog mirándolas; T-113 split de archivos > 400 líneas.
Paralelo = mismo número de tanda (archivos `owns` disjuntos). Secuencial = `depends_on`.
| N-0015 | Cielo, horizonte y niebla: montañas nevadas con velo | arte | N-0014 | verified |
| N-0016 | Vida: agua que se mece (lago+pantano), mariposas, relleno | arte | N-0015 | verified |
