// AC: SPEC-O/T-095/AC-5 - colorSanity en la capa de modelos: si el color
// dominante de un template queda fuera del rango de su categoría (los
// "cristales celestes"), NO reemplaza la pieza procedural.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { MergedModelPart } from './normalize'
import { templateDominantColor, templatePassesSanity } from './layer'

const partOf = (color: string, withMap = false): MergedModelPart => {
  const material = new THREE.MeshStandardMaterial({ color })
  if (withMap) material.map = new THREE.Texture()
  return {
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material,
  } as unknown as MergedModelPart
}

test('AC: SPEC-O/T-095/AC-5 - color dominante = media de materiales sin textura', () => {
  const parts = [partOf('#4E9D5B'), partOf('#2F7A45'), partOf('#999999', true)]
  const dominant = templateDominantColor(parts)
  expect(dominant).not.toBeNull()
  // Texturizado no cuenta: promedio entre dos verdes sigue en rango árbol.
  expect(templatePassesSanity('tree', parts)).toBe(true)
})

test('AC: SPEC-O/T-095/AC-5 - árbol celeste (cristal) no pasa y queda procedural', () => {
  expect(templatePassesSanity('tree', [partOf('#4F8FD6')])).toBe(false)
  expect(templatePassesSanity('bush', [partOf('#00CFE8')])).toBe(false)
})

test('AC: SPEC-O/T-095/AC-5 - roca saturada no pasa; roca gris sí; edificio sin rango pasa', () => {
  expect(templatePassesSanity('rock', [partOf('#E8483B')])).toBe(false)
  expect(templatePassesSanity('rock', [partOf('#8C8577')])).toBe(true)
  // Sin colorSanity definido (building) siempre pasa.
  expect(templatePassesSanity('gym', [partOf('#4F8FD6')])).toBe(true)
})

test('AC: SPEC-O/T-095/AC-5 - todo texturizado ⇒ se confía en el arte (pasa)', () => {
  expect(templatePassesSanity('tree', [partOf('#4F8FD6', true), partOf('#FF0000', true)])).toBe(true)
  expect(templateDominantColor([partOf('#4F8FD6', true)])).toBeNull()
})
