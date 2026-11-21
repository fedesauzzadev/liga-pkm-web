# SPEC-F — Cartas reales, energías e ítems (T-002b, T-042a/b/c, T-047, T-048, T-049)
Contexto: el dueño tiene fotos de TODAS las cartas (`content/photo-manifest.csv`) y confirmó cantidades de energías e ítems (`content/decks.json`, `content/items.json`, `content/energy.json`, `content/gyms.json`). "Comodín" pasó a llamarse **Multicolor** (D-23).

## T-002b Esquemas del contenido nuevo
Si T-002 se ejecutó **después** de aplicar este parche y ya cubre todo lo de abajo, marcar T-002b como DONE sin hacer nada y decirlo en el reporte.
- AC-1 Esquemas Zod para `decks.json`, `items.json`, `energy.json`, `gyms.json`, `house-edits/*.json` y `ruleset` con las claves nuevas (`start.multicolor`, `features.sorpresaDeck/houseEdits`, `capture`, `oportunidad`).
- AC-2 `PokemonCard.variant?`; `id` único (el `dex` puede repetirse). `Attack.canOpen?`. Efectos nuevos `fixedRolls` y `nextAttackBonus`; campo común `onRoll?: Faces` (ver `docs/EFFECTS.md`).
- AC-3 Chequeos cruzados: energías por mazo = bosque 40, montana 40, isla 38, llanura 38, pantano 40; `item` suma 60; Sorpresa no-PKM suma 12; todo tipo de energía de `decks.json` existe en `energy.json` con `energyCard:true`.
- AC-4 `content:validate` imprime totales por mazo y marca `VERIFY` (warning, sin fallar) si un mazo de terreno no suma 60 una vez cargados sus PKM (esperado: isla 58, pantano 59 hasta aclararlo con el dueño).
- AC-5 Los datos de gimnasios salen de `content/gyms.json`; el bloque `gyms` de `kanto.json` queda obsoleto (se ignora con warning).
- AC-6 Renombrar `wildcard/comodín` → `multicolor` en tipos, código, tests y textos de UI.
- AC-7 Las cartas de `_samples.json` siguen validando.

## T-042a Recorte de cartas desde las fotos
Herramienta offline en Python: `tools/crop_cards.py` + `tools/requirements.txt` (opencv-python-headless, numpy, pillow) + script `pnpm crop-cards <archivo|carpeta>`. Usar las **fotos originales de cámara** en `content/photos/` (las del chat pueden estar reducidas).
- AC-1 Detecta cada carta (fondo claro, bordes oscuros o rojos), corrige perspectiva y rotación y guarda `content/photos/crops/<grupo>/<archivo>_<nn>.jpg` normalizada a 630×1000 px, en orden de lectura (filas de arriba abajo, izquierda a derecha).
- AC-2 `crops.json` con archivo de origen, índice, polígono original y confianza.
- AC-3 Compara la cantidad detectada con `content/photo-manifest.csv`; si no coincide, falla con mensaje claro y deja `_debug/<archivo>.jpg` con las cajas numeradas.
- AC-4 Genera `contact/<archivo>.jpg` (hoja de contacto con todos los recortes numerados) para que el dueño verifique de un vistazo.
- AC-5 Cartas que se tocan o superponen (Gimnasios, Liga): separar por grilla uniforme cuando el contorno no alcanza; parámetros por archivo en `tools/crop-config.json`; modo manual `--grid FILASxCOLUMNAS`.
- AC-6 Avisa si un recorte queda con menos de 500 px de ancho. Nada de fotos ni recortes en git.
- Entrega al dueño: las 15 hojas de contacto para su visto bueno.

## T-042b Piloto de 12 cartas
Requiere T-040, T-041, T-045 y T-042a. Se eligen cartas que ejercitan todo el vocabulario:
`pikachu` (ataque rápido, agilidad) · `magmar_a` y `magmar_b` (dos variantes) · `ditto` (transformación) · `clefairy` (esquivar, canto) · `onix` (chillido: próximo ataque +30) · `dugtrio` (tri-ataque, 3 tiradas) · `gloom` (puede empezar con 2 ataques) · `squirtle` (habilidad con costo) · `charmeleon` (ira) · `koffing_koga` (gimnasio) · `mew` (Sorpresa, oportunidad).
- AC-1 Las 12 se extraen, se revisan en `/admin/cards` y quedan `verified:true` en `content/pokemon/`.
- AC-2 `tasks/reports/T-042b.md`: tasa de error por campo (hp, element, rollFaces, cost, damage, effects, evolvesTo), tiempo por carta y ajustes hechos al prompt. Meta: ≥ 95 % de aciertos en nombre, HP y elemento antes de la revisión manual; si no, mejorar el prompt y repetir.
- AC-3 Todo ataque que no entre en el vocabulario → `docs/effect-requests/ER-xxx.md` + `{op:'custom'}`; **no inventar primitivas**.
- AC-4 El dueño compara las 12 con las cartas físicas antes de pasar a T-042c.

