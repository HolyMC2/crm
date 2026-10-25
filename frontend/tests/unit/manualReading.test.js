// Manual de la tienda, lane 2 (D5, restore): an editor asks the team to read a
// published article and sees who read it; a reader closes the ask with «Leído»;
// an editor brings back an older version from the history sheet. Mounted with a
// mocked doco.manual transport that records each POST.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'

import ManualArticulo from '@/pages/ManualArticulo.vue'
import HistorySheet from '@/components/manual/HistorySheet.vue'
import { readersLine } from '@/composables/useManual'

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const Stub = (name) => defineComponent({ name, render: () => h('p', name) })
const article = (extra = {}) => ({
  name: 'art1',
  title: 'Cierre de caja',
  category: 'Caja',
  summary: '',
  body: '<p>x</p>',
  status: 'Publicado',
  modified: '2026-10-25 10:00:00.000001',
  company: null,
  audience: [],
  place: null,
  history: [],
  can_edit: true,
  reading: { asked: false },
  readers: { asked: 0, read: 0, waiting: [] },
  ...extra,
})

let app
let root
let answers
let calls
beforeEach(() => {
  calls = []
  answers = { 'doco.manual.api.get_article': article() }
  globalThis.fetch = vi.fn(async (url, init) => {
    const method = String(url).replace('/api/method/', '')
    calls.push({ method, args: JSON.parse(init?.body || '{}') })
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: answers[method] }),
    }
  })
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

async function mountArticle() {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/manual', name: 'Manual', component: Stub('Manual') },
      {
        path: '/manual/:name/editar',
        name: 'ManualEditar',
        component: Stub('Editar'),
        props: true,
      },
      {
        path: '/manual/:name',
        name: 'ManualArticulo',
        component: ManualArticulo,
        props: true,
      },
    ],
  })
  router.push('/manual/art1')
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.config.globalProperties.__ = window.__ || globalThis.__
  app.mount(root)
  await flush()
}
const find = (id) => document.querySelector(`[data-testid="${id}"]`)
const posted = (name) => calls.filter((c) => c.method === `doco.manual.api.${name}`)

describe('«Pedir que lo lean» (D5)', () => {
  it('an editor asks the team to read a published article and is told how many were asked', async () => {
    await mountArticle()
    answers['doco.manual.api.ask_to_read'] = {
      ...article({ readers: { asked: 3, read: 0, waiting: ['Ana', 'Beto', 'Caro'] } }),
      asked_now: 3,
    }
    find('manual-ask-read').click()
    await flush()
    expect(posted('ask_to_read').at(-1).args).toEqual({ name: 'art1' })
    expect(find('manual-article-notice').textContent).toContain('3')
    expect(find('manual-readers').textContent).toContain('Read by 0 of 3')
    expect(find('manual-readers').textContent).toContain('Ana, Beto, Caro')
  })

  it('says so when everyone was already asked', async () => {
    await mountArticle()
    answers['doco.manual.api.ask_to_read'] = { ...article(), asked_now: 0 }
    find('manual-ask-read').click()
    await flush()
    expect(find('manual-article-notice').textContent).toMatch(/already/)
  })

  it('is only for an editor and only on a published article', async () => {
    answers['doco.manual.api.get_article'] = article({ status: 'Borrador' })
    await mountArticle()
    expect(find('manual-ask-read')).toBeNull()
    app.unmount()
    root.remove()
    answers['doco.manual.api.get_article'] = article({
      can_edit: false,
      readers: null,
    })
    await mountArticle()
    expect(find('manual-ask-read')).toBeNull()
    expect(find('manual-readers')).toBeNull()
  })

  it('the readers line counts who read it and names who is still waiting', () => {
    expect(readersLine({ asked: 0, read: 0, waiting: [] })).toBe('')
    expect(readersLine({ asked: 2, read: 2, waiting: [] })).toBe(
      'Read by 2 of 2',
    )
    expect(readersLine({ asked: 3, read: 1, waiting: ['Ana', 'Beto'] })).toBe(
      'Read by 1 of 3 · Waiting: Ana, Beto',
    )
  })
})

describe('«Leído» (D5)', () => {
  it('a reader who was asked taps «Read» and the ask goes away', async () => {
    answers['doco.manual.api.get_article'] = article({
      can_edit: false,
      readers: null,
      reading: { asked: true },
    })
    await mountArticle()
    expect(find('manual-read-ask')).not.toBeNull()
    answers['doco.manual.api.mark_read'] = article({
      can_edit: false,
      readers: null,
      reading: { asked: false },
    })
    find('manual-mark-read').click()
    await flush()
    expect(posted('mark_read').at(-1).args).toEqual({ name: 'art1' })
    expect(find('manual-read-ask')).toBeNull()
    expect(find('manual-article-notice')).not.toBeNull()
  })

  it('nobody asked: no banner', async () => {
    await mountArticle()
    expect(find('manual-read-ask')).toBeNull()
  })
})

describe('restore a version from the history (D4)', () => {
  const history = [
    { name: 'v3', who: 'Ana', when: '2026-10-25 09:00:00', fields: ['body'] },
    { name: 'v2', who: 'Ana', when: '2026-10-24 09:00:00', fields: ['title'] },
    { name: 'v1', who: 'Beto', when: '2026-10-23 09:00:00', created: true },
  ]

  it('every row but the newest can be restored; the restore is a new save', async () => {
    answers['doco.manual.api.get_article'] = article({ history })
    await mountArticle()
    find('manual-history').click()
    await flush()
    const buttons = document.querySelectorAll('[data-testid="manual-restore"]')
    expect(buttons.length).toBe(2)
    answers['doco.manual.api.restore_version'] = article({
      title: 'Cierre de caja (antes)',
      modified: '2026-10-25 11:00:00.000001',
    })
    buttons[0].click()
    await flush()
    const args = posted('restore_version').at(-1).args
    expect(args).toMatchObject({
      name: 'art1',
      version: 'v2',
      modified: '2026-10-25 10:00:00.000001',
    })
    expect(args.request_id).toBeTruthy()
    expect(find('manual-sheet')).toBeNull()
    expect(document.querySelector('h1').textContent).toContain('(antes)')
    expect(find('manual-article-notice').textContent).toMatch(/Restored/)
  })

  it('the sheet offers no restore unless the page allows it', async () => {
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () => h(HistorySheet, { history, title: 'Cierre' }),
    })
    app.config.globalProperties.__ = window.__ || globalThis.__
    app.mount(root)
    await flush()
    expect(find('manual-history-list')).not.toBeNull()
    expect(find('manual-restore')).toBeNull()
  })
})
