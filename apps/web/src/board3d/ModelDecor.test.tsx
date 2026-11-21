// AC: fix-modelos-galeria/AC-3 — helper puro siblingModelUrl: URL hermana del
// mtllib para URLs path-style (dir clásico + nombre encodeado) y query-style
// (?path= mantiene el parámetro con el directorio del valor). La carga real
// (texturas HGSS vía setResourcePath) la revisa el dueño en la galería (NO-VISION).
// T-086/AC-2 — textureUrlCandidates: resolución de texturas con tolerancia a
// mayúsculas/minúsculas y espacios (variantes encodeadas + minúsc/mayúsc).
import { expect, test } from 'vitest'
import { encodeUrlSegment, siblingModelUrl, textureUrlCandidates } from './ModelDecor'

test('AC: fix-modelos-galeria/AC-3 path-style: directorio clásico + nombre encodeado', () => {
  expect(siblingModelUrl('/dev-models/file/hgss/bld/gym.obj', 'gym.mtl')).toBe(
    '/dev-models/file/hgss/bld/gym.mtl',
  )
  expect(siblingModelUrl('/dev-models/file/kenney/kits/model.obj', 'mi mtl.mtl')).toBe(
    '/dev-models/file/kenney/kits/mi%20mtl.mtl',
  )
})

test('AC: fix-modelos-galeria/AC-3 query-style: mismo ?path= con directorio del valor', () => {
  expect(siblingModelUrl('/dev-models/asset?path=hgss%2Fbld%2Fgym.obj', 'gym.mtl')).toBe(
    '/dev-models/asset?path=hgss%2Fbld%2Fgym.mtl',
  )
  expect(
    siblingModelUrl(`/dev-models/asset?path=${encodeURIComponent('hgss/bld/gym.obj')}`, 'a b.mtl'),
  ).toBe(`/dev-models/asset?path=${encodeURIComponent('hgss/bld/a b.mtl')}`)
})

test('AC: T-086/AC-2 encodeUrlSegment preserva escapes existentes y encodea espacios', () => {
  expect(encodeUrlSegment('colormap.png')).toBe('colormap.png')
  expect(encodeUrlSegment('my tex.png')).toBe('my%20tex.png')
  // Un %20 ya encodeado no se re-encodea a %2520.
  expect(encodeUrlSegment('my%20tex.png')).toBe('my%20tex.png')
  expect(encodeUrlSegment('a\\b.png')).toBe('a%5Cb.png')
})

test('AC: T-086/AC-2 textureUrlCandidates tolera espacios y mayúsculas/minúsculas', () => {
  // Espacio en el nombre: cand crudo + encodeado.
  const conEspacio = textureUrlCandidates('/dev-models/file/hgss/bld/my tex.png')
  expect(conEspacio).toContain('/dev-models/file/hgss/bld/my tex.png')
  expect(conEspacio).toContain('/dev-models/file/hgss/bld/my%20tex.png')
  // Mayúsculas/minúsculas: variantes lower/upper del basename.
  const conCase = textureUrlCandidates('/dev-models/file/hgss/bld/Colormap.PNG')
  expect(conCase).toContain('/dev-models/file/hgss/bld/colormap.png')
  expect(conCase).toContain('/dev-models/file/hgss/bld/COLORMAP.PNG')
  // Query (?path=) se conserva en todas las variantes.
  const conQuery = textureUrlCandidates('/dev-models/asset?path=hgss%2Fbld%2Fa b.png')
  expect(conQuery.every((url) => url.includes('?path='))).toBe(true)
  // data: URI no se toca.
  expect(textureUrlCandidates('data:image/png;base64,xxxx')).toEqual([])
  expect(textureUrlCandidates('')).toEqual([])
})