## T-042c Carga completa
Orden: iniciales → 5 mazos de terreno → 4 fotos de evolución → Sorpresa → gimnasios → Liga. Entregar por tandas; cada tanda con `/revisa`.
- AC-1 Todas las cartas extraídas, revisadas y guardadas en `content/pokemon/<mazo>.json`, `evolutions.json`, `sorpresa.json`, `gym-pokemon.json`, `league.json`.
- AC-2 Duplicados (D-25): cartas idénticas ⇒ una carta + `copies: n`; cartas distintas ⇒ variantes `_a`, `_b` por orden de aparición. Si hay duda, no fusionar y preguntar al dueño.
- AC-3 `pnpm build-decks` completa las listas `pokemon` de `content/decks.json` y compara con `expectedPokemonInPhoto`. Las diferencias se **reportan**, no se rellenan (esperado: isla 58 y pantano 59).
- AC-4 Gimnasios: los 8 líderes de `gyms.json` enlazados con sus PKM (#1, #2; Giovanni #1-#3). Liga: Brock, Lance, Gary, Misty (3 PKM cada uno) y Ash (8 PKM); atacan también con 6.
- AC-5 Cada `evolvesTo` apunta a una carta existente; los huecos se listan (cruce con T-045).
- AC-6 Resumen final: cartas por grupo, verificadas, con `custom`, sin `officialMove` (las completa T-046).

## T-047 Íconos de energía
Los 16 SVG ya están en `apps/web/src/assets/energy/` (no hay que dibujarlos; para retocarlos, seguir `docs/ENERGY-ICONS.md`).
- AC-1 `<EnergyIcon type size />` (tamaños 16/24/32/48; `aria-label` en español desde `energy.json`).
- AC-2 `<CostRow cost={CostSlot[]} />`: un ícono por slot; `any` usa `normal.svg`.
- AC-3 `<EnergyToken>`: ficha redonda equipable/arrastrable usada por T-033.
- AC-4 Test: cada `icon` de `energy.json` existe como archivo y cada SVG es XML válido, ≤ 2 KB, sin scripts ni fuentes externas.
- AC-5 Página `/dev/icons` con todos los íconos en 3 tamaños.

## T-048 Ediciones de la casa
Mecanismo para que el dueño cambie cartas sin tocar la transcripción original (D-26). Formato: `content/house-edits/_example.json`.
- AC-1 Con `features.houseEdits` y `enabled:true`, el loader aplica las ediciones tras cargar las cartas, en orden alfabético por archivo y por `edits[]`.
- AC-2 Operaciones: `set` (campos de la carta), `attacks.<id>` (fusión profunda sobre ese ataque), `addAttacks[]`, `removeAttacks[]`. El resultado se valida con Zod y marca `source.houseEdited:true` y `source.editId`.
- AC-3 `target` inexistente o edición inválida ⇒ error claro con el id de la edición. Nunca se modifican los archivos originales.
- AC-4 `/admin/cards` muestra original vs. editada lado a lado y permite activar/desactivar un archivo de ediciones.
- AC-5 Test: `_example.json` habilitado sobre una carta fixture da el resultado esperado; deshabilitado no cambia nada.
- AC-6 Las partidas guardadas incluyen `contentHash` (con ediciones); al cargar una partida con otro hash se avisa.

## T-049 Ítems, Sorpresa y capturas especiales
Depende de T-022 y T-023. Reglas: `docs/RULES.md` (D-12, D-19…D-22).
- AC-1 Se cargan `items.json` y los mazos: Ítem de 60 (16 multicolor, 9 poción, 30 pokebola, 5 oportunidad) y Sorpresa de 40 (12 no-PKM + 28 PKM).
- AC-2 Poción cura 30; Super Poción cura todo el daño; las usadas vuelven al fondo de su mazo.
- AC-3 Oportunidad: se usa en `Organize` (tirada `purpose:'oportunidad'`); con 4-5-6 y ≥ `minMedals` medallas roba del mazo Sorpresa: PKM ⇒ encuentro; ítem ⇒ inventario. Sin medallas suficientes no se puede usar (la UI lo explica).
- AC-4 PKM Sorpresa con `chances: n`: escapa al derrotar n PKM tuyos y vuelve al fondo del mazo Sorpresa.
- AC-5 Ultra Ball: acción en tu turno de combate, legal solo contra PKM sin dueño con `hp − daño ≤ 40`; captura al instante. Master Ball: legal en cualquier turno tuyo contra PKM sin dueño; captura al instante. Ninguna sirve contra gimnasio/Liga. La bola se consume y vuelve al fondo del mazo Sorpresa. Capturar así no da XP.
- AC-6 Tests: Master Ball en el turno 1; Ultra Ball ilegal con 41 de vida restante y legal con 40; Oportunidad con dados [3] (nada) y [5] (roba).
- AC-7 Invariante de conservación de cartas con los dos mazos nuevos.
