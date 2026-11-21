// AC: SPEC-I/T-071/AC-2, AC-3, AC-5, AC-7 — proxy SSR (patrón T-034/T-061):
// estructura, testids y orden de foco. La geometría real (cajas, capas
// pointer-events, fullscreen, reduced-transparency) la mide e2e/t071-shell.mjs.
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { es } from '../i18n/es'
import { FOCUS_ORDER, shellPanels } from './layout'
import { GameShell } from './GameShell'
import { MenuPopover } from './MenuPopover'

const testidOf = (key: (typeof FOCUS_ORDER)[number]): string => shellPanels[key].testid

const html = (props: { readonly layoutDebug?: boolean; readonly hudHidden?: boolean } = {}): string =>
  renderToString(
    <GameShell
      world={<p>world</p>}
      overlay={<p>overlay</p>}
      onDevEncounter={() => undefined}
      {...props}
    />,
  )

test('AC: SPEC-I/T-071/AC-2 - shell con mundo y overlay en capas separadas', () => {
  const doc = html()
  expect(doc).toContain('data-testid="game-shell"')
  expect(doc).toContain('data-shell-root')
  expect(doc).toContain('data-shell-world')
  expect(doc).toContain('data-shell-overlay')
  expect(doc).toContain('data-shell-hud')
})

test('AC: SPEC-I/T-071/AC-3 - los 9 elementos del HUD existen con su testid', () => {
  const doc = html()
  for (const key of FOCUS_ORDER) {
    expect(doc).toContain(`data-testid="${testidOf(key)}"`)
  }
})

test('AC: SPEC-I/T-071/AC-3 - popups solo con contenido o layoutDebug (T-075)', () => {
  const normal = html()
  expect(normal).not.toContain('data-testid="popup-card"')
  expect(normal).not.toContain('data-testid="popup-battle"')
  const debug = html({ layoutDebug: true })
  expect(debug).toContain('data-testid="popup-card"')
  expect(debug).toContain('data-testid="popup-battle"')
  expect(debug).toContain(es.shellPopupCard)
})

test('AC: SPEC-I/T-071/AC-7 - el DOM recorre los paneles en orden lógico (Tab)', () => {
  const doc = html()
  const positions = FOCUS_ORDER.map((key) => doc.indexOf(`data-testid="${testidOf(key)}"`))
  for (const pos of positions) expect(pos).toBeGreaterThanOrEqual(0)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
})

test('AC: SPEC-I/T-071/AC-5 - tip de F11 inicial; menú cerrado de entrada', () => {
  const doc = html()
  expect(doc).toContain('data-testid="tip-f11"')
  expect(doc).toContain(es.shellTipF11)
  expect(doc).not.toContain('data-testid="menu-popover"')
  expect(doc).not.toContain('data-testid="viewport-warning"')
})

test('AC: SPEC-I/T-071/AC-5 - botones Oak y Menú con etiqueta', () => {
  const doc = html()
  expect(doc).toContain('data-testid="btn-oak"')
  expect(doc).toContain('data-testid="btn-menu"')
  expect(doc).toContain(es.shellBtnOak)
  expect(doc).toContain(es.shellMenu)
})

// ── SPEC-N/T-089: pestaña para ocultar/mostrar el equipo ──

