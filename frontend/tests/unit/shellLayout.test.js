// Where each place sits (Más › Personalizar): the bar, Más in the saved
// order, and the hidden ones. Frappe decides what exists; a layout arranges.
import { describe, expect, it } from 'vitest'
import { SHELL_MODULES } from '@/vendor/muelle-shell/contracts'
import {
  arrangeSections,
  arrangeShell,
  barRoom,
  layoutOf,
} from '@/utils/shellLayout'

const modules = (...keys) =>
  keys.map((key) => {
    const meta = SHELL_MODULES.find((module) => module.key === key)
    return { ...meta, to: meta.basePath }
  })
const scan = { key: 'scan', label: 'Escáner', icon: 'lucide-scan-barcode' }
const pos = { key: 'pos', label: 'POS', icon: 'lucide-receipt' }
const keys = (list) => list.map((place) => place.key)

describe('arrangeShell', () => {
  const stock = modules(
    'hoy',
    'pendientes',
    'contactos',
    'compras',
    'productos',
    'inventario',
    'avisos',
  )

  it('a stock worker gets Inventario, Compras and Escáner on the bar by default', () => {
    const arranged = arrangeShell({
      role: 'almacen',
      modules: stock,
      apps: [scan, pos],
    })
    expect(keys(arranged.bar)).toEqual(['hoy', 'inventario', 'compras', 'scan'])
    // Más keeps the rest in registry order, the apps after the modules;
    // Avisos is the bell and never a place.
    expect(keys(arranged.more)).toEqual([
      'pendientes',
      'contactos',
      'productos',
      'pos',
    ])
    expect(arranged.hidden).toEqual([])
    expect(arranged.bar.find((place) => place.key === 'scan').app).toBe(true)
  })

  it('an accountant gets Bancos, Efectivo and Gastos', () => {
    const arranged = arrangeShell({
      role: 'contador',
      modules: modules('hoy', 'gastos', 'resultados', 'bancos', 'efectivo'),
    })
    expect(keys(arranged.bar)).toEqual(['hoy', 'bancos', 'efectivo', 'gastos'])
    expect(keys(arranged.more)).toEqual(['resultados'])
  })

  it('follows the saved dock, Más order and hidden places', () => {
    const arranged = arrangeShell({
      role: 'almacen',
      modules: stock,
      apps: [scan, pos],
      layout: {
        dock: ['productos', 'pos'],
        order: ['contactos', 'scan'],
        hidden: ['compras', 'hoy'],
      },
    })
    // Hoy is never hidden; the saved dock leads, the registry fills the rest.
    expect(keys(arranged.bar)).toEqual([
      'hoy',
      'productos',
      'pos',
      'pendientes',
    ])
    // The saved order first, then what it does not name in registry order.
    expect(keys(arranged.more)).toEqual(['contactos', 'scan', 'inventario'])
    expect(keys(arranged.hidden)).toEqual(['compras'])
  })

  it('a hidden place keeps its spot in Más: Personalizar lists it where it was', () => {
    const arranged = arrangeShell({
      role: 'almacen',
      modules: stock,
      apps: [scan],
      layout: {
        dock: ['inventario', 'pendientes', 'scan'],
        order: ['productos', 'compras', 'contactos'],
        hidden: ['compras'],
      },
    })
    expect(keys(arranged.more)).toEqual(['productos', 'contactos'])
    expect(keys(arranged.hidden)).toEqual(['compras'])
    expect(keys(arranged.rest)).toEqual(['productos', 'compras', 'contactos'])
  })

  it('a hidden place never fills the bar, and a saved place I lost drops out', () => {
    const arranged = arrangeShell({
      role: 'almacen',
      modules: stock,
      apps: [],
      layout: { dock: ['scan', 'bancos'], hidden: ['inventario'] },
    })
    expect(keys(arranged.bar)).toEqual([
      'hoy',
      'pendientes',
      'contactos',
      'compras',
    ])
    expect(keys(arranged.hidden)).toEqual(['inventario'])
  })

  it('without a layout the class decides; without a class the fallback', () => {
    const arranged = arrangeShell({
      role: null,
      modules: modules('hoy', 'pendientes', 'agenda', 'contactos', 'ventas'),
    })
    // Agenda, Contactos, then Productos; without a catalog the registry
    // fills the last place.
    expect(keys(arranged.bar)).toEqual([
      'hoy',
      'agenda',
      'contactos',
      'pendientes',
    ])
    expect(keys(arranged.more)).toEqual(['ventas'])
  })
})

describe('layoutOf and barRoom', () => {
  it('saves keys without Hoy, from places or keys', () => {
    expect(
      layoutOf({
        bar: modules('hoy', 'ventas'),
        more: ['contactos', scan],
        hidden: [],
      }),
    ).toEqual({ dock: ['ventas'], order: ['contactos', 'scan'], hidden: [] })
  })

  it('Más keeps hidden places in its order; the flags follow that order', () => {
    expect(
      layoutOf({
        bar: ['hoy', 'ventas'],
        more: ['contactos', 'compras', 'scan'],
        hidden: ['scan', 'compras'],
      }),
    ).toEqual({
      dock: ['ventas'],
      order: ['contactos', 'compras', 'scan'],
      hidden: ['compras', 'scan'],
    })
  })

  it('the bar holds three after Hoy, four without it', () => {
    expect(barRoom(modules('hoy', 'ventas'))).toBe(3)
    expect(barRoom(modules('ventas'))).toBe(4)
  })
})

describe('arrangeSections', () => {
  const items = ['deals', 'prospectos', 'inbox', 'leads', 'tasks', 'calls'].map(
    (key) => ({ key }),
  )
  const top = ['deals', 'prospectos', 'inbox']

  it('without a layout the module keeps the order it ships with', () => {
    const arranged = arrangeSections({ items, top })
    expect(keys(arranged.top)).toEqual(['deals', 'prospectos', 'inbox'])
    expect(keys(arranged.rest)).toEqual(['leads', 'tasks', 'calls'])
    expect([...arranged.hidden]).toEqual([])
  })

  it('a saved layout moves sections between the parts and hides in place', () => {
    const arranged = arrangeSections({
      items,
      top,
      layout: {
        dock: ['inbox', 'tasks'],
        order: ['calls', 'deals', 'leads'],
        hidden: ['deals', 'inbox'],
      },
    })
    // Prospectos is not named: it keeps its suggested part, after the saved ones.
    expect(keys(arranged.top)).toEqual(['inbox', 'tasks', 'prospectos'])
    expect(keys(arranged.rest)).toEqual(['calls', 'deals', 'leads'])
    // A leading section is never hidden.
    expect([...arranged.hidden]).toEqual(['deals'])
  })

  it('a one-list module (Inmobiliaria homes) orders and hides only', () => {
    const homes = ['inmobiliaria', 'corretaje', 'cobranza'].map((key) => ({
      key,
    }))
    const arranged = arrangeSections({
      items: homes,
      layout: { order: ['cobranza', 'gone'], hidden: ['corretaje', 'gone'] },
    })
    expect(arranged.top).toEqual([])
    expect(keys(arranged.rest)).toEqual([
      'cobranza',
      'inmobiliaria',
      'corretaje',
    ])
    expect([...arranged.hidden]).toEqual(['corretaje'])
  })
})
