# DIAG-visual — Modelos negros (T-086)
Origen: `/diagnostica-visual modelos negros`. Sin ojos (NO-VISION); todo con mediciones.

## Mediciones por modelo cargado (post-fix, `pnpm models:check`)
Cada modelo se renderiza solo sobre gris `#808080` con luz neutra (hemisphere 0.9 + directional 1) y se mide `gl.readPixels`. Umbrales AC-4: brillo medio ≥ 0,18 · oscuros (luma < 0,08) ≤ 35 %.

| Elemento | Medida | Valor (post-fix) | Esperado |
|---|---|---|---|
| Kenney GLB (nature/survival/city, 211 modelos) | brillo medio | 0,31 – 0,71 | ≥ 0,18 |
| Kenney GLB | % oscuros | 0,0 – 1,8 % | ≤ 35 % |
| HGSS gimnasios (7) | brillo medio | 0,19 – 0,23 | ≥ 0,18 |
| HGSS gimnasios | % oscuros | 18,4 – 28,0 % | ≤ 35 % |
| HGSS Pokémon League | brillo medio | 0,543 | ≥ 0,18 |
| HGSS Oak Lab | brillo medio | 0,521 | ≥ 0,18 |
| HGSS Pallet Houses (2) | brillo medio | 0,273 – 0,278 | ≥ 0,18 |
| HGSS Poké Mart (2) | brillo medio | **0,170** | ≥ 0,18 → **falla** |
| HGSS Poké Mart (2) | % oscuros | **54,0 %** | ≤ 35 % → **falla** |
| Normales (`ensureVertexNormals`) | geometrías sin `normal` reparadas | todas las que faltaban | ninguna sin normal |
| Textura caída (`isTextureLoaded`) | material ⇒ color neutro del kind | `#C9C9C9`/kind, nunca negro | nunca negro puro |
| `map` conservado (`toonizeModel`) | colorSpace | `SRGBColorSpace` | sRGB |
| `alphaTest` | solo si transparente/`opacity<1`/`alphaTest>0` | 0 en opacos | condicional |

## Causa raíz (verificada con archivo:línea)
El bug de "modelos negros" **no se reproduce en el entorno del chequeo** (que sirve desde `assets-src` donde las texturas existen con su case correcto). Se manifestaba en **producción** (`public/models`) por tres mecanismos, todos encadenados en el pipeline de carga:

1. **`MTLLoader` + textura externa no copiada → muestreo negro.** 142 de los GLB Kenney referencian `Textures/colormap.png` externa; `tools/models-import.ts` solo copiaba el `.glb`, no las texturas. `GLTFLoader` hace `catch → null` (three@0.186.1) ⇒ `map` anulado y el material queda con `color` base (a menudo negro). En el path OBJ, `MTLLoader` deja `map` apuntando a una `Texture` cuya imagen **nunca carga** (`image.width === 0`); WebGL la muestrea en **negro**. → `isTextureLoaded` + `neutralizeMaterial` (AC-2).
2. **`alphaTest` 0.5 incondicional en todo material pixelArt HGSS** (hojas/rejas): un `alphaTest` alto sobre una textura sin canal alfa (o alfa 0) **descarta todos los fragmentos** ⇒ huecos negros. → `alphaTest` solo si el material es realmente transparente (AC-3).
3. **`Kd 0 0 0` / color negro puro en MTLs** sin textura cargada: el material toon hereda negro y, con la luz cenital del tablero, luce negro sólido. → AC-5: nunca negro puro sin textura cargada.

Complemento: geometrías OBJ sin atributo `normal` iluminan mal (negro plano) → `computeVertexNormals` al cargar (AC-1).

## 3 causas más probables (ordenadas)
1. Textura externa no copiada / case-espacio mismatch ⇒ `map` sin imagen ⇒ muestreo negro (AC-2).
2. `alphaTest` 0.5 incondicional descarta fragmentos de materiales pixelArt sin alfa real (AC-3).
3. `Kd` negro / color base negro en materiales sin textura válida (AC-5).

## Nota de medición
El "antes" (brillo ≈ 0, negro puro) corresponde al estado **producción** con las texturas externas ausentes; no es reproducible en el chequeo (dev sirve `assets-src`). El "después" son las mediciones de arriba, tomadas con `pnpm models:check` sobre el mismo pipeline que usa el juego.
