// Mi perfil › Seguridad › «Correo»: changing the address the person signs in
// with (doco's cambio_correo). The row only where doco offers it; the new
// address and the password, then the code mailed to it, then the change,
// followed through doco's guest `progreso` since it signs this browser out;
// «Entrar» at the end, and «Reportar problema» where Muelle's own mail did not
// follow.
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
      props: ['open', 'title', 'dismissible'],
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

import {
  POLL_FAST_FOR_MS,
  POLL_MS,
  POLL_SLOW_MS,
  PROGRESS_KEY,
  SIGN_IN_URL,
  billingLine,
  codeDigits,
  codeGap,
  formGap,
  maskEmail,
  pollDelay,
  readProgress,
  refusalText,
  rowLine,
  sentLine,
  triesLine,
} from '@/components/perfil/correo'
import CorreoSheet from '@/components/perfil/CorreoSheet.vue'
import Perfil from '@/pages/Perfil.vue'
import { shellBoot } from '@/composables/muelleShell'

const EMAIL = 'karla@example.test'
const NEW = 'karla.nueva@correo.test'
const API = 'doco.docoutils.cambio_correo.api.'
const CHANGE = {
  offered: true,
  email: EMAIL,
  code_minutes: 15,
  pending: null,
  changing: false,
  billing: null,
}

let app, root
const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const $ = (id) => document.querySelector(`[data-testid="${id}"]`)
async function type(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}
async function tap(id) {
  $(id).click()
  await settle()
}
const calls = (method) =>
  state.call.mock.calls.filter(([name]) => name === method)

function progressAnswers(...answers) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ message: answers.shift() }),
  }))
}

async function mountSheet(change = CHANGE, io = {}) {
  const ways = {
    navigate: vi.fn(),
    fetcher: progressAnswers({ state: 'done', billing: 'none' }),
    report: vi.fn(() => true),
    ...io,
  }
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () => h(CorreoSheet, { open: true, change, io: ways }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  await settle()
  return ways
}

async function askAndConfirm() {
  await type($('correo-nuevo'), NEW)
  await type($('correo-contrasena'), 'secreta')
  await tap('correo-guardar')
  await type($('correo-codigo'), '042 137')
  await tap('correo-guardar')
}

beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  sessionStorage.clear()
  state.call.mockReset()
  state.call.mockImplementation(async (method) => {
    if (method === `${API}pedir_codigo`)
      return {
        ok: true,
        sent: true,
        email: NEW,
        expires_in: 900,
        code_minutes: 15,
      }
    if (method === `${API}confirmar`)
      return {
        ok: true,
        state: 'changing',
        cambio: 'tok-'.padEnd(32, 'x'),
        email: NEW,
      }
    if (method === `${API}reenviar_codigo`)
      return { ok: true, sent: true, email: NEW, expires_in: 900 }
    throw new Error(`unexpected ${method}`)
  })
})
afterEach(() => {
  vi.useRealTimers()
  app?.unmount()
  root?.remove()
  shellBoot.value = null
})

