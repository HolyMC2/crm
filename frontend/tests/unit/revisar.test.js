// «Cambios propuestos» (RevisarDeck): what a swipe decides, the card's words,
// and the deck sending each decision and putting a refused card back.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import {
  freshCards,
  listOf,
  progressOf,
  sourceText,
  sureText,
  swipeAction,
} from '@/utils/revisar'

describe('revisar helpers', () => {
  it('decides by distance, flick or an upward pull, else goes back', () => {
    const box = { width: 400, height: 500, ms: 400 }
    expect(swipeAction({ ...box, dx: 150 })).toBe('apply')
    expect(swipeAction({ ...box, dx: -150 })).toBe('skip')
    expect(swipeAction({ ...box, dx: 60 })).toBe('')
    expect(swipeAction({ ...box, dx: 60, ms: 50 })).toBe('apply') // a flick
    expect(swipeAction({ ...box, dx: 10, dy: -200 })).toBe('edit')
    expect(swipeAction({ ...box, dx: 10, dy: 200 })).toBe('')
  })

  it('says how sure and where from, and lists compatible models', () => {
    expect(sureText(0.9)).toBe('Very sure')
    expect(sureText(0.7)).toBe('Fairly sure')
    expect(sureText(0.3)).toBe('Check it')
    expect(sourceText('proveedor')).toBe('Supplier list')
    expect(sourceText('nada')).toBe('')
    expect(
      listOf({
        campo: 'doco_compatible_con',
        despues: 'Samsung Galaxy A02\nSamsung Galaxy A12\n',
      }),
    ).toEqual(['Samsung Galaxy A02', 'Samsung Galaxy A12'])
    expect(listOf({ campo: 'doco_titulo', despues: 'x' })).toBeNull()
  })

  it('counts progress and never shows a card twice', () => {
    expect(progressOf({ total: 80, pendientes: 68 })).toEqual({
      done: 12,
      total: 80,
      share: 0.15,
    })
    const shown = [{ name: 'a' }]
    expect(
      freshCards(
        shown,
        [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        new Set(['c']),
      ),
    ).toEqual([{ name: 'b' }])
  })
})

const state = vi.hoisted(() => ({ calls: [], refuse: false }))
vi.mock('@/composables/useCompras', async (importOriginal) => {
  const actual = await importOriginal()
  const card = (name, titulo) => ({
    name,
    titulo,
    etiqueta: 'Título completo',
    campo: 'doco_titulo',
    antes_texto: '',
    despues: `${titulo} completo`,
    despues_texto: `${titulo} completo`,
    motivo: 'El nombre lo dice.',
    fuente: 'proveedor',
    confianza: 0.9,
  })
  return {
    ...actual,
    comprasApi: vi.fn(async (method, args) => {
      state.calls.push([method.split('.').pop(), args])
      if (method.endsWith('.bootstrap'))
        return {
          trabajos: [
            { name: 'L1', titulo: 'Enriquecer Pantallas (3)', pendientes: 2 },
          ],
          lote: 'L1',
          titulo: 'Enriquecer Pantallas (3)',
          estado: 'Listo',
          conteo: { total: 2, pendientes: 2 },
          tipos: [
            {
              grupo: 'titulo',
              label: 'Título completo',
              pendientes: 2,
              seguras: 2,
            },
          ],
          tarjetas: [
            card('p1', 'Pantalla SM A05 ORI'),
            card('p2', 'Pantalla iPhone 11 JK'),
          ],
          puede_editar: true,
          segura: 0.85,
        }
      if (method.endsWith('.decide')) {
        if (state.refuse) {
          const error = new Error(
            'No puedes editar «Pantalla SM A05 ORI»; pídelo al dueño.',
          )
          error.messages = [
            'No puedes editar «Pantalla SM A05 ORI»; pídelo al dueño.',
          ]
          throw error
        }
        return {
          estado: args.action === 'skip' ? 'Rechazada' : 'Aplicada',
          conteo: { total: 2, pendientes: 1 },
        }
      }
      if (method.endsWith('.undo'))
        return { estado: 'Pendiente', conteo: { total: 2, pendientes: 2 } }
      if (method.endsWith('.deck'))
        return { lote: 'L1', conteo: { total: 2, pendientes: 1 }, tarjetas: [] }
      return {}
    }),
  }
})

import RevisarDeck from '@/components/productos/RevisarDeck.vue'

let app, root
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount() {
  window.__ = (text, args) =>
    String(text).replace(/\{(\d+)\}/g, (_, i) => args?.[i] ?? '')
  window.matchMedia = () => ({ matches: true }) // reduced motion: no fly-out wait
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp(RevisarDeck, { lote: 'L1' })
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await settle()
}
const card = () => root.querySelector('[data-testid="revisar-tarjeta"]')
const click = async (id) => {
  root.querySelector(`[data-testid="${id}"]`).click()
  await settle()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  state.calls.length = 0
  state.refuse = false
})

describe('the deck', () => {
  it('applies the top card, skips the next and undoes the skip', async () => {
    await mount()
    expect(card().textContent).toContain('Pantalla SM A05 ORI completo')
    expect(card().textContent).toContain('Supplier list')
    await click('revisar-aplicar')
    expect(state.calls.find(([m]) => m === 'decide')[1]).toMatchObject({
      name: 'p1',
      action: 'apply',
      lote: 'L1',
    })
    expect(card().textContent).toContain('Pantalla iPhone 11 JK')
    await click('revisar-saltar')
    expect(state.calls.filter(([m]) => m === 'decide').at(-1)[1]).toMatchObject(
      { name: 'p2', action: 'skip' },
    )
    await click('revisar-deshacer')
    expect(state.calls.at(-1)).toEqual(['undo', { name: 'p2', lote: 'L1' }])
    expect(card().textContent).toContain('Pantalla iPhone 11 JK')
  })

  it('a refused decision puts the card back and says why; the keys decide too', async () => {
    await mount()
    state.refuse = true
    await click('revisar-aplicar')
    expect(card().textContent).toContain('Pantalla SM A05 ORI')
    expect(root.textContent).toContain('pídelo al dueño')
    state.refuse = false
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await settle()
    expect(state.calls.filter(([m]) => m === 'decide').at(-1)[1]).toMatchObject(
      { name: 'p1', action: 'skip' },
    )
  })

  it('the sure ones of a kind apply after a second tap', async () => {
    await mount()
    await click('revisar-seguras-titulo')
    expect(state.calls.some(([m]) => m === 'apply_safe')).toBe(false)
    expect(root.textContent).toContain('Yes, apply 2')
  })
})
