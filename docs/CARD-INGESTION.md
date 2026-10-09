# CARD-INGESTION — de cartas físicas a JSON

## Decisión: pipeline híbrido (fotos → extracción por visión → revisión en CRUD)
| Opción | Esfuerzo | Riesgo | Veredicto |
|---|---|---|---|
| Solo CRUD manual | Muy alto (≈250 PKM × 3 ataques × costos/efectos) | Typos, cansancio | Solo como herramienta de **corrección** |
| Solo fotos + visión, sin revisar | Bajo | Errores en números/íconos de costo/caras de dado | No |
| **Fotos + visión + CRUD de revisión lado a lado** | Medio-bajo | Controlado (humano valida) | **Elegida** |

## 1. Qué fotografiar (por prioridad)
1. **PKM básicos de los 5 mazos** (Bosque, Montaña, Isla, Llanura, Pantano) — para MVP alcanza con ~40-60 cartas para tener variedad; luego completar los 151.
2. **Evoluciones** (85) de los PKM elegidos.
3. **Líderes de gimnasio** (cartas del líder + sus 2 PKM) — 8 líderes, 25 cartas de gimnasio.
4. **Ítems** (60): solo anotar **cuántas** hay de cada tipo (Pokebola, Poción, Oportunidad…) y fotografiar una de cada.
5. **Elementos por mazo**: NO hace falta fotografiar. Solo anotar la cantidad por tipo en cada mazo (ej. Bosque: 14 Planta, 3 Veneno…). Plantilla: `content/decks.template.csv`.
6. Después (Modo Historia): Sorpresa (40), Liga (26), Medallas, tabla del Pokedex.

## 2. Protocolo de fotos
- Superficie lisa y mate, luz difusa de arriba, sin reflejos ni sombras de la mano. Teléfono paralelo a la mesa.
- **Grilla de hasta 6 cartas (3×2)** por foto, bien separadas, sin cortar bordes; foto en máxima resolución. Si el texto no se lee a 100 %, usar 4 por foto.
- Nombre de archivo: `{mazo}_{nn}.jpg` (ej. `pantano_03.jpg`); mantener el orden físico de las cartas (izq→der, arriba→abajo) y anotar el orden en `content/photos/_manifest.csv` (`foto, posicion, nota`).
- Solo frente. Una foto extra del reverso de cada mazo no hace falta.

## 3. Extracción por visión (T-041)
Script/herramienta que, por cada foto, envía la imagen a un modelo con visión y exige **JSON que valide contra el esquema de `PokemonCard`**. Reglas del prompt (copiar tal cual):
```
Sos un transcriptor de cartas del juego LIGA POKEMON. Devolvé SOLO JSON válido (array de cartas) según el esquema dado.
- No inventes datos. Si algo no se lee: usá null en ese campo y poné "needsReview": true.
- hp: número dentro del círculo blanco. element: ícono a la derecha del hp.
- Por cada ataque: rollFaces = números antes del guion (ej. "4-5_" => [4,5]); name; rawText = texto literal; damage.base = número entre paréntesis del ataque; si hay "4-5-6 (20)" => ifRoll.
- cost: un elemento por cada ícono a la derecha del ataque; círculo gris vacío => "any". Habilidades (itálica y comillas) => kind:"ability".
- specialties: texto en MAYÚSCULAS bajo la línea horizontal.
- evolvesTo: de "E: Nombre (n)" => {id, xp:n}. stage: "Básico" | "Evolución".
- deck: por el ícono/color del pie de carta. effects: mapear SOLO con las primitivas de docs/EFFECTS.md; si no hay, {"op":"custom","handler":"TODO","rawText":"…"}.
- Para cada ataque proponé `officialMove` (id en inglés minúsculas con guiones, ej. "flamethrower", "double-slap") con `officialMoveStatus:"proposed"` y un `fx` de la lista de arquetipos; si no estás seguro: `officialMoveStatus:"unmapped"`.
- Para cada carta incluí source.photo y la posición en la foto.
```
Salida: `content/pokemon/_staging/*.json` (no entra al juego hasta ser revisada).

## 4. Herramienta de revisión `/admin/cards` (T-040)
- Panel izquierdo: foto recortada de la carta; derecho: formulario (hp, elemento, ataques, costos con selector de íconos, efectos con selector de primitivas, evoluciones).
- Valida en vivo con Zod; marca `needsReview`; botón "Verificado" ⇒ `source.verified=true`.
- Persistencia: lee/escribe archivos de `content/` en dev (middleware de Vite) o descarga/sube JSON en producción. **No** se publica en el build final.
- Atajos de teclado para revisar rápido; filtros: sin verificar / con `custom` / con errores.
- Chequeos cruzados: evoluciones apuntan a cartas existentes, 151 dex sin duplicados, costos coherentes con el elemento del ataque, `rollFaces` de ataques de salvaje/gimnasio no se pisan (cada cara 1-6 en ≤ 1 ataque; huecos permitidos = "no ataca").

## 5. Estimación y orden de trabajo
Fotos (~40-60 con grilla de 6) → extracción (minutos) → revisión humana (≈ 1-2 min por carta). Empezar con un **lote piloto de 12 cartas**; el jefe revisa la calidad de extracción antes de escalar.
