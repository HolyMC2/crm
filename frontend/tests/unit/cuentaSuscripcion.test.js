// Mi cuenta › Resumen › «Tu suscripción» where Boat offers the cancel
// (capability «cancel»): one quiet «Cancelar suscripción» at the foot opens a
// sheet with Boat's dates and reasons, an optional note and a retention line
// that never blocks, and asks for the password again; once recorded, Resumen
// leads with «Tu suscripción termina el …» and «Reanudar». «Pedir mis datos»
// (in the sheet and in a recorded cancel) asks Resumen's export block for the
// copy, once the sheet is closed, with no detour through support; «¿Olvidaste
// tu contraseña?» sits under the password; a payment hold does not hold the
// cancel. Without the capability, or on a trial, nothing of it shows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  seam: vi.fn(),
  toast: vi.fn(),
  support: [],
  // Whether a sheet was still on screen when support opened.
  sheetAtSupport: [],
  exportStatus: vi.fn(),
  requestExport: vi.fn(),
  // Whether the cancel sheet was still on screen when the copy was asked for.
  sheetAtExport: [],
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
    toast: { success: (...args) => state.toast(...args), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'theme'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled,
              'data-variant': props.variant || 'subtle',
              'data-theme': props.theme || '',
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
  }
})
vi.mock('@/components/ui', async (importOriginal) => {
  const { h } = await import('vue')
  return {
    ...(await importOriginal()),
    BottomSheet: {
      props: ['open', 'title'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog', 'aria-label': props.title }, [
                h('h2', props.title),
                slots.default?.(),
                slots.actions?.(),
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
  requestExport: (...args) => {
    state.sheetAtExport.push(
      Boolean(document.querySelector('[data-testid="cancelar"]')),
    )
    return state.requestExport(...args)
  },
}))

import { createPagos } from '@/components/cuenta/pagos'
import CuentaResumen from '@/components/cuenta/CuentaResumen.vue'

const QUOTE = {
  ok: true,
  state: 'active',
  cancel_at: '2026-11-30',
  service_until: '2026-11-30',
  paused_on: '2026-12-01',
  export_until: '2026-12-30',
  archive_on: '2026-12-31',
  ends_now: false,
  unpaid_invoice: null,
  pending: null,
  reasons: [
    { value: 'expensive', label: 'Es muy caro' },
    { value: 'missing_feature', label: 'Me falta una función' },
    { value: 'closing', label: 'Cierro o vendo el negocio' },
  ],
  message: 'Tu servicio sigue hasta el 30 de noviembre de 2026.',
}

const RUNNING = {
  name: 'EXP-0001',
  status: 'En proceso',
  running: true,
  ready: false,
  expired: false,
  failed: false,
}

let app, root
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
// An async chunk's first import can take a while on a busy machine.
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
  state.read.mockReset()
  state.mutate.mockReset()
  state.seam.mockReset()
  state.toast.mockReset()
  state.support.length = 0
  state.sheetAtSupport.length = 0
  state.sheetAtExport.length = 0
  state.exportStatus.mockReset()
  state.exportStatus.mockResolvedValue({ export: null, can_request: true })
  state.requestExport.mockReset()
  state.requestExport.mockImplementation(async () => {
    state.exportStatus.mockResolvedValue({
      export: RUNNING,
      can_request: false,
    })
    return { export: RUNNING, already_running: false }
  })
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

function boot(capabilities, overrides = {}) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: {
      billing: {
        is_trial: false,
        monthly_price_mxn: 499,
        next_charge_date: '2026-12-04',
      },
    },
    invoices: [],
    payment_state: { status: 'ready', authoritative: true, invoices: {} },
    ...(capabilities ? { capabilities } : {}),
    ...overrides,
  }
}
function readyDoor(data) {
  const pagos = createPagos({
    read: (...args) => state.read(...args),
    mutate: (...args) => state.mutate(...args),
    navigate: vi.fn(),
    openSupport: (text) => {
      state.sheetAtSupport.push(
        Boolean(document.querySelector('[role="dialog"]')),
      )
      return state.support.push(text) > 0
    },
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = data
  pagos.loading.value = false
  pagos.resolvePaymentState(data.payment_state)
  return pagos
}
function mount(pagos) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const events = []
  app = createApp({
    render: () =>
      h(CuentaResumen, {
        door: pagos,
        actions: ['activate', 'pay', 'topup', 'support', 'plans'],
        onAct: (key) => events.push(key),
      }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  return events
}

describe('Tu suscripción', () => {
  it('no capability, or a trial: no block and nothing asked', async () => {
    mount(readyDoor(boot()))
    await flush()
    expect(root.querySelector('[data-testid="cuenta-suscripcion"]')).toBeNull()
    app.unmount()
    root.remove()
    mount(
      readyDoor(
        boot(['cancel'], {
          site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 1 },
          meters: { billing: { is_trial: true, trial_days_left: 5 } },
        }),
      ),
    )
    await flush()
    expect(root.querySelector('[data-testid="cuenta-suscripcion"]')).toBeNull()
    expect(state.seam).not.toHaveBeenCalled()
  })

  it('«Cancelar suscripción», a reason, the password: Boat records it and Resumen reads it', async () => {
    const recorded = boot(['cancel'], {
      cancel: {
        state: 'scheduled',
        cancel_at: '2026-11-30',
        service_until: '2026-11-30',
        export_until: '2026-12-30',
        can_resume: true,
      },
    })
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap' ? recorded : null,
    )
    state.seam.mockImplementation(async (method, payload, options) => {
      if (method === 'cancel_quote') return QUOTE
      if (method === 'cancel_subscription')
        return options?.password === 'secreto'
          ? { ok: true, changed: true, state: 'scheduled' }
          : {
              ok: false,
              reason: 'wrong_password',
              message: 'That password is not right. Type it again.',
              next: 'password',
            }
      return null
    })
    const events = mount(readyDoor(boot(['cancel'])))
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    expect(block.dataset.state).toBe('active')
    expect(root.textContent).toContain('Charged')
    // At the foot of Resumen, after the meters.
    expect(root.firstElementChild.lastElementChild).toBe(block)
    button('Cancel subscription', block).click()
    const sheet = await find('[data-testid="cancelar"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('cancel_quote')
    const dates = sheet.querySelector('[data-testid="cancelar-fechas"]')
    expect(dates.textContent).toContain('Your service runs until')
    expect(dates.textContent).toContain('30 de noviembre')
    expect(dates.textContent).toContain('30 de diciembre')
    expect(dates.textContent).toContain('31 de diciembre')
    expect(sheet.textContent).toContain(
      'Before you go, download a copy of your data',
    )
    expect(sheet.textContent).not.toContain('support')
    const confirm = document.querySelector('[data-testid="cancelar-confirmar"]')
    expect(confirm.disabled).toBe(true)
    expect(confirm.dataset.theme).toBe('red')
    expect(sheet.textContent).toContain(
      'Choose a reason and type your password to confirm.',
    )
    // A retention line answers the reason and never blocks.
    button('Me falta una función', sheet).click()
    await flush()
    expect(
      sheet.querySelector('[data-testid="cancelar-retener"]').textContent,
    ).toContain('Tell us in the note what you are missing')
    type(sheet.querySelector('[data-testid="cancelar-nota"]'), 'Facturación')
    type(sheet.querySelector('[data-testid="cancelar-password"]'), 'mal')
    await flush()
    expect(confirm.disabled).toBe(false)
    confirm.click()
    await flush()
    expect(
      sheet.querySelector('[data-testid="cancelar-error"]').textContent,
    ).toContain('That password is not right.')
    type(sheet.querySelector('[data-testid="cancelar-password"]'), 'secreto')
    await flush()
    document.querySelector('[data-testid="cancelar-confirmar"]').click()
    await flush()
    expect(state.seam).toHaveBeenLastCalledWith(
      'cancel_subscription',
      { reason: 'missing_feature', note: 'Facturación' },
      { password: 'secreto' },
    )
    expect(state.toast).toHaveBeenCalledWith('Your cancellation is recorded')
    expect(state.read).toHaveBeenCalledWith('bootstrap', { require_fresh: 1 })
    await flush()
    const now = root.querySelector('[data-testid="cuenta-suscripcion"]')
    expect(now.dataset.state).toBe('scheduled')
    expect(now.textContent).toContain('Your subscription ends on')
    expect(now.textContent).toContain('30 de noviembre')
    expect(events).toEqual([])
  })

  it('a recorded cancel leads Resumen with its date and «Reanudar»', async () => {
    const data = boot(['cancel'], {
      cancel: {
        state: 'scheduled',
        cancel_at: '2026-11-30',
        service_until: '2026-11-30',
        export_until: '2026-12-30',
        can_resume: true,
      },
    })
    state.seam.mockResolvedValue({
      ok: true,
      changed: true,
      state: 'active',
      message:
        'Listo: tu suscripción sigue activa. Tu próxima factura llega en la fecha de siempre.',
    })
    state.read.mockResolvedValue(boot(['cancel']))
    mount(readyDoor(data))
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    // Right after the plan header, before the meters; no next charge named.
    const sections = [...root.firstElementChild.children]
    expect(sections.indexOf(block)).toBe(1)
    expect(sections[0].textContent).not.toContain('Charged')
    expect(block.textContent).toContain('Your subscription ends on')
    expect(block.textContent).toContain(
      'You can ask for a copy of your data until',
    )
    button('Ask for my data', block).click()
    await flush()
    expect(state.requestExport).toHaveBeenCalledTimes(1)
    expect(state.support).toEqual([])
    expect(
      root.querySelector('[data-testid="cuenta-datos"]').dataset.state,
    ).toBe('running')
    block.querySelector('[data-testid="suscripcion-reanudar"]').click()
    await flush()
    expect(state.seam).toHaveBeenCalledWith('resume_subscription')
    expect(state.toast).toHaveBeenCalledWith(
      'Listo: tu suscripción sigue activa. Tu próxima factura llega en la fecha de siempre.',
    )
    expect(state.read).toHaveBeenCalledWith('bootstrap', { require_fresh: 1 })
  })

  it('«Pedir mis datos» closes the sheet, then Resumen’s export block asks for the copy', async () => {
    state.seam.mockResolvedValue(QUOTE)
    mount(readyDoor(boot(['cancel'])))
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    button('Cancel subscription', block).click()
    const sheet = await find('[data-testid="cancelar"]')
    await flush()
    sheet.querySelector('[data-testid="cancelar-datos"]').click()
    await flush()
    expect(state.requestExport).toHaveBeenCalledTimes(1)
    // Asked once the sheet is gone; support is never the way to the copy.
    expect(state.sheetAtExport).toEqual([false])
    expect(state.support).toEqual([])
    expect(document.querySelector('[data-testid="cancelar"]')).toBeNull()
    const exportBlock = root.querySelector('[data-testid="cuenta-datos"]')
    expect(exportBlock.dataset.state).toBe('running')
    expect(exportBlock.textContent).toContain('Preparing…')
  })

  it('«Pedir mis datos» sits above the reasons; the reason and the note wait for the way back, the password never', async () => {
    state.seam.mockResolvedValue(QUOTE)
    mount(readyDoor(boot(['cancel'])))
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    button('Cancel subscription', block).click()
    let sheet = await find('[data-testid="cancelar"]')
    await flush()
    // Under Boat's dates, before anything is typed.
    const ask = sheet.querySelector('[data-testid="cancelar-datos"]')
    const reasons = sheet.querySelector('[data-testid="cancelar-motivos"]')
    expect(
      ask.compareDocumentPosition(reasons) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    button('Es muy caro', sheet).click()
    type(sheet.querySelector('[data-testid="cancelar-nota"]'), 'Por ahora')
    type(sheet.querySelector('[data-testid="cancelar-password"]'), 'secreto')
    await flush()
    sheet.querySelector('[data-testid="cancelar-datos"]').click()
    await flush()
    expect(document.querySelector('[data-testid="cancelar"]')).toBeNull()
    expect(state.requestExport).toHaveBeenCalledTimes(1)

    // Back to the cancel: what was chosen and written is still there.
    button('Cancel subscription', block).click()
    sheet = await find('[data-testid="cancelar"]')
    await flush()
    expect(button('Es muy caro', sheet).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(sheet.querySelector('[data-testid="cancelar-nota"]').value).toBe(
      'Por ahora',
    )
    expect(sheet.querySelector('[data-testid="cancelar-password"]').value).toBe(
      '',
    )

    // «Seguir con mi suscripción» lets it go: the next cancel starts over.
    button('Keep my subscription').click()
    await flush()
    expect(document.querySelector('[data-testid="cancelar"]')).toBeNull()
    button('Cancel subscription', block).click()
    sheet = await find('[data-testid="cancelar"]')
    await flush()
    expect(button('Es muy caro', sheet).getAttribute('aria-pressed')).toBe(
      'false',
    )
    expect(sheet.querySelector('[data-testid="cancelar-nota"]').value).toBe('')
  })

  it('«Pedir mis datos» with a copy ready shows it and asks for nothing', async () => {
    state.seam.mockResolvedValue(QUOTE)
    state.exportStatus.mockResolvedValue({
      export: {
        name: 'EXP-0002',
        status: 'Lista',
        running: false,
        ready: true,
        size_label: '2.4 MB',
        expires_label: '18 de noviembre de 2026, 14:30',
      },
      can_request: true,
    })
    mount(readyDoor(boot(['cancel'])))
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    button('Cancel subscription', block).click()
    const sheet = await find('[data-testid="cancelar"]')
    await flush()
    sheet.querySelector('[data-testid="cancelar-datos"]').click()
    await flush()
    expect(state.requestExport).not.toHaveBeenCalled()
    const exportBlock = root.querySelector('[data-testid="cuenta-datos"]')
    expect(exportBlock.dataset.state).toBe('ready')
    expect(exportBlock.textContent).toContain('Download (zip)')
  })

  it('Boat keeps the data after the archive: the sheet says until when', async () => {
    state.seam.mockResolvedValue({ ...QUOTE, delete_after: '2027-12-31' })
    mount(readyDoor(boot(['cancel'])))
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    button('Cancel subscription', block).click()
    const dates = await find('[data-testid="cancelar-fechas"]')
    await flush()
    expect(dates.textContent).toContain('We archive your system on')
    expect(dates.textContent).toContain('We keep your information until')
    expect(dates.textContent).toContain('31 de diciembre de 2027')
  })

  it('«¿Olvidaste tu contraseña?» mails a link; locked out, the field stays with it', async () => {
    state.seam.mockImplementation(async (method) =>
      method === 'cancel_quote'
        ? QUOTE
        : {
            ok: false,
            reason: 'password_locked',
            message:
              'Too many wrong passwords. Wait 15 minutes and try again, or ask for a link to set a new password.',
            next: 'reset_password',
          },
    )
    state.mutate.mockResolvedValue({
      ok: true,
      message:
        'We sent you an email with a link to set a new password. Set it there, then come back and confirm here.',
    })
    mount(readyDoor(boot(['cancel'])))
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    button('Cancel subscription', block).click()
    const sheet = await find('[data-testid="cancelar"]')
    await flush()
    const forgot = sheet.querySelector('[data-testid="olvido-contrasena"]')
    expect(forgot.textContent).toContain('Forgot your password?')
    button('Me falta una función', sheet).click()
    type(sheet.querySelector('[data-testid="cancelar-password"]'), 'mal')
    await flush()
    document.querySelector('[data-testid="cancelar-confirmar"]').click()
    await flush()
    expect(
      sheet.querySelector('[data-testid="cancelar-error"]').textContent,
    ).toContain('ask for a link to set a new password')
    expect(sheet.querySelector('[data-testid="cancelar-password"]').value).toBe(
      '',
    )
    button('Forgot your password?', forgot).click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('password_reset')
    expect(
      forgot.querySelector('[data-testid="olvido-respuesta"]').textContent,
    ).toContain('We sent you an email with a link to set a new password.')
    expect(button('Forgot your password?', forgot)).toBeUndefined()
  })

  it('a link that cannot go out says why and offers support, after the sheet closes', async () => {
    state.seam.mockResolvedValue(QUOTE)
    state.mutate.mockResolvedValue({
      ok: false,
      reason: 'reset_unavailable',
      message: 'We could not send you the link. Ask support for help.',
      next: 'support',
    })
    const events = mount(readyDoor(boot(['cancel'])))
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    button('Cancel subscription', block).click()
    const sheet = await find('[data-testid="cancelar"]')
    await flush()
    const forgot = sheet.querySelector('[data-testid="olvido-contrasena"]')
    button('Forgot your password?', forgot).click()
    await flush()
    expect(forgot.textContent).toContain('We could not send you the link.')
    button('Ask support for help', forgot).click()
    await flush()
    expect(document.querySelector('[data-testid="cancelar"]')).toBeNull()
    expect(events).toEqual(['support'])
  })

  it('a payment hold does not hold the cancel: Boat’s quote answers for itself', async () => {
    state.seam.mockResolvedValue(QUOTE)
    const pagos = readyDoor(
      boot(['cancel'], {
        payment_state: {
          status: 'blocked',
          reason: 'invalid_payment_state',
          authoritative: true,
          invoices: {},
        },
      }),
    )
    expect(pagos.paymentHold.value).toBe(true)
    mount(pagos)
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    const cancel = block.querySelector('[data-testid="suscripcion-cancelar"]')
    expect(cancel.disabled).toBe(false)
    cancel.click()
    await find('[data-testid="cancelar"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('cancel_quote')
    // A request in flight still waits, with the sentence beside it.
    app.unmount()
    root.remove()
    const busy = readyDoor(boot(['cancel']))
    busy.busy.value = 'pay:INV-1'
    mount(busy)
    const again = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    expect(
      again.querySelector('[data-testid="suscripcion-cancelar"]').disabled,
    ).toBe(true)
    expect(again.textContent).toContain('A request is in progress.')
  })

  it('Boat refusing the quote says why in the sheet and offers no cancel', async () => {
    state.seam.mockResolvedValueOnce({
      ok: false,
      reason: 'invoice_run',
      message:
        'Estamos generando las facturas del mes. Intenta de nuevo en un rato.',
      next: null,
    })
    mount(readyDoor(boot(['cancel'])))
    const block = await find('[data-testid="cuenta-suscripcion"]')
    await flush()
    button('Cancel subscription', block).click()
    const refused = await find('[data-testid="cancelar-negado"]')
    await flush()
    expect(refused.textContent).toContain(
      'Estamos generando las facturas del mes.',
    )
    expect(
      document.querySelector('[data-testid="cancelar-confirmar"]'),
    ).toBeNull()
    expect(button('Keep my subscription')).toBeDefined()
  })
})
