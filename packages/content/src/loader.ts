// Loader: lee content/** y devuelve `Content` tipado (SDD §3: Ctx.content).
// Falla con la lista completa de errores si algo no valida. Solo entornos Node:
// la UI carga sus JSON por su cuenta y no debe importar este módulo.
import { collect, type Content } from './validate.ts'

export function loadContent(contentDir: string): Content {
  const { errors, content } = collect(contentDir)
  if (content === null) throw new Error(`contenido inválido (${errors.length} error(es)):\n${errors.join('\n')}`)
  return content
}

export type { Content }
