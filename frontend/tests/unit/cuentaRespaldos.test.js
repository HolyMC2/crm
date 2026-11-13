// Mi cuenta › Resumen › «Respaldos» (capability «backups», Boat my_backups and
// download_backup through miplan.call): the backup row of «Estado del sitio»
// opens the copies with their day and size, the newest, the next one and the
// copy kept off site; «Descargar» asks for the password, then gives Boat's
// 5-minute link. A late copy reads «Tu respaldo más reciente es de hace N
// días; ya lo estamos revisando» (never «al día») and offers no download,
// only «Pedir mis datos». Without the capability the row stays a row and
// nothing is asked. Nothing Boat may add reaches the screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  seam: vi.fn(),
  mutate: vi.fn(),
  exportStatus: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'theme', 'href'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          props.href
            ? h(
                'a',
                { href: props.href, 'data-testid': attrs['data-testid'] },
                props.label,
              )
            : h(
                'button',
                {
                  disabled: props.disabled || props.loading,
                  'data-testid': attrs['data-testid'],
                  onClick: () => emit('click'),
                },
                props.label,
              ),
    },
  }
})
vi.mock('@/components/ui', async (importOriginal) => {
  // renderSlot keys each branch of a conditional slot, as <slot> does.
  const { h, renderSlot } = await import('vue')
  return {
    ...(await importOriginal()),
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      emits: ['update:open'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog', 'aria-label': props.title }, [
                h('h2', props.title),
                renderSlot(slots, 'default'),
                renderSlot(slots, 'actions'),
              ])
            : null,
    },
  }
})
vi.mock('@/components/cuenta/api', async (importOriginal) => ({
  ...(await importOriginal()),
  seam: (...args) => state.seam(...args),
  mutate: (...args) => state.mutate(...args),
  exportStatus: (...args) => state.exportStatus(...args),
}))

import {
  backupOwner,
  backupsOn,
  backupsView,
  holdText,
  keepHour,
  linkUntil,
  linkView,
  offsiteText,
  readyText,
  sizeText,
  staleText,
  withBackupCopy,
} from '@/components/cuenta/respaldos'
import { createPagos } from '@/components/cuenta/pagos'
import CuentaResumen from '@/components/cuenta/CuentaResumen.vue'

// 2026-11-20 12:00 in a site at -07:00.
const NOW = new Date('2026-11-20T19:00:00Z')
const LINK = 'https://download.example/file/x?Authorization=tok'

function listing(over = {}) {
  return {
    ok: true,
    site: 'shop',
    configured: true,
    backups: [
      {
        id: 's/shop/backups/2026-11-20.sql.gz',
        file_name: '2026-11-20.sql.gz',
        size_bytes: 1288490189,
        uploaded_at: '2026-11-20T03:20:00-07:00',
      },
      {
        id: 's/shop/backups/2026-11-19.sql.gz',
        file_name: '2026-11-19.sql.gz',
        size_bytes: 367001600,
        uploaded_at: '2026-11-19T03:21:00-07:00',
      },
    ],
    newest_at: '2026-11-20T03:20:00-07:00',
    stale: false,
    offsite: { state: 'ok', at: '2026-11-20T00:05:00-07:00' },
    next_upload_at: '2026-11-21T03:20:00-07:00',
    hold: null,
    downloadable: true,
    bucket: 'backups-bucket-name',
    ...over,
  }
}

