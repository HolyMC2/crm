// `/` composer palette: root-token parsing, item building from the command
// catalog, ranking and the keyboard contract (Enter-to-send must survive
// whenever the menu is closed). Contract: docs/COMPOSER_COMMANDS.md.
import { describe, it, expect, vi } from 'vitest'
import {
  parseSlash,
  stripSlash,
  slugify,
  buildItems,
  rankItems,
  matchTier,
  menuKeyAction,
  findHoles,
  fillHole,
  textToHtml,
  useSlashMenu,
} from '@/composables/slashCommands'

const CATALOG = {
  channel: 'whatsapp',
  commands: [
    {
      key: 'cotizacion',
      aliases: ['cot', 'quote', 'quotation'],
      label: 'Enviar cotización',
      kind: 'document',
      doctype: 'Quotation',
      available: true,
      count: 2,
    },
    {
      key: 'pedido',
      aliases: ['ped', 'orden-venta', 'so'],
      label: 'Enviar orden de venta',
      kind: 'document',
      doctype: 'Sales Order',
      available: false,
      reason: 'Sin órdenes de venta en este trato',
      count: 0,
    },
    {
      key: 'reparacion',
      aliases: ['ord', 'ro', 'orden'],
      label: 'Enviar orden de reparación',
      kind: 'document',
      doctype: 'Repair Order',
      available: true,
      count: 1,
    },
    {
      key: 'adeudo',
      aliases: ['ade', 'saldo', 'deuda', 'debe'],
      label: 'Enviar adeudo',
      kind: 'document',
      doctype: 'Adeudo',
      available: true,
    },
    {
      key: 'plantilla',
      aliases: ['tpl', 'template'],
      label: 'Plantillas',
      kind: 'templates',
      available: true,
    },
    {
      key: 'guardar',
      aliases: ['save'],
      label: 'Guardar como plantilla',
      kind: 'save_template',
      available: true,
    },
  ],
  templates: [
    {
      id: 'CR-0001',
      kind: 'reply',
      title: 'Horario',
      shortcut: 'horario',
      channel: 'Any',
      body: 'Abrimos de 10 a 7, {{cliente}}',
    },
    {
      id: 'CR-0002',
      kind: 'reply',
      title: 'Solo correo',
      shortcut: 'correo',
      channel: 'Email',
      body: 'Te escribo por correo',
    },
    {
      id: 'welcome_msg',
      kind: 'whatsapp',
      title: 'welcome_msg',
      shortcut: '',
      body: 'Hola {{1}}',
    },
  ],
}

describe('parseSlash', () => {
  it('detects a root token while the caret is inside it', () => {
    expect(parseSlash('/cot', 4)).toEqual({ query: 'cot', start: 0, end: 4 })
    expect(parseSlash('/cot', 2)).toEqual({ query: 'cot', start: 0, end: 4 })
    expect(parseSlash('/', 1)).toEqual({ query: '', start: 0, end: 1 })
  })

  it('allows leading whitespace', () => {
    expect(parseSlash('  /ped', 6)).toEqual({ query: 'ped', start: 2, end: 6 })
  })

  it('closes once the caret leaves the token', () => {
    expect(parseSlash('/cat fundas', 11)).toBeNull()
    expect(parseSlash('/cot', 0)).toBeNull()
  })

  it('ignores a slash that is not at the root', () => {
    expect(parseSlash('hola /cot', 9)).toBeNull()
    expect(parseSlash('', 0)).toBeNull()
    expect(parseSlash(null, 0)).toBeNull()
  })

  it('defaults the caret to the end of the text', () => {
    expect(parseSlash('/ade')?.query).toBe('ade')
  })

  it('stripSlash removes only the token', () => {
    const text = '/cat fundas rojas'
    expect(stripSlash(text, { start: 0, end: 4 })).toBe('fundas rojas')
    expect(stripSlash('/cot', parseSlash('/cot', 4))).toBe('')
  })
})

describe('slugify', () => {
  it('lowercases, strips accents and dashes the rest', () => {
    expect(slugify('Horario de Atención')).toBe('horario-de-atencion')
    expect(slugify('  ¡Promo 2x1!  ')).toBe('promo-2x1')
  })
})

