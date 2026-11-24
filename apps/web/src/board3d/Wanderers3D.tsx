// N-0034: capa R3F fina de los pokémon salvajes (wanderers.ts). Carga el GIF
// de Showdown de cada uno — animado con ImageDecoder (WebCodecs) si el
// navegador lo trae, si no el primer cuadro quieto — y en cada frame
// renderizado los pone de cara a la cámara. El avance por el circuito lo hace
// el bucle ambiental (AmbientLoop), que es el que pide frames.
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { spriteUrl, useSprites } from '../battle/sprites'
import { faceWanderers, setWandererTexture } from './wanderers'

interface SpriteAnim {
  readonly texture: THREE.Texture
  readonly width: number
  readonly height: number
  /** Dibuja el cuadro siguiente si ya venció el actual. */
  readonly tick: (nowMs: number) => void
  readonly dispose: () => void
}

const pixelArt = (texture: THREE.Texture): THREE.Texture => {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  return texture
}

async function loadStatic(url: string): Promise<SpriteAnim> {
  const texture = pixelArt(await new THREE.TextureLoader().loadAsync(url))
  const image = texture.image as { width: number; height: number }
  return { texture, width: image.width, height: image.height, tick: () => undefined, dispose: () => texture.dispose() }
}

async function loadAnimated(url: string): Promise<SpriteAnim> {
  const decoder = new ImageDecoder({ data: await (await fetch(url)).arrayBuffer(), type: 'image/gif' })
  await decoder.tracks.ready
  const frames = decoder.tracks.selectedTrack?.frameCount ?? 1
  const first = (await decoder.decode({ frameIndex: 0 })).image
  const canvas = document.createElement('canvas')
  canvas.width = first.displayWidth
  canvas.height = first.displayHeight
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('sin canvas 2D')
  context.drawImage(first, 0, 0)
  first.close()
  const texture = pixelArt(new THREE.CanvasTexture(canvas))
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  let index = 1 % frames
  let nextAt = 0
  let busy = frames < 2
  const tick = (nowMs: number): void => {
    if (busy || nowMs < nextAt) return
    busy = true
    void decoder.decode({ frameIndex: index }).then(
      ({ image }) => {
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0)
        // duration viene en µs; los GIF con 0 se muestran a 10 fps como en los navegadores.
        nextAt = nowMs + Math.max(20, (image.duration ?? 0) / 1000 || 100)
        image.close()
        texture.needsUpdate = true
        index = (index + 1) % frames
        busy = false
      },
      () => undefined, // Cuadro ilegible: queda quieto en el último bueno.
    )
  }
  return { texture, width: canvas.width, height: canvas.height, tick, dispose: () => { decoder.close(); texture.dispose() } }
}

const loadSprite = (url: string): Promise<SpriteAnim> =>
  typeof ImageDecoder === 'undefined' ? loadStatic(url) : loadAnimated(url).catch(() => loadStatic(url))

export function Wanderers3D({ group }: { readonly group: THREE.Group }): null {
  const { sprites } = useSprites()
  const animsRef = useRef<SpriteAnim[]>([])

  useEffect(() => {
    if (sprites === null) return
    let alive = true
    const anims: SpriteAnim[] = []
    animsRef.current = anims
    for (const mesh of group.children) {
      const url = spriteUrl(sprites, (mesh.userData as { dex: number }).dex, 'front')
      if (url === null) continue
      void loadSprite(url).then(
        (anim) => {
          if (!alive) return anim.dispose()
          anims.push(anim)
          setWandererTexture(mesh, anim.texture, anim.width, anim.height)
        },
        () => undefined, // Sin sprite (assets no bajados): ese pokémon no aparece.
      )
    }
    return () => {
      alive = false
      for (const mesh of group.children) mesh.visible = false
      for (const anim of anims) anim.dispose()
    }
  }, [group, sprites])

  useFrame((state) => {
    faceWanderers(group, state.camera)
    const now = performance.now()
    for (const anim of animsRef.current) anim.tick(now)
  })

  return null
}
