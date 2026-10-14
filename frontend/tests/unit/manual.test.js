import { describe, expect, it, vi } from 'vitest'
import {
  hostedModules,
  isNeutralModule,
  moduleKeyFor,
} from '../../src/composables/muelleShell.js'
import {
  createDraftStore,
  draftKey,
  draftNotice,
  isDirty,
  listQuery,
  listState,
  memoryBackend,
  metaLine,
  placeActionUrl,
  placeAvailability,
  resolveLugar,
  statusBadge,
  vistasFor,
} from '../../src/composables/useManual.js'
import { createManualProvider } from '../../src/utils/manualPalette.js'
import { recoveryModule } from '../../src/utils/shellRoutes.js'
import {
  SHELL_MODULES,
  readReturn,
} from '../../src/vendor/muelle-shell/contracts'

const boot = (modules = {}) => ({ modules })
const on = (capabilities = { read: true }) => ({ enabled: true, capabilities })
const article = {
  name: 'a1b2c3',
  title: 'Política de garantías y devoluciones',
}

describe('Manual de la tienda boot', () => {
  it('is its own module and boots without the sales runtime', () => {
    expect(isNeutralModule('manual')).toBe(true)
    expect(hostedModules.find((m) => m.key === 'manual')?.to).toBe('/manual')
    expect(moduleKeyFor({ path: '/manual/a1b2c3', meta: {} })).toBe('manual')
    expect(recoveryModule('/manual/a1b2c3/editar')).toBe('manual')
  })

  it('contracts keep every key and go key unique', () => {
    const keys = SHELL_MODULES.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
    const go = SHELL_MODULES.map((m) => m.go).filter(Boolean)
    expect(new Set(go).size).toBe(go.length)
    const manual = SHELL_MODULES.find((m) => m.key === 'manual')
    expect(manual).toMatchObject({
      label: 'Manual de la tienda',
      basePath: '/manual',
      go: 'm',
    })
    // Never «Manual» alone in the shell.
    expect(SHELL_MODULES.some((m) => m.label === 'Manual')).toBe(false)
  })
})

describe('the place action', () => {
  const garantia = {
    key: 'garantias.nueva',
    action: 'Abrir garantía',
    path: '/crm/garantias?create=1',
    module: 'garantias',
    capability: 'create',
    installed: true,
  }

  it('opens the place with a way back to the article, label at most 40', () => {
    const url = placeActionUrl(garantia, article)
    expect(url.startsWith('/crm/garantias?')).toBe(true)
    const back = readReturn(url.split('?')[1])
    expect(back.to).toBe('/crm/manual/a1b2c3')
    expect(back.label.length).toBeLessThanOrEqual(40)
    expect(back.label.startsWith('Política de garantías')).toBe(true)
    expect(new URLSearchParams(url.split('?')[1]).get('create')).toBe('1')
  })

  it('refuses a path outside the Muelle apps', () => {
    for (const path of [
      'https://evil.invalid/x',
      '//evil.invalid/crm/x',
      '/app/sales-invoice',
      '/crm/../app',
      '',
    ])
      expect(placeActionUrl({ ...garantia, path }, article)).toBeNull()
  })

  it('an unavailable place gives the reason and a request to copy', () => {
    const off = placeAvailability(
      garantia,
      boot({ garantias: { enabled: false } }),
    )
    expect(off.available).toBe(false)
    expect(off.reason).toMatch(/Garantías/)
    expect(off.request).toMatch(/Garantías/)
    const noCreate = placeAvailability(
      garantia,
      boot({ garantias: on({ read: true, create: false }) }),
    )
    expect(noCreate.available).toBe(false)
    expect(noCreate.reason).toBeTruthy()
    expect(
      placeAvailability(
        garantia,
        boot({ garantias: on({ read: true, create: true }) }),
      ).available,
    ).toBe(true)
    const caja = {
      key: 'caja',
      label: 'Caja',
      action: 'Ir a Caja',
      path: '/posapp/',
      installed: false,
      reason: 'Caja no está instalada en este sistema.',
    }
    const missing = placeAvailability(caja, boot({}))
    expect(missing.available).toBe(false)
    expect(missing.reason).toBe('Caja no está instalada en este sistema.')
    expect(missing.request).toMatch(/Caja/)
    expect(
      placeAvailability({ ...caja, installed: true, allowed: true }, boot({}))
        .available,
    ).toBe(true)
  })
})

describe('list URL state', () => {
  it('restores q, categoria and vista and drops defaults', () => {
    const state = listState(
      { q: 'garant', categoria: 'Caja', vista: 'borradores' },
      true,
    )
    expect(state).toEqual({
      q: 'garant',
      categoria: 'Caja',
      vista: 'borradores',
    })
    expect(listQuery(state)).toEqual({
      q: 'garant',
      categoria: 'Caja',
      vista: 'borradores',
    })
    expect(listQuery(listState({}, true))).toEqual({})
    expect(listState(listQuery(state), true)).toEqual(state)
  })

  it('a reader never lands on drafts or retired', () => {
    expect(listState({ vista: 'borradores' }, false).vista).toBe('publicados')
    expect(listState({ vista: 'retirados' }, true).vista).toBe('retirados')
    expect(vistasFor(false).map((v) => v.value)).toEqual(['publicados'])
    expect(vistasFor(true).map((v) => v.value)).toEqual([
      'publicados',
      'borradores',
      'retirados',
    ])
  })

  it('rows say category and how fresh, badges only where they help', () => {
    const now = Date.parse('2026-10-14T12:00:00')
    expect(
      metaLine({ category: 'Caja', modified: '2026-10-11 12:00:00' }, now),
    ).toBe('Caja · updated hace 3 días')
    expect(statusBadge({ status: 'Borrador' }, true)?.label).toBe('Borrador')
    expect(statusBadge({ status: 'Borrador' }, false)).toBeNull()
    expect(
      statusBadge(
        { status: 'Publicado', published_on: '2026-10-12 09:00:00' },
        false,
        now,
      )?.label,
    ).toBe('New')
    expect(
      statusBadge(
        { status: 'Publicado', published_on: '2026-09-01 09:00:00' },
        false,
        now,
      ),
    ).toBeNull()
  })
})