describe('buildItems', () => {
  it('flattens commands, templates and quick replies with their types', () => {
    const items = buildItems(
      CATALOG,
      [{ label: 'Gracias', text: 'Gracias por tu compra' }],
      'whatsapp',
    )
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(byId['cmd:cotizacion']).toMatchObject({
      type: 'command',
      shortcut: 'cotizacion',
      available: true,
      payload: { kind: 'document', doctype: 'Quotation' },
    })
    expect(byId['cmd:cotizacion'].keywords).toContain('cot')
    expect(byId['cmd:pedido']).toMatchObject({
      available: false,
      reason: 'Sin órdenes de venta en este trato',
    })
    expect(byId['tpl:CR-0001']).toMatchObject({
      type: 'template',
      shortcut: 'horario',
    })
    expect(byId['meta:welcome_msg'].type).toBe('meta')
    expect(byId['quick:0']).toMatchObject({
      type: 'quick',
      payload: { text: 'Gracias por tu compra' },
    })
  })

  it('always includes /cat, even when the catalog failed', () => {
    const items = buildItems(
      null,
      [{ label: 'Hola', text: 'Hola!' }],
      'whatsapp',
    )
    expect(items.map((i) => i.id)).toEqual(['cmd:cat', 'quick:0'])
    expect(items[0]).toMatchObject({
      shortcut: 'cat',
      payload: { kind: 'catalog' },
    })
  })

  it('can leave /cat out (email)', () => {
    const items = buildItems(null, [], 'email', { catalogCommand: false })
    expect(items).toEqual([])
  })

  it('filters templates by channel; Meta templates only on WhatsApp', () => {
    const wa = buildItems(CATALOG, [], 'whatsapp').map((i) => i.id)
    expect(wa).toContain('tpl:CR-0001')
    expect(wa).not.toContain('tpl:CR-0002')
    const email = buildItems(CATALOG, [], 'email').map((i) => i.id)
    expect(email).toContain('tpl:CR-0002')
    expect(email).not.toContain('meta:welcome_msg')
    const msgr = buildItems(CATALOG, [], 'messenger').map((i) => i.id)
    expect(msgr).not.toContain('meta:welcome_msg')
  })

  it('drops a quick reply whose text is already a template', () => {
    const items = buildItems(
      CATALOG,
      [{ label: 'Horario', text: 'Abrimos de 10 a 7, {{cliente}}' }],
      'whatsapp',
    )
    expect(items.filter((i) => i.type === 'quick')).toHaveLength(0)
  })
})

