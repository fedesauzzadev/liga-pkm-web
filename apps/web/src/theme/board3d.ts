// Tema del tablero 3D (SPEC-G/T-062 + NO-VISION §6): TODOS los valores
// numéricos y colores del tablero 3D viven acá, en un solo lugar. Nada de
// "números mágicos" dispersos: si el dueño pide un ajuste visual, se toca
// este archivo y nada más.
export const BOARD3D = {
  /** Mapeo tablero físico → mundo: 1 px = 0,01 unidades (spec T-062). */
  pxToUnits: 0.01,
  base: {
    /** Extensiones del tablero de juego (1176×1600 px × 0,01): encuadre y pan. */
    width: 11.76,
    depth: 16.0,
  },
  node: {
    /** Piedra elevada (SPEC-H/T-067): redonda r 0,2 / cuadrada 0,4×0,4, alto 0,12. */
    radius: 0.2,
    height: 0.12,
    square: 0.4,
    /** Bisel de la piedra; el color del tipo/mazo vive en el aro superior. */
    bevel: 0.03,
    stoneColor: '#b3aca1',
    /** N-0012: la piedra entera lleva el color del tipo; el aro superior es crema. */
    rimColor: '#FFF6E0',
    segments: 24,
  },
  glyph: {
    /** Glifo en la cara superior (AC-2): plano 0,24 con CanvasTexture 128×128. */
    size: 0.24,
    px: 128,
    ink: '#241f1c',
    lift: 0.004,
  },
  edge: {
    /** Camino de tierra (AC-3): cinta 0,16 #C9A877 + falda suave por seed. */
    width: 0.22,
    height: 0.02,
    color: '#E6C98F',
    /** N-0012: borde más oscuro que marca el recorrido sobre cualquier bioma. */
    softColor: '#A9824F',
    /** Falda: ancho extra con opacidad baja (borde suave determinista). */
    soft: 0.06,
    softOpacity: 0.75,
    seed: 20261012,
  },
  pebbles: {
    /** Guijarros instanciados a los lados del camino (AC-3). */
    size: 0.04,
    spacing: 0.95,
    sideMin: 0.17,
    sideMax: 0.26,
    seed: 20261013,
  },
  card: {
    /** Pila de 12 cartas: cajas 0,63 × 0,02 × 1,0 con ligero desorden. */
    width: 0.63,
    height: 0.02,
    depth: 1.0,
    count: 12,
    color: '#f5f1e6',
    backColor: '#3a5a8c',
    /** Desorden determinista (mismo seed → misma pila; sin Math.random). */
    jitter: { x: 0.045, z: 0.045, rotY: 0.1 },
    seed: 20261011,
  },
  camera: {
    // El resto de los valores de cámara vive en content/ui/camera.json
    // (SPEC-I/T-076 + SPEC-M/T-085): fov, picadas (elevationDeg = pitch) y
    // pitchDegRange por modo, distancias del follow/fork, zoom/azimut y
    // transiciones. Acá solo lo que three pide siempre.
    near: 0.1,
    far: 200,
    /** N-0001: distancia del encuadre del arranque y de "Centrar en mí": la
     *  ficha queda en ~11 % del alto (bbox de sceneDump, 1440×810). Antes el
     *  clamp de borde la dejaba a 3,6 = pegada a los techos. */
    centerOnMeDistance: 15,
    /** N-0004: "Centrar en mí" no acerca el objetivo a menos de [x, z] del
     *  borde del tablero (ficha en Pueblo Paleta ⇒ mitad inferior, sin media
     *  pantalla de pasto al sur). */
    centerOnMeInset: [4.5, 5] as const,
  },
  blob: {
    /** Sombras "blob": círculos translúcidos, sin mapas de sombra. */
    radius: 0.55,
    opacity: 0.25,
    color: '#000000',
  },
  world: {
    /** Mundo continuo (SPEC-H/T-069). Geometría/niebla/semillas: decor.json. */
    pedestal: {
      /** Piedra del mazo (AC-2): cilindro bajo + aro del color del mazo. */
      radius: 0.72,
      height: 0.12,
      color: '#9a938a',
      /** N-0012: aro crema; la piedra del mazo lleva el color del mazo. */
      ringColor: '#FFF6E0',
      ringHeight: 0.025,
      ringInset: 0.06,
    },
    sky: {
      /** Domo con degradado (AC-4): BackSide, sin niebla (decor: colores). */
      radius: 60,
      widthSegments: 24,
      heightSegments: 12,
      /** N-0015: curva del degradado horizonte → cenit (<1 sube el azul rápido). */
      gradientPower: 0.6,
    },
    /** N-0015: perspectiva aérea de las montañas (mezcla con el color de niebla). */
    haze: { ring: [0.45, 0.72], base: 0.55, snowTint: 0.25 },
    cloud: {
      /** Nube low-poly (AC-4): icosaedro detail 0 estirado y achatado. */
      size: 1.5,
      stretch: 1.9,
      squash: 0.55,
      color: '#ffffff',
      /** N-0030: holgura entre el alcance máximo de la cámara de explore y la
       *  franja de nubes (al norte); la franja mide 2 × clearDepth de fondo. */
      clearDepth: 2,
      /** N-0030: emisivo de la nube (su panza en sombra se veía gris). */
      glow: 0.5,
    },
    lake: {
      /** Zona cuyo espejo de agua mece Ambient (WorldScene.water). */
      zone: 'isla',
    },
    relief: {
      /** Zona con relieve rocoso (tests de rugosidad). */
      zone: 'montana',
    },
    /**
     * N-0011: forma y reglas de las 5 zonas. Cada zona es la elipse de su
     * panel × reach, con borde ondulado, recortada a `clear` de caminos,
     * casilleros, mazos y edificios. Reglas: depth = cuenca, pools = umbral de
     * ruido de los charcos, rise = relieve, shore = color de orilla, water =
     * espejo de agua (el terreno lo recorta en la orilla).
     */
    zones: {
      reach: 1.45,
      blend: 0.3,
      wobble: 0.22,
      wobbleFreq: 0.8,
      clear: 0.34,
      clearSoft: 0.6,
      clearWobble: 0.3,
      beach: 0.5,
      waterCells: 28,
      pedestalRadius: 0.78,
      defaultHalf: [1.35, 1.85] as const,
      shoreBand: 0.12,
      groundBand: 0.3,
      rules: {
        isla: { depth: 0.3, shore: '#EAD9A0', water: { color: '#3FB5D9', level: -0.1 } },
        pantano: { depth: 0.2, pools: 0.38, shore: '#5A5240', water: { color: '#7A63B0', level: -0.07 } },
        montana: { rise: 0.75 },
      },
    },
    idle: {
      /** Idle de la ficha (AC-5): ±0,03 en 1,6 s. */
      amplitude: 0.03,
      periodMs: 1600,
    },
    water: {
      /** Vaivén del agua (AC-5). */
      bob: 0.03,
      periodMs: 2400,
      /** N-0016: brillo lento del agua (mezcla hacia blanco) y su período. */
      shimmer: 0.22,
      shimmerPeriodMs: 3200,
    },
    /** N-0016: mariposas (espejo de style.ambientFx.butterflies, que el esquema aún no parsea). */
    butterfly: { count: 6, zones: ['bosque', 'llanura'], size: 0.16, radius: [0.4, 0.9], height: [0.45, 0.9], flapHz: 3, colors: ['#FFE066', '#FFFFFF', '#FF9EC4', '#FFB347'] },
    /** N-0034: pokémon salvajes (dex por zona, sprites de Showdown) que caminan
     *  circuitos de `corners` esquinas a `radius` de un punto de su zona. */
    wanderer: {
      species: { bosque: [10, 16, 43], llanura: [19, 56, 77], montana: [25, 27, 37], isla: [54, 98], pantano: [23, 60] } as Readonly<Record<string, readonly number[]>>,
      unitsPerPx: 0.013,
      speed: [0.18, 0.32],
      radius: [0.3, 0.9],
      corners: 4,
      spread: 0.85,
      /** Distancia libre a nodos, caminos y edificios; margen sobre el nivel de agua de la zona. */
      clearance: 0.22,
      shore: 0.04,
      sampleStep: 0.12,
      attempts: 400,
      hop: 0.04,
      hopHz: 3,
    },
    /** Bucle ambiental (AC-5): 33 ms ⇒ 30 fps máx con frameloop demand. */
    tickMs: 33,
    /** T-088/AC-3: ruido de luminosidad suave (interpolado, sin bloques). */
    lightnessFreq: 0.5,
    /** N-0004: piso de luminancia del suelo relativo al pasto base (los
     *  biomas oscuros no tapan casilleros ni caminos). */
    groundMinLuma: 0.55,
    /**
     * T-096/AC-2: el tinte de zona es una textura de bioma (≥ 1024², filtro
     * lineal, desenfoque gaussiano) en vez de color por vértice a paso 0,3
     * (Q-057: bloques cuadrados). `field` es la resolución del muestreo
     * previo; el resto se upsamplea bilineal y se difumina con `blur`.
     */
    biomeTexture: {
      size: 1024,
      fieldRatio: 4,
      blur: [1, 4, 6, 4, 1] as const,
    },
  },
  decor: {
    /** Catálogo de piezas (SPEC-H/T-068): recetas numéricas. Colores: decor.json. */
    house: {
      body: [0.7, 0.5, 0.6],
      roof: { radius: 0.55, height: 0.35, segments: 4, rotY: Math.PI / 4 },
      door: [0.14, 0.25, 0.02],
    },
    pokecenter: {
      body: [1.0, 0.5, 0.7],
      roof: [1.1, 0.12, 0.8],
      roofColor: '#E8483B',
      door: [0.16, 0.26, 0.02],
      cross: { arm: [0.2, 0.06, 0.02], lift: 0.34 },
    },
    market: {
      counter: [0.8, 0.3, 0.4],
      slat: [0.12, 0.02, 0.44],
      slats: 6,
      tilt: 0.3,
      post: { radius: 0.02, height: 0.72 },
    },
    lab: {
      body: [1.2, 0.6, 0.8],
      roof: [1.28, 0.06, 0.88],
      roofColor: '#5A6B7A',
      antenna: { radius: 0.02, height: 0.35 },
      sign: [0.3, 0.12, 0.02],
    },
    gym: {
      body: [1.1, 0.7, 0.9],
      roof: [1.2, 0.1, 1.0],
      flag: { plane: [0.3, 0.2], pole: { radius: 0.015, height: 0.5 } },
    },
    tree: {
      pine: { trunk: { radius: 0.05, height: 0.25 }, cones: [{ radius: 0.28, height: 0.5 }, { radius: 0.2, height: 0.4 }] },
      round: { trunk: { radius: 0.05, height: 0.25 }, ball: { radius: 0.3, widthSegments: 8, heightSegments: 6 } },
    },
    deadTree: { trunk: { radius: 0.05, height: 0.5 }, branches: 3, branch: { radius: 0.015, length: 0.22 } },
    bush: { radius: 0.18, squash: 0.7 },
    rock: { radius: 0.14, detail: 0, scaleMin: 0.6, scaleMax: 1.6 },
    mountain: { radius: 0.6, height: 0.9, segments: 5, snowRatio: 0.32 },
    pond: { segments: 20, radius: 0.9 },
    reeds: { blades: 3, radius: 0.012, height: 0.16 },
    grassTuft: { blades: 3, radius: 0.014, height: 0.1 },
    flowerPatch: { stem: { radius: 0.01, height: 0.06 }, head: { radius: 0.035 }, headColor: '#E879A8' },
    lavaPool: { segments: 16, radius: 0.45, color: '#FF7A2F' },
    /** T-088/AC-2: opacidad ≤ 0,12; T-096/AC-3: ≤ 0,10 (mancha mínima). */
    mist: { radius: 0.35, squash: 0.45, opacity: 0.1 },
    fence: { post: { radius: 0.02, height: 0.22 }, spacing: 0.5, rail: [0.028, 0.028] },
    sign: { post: { radius: 0.02, height: 0.32 }, board: [0.36, 0.16, 0.03] },
    lamp: { pole: { radius: 0.02, height: 0.55 }, bulb: { radius: 0.06 } },
    flag: { plane: [0.3, 0.2], pole: { radius: 0.015, height: 0.5 } },
    /** Bandera del gimnasio: color por medalla del líder (content/gyms.json). */
    medalColors: {
      Roca: '#8C8577', Cascada: '#4F8FD6', Trueno: '#F2C230', 'Arcoíris': '#66C7A0',
      Alma: '#A97BD6', Pantano: '#7A5FA8', Volcán: '#E8483B', Tierra: '#C9A877',
    } as const,
    scatter: {
      /** Clearance alrededor del pedestal del mazo (AC-3). */
      pedestalClearance: 0.85,
      /** Intentos de rechazo por pieza antes de omitirla. */
      maxTries: 160,
      /** Levanta la pieza del terreno (evita z-fighting en pendientes). */
      lift: 0.02,
      /** Escala determinista por pieza. */
      scaleMin: 0.8,
      scaleMax: 1.25,
    },
  },
  ring: {
    /** Aro de resaltado para casilleros ofrecidos por pending (AC-10). */
    inner: 0.2,
    outer: 0.27,
    color: '#ffd84d',
    lift: 0.012,
    /** Pulso del aro (SPEC-H/T-067/AC-4): 1→1,15 en 900 ms. */
    pulseScaleTo: 1.15,
    pulsePeriodMs: 900,
  },
  hit: {
    /** Área de toque por nodo (invisible, solo raycast de hover/click). */
    radius: 0.24,
    height: 0.24,
  },
  token: {
    /** Ficha (T-063/AC-1): base cilíndrica de radio 0,2. */
    baseRadius: 0.2,
    baseHeight: 0.1,
    /** Sprite billboard del PKM inicial: tamaño 0,9 (AC-1). */
    spriteSize: 0.9,
    spriteLift: 0.85,
    /** Sin sprite ⇒ peón de color, uno por jugador (AC-1); caminata-ficha/AC-7:
     *  5 colores ⇒ hasta 5 jugadores sin repetir el fallback. */
    pawnHeight: 0.5,
    pawnRadius: 0.12,
    pawnColors: ['#e2504c', '#4c7de2', '#e2b84c', '#7d4ce2', '#3ec98a'] as const,
    /** Salto parabólico por tramo: altura 0,35 (AC-2). Caminata-ficha/AC-1:
     *  paso más lento — 320 ms a 1× (2× ⇒ 160; skip/reduced ⇒ 0). */
    hopHeight: 0.35,
    stepMs: 320,
    framesPerStep: 10,
    /** Caminata-ficha/AC-5/AC-6: reposo — sola a soloOffset del centro en una
     *  de maxPlayers direcciones (índice de jugador); 2..5 en círculo a
     *  radialOffset (pares a ≥ 2·baseRadius: 2·r·sin(π/5) ≥ 0,4 ⇒ 0,36). */
    soloOffset: 0.1,
    maxPlayers: 5,
    radialOffset: 0.36,
    /** La ficha se apoya sobre la piedra (alto del casillero T-067). */
    lift: 0.12,
    /** Modelo 3D HGSS del inicial (fichas-modelo-3d-hgss): rotación fija,
     *  anclado al tablero (NO billboard); se apoya sobre la base cilíndrica. */
    modelRotY: Math.PI,
  },
  draw: {
    /** Robo de carta (T-064): la pila se resalta elevándose 0,15 (AC-1). */
    stackLift: 0.15,
    highlightMs: 250,
    /** Vuelo pila → centro con giro de revelado rotateY 0→180° (AC-1). */
    flyMs: 700,
    /** Reposo del revelado antes de la decisión o el inventario. */
    revealMs: 180,
    /** Energía/ítem: segundo vuelo encogiendo hacia el botón inventario (AC-2). */
    stowMs: 420,
    /** Tamaño de la carta DOM voladora (px). */
    cardWidth: 168,
    cardHeight: 236,
    /** La <PkmCard> completa se encoge para entrar en la cara. */
    pkmScale: 0.58,
  },
  label: {
    /** <Text> de drei para ciudades y Centro/Mercado/Oak (AC-3). */
    fontSize: 0.3,
    color: '#ffffff',
    outlineColor: '#20301d',
    outlineWidth: 0.03,
    /** SPEC-O/T-097/AC-1: ancla 0,5 unidades por encima del nodo. */
    lift: 0.5,
    /** SPEC-O/T-097/AC-1: la etiqueta se dibuja ENCIMA de todo — sin depth
     * test y con renderOrder alto, ningún edificio la tape. */
    depthTest: false,
    renderOrder: 9990,
    /** T-088/AC-1: desplaza la etiqueta para que su caja quede completa
     * dentro del viewport, con este margen (px) por lado. */
    viewportMarginPx: 8,
  },
  canvas: {
    /** Render bajo demanda salvo animaciones; dpr lo maneja perf (T-076/AC-9). */
    frameloop: 'demand',
  },
  /** Color de cada mazo de terreno (paneles y nodos `deck`). */
  deckColors: {
    llanura: '#F2D36B',
    pantano: '#8A63C8',
    isla: '#3F9BE0',
    montana: '#E0553F',
    bosque: '#3FA85A',
  } as const,
  /** Color por tipo de casillero (spec AC-2; deck usa el color del mazo). */
  nodeColors: {
    start: '#F4F1E4',
    mercado: '#4F8FE8',
    centro: '#F2718F',
    oak: '#B78BFF',
    gym: '#F2A93B',
    duelo: '#FF7A3C',
    sorpresa: '#E34FD0',
    liga: '#35C9D8',
    empty: '#E9E4D8',
    junction: '#F0D7BB',
    deck: '#b7d5a7',
  } as const,
} as const

export type Board3DTheme = typeof BOARD3D