describe('the words', () => {
  it('sizes and the link’s last minute', () => {
    expect(sizeText(1288490189)).toBe('1.2\u00a0GB')
    expect(sizeText(367001600)).toBe('350\u00a0MB')
    expect(sizeText(12 * 1024)).toBe('12\u00a0KB')
    for (const bad of [0, -1, null, 'x', undefined])
      expect(sizeText(bad)).toBe('')
    expect(linkUntil(300, new Date(2026, 10, 20, 10, 20))).toBe('10:25')
    expect(linkUntil(300, new Date(2026, 10, 20, 0, 58))).toBe('1:03')
    expect(linkUntil(300, new Date(2026, 10, 20, 23, 57))).toBe('0:02')
    expect(linkUntil(0)).toBe('')
  })

  it('the ready line says «hasta la 1:05» at one o’clock, «hasta las» otherwise', () => {
    const said = []
    const real = window.__
    window.__ = (text, values, context) => {
      said.push([text, values, context])
      return real(text, values)
    }
    try {
      expect(readyText(300, new Date(2026, 10, 20, 0, 58))).toBe(
        'Your download is ready. The link works for 5 minutes, until 1:03.',
      )
      expect(readyText(300, new Date(2026, 10, 20, 13, 0))).toBe(
        'Your download is ready. The link works for 5 minutes, until 13:05.',
      )
    } finally {
      window.__ = real
    }
    expect(said).toEqual([
      [
        'Your download is ready. The link works for 5 minutes, until 1:{0}.',
        ['03'],
        'Cuenta',
      ],
      [
        'Your download is ready. The link works for 5 minutes, until {0}.',
        ['13:05'],
        'Cuenta',
      ],
    ])
    expect(readyText(0)).toBe('')
  })

  it('a copy’s hour stays with its «a las» on a narrow row', () => {
    expect(keepHour('12 de noviembre a las 3:20')).toBe(
      '12 de noviembre a\u00a0las\u00a03:20',
    )
    expect(keepHour('Hoy a la 1:05')).toBe('Hoy a\u00a0la\u00a01:05')
    expect(keepHour('Today at 13:05')).toBe('Today\u00a0at\u00a013:05')
    expect(keepHour('sin hora')).toBe('sin hora')
    for (const bad of ['', null, undefined]) expect(keepHour(bad)).toBe('')
  })

  it('a late copy says how old it is and never «al día»', () => {
    const text = staleText('2026-11-17T03:20:00-07:00', NOW)
    expect(text).toBe(
      'Your newest backup is from 3 days ago; we are already looking into it.',
    )
    expect(holdText('stale', '2026-11-17T03:20:00-07:00', NOW)).toBe(text)
    // Late by Boat's word but under two whole days: still two.
    expect(staleText('2026-11-18T18:00:00-07:00', NOW)).toContain('2 days')
    expect(holdText('review')).toBe(
      'We are checking your backups. You can download them again as soon as we finish.',
    )
    expect(holdText(null)).toBe('')
    expect(holdText('mystery')).toBe('')
  })

  it('the copy kept off site', () => {
    expect(
      offsiteText({ state: 'ok', at: '2026-11-20T00:05:00-07:00' }, NOW),
    ).toBe('Today at 0:05')
    expect(
      offsiteText({ state: 'late', at: '2026-11-17T00:05:00-07:00' }, NOW),
    ).toBe('Late; we are already looking into it')
    expect(offsiteText({ state: 'none' }, NOW)).toBe('Not yet')
    expect(offsiteText({ state: 'weird' }, NOW)).toBe('Not yet')
  })

  it('the sheet’s states', () => {
    expect(backupsView(null).state).toBe('loading')
    expect(
      backupsView({ ok: false, reason: 'disabled', message: 'Aún no.' }),
    ).toMatchObject({ state: 'off', message: 'Aún no.' })
    expect(backupsView({ ok: false, reason: 'unreachable' }).state).toBe(
      'failed',
    )
    expect(
      backupsView(listing({ hold: 'unavailable', backups: [] })).state,
    ).toBe('failed')
    const empty = backupsView(listing({ backups: [], newest_at: null }), NOW)
    expect(empty.state).toBe('empty')
    expect(empty.downloadable).toBe(false)
    expect(empty.facts.map((f) => f.key)).toEqual(['next', 'offsite'])

    const view = backupsView(listing(), NOW, { owner: true })
    expect(view.state).toBe('list')
    expect(view.rows).toEqual([
      {
        id: 's/shop/backups/2026-11-20.sql.gz',
        when: 'Today\u00a0at\u00a03:20',
        size: '1.2\u00a0GB',
      },
      {
        id: 's/shop/backups/2026-11-19.sql.gz',
        when: '19 de noviembre\u00a0at\u00a03:21',
        size: '350\u00a0MB',
      },
    ])
    expect(view.facts.map((f) => [f.label, f.value, Boolean(f.warn)])).toEqual([
      ['Newest backup', 'Today at 3:20', false],
      ['Next backup', '21 de noviembre at 3:20', false],
      ['Copy kept off site', 'Today at 0:05', false],
    ])
    expect(view.downloadable).toBe(true)
    expect(view.ownerOnly).toBe('')
    expect(view.held).toBe('')
    expect(JSON.stringify(view)).not.toMatch(/bucket|backups-bucket-name/)

    // «Mi Plan» (billing only) reads the list, never «Descargar», and why.
    for (const options of [{ owner: false }, undefined]) {
      const billing = backupsView(listing(), NOW, options)
      expect(billing.rows).toHaveLength(2)
      expect(billing.downloadable).toBe(false)
      expect(billing.ownerOnly).toBe(
        'Only the account owner can download a backup.',
      )
    }
    // Held, nothing to say about the owner: the held line says it all.
    expect(
      backupsView(listing({ hold: 'review' }), NOW, { owner: false }).ownerOnly,
    ).toBe('')

    const late = backupsView(
      listing({
        stale: true,
        hold: 'stale',
        downloadable: false,
        newest_at: '2026-11-17T03:20:00-07:00',
      }),
      NOW,
    )
    expect(late.downloadable).toBe(false)
    expect(late.stale).toBe(true)
    expect(late.held).toContain('3 days ago')
    expect(late.facts[0].warn).toBe(true)
    // A copy Boat holds never downloads, whatever `downloadable` says.
    expect(
      backupsView(listing({ hold: 'review' }), NOW, { owner: true })
        .downloadable,
    ).toBe(false)
  })

  it('Resumen’s backup row reads the copy «Respaldos» lists', () => {
    const rows = [
      { key: 'backup', label: 'Last backup', value: 'hoy', warn: false },
      { key: 'ssl', label: 'Security certificate', value: 'x', warn: false },
    ]
    const late = {
      capabilities: ['backups'],
      backups: { newest_at: '2026-11-17T03:20:00-07:00', stale: true },
    }
    expect(withBackupCopy(rows, late, NOW)).toEqual([
      {
        key: 'backup',
        label: 'Last backup',
        value: '17 nov',
        warn: true,
      },
      rows[1],
    ])
    expect(
      withBackupCopy(
        rows,
        {
          capabilities: ['backups'],
          backups: { newest_at: null, stale: false },
        },
        NOW,
      )[0],
    ).toMatchObject({ value: 'No record', warn: false })
    // Without the capability (or an older Boat) the row stays the site's own.
    expect(withBackupCopy(rows, { backups: late.backups }, NOW)).toBe(rows)
    expect(withBackupCopy(rows, { capabilities: ['backups'] }, NOW)).toBe(rows)
    expect(backupOwner({ account_owner: true })).toBe(true)
    expect(backupOwner({ account_owner: 'yes' })).toBe(false)
    expect(backupOwner(null)).toBe(false)
  })

  it('what download_backup answered', () => {
    expect(linkView({ ok: true, url: LINK, expires_in_sec: 300 })).toEqual({
      url: LINK,
      seconds: 300,
    })
    expect(linkView({ ok: true, url: 'javascript:alert(1)' }).refusal).toBe(
      'We could not prepare the download. Try again.',
    )
    expect(
      linkView({
        ok: false,
        reason: 'wrong_password',
        message: 'No.',
        next: 'password',
      }),
    ).toEqual({ refusal: 'No.', password: true, held: false })
    expect(
      linkView({ ok: false, reason: 'held', message: 'Revisando.' }).held,
    ).toBe(true)
    expect(backupsOn({ capabilities: ['backups'] })).toBe(true)
    expect(backupsOn({ capabilities: ['health'] })).toBe(false)
    expect(backupsOn({})).toBe(false)
  })
})