describe('rankItems', () => {
  const items = buildItems(
    CATALOG,
    [{ label: 'Ordenar pedido', text: 'Tu pedido está en camino' }],
    'whatsapp',
  )
  const ids = (q) => rankItems(items, q).map((i) => i.id)

  it('keeps catalog order for an empty query, unavailable last', () => {
    const r = ids('')
    expect(r[0]).toBe('cmd:cotizacion')
    expect(r[r.length - 1]).toBe('cmd:pedido')
    expect(r).toHaveLength(items.length)
  })

  it('exact alias beats alias prefix, which beats label words', () => {
    // "ord": exact alias of reparacion, prefix of pedido's orden-venta (but
    // pedido is unavailable), label-word prefix of the quick reply.
    const r = ids('ord')
    expect(r[0]).toBe('cmd:reparacion')
    expect(r.indexOf('quick:0')).toBeGreaterThan(0)
    expect(r[r.length - 1]).toBe('cmd:pedido')
  })

  it('prefix on shortcut first', () => {
    expect(ids('cot')[0]).toBe('cmd:cotizacion')
    expect(ids('ho')[0]).toBe('tpl:CR-0001')
    expect(ids('ade')[0]).toBe('cmd:adeudo')
    expect(ids('saldo')[0]).toBe('cmd:adeudo')
  })

  it('ignores accents and case', () => {
    expect(ids('REPARACIÓN')[0]).toBe('cmd:reparacion')
  })

  it('falls back to subsequence fuzzy matching', () => {
    expect(
      matchTier(
        items.find((i) => i.id === 'cmd:guardar'),
        'gdr',
      ),
    ).toBe(3)
    expect(ids('gdr')).toContain('cmd:guardar')
  })

  it('drops non-matching items', () => {
    expect(ids('zzz')).toEqual([])
  })

  it('is stable within a tier', () => {
    const same = [
      { id: 'a', label: 'Uno', shortcut: 'xa', keywords: [], available: true },
      { id: 'b', label: 'Dos', shortcut: 'xb', keywords: [], available: true },
      { id: 'c', label: 'Tres', shortcut: 'xc', keywords: [], available: true },
    ]
    expect(rankItems(same, 'x').map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('menuKeyAction', () => {
  const ev = (key, extra = {}) => ({ key, ...extra })

  it('does nothing while the menu is closed (Enter-to-send survives)', () => {
    for (const key of ['Enter', 'ArrowDown', 'Tab', 'Escape'])
      expect(
        menuKeyAction(ev(key), { open: false, count: 3, activeIndex: 0 })
          .handled,
      ).toBe(false)
  })

  it('moves with wraparound', () => {
    const s = { open: true, count: 3, activeIndex: 2 }
    expect(menuKeyAction(ev('ArrowDown'), s).activeIndex).toBe(0)
    expect(
      menuKeyAction(ev('ArrowUp'), { ...s, activeIndex: 0 }).activeIndex,
    ).toBe(2)
  })

  it('Enter and Tab pick, Escape closes', () => {
    const s = { open: true, count: 2, activeIndex: 1 }
    expect(menuKeyAction(ev('Enter'), s)).toMatchObject({
      handled: true,
      action: 'pick',
    })
    expect(menuKeyAction(ev('Tab'), s).action).toBe('pick')
    expect(menuKeyAction(ev('Escape'), s).action).toBe('close')
  })

  it('Shift+Enter stays a newline, and an empty menu lets Enter send', () => {
    const s = { open: true, count: 2, activeIndex: 0 }
    expect(menuKeyAction(ev('Enter', { shiftKey: true }), s).handled).toBe(
      false,
    )
    expect(
      menuKeyAction(ev('Enter'), { open: true, count: 0, activeIndex: 0 })
        .handled,
    ).toBe(false)
  })

  it('ignores IME composition', () => {
    expect(
      menuKeyAction(ev('Enter', { isComposing: true }), {
        open: true,
        count: 2,
        activeIndex: 0,
      }).handled,
    ).toBe(false)
  })
})

describe('useSlashMenu', () => {
  function setup() {
    const onPick = vi.fn()
    const items = buildItems(CATALOG, [], 'whatsapp')
    const menu = useSlashMenu({ source: () => items, onPick })
    return { menu, onPick }
  }
  const key = (k, extra = {}) => ({
    key: k,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...extra,
  })

  it('opens on a root token and closes when it goes away', () => {
    const { menu } = setup()
    menu.update('/co', 3)
    expect(menu.open.value).toBe(true)
    expect(menu.query.value).toBe('co')
    expect(menu.ranked.value[0].id).toBe('cmd:cotizacion')
    menu.update('hola', 4)
    expect(menu.open.value).toBe(false)
  })

  it('arrow keys move, Enter picks the active item with the parsed token', () => {
    const { menu, onPick } = setup()
    menu.update('/', 1)
    const down = key('ArrowDown')
    expect(menu.onKeydown(down)).toBe(true)
    expect(down.preventDefault).toHaveBeenCalled()
    expect(menu.activeIndex.value).toBe(1)
    const enter = key('Enter')
    expect(menu.onKeydown(enter)).toBe(true)
    expect(onPick).toHaveBeenCalledWith(menu.ranked.value[1], {
      query: '',
      start: 0,
      end: 1,
    })
  })

  it('Escape closes; a closed menu never swallows Enter', () => {
    const { menu, onPick } = setup()
    menu.update('/cot', 4)
    expect(menu.onKeydown(key('Escape'))).toBe(true)
    expect(menu.open.value).toBe(false)
    const enter = key('Enter')
    expect(menu.onKeydown(enter)).toBe(false)
    expect(enter.preventDefault).not.toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('resets the highlight when the query changes', () => {
    const { menu } = setup()
    menu.update('/', 1)
    menu.onKeydown(key('ArrowDown'))
    menu.update('/a', 2)
    expect(menu.activeIndex.value).toBe(0)
  })

  it('templates scope lists only templates and quick replies', () => {
    const { menu } = setup()
    menu.update('/', 1)
    menu.scope.value = 'templates'
    expect(
      menu.ranked.value.every((i) =>
        ['template', 'meta', 'quick'].includes(i.type),
      ),
    ).toBe(true)
    menu.close()
    expect(menu.scope.value).toBe('')
  })
})

describe('template holes', () => {
  it('finds each {{hole}} once', () => {
    expect(
      findHoles('Hola {{cliente}}, total {{ total }} {{cliente}}'),
    ).toEqual([
      { key: 'cliente', label: 'cliente', value: null },
      { key: 'total', label: 'total', value: null },
    ])
  })

  it('fills every occurrence, literally', () => {
    expect(fillHole('{{a}} y {{ a }}', 'a', '$1,200.00')).toBe(
      '$1,200.00 y $1,200.00',
    )
  })

  it('textToHtml escapes and keeps line breaks', () => {
    expect(textToHtml('<b>hola</b>\n& adiós')).toBe(
      '&lt;b&gt;hola&lt;/b&gt;<br>&amp; adiós',
    )
  })
})