/** Etiqueta de apertura de un elemento por testid (SSR: sin DOM). */
const tagOf = (doc: string, testid: string): string =>
  new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`).exec(doc)?.[0] ?? ''

/** Texto directo de un elemento por testid (SSR separa nodos con <!-- -->). */
const textOf = (doc: string, testid: string): string =>
  (new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(doc)?.[1] ?? '').replace(/<!-- -->/g, '')

/** Caja (style inline) de un elemento por testid: idéntica ⇒ no se movió. */
const styleOf = (doc: string, testid: string): string =>
  /style="([^"]*)"/.exec(tagOf(doc, testid))?.[1] ?? ''

// AC: SPEC-N/AC-2 — la pestaña del shell: testid, aria-controls/expanded y textos i18n.
test('AC: SPEC-N/AC-2 - btn-team-tab con aria coherente y textos teamCollapse/teamExpand', () => {
  const visible = html()
  expect(tagOf(visible, 'btn-team-tab')).toContain('aria-expanded="true"')
  expect(tagOf(visible, 'btn-team-tab')).toContain('aria-controls="panel-team"')
  expect(textOf(visible, 'btn-team-tab')).toBe(es.teamCollapse)
  expect(tagOf(visible, 'panel-team')).toContain('id="panel-team"')

  const hidden = renderToString(
    <GameShell world={<p>world</p>} teamCollapsed onTeamToggle={() => undefined} />,
  )
  expect(tagOf(hidden, 'btn-team-tab')).toContain('aria-expanded="false"')
  expect(tagOf(hidden, 'btn-team-tab')).toContain('aria-controls="panel-team"')
  expect(textOf(hidden, 'btn-team-tab')).toBe(es.teamExpand)
  expect(textOf(hidden, 'btn-team-tab')).not.toBe(es.teamCollapse)
})

// AC: SPEC-N/AC-3 — colapsado: panel-team sale del DOM y ningún otro panel cambia de caja.
test('AC: SPEC-N/AC-3 - teamCollapsed quita panel-team sin mover ningún otro panel', () => {
  const open = html()
  const closed = renderToString(
    <GameShell world={<p>world</p>} overlay={<p>overlay</p>} teamCollapsed onTeamToggle={() => undefined} />,
  )
  expect(open).toContain('data-testid="panel-team"')
  expect(closed).not.toContain('data-testid="panel-team"')
  expect(closed).toContain('data-testid="btn-team-tab"')
  expect(closed).toContain('data-shell-world')
  expect(closed).toContain('data-testid="panel-turn"')
  for (const id of [
    'panel-turn',
    'panel-players',
    'panel-history',
    'panel-backpack',
    'btn-oak',
    'btn-menu',
    'btn-team-tab',
  ]) {
    expect(styleOf(closed, id), id).toBe(styleOf(open, id))
  }
})

// AC: SPEC-I/T-074/AC-1..AC-4 + T-072/T-073 - el contenido del HUD reemplaza los placeholders.
test('AC: SPEC-I/T-074 - el contenido de hud llena los paneles (sin placeholders)', () => {
  const doc = renderToString(
    <GameShell
      world={<p>world</p>}
      hud={{
        // T-092: panel-dice también se llena (sin placeholder).
        dice: <p data-testid="dice-content">dado</p>,
        turn: <p data-testid="turn-content">turno</p>,
        team: <p data-testid="team-content">equipo</p>,
        players: <p data-testid="players-content">jugadores</p>,
        history: <p data-testid="history-content">historial</p>,
        backpack: <p data-testid="backpack-content">mochila</p>,
      }}
    />,
  )
  expect(doc).toContain('data-testid="turn-content"')
  expect(doc).toContain('data-testid="dice-content"')
  expect(doc).toContain('data-testid="team-content"')
  expect(doc).toContain('data-testid="players-content"')
  expect(doc).toContain('data-testid="history-content"')
  // T-073: con la mochila, ningún panel queda con placeholder.
  expect(doc).toContain('data-testid="backpack-content"')
  expect((doc.match(/class="[^"]*placeholder[^"]*"/g) ?? []).length).toBe(0)
})

// AC: SPEC-I/T-074/AC-5 - menú: Continuar, Guardar, Ajustes, Pantalla completa,
// Exportar reporte de bug y Salir.
test('AC: SPEC-I/T-074/AC-5 - el menú tiene las seis acciones', () => {
  const doc = renderToString(
    <MenuPopover
      menu={{ onSave: () => undefined, onExit: () => undefined, settings: <p data-testid="menu-settings-node" /> }}
      fullscreen={false}
      onToggleFullscreen={() => undefined}
      onClose={() => undefined}
    />,
  )
  expect(doc).toContain('data-testid="menu-popover"')
  expect(doc).toContain('data-testid="menu-continue"')
  expect(doc).toContain(es.shellMenuContinue)
  expect(doc).toContain('data-testid="menu-save"')
  expect(doc).toContain('data-testid="menu-settings-node"')
  expect(doc).toContain('data-testid="btn-fullscreen"')
  expect(doc).toContain(es.shellFullscreen)
  expect(doc).toContain('data-testid="menu-bug"')
  expect(doc).toContain(es.shellMenuBug)
  expect(doc).toContain('data-testid="menu-exit"')
  expect(doc).toContain(es.shellMenuExit)
})

// AC: SPEC-I/T-075/AC-2, AC-5 - un solo popup-battle con contenido; Ampliar usa
// la caja `expanded` de layout.json (la geometría exacta la mide e2e). Con
// rediseno-combate-max la caja ampliada es la ventana completa (nota n.º 8),
// así que el estilo del popup se chequea en su propio tag (panel-players
// también vive en left:0%).
test('AC: SPEC-I/T-075/AC-2,AC-5 - popup-battle único; expandido cambia a la caja expanded', () => {
  const render = (expanded: boolean): string =>
    renderToString(
      <GameShell
        world={<p>world</p>}
        battlePopup={<p data-testid="battle-content">combate</p>}
        battlePopupExpanded={expanded}
      />,
    )
  const popupStyle = (doc: string): string => {
    const at = doc.indexOf('data-testid="popup-battle"')
    expect(at).toBeGreaterThanOrEqual(0)
    return doc.slice(Math.max(0, doc.lastIndexOf('<section', at)), at + 40)
  }
  const normal = render(false)
  expect((normal.match(/data-testid="popup-battle"/g) ?? []).length).toBe(1)
  expect(normal).toContain('data-testid="battle-content"')
  const battle = shellPanels.battlePopup
  expect(popupStyle(normal)).toContain(`left:${String((battle.x * 100).toFixed(3))}%`)
  expect(popupStyle(normal)).not.toContain(`left:${String(((battle.expanded?.x ?? 0) * 100).toFixed(3))}%`)

  const wide = render(true)
  const expandedBox = battle.expanded
  if (expandedBox !== undefined) {
    expect(popupStyle(wide)).toContain(`left:${String((expandedBox.x * 100).toFixed(3))}%`)
    // Los clamps del panel se mantienen (max(200px, 100%)).
    expect(popupStyle(wide)).toContain(`width:max(${String(battle.minW)}px, ${String((expandedBox.w * 100).toFixed(3))}%)`)
  }
})

// ── Plan ocultar-hud: botón de anteojitos que oculta/muestra el HUD ──

/** Inner HTML del elemento por testid (para ver el SVG del botón, AC-1). */
const innerOf = (doc: string, testid: string): string => {
  const start = doc.indexOf(tagOf(doc, testid))
  return doc.slice(start, doc.indexOf('</button>', start))
}

// AC: ocultar-hud/AC-1 — botón arriba a la izquierda (panel hudToggle), con SVG
// inline de anteojitos y aria-label/title desde es.ts.
test('AC: ocultar-hud/AC-1 - btn-hud-toggle con anteojitos SVG, aria-label y título', () => {
  const doc = html()
  const tag = tagOf(doc, 'btn-hud-toggle')
  expect(tag).toContain(`aria-label="${es.hudToggleHide}"`)
  expect(tag).toContain(`title="${es.hudToggleHide}"`)
  const toggle = shellPanels.hudToggle
  expect(tag).toContain(`left:${String((toggle.x * 100).toFixed(3))}%`)
  expect(tag).toContain(`top:${String((toggle.y * 100).toFixed(3))}%`)
  expect(innerOf(doc, 'btn-hud-toggle')).toContain('<svg')
})

// AC: ocultar-hud/AC-2 — oculto: sin overlay ni paneles/botones/tip; el toggle queda.
test('AC: ocultar-hud/AC-2 - hudHidden saca overlay, paneles y tip; el toggle queda', () => {
  const doc = renderToString(
    <GameShell world={<p>world</p>} overlay={<p>overlay</p>} hudHidden />,
  )
  expect(doc).not.toContain('data-shell-overlay')
  for (const id of [
    'panel-turn',
    'panel-team',
    'btn-team-tab',
    'panel-players',
    'panel-history',
    'panel-backpack',
    'btn-oak',
    'btn-menu',
    'tip-f11',
  ]) {
    expect(doc, id).not.toContain(`data-testid="${id}"`)
  }
  expect(doc).toContain('data-testid="btn-hud-toggle"')
  expect(doc).toContain('data-shell-world')
})

// AC: ocultar-hud/AC-3 — al volver, el HUD conserva su estado (teamCollapsed) y caja.
test('AC: ocultar-hud/AC-3 - el HUD vuelve conservando su estado previo', () => {
  const before = renderToString(
    <GameShell world={<p>world</p>} overlay={<p>o</p>} teamCollapsed onTeamToggle={() => undefined} />,
  )
  expect(before).toContain('data-shell-overlay')
  expect(before).toContain('data-testid="panel-turn"')
  expect(before).toContain('data-testid="btn-team-tab"')
  expect(tagOf(before, 'btn-team-tab')).toContain('aria-expanded="false"')
  expect(before).not.toContain('data-testid="panel-team"')
  const full = html()
  for (const id of ['panel-turn', 'panel-players', 'panel-history', 'panel-backpack', 'btn-oak', 'btn-menu']) {
    expect(styleOf(before, id), id).toBe(styleOf(full, id))
  }
})

// AC: unificar-popup-encuentro - el shell expone la capa encounterPopup dentro
// de .popups: encima del HUD (misma capa de popups) y debajo de popup-battle.
test('AC: unificar-popup-encuentro - slot encounterPopup debajo de popup-battle', () => {
  const doc = renderToString(
    <GameShell
      world={<p>world</p>}
      encounterPopup={<p data-testid="encounter-content">encuentro</p>}
      battlePopup={<p data-testid="battle-content">combate</p>}
    />,
  )
  expect(doc).toContain('data-testid="encounter-content"')
  expect(doc).toContain('data-testid="battle-content"')
  expect(doc.indexOf('data-testid="encounter-content"')).toBeLessThan(
    doc.indexOf('data-testid="battle-content"'),
  )
  const plain = html()
  expect(plain).not.toContain('data-testid="encounter-content"')
})

// AC: ocultar-hud/AC-4 — popups modales NO se ocultan con el toggle (gameplay).
test('AC: ocultar-hud/AC-4 - con el HUD oculto, los popups se siguen mostrando', () => {
  const doc = renderToString(
    <GameShell
      world={<p>world</p>}
      hudHidden
      cardPopup={<p data-testid="card-content">carta</p>}
      battlePopup={<p data-testid="battle-content">combate</p>}
    />,
  )
  expect(doc).toContain('data-testid="popup-card"')
  expect(doc).toContain('data-testid="card-content"')
  expect(doc).toContain('data-testid="popup-battle"')
  expect(doc).toContain('data-testid="battle-content"')
})

// AC: ocultar-hud/AC-5 — aria-pressed refleja el estado; el botón entra a FOCUS_ORDER.
test('AC: ocultar-hud/AC-5 - aria-pressed refleja el estado y el botón encabeza el foco', () => {
  const visible = html()
  expect(tagOf(visible, 'btn-hud-toggle')).toContain('aria-pressed="false"')
  const hidden = renderToString(<GameShell world={<p>world</p>} hudHidden />)
  expect(tagOf(hidden, 'btn-hud-toggle')).toContain('aria-pressed="true"')
  expect(tagOf(hidden, 'btn-hud-toggle')).toContain(`aria-label="${es.hudToggleShow}"`)
  expect(FOCUS_ORDER).toContain('hudToggle')
  expect(FOCUS_ORDER.indexOf('hudToggle')).toBe(0)
  const positions = FOCUS_ORDER.map((key) => visible.indexOf(`data-testid="${testidOf(key)}"`))
  for (const pos of positions) expect(pos).toBeGreaterThanOrEqual(0)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
})

// AC: SPEC-R/T-103 - el shell expone una capa `modal` (ventana de carta) por
// encima de los popups; sin ella no estorba al resto de las capas.
test('AC: SPEC-R/T-103 - la capa modal del shell monta encima de los popups', () => {
  const withModal = renderToString(
    <GameShell
      world={<p>world</p>}
      cardPopup={<p data-testid="card-content">carta</p>}
      modal={<p data-testid="modal-content">modal</p>}
    />,
  )
  expect(withModal).toContain('data-testid="modal-content"')
  expect(withModal).toContain('data-testid="card-content"')
  const modalPos = withModal.indexOf('data-testid="modal-content"')
  const popupPos = withModal.indexOf('data-testid="popup-card"')
  expect(modalPos).toBeGreaterThan(popupPos)
  const plain = renderToString(<GameShell world={<p>world</p>} />)
  expect(plain).not.toContain('data-testid="popup-card"')
})

// ── Plan probar-encuentro-abra: botón dev que fuerza el encuentro con Abra ──

// AC: probar-encuentro-abra/AC-5 — junto al anteojito (panel devEncounter), SVG
// inline, aria-label/title desde es.ts, en FOCUS_ORDER tras hudToggle; sin
// handler no existe (producción) y se oculta con el HUD.
test('AC: probar-encuentro-abra/AC-5 - btn-dev-encounter: caja, i18n, foco y gating', () => {
  const doc = html()
  const tag = tagOf(doc, 'btn-dev-encounter')
  expect(tag).toContain(`aria-label="${es.devEncounterLabel}"`)
  expect(tag).toContain(`title="${es.devEncounterLabel}"`)
  const panel = shellPanels.devEncounter
  expect(tag).toContain(`left:${String((panel.x * 100).toFixed(3))}%`)
  expect(tag).toContain(`top:${String((panel.y * 100).toFixed(3))}%`)
  expect(innerOf(doc, 'btn-dev-encounter')).toContain('<svg')
  expect(FOCUS_ORDER.indexOf('devEncounter')).toBe(FOCUS_ORDER.indexOf('hudToggle') + 1)

  // Sin handler (producción) el botón no se renderiza.
  const bare = renderToString(<GameShell world={<p>world</p>} />)
  expect(bare).not.toContain('data-testid="btn-dev-encounter"')
  // Con el HUD oculto desaparece junto con el resto (el anteojito queda).
  const hidden = renderToString(
    <GameShell world={<p>world</p>} onDevEncounter={() => undefined} hudHidden />,
  )
  expect(hidden).not.toContain('data-testid="btn-dev-encounter"')
  expect(hidden).toContain('data-testid="btn-hud-toggle"')
})