let app, root
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function find(selector) {
  for (let i = 0; i < 600; i++) {
    const found = document.querySelector(selector)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return null
}
const button = (text, scope = document) =>
  [...scope.querySelectorAll('button')].find((b) =>
    b.textContent.trim().startsWith(text),
  )
function type(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input'))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  state.seam.mockReset()
  state.mutate.mockReset()
  state.exportStatus.mockReset()
  state.exportStatus.mockResolvedValue({ export: null, can_request: true })
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  vi.useRealTimers()
})

function boot(capabilities, extra = { account_owner: true }) {
  return {
    ...extra,
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: {
      billing: { is_trial: false, monthly_price_mxn: 499 },
      health: { last_backup_at: '2026-11-20 03:20:00', ssl_days_left: 40 },
    },
    invoices: [],
    payment_state: { status: 'ready', authoritative: true, invoices: {} },
    ...(capabilities ? { capabilities } : {}),
  }
}
function mount(data) {
  const pagos = createPagos({
    read: vi.fn(),
    mutate: vi.fn(),
    navigate: vi.fn(),
    openSupport: () => true,
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = data
  pagos.loading.value = false
  pagos.resolvePaymentState(data.payment_state)
  root = document.createElement('div')
  document.body.appendChild(root)
  const events = []
  app = createApp({
    render: () =>
      h(CuentaResumen, {
        door: pagos,
        actions: ['activate', 'pay', 'support'],
        onAct: (key) => events.push(key),
      }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  return events
}
const backupCalls = (method) =>
  state.seam.mock.calls.filter(([name]) => name === method)

describe('Resumen’s backup row', () => {
  it('without the capability it is a row: no door, nothing asked', async () => {
    mount(boot(['health']))
    await flush()
    const sitio = root.querySelector('[data-testid="cuenta-sitio"]')
    expect(sitio.textContent).toContain('Last backup')
    expect(
      root.querySelector('[data-testid="cuenta-respaldos-abrir"]'),
    ).toBeNull()
    expect(backupCalls('my_backups')).toEqual([])
  })

  it('opens «Respaldos», then «Descargar», the password and Boat’s 5-minute link', async () => {
    state.seam.mockImplementation(async (method, payload, options) => {
      if (method === 'my_backups') return listing()
      if (method === 'download_backup')
        return options?.password === 'secreto'
          ? { ok: true, url: LINK, expires_in_sec: 300 }
          : {
              ok: false,
              reason: 'wrong_password',
              message: 'That password is not right. Type it again.',
              next: 'password',
            }
      return { ok: false, reason: 'disabled' }
    })
    mount(boot(['backups']))
    await flush()
    root.querySelector('[data-testid="cuenta-respaldos-abrir"]').click()
    const sheet = await find('[data-testid="respaldos"]')
    await flush()
    expect(backupCalls('my_backups')).toEqual([['my_backups']])
    const list = sheet.querySelector('[data-testid="respaldos-lista"]')
    expect(list.textContent).toContain('Today\u00a0at\u00a03:20')
    expect(list.textContent).toContain('1.2\u00a0GB')
    expect(list.textContent).toContain('19 de noviembre\u00a0at\u00a03:21')
    const facts = sheet.querySelector(
      '[data-testid="respaldos-datos"]',
    ).textContent
    expect(facts).toContain('Next backup')
    expect(facts).toContain('Copy kept off site')
    expect(sheet.textContent).not.toMatch(/s\/shop|sql\.gz|bucket/)

    sheet.querySelector('[data-testid="respaldo-descargar"]').click()
    await flush()
    const confirm = () =>
      document.querySelector('[data-testid="respaldo-confirmar"]')
    expect(confirm().disabled).toBe(true) // no password yet
    type(document.querySelector('[data-testid="respaldo-password"]'), 'mal')
    await flush()
    confirm().click()
    await flush()
    const refusal = document.querySelector('[data-testid="respaldo-error"]')
    expect(refusal.textContent).toContain('That password is not right.')
    // The refusal sits right under the field it is about.
    expect(refusal.previousElementSibling.tagName).toBe('LABEL')
    expect(
      document.querySelector('[data-testid="respaldo-password"]').value,
    ).toBe('')
    type(document.querySelector('[data-testid="respaldo-password"]'), 'secreto')
    await flush()
    confirm().click()
    await flush()
    expect(backupCalls('download_backup').at(-1)).toEqual([
      'download_backup',
      { backup_id: 's/shop/backups/2026-11-20.sql.gz' },
      { password: 'secreto' },
    ])
    const ready = document.querySelector('[data-testid="respaldo-listo"]')
    expect(ready.textContent).toContain('The link works for 5 minutes')
    // The link names the copy it downloads: its day and size.
    const chosen = document.querySelector(
      '[data-testid="respaldo-elegido"]',
    ).textContent
    expect(chosen).toContain('Today\u00a0at\u00a03:20')
    expect(chosen).toContain('1.2\u00a0GB')
    expect(
      document
        .querySelector('[data-testid="respaldo-enlace"]')
        .getAttribute('href'),
    ).toBe(LINK)
    // Back to the list: the link is gone.
    button('Back to backups').click()
    await flush()
    expect(document.querySelector('[data-testid="respaldo-enlace"]')).toBeNull()
    expect(
      document.querySelector('[data-testid="respaldo-elegido"]'),
    ).toBeNull()
    expect(
      document.querySelector('[data-testid="respaldos-lista"]'),
    ).not.toBeNull()
  })

  it('a late copy: the line, no «Descargar», and «Pedir mis datos» closes for the export', async () => {
    state.seam.mockImplementation(async (method) =>
      method === 'my_backups'
        ? listing({
            stale: true,
            hold: 'stale',
            downloadable: false,
            newest_at: '2026-11-17T03:20:00-07:00',
          })
        : { ok: false, reason: 'disabled' },
    )
    const events = mount(boot(['backups']))
    await flush()
    root.querySelector('[data-testid="cuenta-respaldos-abrir"]').click()
    const sheet = await find('[data-testid="respaldos"]')
    await flush()
    const held = sheet.querySelector(
      '[data-testid="respaldos-retenido"]',
    ).textContent
    expect(held).toContain(
      'Your newest backup is from 3 days ago; we are already looking into it.',
    )
    expect(sheet.textContent).not.toMatch(/al día|up to date/i)
    expect(sheet.querySelector('[data-testid="respaldo-descargar"]')).toBeNull()
    // The way on sits right under why, above the facts and the copies.
    expect(
      sheet.querySelector('[data-testid="respaldos-retenido"]')
        .nextElementSibling.dataset.testid,
    ).toBe('respaldos-datos-propios')
    button('Ask for my data', sheet).click()
    await flush()
    expect(document.querySelector('[data-testid="respaldos"]')).toBeNull()
    expect(events).toEqual([])
    expect(backupCalls('download_backup')).toEqual([])
  })

  it('Boat holding the link at the tap sends the owner back to the list, which says why', async () => {
    let held = false
    state.seam.mockImplementation(async (method) => {
      if (method === 'my_backups')
        return held
          ? listing({ hold: 'review', downloadable: false })
          : listing()
      held = true
      return {
        ok: false,
        reason: 'held',
        hold: 'review',
        message: 'Revisando.',
      }
    })
    mount(boot(['backups']))
    await flush()
    root.querySelector('[data-testid="cuenta-respaldos-abrir"]').click()
    const sheet = await find('[data-testid="respaldos"]')
    await flush()
    sheet.querySelector('[data-testid="respaldo-descargar"]').click()
    await flush()
    type(document.querySelector('[data-testid="respaldo-password"]'), 'secreto')
    await flush()
    document.querySelector('[data-testid="respaldo-confirmar"]').click()
    await flush()
    expect(
      document.querySelector('[data-testid="respaldos-retenido"]').textContent,
    ).toContain('We are checking your backups.')
    expect(
      document.querySelector('[data-testid="respaldo-descargar"]'),
    ).toBeNull()
    expect(backupCalls('my_backups').length).toBe(2)
  })

  it('«Mi Plan» sees the copies and why it cannot download them', async () => {
    state.seam.mockImplementation(async (method) =>
      method === 'my_backups' ? listing() : { ok: false, reason: 'disabled' },
    )
    mount(boot(['backups'], { account_owner: false }))
    await flush()
    root.querySelector('[data-testid="cuenta-respaldos-abrir"]').click()
    const sheet = await find('[data-testid="respaldos"]')
    await flush()
    expect(
      sheet.querySelector('[data-testid="respaldos-lista"]').textContent,
    ).toContain('Today\u00a0at\u00a03:20')
    expect(sheet.querySelector('[data-testid="respaldo-descargar"]')).toBeNull()
    expect(
      sheet.querySelector('[data-testid="respaldos-solo-dueno"]').textContent,
    ).toContain('Only the account owner can download a backup.')
    expect(backupCalls('download_backup')).toEqual([])
  })

  it('the row shows the newest copy «Respaldos» lists, late in amber', async () => {
    const data = boot(['backups'])
    data.backups = { newest_at: '2026-11-17T03:20:00-07:00', stale: true }
    mount(data)
    await flush()
    const row = root.querySelector('[data-testid="cuenta-respaldos-abrir"]')
    expect(row.textContent).toContain('17 nov')
    expect(row.querySelector('.lucide-triangle-alert')).not.toBeNull()
  })

  it('a failed read is one line with «Volver a intentar»; Boat’s «disabled» says its sentence', async () => {
    state.seam.mockRejectedValueOnce(new Error('platform down'))
    mount(boot(['backups']))
    await flush()
    root.querySelector('[data-testid="cuenta-respaldos-abrir"]').click()
    await find('[data-testid="respaldos"]')
    await flush()
    const line = document.querySelector('[data-testid="respaldos-sin-lectura"]')
    expect(line.textContent).toContain(
      'We could not read your backups right now.',
    )
    expect(line.textContent).not.toContain('platform down')
    state.seam.mockResolvedValueOnce({
      ok: false,
      reason: 'disabled',
      message: 'Los respaldos todavía no están disponibles para tu sistema.',
    })
    button('Try once more', line).click()
    await flush()
    expect(
      document.querySelector('[data-testid="respaldos-apagado"]').textContent,
    ).toContain('todavía no están disponibles')
  })
})
