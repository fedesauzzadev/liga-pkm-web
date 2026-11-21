// Plantillas de mensajes ({name}, {move}, …) centralizadas en i18n/es.ts.
export const fmt = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_match: string, key: string): string => {
    const value = params[key]
    return value === undefined ? '' : String(value)
  })