describe('?lugar= resolution', () => {
  it('none, one opens it, several filter the list', () => {
    expect(resolveLugar([])).toEqual({ kind: 'none' })
    expect(resolveLugar([{ name: 'x' }])).toEqual({ kind: 'one', name: 'x' })
    expect(resolveLugar([{ name: 'x' }, { name: 'y' }])).toEqual({
      kind: 'many',
    })
  })
})

describe('editor drafts', () => {
  const base = { title: 'Cierre', body: '<p>a</p>', audience: [] }

  it('is dirty only when something changed', () => {
    expect(isDirty({ ...base }, base)).toBe(false)
    expect(isDirty({ ...base, title: 'Cierre de caja' }, base)).toBe(true)
    expect(isDirty({ ...base, audience: ['Cajero'] }, base)).toBe(true)
  })

  it('keeps typing in a draft and offers it back with its age', async () => {
    const store = createDraftStore(memoryBackend())
    const key = draftKey({ site: 's', user: 'ana@x', name: '' })
    expect(key).toBe('s:ana@x:manual:Shop Manual Article:new')
    await store.save(key, { ...base, title: 'A medias' }, base.modified)
    const stored = await store.load(key)
    expect(stored.form.title).toBe('A medias')
    const notice = draftNotice(
      stored,
      { modified: undefined },
      stored.at + 12 * 60000,
    )
    expect(notice).toMatch(/12/)
    await store.clear(key)
    expect(await store.load(key)).toBeNull()
  })

  it('warns when the draft started from an older version', async () => {
    const store = createDraftStore(memoryBackend())
    await store.save('k', { title: 'x' }, '2026-10-01 10:00:00')
    const stored = await store.load('k')
    expect(
      draftNotice(
        stored,
        { modified: '2026-10-02 10:00:00' },
        stored.at + 60000,
      ),
    ).toMatch(/older|anterior/i)
  })
})

describe('palette', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    name: `art-${i}`,
    title: `Garantía ${i}`,
    category: i % 2 ? 'Garantías' : 'Caja',
    modified: '2026-10-12 10:00:00',
  }))

  it('groups records, caps them at five and links the whole list', async () => {
    const api = vi.fn().mockResolvedValue({
      rows,
      has_more: true,
      categories: ['Caja', 'Garantías'],
    })
    const provider = createManualProvider({
      boot: { value: boot({ manual: on({ read: true, write: false }) }) },
      api,
    })
    expect(provider.label).toBe('Manual de la tienda')
    const items = await provider.search(
      { kind: 'text', text: 'garant', scope: 'all' },
      new AbortController().signal,
    )
    const records = items.filter((i) => i.group === 'registros')
    expect(records).toHaveLength(5)
    expect(records[0].href).toBe('/manual/art-0')
    const all = items.find((i) => i.id === 'manual.all')
    expect(all.group).toBe('ir_a')
    expect(all.href).toBe('/manual?q=garant')
    expect(items.some((i) => i.id === 'manual.categoria.Garantías')).toBe(true)
    // Readers get no «Nuevo artículo».
    expect(items.some((i) => i.group === 'acciones')).toBe(false)
  })

  it('editors get «Nuevo artículo»; off module answers nothing', async () => {
    const api = vi.fn().mockResolvedValue({ rows: [], categories: [] })
    const editor = createManualProvider({
      boot: { value: boot({ manual: on({ read: true, write: true }) }) },
      api,
    })
    const items = await editor.search(
      { kind: 'text', text: 'nuevo art', scope: 'all' },
      new AbortController().signal,
    )
    expect(items.find((i) => i.group === 'acciones')?.href).toBe(
      '/manual/nuevo',
    )
    const off = createManualProvider({
      boot: { value: boot({ manual: { enabled: false } }) },
      api,
    })
    expect(
      await off.search(
        { kind: 'text', text: 'x', scope: 'all' },
        new AbortController().signal,
      ),
    ).toEqual([])
    expect(
      await editor.search(
        { kind: 'empty', text: '', scope: 'all' },
        new AbortController().signal,
      ),
    ).toEqual([])
  })
})

describe('article body in the browser', () => {
  it('cleans the served body once more before rendering', async () => {
    const { articleHtml } = await import('../../src/utils/manualHtml.js')
    const html = articleHtml(
      '<p>Cuenta</p><img src="x" onerror="alert(1)"><script>alert(2)</script>' +
        '<a href="javascript:alert(3)">tres</a>' +
        '<p style="background-image:url(https://evil.invalid/t.png)">cuatro</p>' +
        '<a href="https://example.com" target="_blank">cinco</a>',
    )
    expect(html).toContain('Cuenta')
    expect(html).not.toMatch(/onerror|<script|alert\(2\)|javascript:|url\(/i)
    expect(html).toMatch(
      /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">/,
    )
  })
})
