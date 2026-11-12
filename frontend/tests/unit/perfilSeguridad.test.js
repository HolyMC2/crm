// Mi perfil › Seguridad past the password: two-step verification (doco's
// two_step: Activar, the key for the app, the first code with the password,
// the recovery codes once; turning it off asks for the password and a code)
// and the devices signed in (sign out one, or all the others, two taps each).
// No login, email or session id is shown.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn(), theme: null }))
vi.mock('frappe-ui', async () => {
  const { h, ref } = await import('vue')
  state.theme = ref('light')
  return {
    call: (...args) => state.call(...args),
    frappeRequest: ({ url, params }) => state.call(url, params),
    toast: { success: vi.fn(), error: vi.fn() },
    useColorScheme: () => ({
      colorScheme: state.theme,
      setColorScheme: (value) => (state.theme.value = value),
    }),
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'type', 'form'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
              type: props.type || 'button',
              form: props.form,
              disabled: props.disabled,
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
            ? h('section', { role: 'dialog' }, [
                h('h2', props.title),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
  }
})

import { toast } from 'frappe-ui'
import {
  codesText,
  sessionsLine,
  twoStepLine,
} from '@/components/perfil/perfil'
import Perfil from '@/pages/Perfil.vue'
import { shellBoot } from '@/composables/muelleShell'

const EMAIL = 'karla@example.test'
const API = 'doco.docoutils.two_step.api.'
const USER = {
  name: EMAIL,
  first_name: 'Karla',
  last_name: 'Méndez',
  language: 'es-MX',
  time_zone: 'America/Mazatlan',
  email: EMAIL,
}
const OFF = {
  offered: true,
  on: false,
  enrolled: false,
  asked: false,
  required: false,
  codes_left: 0,
  since: null,
}
const ON = {
  ...OFF,
  on: true,
  enrolled: true,
  asked: true,
  codes_left: 10,
  since: '2026-11-11 10:00:00',
}
const CODES = Array.from({ length: 10 }, (_, i) => `AB${i}DE-FG${i}JK`)
const SESSIONS = [
  {
    id: 'aaa',
    device: 'Safari en iPhone',
    kind: 'phone',
    current: true,
    support: false,
    last_active: '2026-11-11 10:00:00',
    started: '2026-11-10 09:00:00',
  },
  {
    id: 'bbb',
    device: 'Chrome en Windows',
    kind: 'computer',
    current: false,
    support: false,
    last_active: '2026-11-11 09:00:00',
    started: '2026-11-09 09:00:00',
  },
]

let twoStep
function answer(method, args) {
  if (method === 'frappe.client.get') return { ...USER }
  if (method === 'frappe.client.get_list') return []
  if (method === 'frappe.core.doctype.user.user.get_timezones')
    return { timezones: [] }
  if (method === `${API}seguridad`)
    return { two_step: twoStep, sessions: { count: 2, current_kind: 'phone' } }
  if (method === `${API}empezar`)
    return {
      uri: 'otpauth://totp/Tienda:karla?secret=PLACEHOLDER&issuer=Tienda',
      qr: 'data:image/svg+xml;base64,AAAA',
      key: 'ABCD EFGH IJKL MNOP',
      issuer: 'Tienda',
      expires_in: 600,
    }
  if (method === `${API}confirmar`) {
    twoStep = ON
    return { codes: CODES, status: ON }
  }
  if (method === `${API}desactivar`) {
    twoStep = OFF
    return { status: OFF }
  }
  if (method === 'doco.docoutils.sesiones.sesiones')
    return { sessions: SESSIONS, trusted_devices: 0 }
  if (method === 'doco.docoutils.sesiones.cerrar_otras')
    return {
      closed: 1,
      sesiones: { sessions: [SESSIONS[0]], trusted_devices: 0 },
    }
  if (method === 'frappe.core.doctype.user.user.clear_session') return null
  if (method === 'crm.api.user.change_password') return null
  throw new Error(`unexpected ${method} ${JSON.stringify(args)}`)
}

let app, root
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function until(find, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const found = find()
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 10))
    await nextTick()
  }
  return find()
}
const $ = (id) => document.querySelector(`[data-testid="${id}"]`)
async function type(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}
async function mount() {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(Perfil) })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  await flush()
}
const calls = (method) =>
  state.call.mock.calls.filter(([name]) => name === method)

beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  shellBoot.value = {
    user: { name: EMAIL, full_name: 'Karla Méndez', puesto: 'Dueño' },
    modules: {},
  }
  twoStep = OFF
  toast.success.mockClear()
  toast.error.mockClear()
  state.call.mockReset()
  state.call.mockImplementation(async (method, args) => answer(method, args))
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  shellBoot.value = null
})

