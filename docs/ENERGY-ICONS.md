# ENERGY-ICONS — guía de los íconos de energía
Los SVG están en `apps/web/src/assets/energy/` (16 archivos, viewBox 0 0 64 64, ficha redonda: círculo de color con borde `#1a1a1a` de 3 px y un símbolo simple). Son originales del proyecto (no son arte oficial). Vista previa: abrir `tools/energy-preview.html`.

| id | Color de fondo | Símbolo (color del símbolo) |
|---|---|---|
| grass | #3FA34D | hoja con nervadura (blanco) |
| bug | #8FAA23 | escarabajo: cuerpo oval, cabeza, 6 patas y antenas (blanco) |
| flying | #6C93D6 | par de alas abiertas (blanco) |
| fire | #E8483B | llama con centro del color de fondo (blanco) |
| electric | #F4C430 | rayo (oscuro #2b2200) |
| ground | #9A7440 | montaña con base y cima de color de fondo (blanco) |
| water | #3B8FE0 | gota con brillo curvo (blanco) |
| rock | #7B746A | gema hexagonal con facetas (blanco) |
| ice | #7ED6E8 | copo de nieve de 3 ejes (azul oscuro #0b3a4a) |
| fighting | #B5532A | puño: palma, 4 nudillos y pulgar (blanco) |
| ghost | #5C4E8C | fantasma con ojos (blanco) |
| poison | #7A3FA0 | 3 burbujas (blanco) |
| psychic | #A24BC4 | ojo con iris (blanco) |
| normal | #C9C9C9 | anillo blanco vacío = "cualquier energía" |
| dragon | #4F5BD5 | colmillos/cuernos en V (blanco); solo como elemento de PKM |
| multicolor | arcoíris | 6 sectores (fuego, eléctrico, planta, agua, psíquico, lucha) con centro blanco |

## Reglas para retocarlos o redibujarlos
- Solo formas básicas (`circle`, `rect`, `ellipse`, `path`, `polygon`, `line`); sin `<script>`, sin `<image>`, sin fuentes, sin filtros ni degradados.
- Tamaño ≤ 2 KB por archivo; mismo viewBox; mismo círculo base y mismo borde; el símbolo ocupa ~36×36 px centrado.
- Contraste mínimo símbolo/fondo (AA aproximado): símbolo oscuro sobre fondos claros (eléctrico, hielo).
- Legibles a 16 px: si a ese tamaño se confunde con otro, simplificar.
- Los colores canónicos viven en `content/energy.json`; si se cambia un color, cambiarlo en el JSON y en el SVG.
- Un tipo nuevo = SVG + entrada en `energy.json` + fila en esta tabla.