describe('what the person reads', () => {
  it('what stops «Enviar código», in the order it is fixed', () => {
    expect(formGap('', '', EMAIL)).toBe('Type the new email.')
    expect(formGap('karla', 'x', EMAIL)).toMatch(/valid email/)
    expect(formGap('Karla <k@x.mx>', 'x', EMAIL)).toMatch(/valid email/)
    expect(formGap(' KARLA@example.test ', 'x', EMAIL)).toMatch(/already/)
    expect(formGap(NEW, '', EMAIL)).toBe('Type your password.')
    expect(formGap(NEW, 'x', EMAIL)).toBe('')
  })

  it('a code is six digits however it is typed', () => {
    expect(codeDigits('042 137')).toBe('042137')
    expect(codeDigits('04-21-37-99')).toBe('042137')
    expect(codeGap('04213')).toMatch(/6 digits/)
    expect(codeGap('042137')).toBe('')
  })

  it('an old address shows masked', () => {
    expect(maskEmail('karla@example.test')).toBe('k•••@example.test')
    expect(maskEmail('')).toBe('•••')
  })

  it('the row says the address, a waiting code or Muelle’s mail', () => {
    expect(rowLine(null)).toBe('')
    expect(rowLine(CHANGE)).toBe(EMAIL)
    // Two lines at most on a 305 px phone: the sheet names the other address.
    expect(rowLine({ ...CHANGE, pending: { email: NEW } })).toBe(
      `${EMAIL}. Your code still needs typing`,
    )
    expect(
      rowLine({ ...CHANGE, billing: { state: 'kept', old: 'k•••@x.mx' } }),
    ).toBe(`${EMAIL}. Muelle still uses your old email`)
    expect(rowLine({ ...CHANGE, changing: true })).toBe('Changing your email…')
  })

  it('a wrong code says how many tries are left', () => {
    expect(triesLine(3)).toBe('3 tries left.')
    expect(triesLine(1)).toBe('1 try left.')
    expect(triesLine(0)).toBe('')
    expect(triesLine(undefined)).toBe('')
    const wrong = { ok: false, reason: 'wrong_code', message: 'Not right.' }
    expect(refusalText({ ...wrong, tries_left: 2 }, 'x')).toBe(
      'Not right. 2 tries left.',
    )
    expect(refusalText(wrong, 'x')).toBe('Not right.')
    // Only a wrong code counts tries; another refusal reads as doco said it.
    expect(
      refusalText(
        { ok: false, reason: 'wait', message: 'Wait.', tries_left: 2 },
        'x',
      ),
    ).toBe('Wait.')
    expect(refusalText(null, 'Fallback.')).toBe('Fallback.')
  })

  it('what happened to Muelle’s mail once the change is done', () => {
    expect(billingLine('synced', EMAIL)).toMatch(/will reach it too/)
    expect(billingLine('kept', EMAIL)).toMatch(/still go to k•••@example\.test/)
    expect(billingLine('kept', EMAIL)).not.toContain(EMAIL)
    // Boat has not answered: nothing is said, a team member included.
    expect(billingLine('pending', EMAIL)).toBe('')
    expect(billingLine('none', EMAIL)).toBe('')
  })

  it('the progress read is a GET with the token and no cookie', async () => {
    const fetcher = progressAnswers({ state: 'changing', slow: false })
    expect(await readProgress('a b', fetcher)).toEqual({
      state: 'changing',
      slow: false,
    })
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe(`/api/method/${API}progreso?cambio=a%20b`)
    // The session would resume under the old name while the rename runs.
    expect(options.credentials).toBe('omit')
  })

  it('reads often at first, then every ten seconds', () => {
    expect(pollDelay(0)).toBe(POLL_MS)
    expect(pollDelay(POLL_FAST_FOR_MS - 1)).toBe(POLL_MS)
    expect(pollDelay(POLL_FAST_FOR_MS)).toBe(POLL_SLOW_MS)
    // A 30-minute change stays inside doco's 120 reads in 10 minutes.
    let reads = 0
    for (let at = 0; at < 600000; at += pollDelay(at)) reads++
    expect(reads).toBeLessThan(120)
  })

  it('the code line says what is left of the code', () => {
    expect(sentLine(NEW, 900)).toBe(
      `We sent a code to ${NEW}. It expires in 15 minutes.`,
    )
    expect(sentLine(NEW, 120)).toMatch(/expires in 2 minutes/)
    expect(sentLine(NEW, 61)).toMatch(/expires in 2 minutes/)
    expect(sentLine(NEW, 45)).toMatch(/less than a minute/)
    expect(sentLine(NEW, 0)).toMatch(/expired/)
  })
})