describe('what the rows say', () => {
  it('two-step: off, on with its codes, on with none left', () => {
    expect(twoStepLine(OFF)).toMatch(/^Off\./)
    expect(twoStepLine(ON)).toBe('On. 10 recovery codes left.')
    expect(twoStepLine({ ...ON, codes_left: 1 })).toBe(
      'On. 1 recovery code left.',
    )
    expect(twoStepLine({ ...ON, codes_left: 0 })).toMatch(/make new ones/)
    expect(twoStepLine({ ...ON, asked: false })).toMatch(/not asking/)
  })

  it('devices: only this one, or how many', () => {
    expect(sessionsLine({ count: 1 })).toBe('Only this device')
    expect(sessionsLine({ count: 3 })).toBe('3 devices, this one included')
  })

  it('the codes file names the shop and says each code works once', () => {
    const text = codesText(['ABCDE-FGHJK'], 'Tienda')
    expect(text).toContain('Recovery codes for Tienda')
    expect(text).toContain('ABCDE-FGHJK')
    expect(text).toContain('works once')
  })
})

describe('Seguridad', () => {
  it('without doco the rows stay hidden', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method === `${API}seguridad`) throw new Error('no such method')
      return answer(method, args)
    })
    await mount()
    expect(root.querySelector('[data-testid="perfil-password-row"]')).not.toBe(
      null,
    )
    expect(root.querySelector('[data-testid="perfil-dos-pasos-row"]')).toBe(
      null,
    )
    expect(root.querySelector('[data-testid="perfil-sesiones-row"]')).toBe(null)
  })

  it('where it is not offered only the devices row shows', async () => {
    twoStep = null
    await mount()
    expect(root.querySelector('[data-testid="perfil-dos-pasos-row"]')).toBe(
      null,
    )
    expect(
      root.querySelector('[data-testid="perfil-sesiones-row"]').textContent,
    ).toContain('2 devices, this one included')
  })

  it('a shared demo login gets no devices row', async () => {
    // doco answers sessions: null there: the other sessions are other visitors'.
    twoStep = null
    state.call.mockImplementation(async (method, args) =>
      method === `${API}seguridad`
        ? { two_step: null, sessions: null }
        : answer(method, args),
    )
    await mount()
    expect(root.querySelector('[data-testid="perfil-password-row"]')).not.toBe(
      null,
    )
    expect(root.querySelector('[data-testid="perfil-sesiones-row"]')).toBe(null)
  })

  it('turning it on: Activar, the key, the code with the password, the codes once', async () => {
    await mount()
    root.querySelector('[data-testid="perfil-dos-pasos-row"]').click()
    const turnOn = await until(() => $('dos-pasos-activar'))
    expect(calls(`${API}empezar`)).toHaveLength(0)
    turnOn.click()
    await until(() => $('dos-pasos-clave'))
    expect(calls(`${API}empezar`)).toHaveLength(1)
    expect($('dos-pasos-llave').textContent).toContain('ABCD EFGH IJKL MNOP')
    expect($('dos-pasos-qr').getAttribute('src')).toMatch(/^data:image\/svg/)
    $('dos-pasos-siguiente').click()
    await until(() => $('dos-pasos-form'))
    expect($('dos-pasos-falta').textContent).toContain('6 digits')
    expect($('dos-pasos-enviar').disabled).toBe(true)
    await type($('dos-pasos-codigo'), '123 456')
    await type($('dos-pasos-password'), 'Secreto1!')
    expect($('dos-pasos-enviar').disabled).toBe(false)
    $('dos-pasos-form').dispatchEvent(new Event('submit'))
    await until(() => $('dos-pasos-codigos'))
    expect(calls(`${API}confirmar`)[0][1]).toEqual({
      code: '123 456',
      password: 'Secreto1!',
    })
    const shown = $('dos-pasos-codigos').textContent
    for (const code of CODES) expect(shown).toContain(code)
    // Said in the sheet: a toast would sit over its actions on the phone.
    expect($('dos-pasos-hecho').textContent).toContain(
      'Two-step verification is on',
    )
    expect(toast.success).not.toHaveBeenCalled()
    // The other device can be signed out from here.
    $('dos-pasos-cerrar-otras').click()
    await flush()
    expect(calls('doco.docoutils.sesiones.cerrar_otras')).toHaveLength(1)
    expect($('dos-pasos-otras').textContent).toContain('signed out')
    $('dos-pasos-listo').click()
    await flush()
    expect($('dos-pasos-codigos')).toBe(null)
    expect(
      root.querySelector('[data-testid="perfil-dos-pasos-row"]').textContent,
    ).toContain('On. 10 recovery codes left.')
    expect(document.body.textContent).not.toContain(EMAIL)
  })

  it('turning it off asks for the password and a code', async () => {
    twoStep = ON
    await mount()
    root.querySelector('[data-testid="perfil-dos-pasos-row"]').click()
    await until(() => $('dos-pasos-activa'))
    expect($('dos-pasos-quedan').textContent).toContain('10 recovery codes')
    $('dos-pasos-desactivar').click()
    await until(() => $('dos-pasos-form'))
    expect($('dos-pasos-que-pasa').textContent).toContain(
      'signing in asks only for your password',
    )
    await type($('dos-pasos-codigo'), 'abcde-fghjk')
    await type($('dos-pasos-password'), 'Secreto1!')
    $('dos-pasos-form').dispatchEvent(new Event('submit'))
    await flush()
    expect(calls(`${API}desactivar`)[0][1]).toEqual({
      password: 'Secreto1!',
      code: 'abcde-fghjk',
    })
    expect($('dos-pasos-form')).toBe(null)
  })

  it('a refusal stays in the sheet with the server’s words', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method === `${API}confirmar`) {
        const error = new Error(`${API}confirmar ValidationError`)
        error.messages = ['That code did not match.']
        throw error
      }
      return answer(method, args)
    })
    await mount()
    root.querySelector('[data-testid="perfil-dos-pasos-row"]').click()
    ;(await until(() => $('dos-pasos-activar'))).click()
    ;(await until(() => $('dos-pasos-siguiente'))).click()
    await until(() => $('dos-pasos-form'))
    await type($('dos-pasos-codigo'), '000000')
    await type($('dos-pasos-password'), 'Secreto1!')
    const clockTip = 'set the time on your phone to automatic'
    expect($('dos-pasos-form').textContent).toContain(clockTip)
    $('dos-pasos-form').dispatchEvent(new Event('submit'))
    await flush()
    expect($('dos-pasos-problema').textContent).toContain(
      'That code did not match.',
    )
    // The refusal says it; the tip under the field does not repeat it.
    expect($('dos-pasos-form').textContent).not.toContain(clockTip)
    expect($('dos-pasos-codigos')).toBe(null)
  })

  it('copying the key says so on the button, not in a toast', async () => {
    const writeText = vi.fn(async () => {})
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    try {
      await mount()
      root.querySelector('[data-testid="perfil-dos-pasos-row"]').click()
      ;(await until(() => $('dos-pasos-activar'))).click()
      const copy = await until(() => $('dos-pasos-copiar-clave'))
      expect(copy.textContent).toContain('Copy key')
      copy.click()
      await flush()
      expect(writeText).toHaveBeenCalledWith('ABCDEFGHIJKLMNOP')
      expect($('dos-pasos-copiar-clave').textContent).toContain('Key copied')
      expect(toast.success).not.toHaveBeenCalled()
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
      else delete navigator.clipboard
    }
  })

  it('devices: this one first and never signed out from here; another with two taps', async () => {
    await mount()
    root.querySelector('[data-testid="perfil-sesiones-row"]').click()
    await until(() => $('sesiones-lista'))
    const rows = [...document.querySelectorAll('[data-testid="sesion"]')]
    expect(rows[0].textContent).toContain('This device')
    expect(rows[0].querySelector('[data-testid="sesion-cerrar"]')).toBe(null)
    const signOut = rows[1].querySelector('[data-testid="sesion-cerrar"]')
    signOut.click()
    await nextTick()
    expect(calls('frappe.core.doctype.user.user.clear_session')).toHaveLength(0)
    expect(signOut.textContent).toContain('Yes, sign out')
    signOut.click()
    await flush()
    expect(calls('frappe.core.doctype.user.user.clear_session')[0][1]).toEqual({
      sid_hash: 'bbb',
    })
    expect(document.querySelectorAll('[data-testid="sesion"]')).toHaveLength(1)
    expect(document.body.textContent).not.toContain(EMAIL)
  })

  it('all the other devices sign out with two taps', async () => {
    await mount()
    root.querySelector('[data-testid="perfil-sesiones-row"]').click()
    const all = await until(() => $('sesiones-cerrar-otras'))
    all.click()
    await nextTick()
    expect(calls('doco.docoutils.sesiones.cerrar_otras')).toHaveLength(0)
    $('sesiones-cerrar-otras').click()
    await flush()
    expect(calls('doco.docoutils.sesiones.cerrar_otras')).toHaveLength(1)
    expect(document.querySelectorAll('[data-testid="sesion"]')).toHaveLength(1)
    expect($('sesiones-aviso').textContent).toContain(
      'Signed out of 1 other device',
    )
    expect($('sesiones-cerrar-otras')).toBe(null)
  })

  it('a new password can also sign out the other devices', async () => {
    await mount()
    root.querySelector('[data-testid="perfil-password-row"]').click()
    const form = await until(() =>
      document.querySelector('[data-testid="perfil-password"]'),
    )
    const [current, next, confirm] = form.querySelectorAll(
      'input[type="password"]',
    )
    await type(current, 'Old1!aaa')
    await type(next, 'New2@bbbb')
    await type(confirm, 'New2@bbbb')
    const box = $('perfil-password-cerrar-otras')
    box.checked = true
    box.dispatchEvent(new Event('change'))
    await nextTick()
    form.dispatchEvent(new Event('submit'))
    await flush()
    expect(calls('crm.api.user.change_password')[0][1]).toEqual({
      old_password: 'Old1!aaa',
      new_password: 'New2@bbbb',
      logout_others: 1,
    })
  })
})