describe('Cambiar correo', () => {
  it('the address and the password, then the code, then the change', async () => {
    vi.useFakeTimers()
    const io = await mountSheet(CHANGE, {
      fetcher: progressAnswers(
        { state: 'changing', slow: false },
        { state: 'done', billing: 'synced' },
      ),
    })
    expect(document.body.textContent).toContain(`You sign in with ${EMAIL}.`)
    expect($('correo-guardar').disabled).toBe(true)
    await askAndConfirm()
    expect(calls(`${API}pedir_codigo`)[0][1]).toEqual({
      email: NEW,
      password: 'secreta',
    })
    expect(calls(`${API}confirmar`)[0][1]).toEqual({ code: '042137' })
    expect($('correo-cambiando')).not.toBeNull()
    expect($('correo-cambiando').textContent).toContain(
      `When it ends, you sign in with ${NEW} and the same password.`,
    )
    // Nothing to tap while it runs: no actions bar.
    expect($('correo-guardar')).toBeNull()
    expect(document.querySelector('[role="dialog"] button')).toBeNull()
    expect(sessionStorage.getItem(PROGRESS_KEY)).toMatch(/^tok-/)

    await vi.advanceTimersByTimeAsync(POLL_MS)
    await settle()
    expect($('correo-cambiando')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await settle()
    expect($('correo-listo').textContent).toContain(
      `Done. You now sign in with ${NEW}.`,
    )
    expect($('correo-listo').textContent).toMatch(/will reach it too/)
    expect(sessionStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(io.fetcher.mock.calls[0][0]).toContain('cambio=tok-')
    await tap('correo-entrar')
    expect(io.navigate).toHaveBeenCalledWith(SIGN_IN_URL)
  })

  it('doco’s refusal shows under the fields, in its words', async () => {
    state.call.mockImplementation(async () => ({
      ok: false,
      reason: 'wrong_password',
      message: 'That password is not right. Type it again.',
    }))
    await mountSheet()
    await type($('correo-nuevo'), NEW)
    await type($('correo-contrasena'), 'otra')
    await tap('correo-guardar')
    expect($('correo-error').textContent).toBe(
      'That password is not right. Type it again.',
    )
    expect($('correo-nuevo')).not.toBeNull()
    expect($('correo-codigo')).toBeNull()
  })

  it('a wrong code clears the field and keeps the sheet on the code', async () => {
    state.call.mockImplementation(async (method) =>
      method === `${API}confirmar`
        ? {
            ok: false,
            reason: 'wrong_code',
            message: 'The code is not right. Check it and try again.',
            tries_left: 3,
          }
        : { ok: true, sent: true, email: NEW, expires_in: 900 },
    )
    await mountSheet()
    await askAndConfirm()
    expect($('correo-error').textContent).toBe(
      'The code is not right. Check it and try again. 3 tries left.',
    )
    expect($('correo-codigo').value).toBe('')
    expect(sessionStorage.getItem(PROGRESS_KEY)).toBeNull()
    // The refusal sits right under the code, before «Enviar otro código».
    const order = [...document.querySelectorAll('[data-testid]')].map((el) =>
      el.getAttribute('data-testid'),
    )
    expect(order.indexOf('correo-codigo')).toBeLessThan(
      order.indexOf('correo-error'),
    )
    expect(order.indexOf('correo-error')).toBeLessThan(
      order.indexOf('correo-reenviar'),
    )
  })

  it('a slow change can be closed from its own button', async () => {
    vi.useFakeTimers()
    await mountSheet(CHANGE, {
      fetcher: progressAnswers({ state: 'changing', slow: true }),
    })
    await askAndConfirm()
    expect($('correo-cerrar')).toBeNull()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await settle()
    expect($('correo-cambiando').textContent).toMatch(/longer than usual/)
    expect($('correo-cerrar')).not.toBeNull()
  })

  it('Enter in the form sends the code', async () => {
    await mountSheet()
    await type($('correo-nuevo'), NEW)
    await type($('correo-contrasena'), 'secreta')
    const submit = $('correo-guardar')
    expect(submit.getAttribute('type')).toBe('submit')
    expect(submit.getAttribute('form')).toBe('perfil-correo')
    document
      .getElementById('perfil-correo')
      .dispatchEvent(new Event('submit', { cancelable: true }))
    await settle()
    expect(calls(`${API}pedir_codigo`)).toHaveLength(1)
    expect($('correo-codigo')).not.toBeNull()
    // On the code, the button confirms by its own tap.
    expect($('correo-guardar').getAttribute('type')).toBe('button')
  })

  it('a request reopened later says what is left of its code', async () => {
    await mountSheet({ ...CHANGE, pending: { email: NEW, expires_in: 110 } })
    expect($('correo-enviado').textContent).toBe(
      `We sent a code to ${NEW}. It expires in 2 minutes.`,
    )
  })

  it('a request still waiting opens on its code', async () => {
    await mountSheet({ ...CHANGE, pending: { email: NEW, expires_in: 0 } })
    expect($('correo-enviado').textContent).toMatch(/expired/)
    await tap('correo-reenviar')
    expect(calls(`${API}reenviar_codigo`)).toHaveLength(1)
    expect($('correo-enviado').textContent).toBe(
      `We sent a code to ${NEW}. It expires in 15 minutes.`,
    )
  })

  it('a change that fails says the old address still works and offers a report', async () => {
    vi.useFakeTimers()
    const answer = state.call.getMockImplementation()
    state.call.mockImplementation(async (method, ...rest) =>
      method === `${API}estado` ? CHANGE : answer(method, ...rest),
    )
    const io = await mountSheet(CHANGE, {
      fetcher: progressAnswers({ state: 'failed' }),
    })
    await askAndConfirm()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await settle()
    expect($('correo-fallo').textContent).toContain(
      `You still sign in with ${EMAIL}.`,
    )
    expect($('correo-fallo-sesion')).toBeNull()
    await tap('correo-fallo-reportar')
    expect(io.report).toHaveBeenCalledWith(
      'I could not change the email I sign in with.',
    )
  })

  it('a change that fails after signing this browser out offers «Entrar»', async () => {
    vi.useFakeTimers()
    // The job ends every session before it renames: the profile read is refused.
    const io = await mountSheet(CHANGE, {
      fetcher: progressAnswers({ state: 'failed' }),
    })
    await askAndConfirm()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await settle()
    expect($('correo-fallo').textContent).toContain(
      `You still sign in with ${EMAIL}.`,
    )
    expect($('correo-fallo-sesion').textContent).toBe(
      'Your session ended. Sign in again with that email.',
    )
    expect($('correo-fallo-reportar')).toBeNull()
    await tap('correo-entrar')
    expect(io.navigate).toHaveBeenCalledWith(SIGN_IN_URL)
    expect(io.report).not.toHaveBeenCalled()
  })

  it('Muelle’s mail that did not follow is said, with «Reportar problema»', async () => {
    const io = await mountSheet({
      ...CHANGE,
      billing: { state: 'kept', old: 'k•••@viejo.test' },
    })
    expect($('correo-facturas').textContent).toContain(
      'Muelle’s invoices and notices still go to k•••@viejo.test.',
    )
    await tap('correo-reportar')
    expect(io.report).toHaveBeenCalledWith(
      expect.stringMatching(/still go to my old email/),
    )
  })
})

describe('the «Correo» row in Mi perfil', () => {
  let emailChange
  beforeEach(() => {
    shellBoot.value = {
      user: { name: EMAIL, full_name: 'Karla Méndez', puesto: 'Dueño' },
      modules: {},
    }
    state.call.mockImplementation(async (method) => {
      if (method === 'frappe.client.get')
        return { name: EMAIL, first_name: 'Karla', email: EMAIL }
      if (method === 'frappe.client.get_list') return []
      if (method === 'frappe.core.doctype.user.user.get_timezones')
        return { timezones: [] }
      if (method === 'doco.docoutils.two_step.api.seguridad')
        return { two_step: null, sessions: null, email_change: emailChange }
      throw new Error(`unexpected ${method}`)
    })
  })

  async function mountPerfil() {
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(Perfil) })
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.mount(root)
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await nextTick()
    }
  }

  it('is not there where doco does not offer it', async () => {
    emailChange = null
    await mountPerfil()
    expect($('perfil-password-row')).not.toBeNull()
    expect($('perfil-correo-row')).toBeNull()
  })

  it('shows the address and opens «Cambiar correo»', async () => {
    emailChange = CHANGE
    await mountPerfil()
    expect($('perfil-correo-row').textContent).toContain(EMAIL)
    $('perfil-correo-row').click()
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await nextTick()
    }
    expect($('correo-sheet')).not.toBeNull()
    expect($('correo-nuevo')).not.toBeNull()
  })
})
