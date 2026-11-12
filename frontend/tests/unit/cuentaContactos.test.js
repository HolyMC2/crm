// Mi cuenta › «Contactos» (capability «contacts»): who else receives Muelle's
// emails, by kind. The tab shows only where Boat lists the capability; it says
// the owner's address receives everything, lists each kind's addresses with
// where they stand, adds one with the code Boat mails to it (four taps from
// the tab: «Agregar correo», the address, «Enviar código», the code and
// «Confirmar»), removes one with the bin and «Borrar» in place, and pauses
// billing or technical notices for the contacts. Every call is a contacts_*
// seam through miplan.call; Boat's refusals show in its own words.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  seam: vi.fn(),
  call: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: (...args) => state.toast(...args), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'theme'],
      emits: ['click'],
      setup:
        (props, { emit, slots }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled,
              'data-variant': props.variant || 'subtle',
              onClick: () => emit('click'),
            },
            [slots.prefix?.(), props.label],
          ),
    },
  }
})
vi.mock('@/components/ui', async (importOriginal) => {
  const { h } = await import('vue')
  return {
    ...(await importOriginal()),
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
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
  read: (...args) => state.read(...args),
  mutate: (...args) => state.mutate(...args),
  seam: (...args) => state.seam(...args),
}))

import {
  codeDigits,
  codeGap,
  contactsView,
  createContacts,
  emailBreaks,
  emailGap,
} from '@/components/cuenta/contactos'
import Cuenta from '@/pages/Cuenta.vue'
import { shellBoot } from '@/composables/muelleShell'

const OWNER = 'duena@acme.mx'
const CONTADOR = 'contador@despacho.mx'
const GERENTE = 'gerente@acme.mx'

function answer({ billing = [], technical = [], account = [], off = [] } = {}) {
  const kind = (key, contacts) => ({
    key,
    optional: key !== 'account',
    enabled: !off.includes(key),
    contacts,
  })
  return {
    ok: true,
    owner_email: OWNER,
    max_per_category: 3,
    code_minutes: 15,
    categories: [
      kind('billing', billing),
      kind('technical', technical),
      kind('account', account),
    ],
  }
}
const verified = (email) => ({ email, verified: true, code_active: false })
const waiting = (email) => ({ email, verified: false, code_active: true })
const expired = (email) => ({ email, verified: false, code_active: false })

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

function boot(capabilities) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: { billing: { is_trial: false, monthly_price_mxn: 499 } },
    store: { addons: [] },
    invoices: [],
    payment_state: { status: 'ready', authoritative: true, invoices: {} },
    ...(capabilities ? { capabilities } : {}),
  }
}

let app, root
beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  shellBoot.value = null
})

async function page(path, data) {
  shellBoot.value = {
    user: { name: OWNER },
    modules: {},
    account: { cuenta: true, plan: null },
  }
  state.call.mockResolvedValue(shellBoot.value)
  state.read.mockImplementation(async (fn) =>
    fn === 'bootstrap'
      ? data
      : fn === 'payment_methods'
        ? { ok: true, cards: [] }
        : [],
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cuenta', component: Cuenta }],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(Cuenta) })
  app.use(router)
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  await flush()
  return router
}
const tabs = () =>
  [...root.querySelectorAll('[role="radio"]')].map((b) => b.textContent.trim())
const rowsOf = (key) =>
  [...root.querySelectorAll(`[data-testid="contactos-filas-${key}"] li`)].map(
    (li) => li.querySelector('p').textContent.trim(),
  )

describe('the contacts view', () => {
  it('reads Boat’s three kinds in the owner’s words, with each address’s state', () => {
    const view = contactsView(
      answer({
        billing: [verified(CONTADOR), waiting('caja@acme.mx')],
        technical: [expired(GERENTE)],
        off: ['technical'],
      }),
    )
    expect(view.owner).toBe(OWNER)
    expect(view.categories.map((k) => [k.key, k.title, k.enabled])).toEqual([
      ['billing', 'Billing', true],
      ['technical', 'Technical notices', false],
      ['account', 'Account', true],
    ])
    expect(
      view.categories[0].contacts.map((row) => [row.email, row.state]),
    ).toEqual([
      [CONTADOR, 'Receives these notices'],
      ['caja@acme.mx', 'Waiting for the code'],
    ])
    expect(view.categories[1].contacts[0].state).toBe(
      'Its code no longer works',
    )
    // A verified address of a kind switched off reads as paused.
    expect(
      contactsView(answer({ billing: [verified(CONTADOR)], off: ['billing'] }))
        .categories[0].contacts[0].state,
    ).toBe('Paused')
    expect(view.categories[2].optional).toBe(false)
    expect(contactsView({ ok: false, reason: 'disabled' })).toBeNull()
  })

  it('a kind is full at Boat’s limit', () => {
    const view = contactsView(
      answer({ billing: ['a@b.mx', 'c@d.mx', 'e@f.mx'].map(verified) }),
    )
    expect(view.categories[0].full).toBe(true)
    expect(view.categories[1].full).toBe(false)
  })

  it('the forms ask for a whole address, not the owner’s, and six digits', () => {
    expect(emailGap('')).toBe('Type the email.')
    expect(emailGap('contador@')).toBe('Check the email: it looks incomplete.')
    expect(emailGap(`${CONTADOR}, ${GERENTE}`)).toBe(
      'Check the email: it looks incomplete.',
    )
    expect(emailGap(' Duena@Acme.mx ', OWNER)).toBe(
      'That is your email: it already receives everything.',
    )
    expect(emailGap(CONTADOR, OWNER)).toBe('')
    expect(codeDigits('12 34-56 7')).toBe('123456')
    expect(codeGap('12345')).toBe('Type the 6-digit code.')
    expect(codeGap('123 456')).toBe('')
  })

  it('an address breaks after «@» or «.», never inside a name', () => {
    expect(emailBreaks('pagos@despacho-ruiz.com.mx')).toEqual([
      'pagos@',
      'despacho-ruiz.',
      'com.',
      'mx',
    ])
    expect(emailBreaks('pagos@despacho-ruiz.com.mx').join('')).toBe(
      'pagos@despacho-ruiz.com.mx',
    )
    expect(emailBreaks('')).toEqual([])
  })
})

describe('the contacts store', () => {
  it('each change is its contacts_* seam and Boat’s list replaces the shown one', async () => {
    const seam = vi.fn(async (method) =>
      method === 'contacts_get'
        ? answer()
        : answer({ billing: [waiting(CONTADOR)] }),
    )
    const contacts = createContacts({ seam })
    await contacts.load()
    expect(seam).toHaveBeenLastCalledWith('contacts_get', {})
    expect((await contacts.add('billing', ' Contador@Despacho.mx ')).ok).toBe(
      true,
    )
    expect(seam).toHaveBeenLastCalledWith('contacts_add', {
      category: 'billing',
      email: CONTADOR,
    })
    expect(contacts.answer.value.categories[0].contacts).toHaveLength(1)
    await contacts.verify('billing', CONTADOR, '123 456')
    expect(seam).toHaveBeenLastCalledWith('contacts_verify', {
      category: 'billing',
      email: CONTADOR,
      code: '123456',
    })
    await contacts.toggle('technical', false)
    expect(seam).toHaveBeenLastCalledWith('contacts_toggle', {
      category: 'technical',
      enabled: 0,
    })
    await contacts.remove('billing', CONTADOR)
    expect(seam).toHaveBeenLastCalledWith('contacts_remove', {
      category: 'billing',
      email: CONTADOR,
    })
  })

  it('a refusal keeps the list and says Boat’s sentence', async () => {
    const seam = vi.fn(async (method) =>
      method === 'contacts_get'
        ? answer({ billing: [verified(CONTADOR)] })
        : {
            ok: false,
            reason: 'full',
            message: 'Ya hay 3 correos en estos avisos.',
          },
    )
    const contacts = createContacts({ seam })
    await contacts.load()
    const result = await contacts.add('billing', GERENTE)
    expect(result).toMatchObject({
      ok: false,
      text: 'Ya hay 3 correos en estos avisos.',
    })
    expect(contacts.answer.value.categories[0].contacts).toHaveLength(1)
  })

  it('a read that answers after a change is dropped', async () => {
    let release
    const seam = vi.fn((method) =>
      method === 'contacts_get'
        ? new Promise((resolve) => (release = () => resolve(answer())))
        : Promise.resolve(answer({ billing: [waiting(CONTADOR)] })),
    )
    const contacts = createContacts({ seam })
    const reading = contacts.load()
    await contacts.add('billing', CONTADOR)
    release()
    await reading
    expect(contacts.answer.value.categories[0].contacts).toHaveLength(1)
  })
})

describe('Mi cuenta › Contactos', () => {
  it('no tab without the capability', async () => {
    await page('/cuenta?tab=contactos', boot(['history']))
    expect(tabs()).toEqual(['Summary', 'Billing', 'Store', 'History'])
    expect(root.querySelector('[data-testid="cuenta-contactos"]')).toBeNull()
    expect(state.seam).not.toHaveBeenCalledWith('contacts_get', {})
  })

  it('lists each kind, says the owner receives everything, and pauses a kind', async () => {
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'contacts_get')
        return answer({
          billing: [verified(CONTADOR)],
          technical: [waiting(GERENTE)],
        })
      if (method === 'contacts_toggle')
        return answer({
          billing: [verified(CONTADOR)],
          technical: [waiting(GERENTE)],
          off: payload.enabled ? [] : [payload.category],
        })
      return { ok: false, reason: 'disabled' }
    })
    await page('/cuenta?tab=contactos', boot(['contacts', 'history']))
    expect(tabs()).toEqual([
      'Summary',
      'Billing',
      'Store',
      'Contacts',
      'History',
    ])
    await find('[data-testid="contactos-billing"]')
    expect(
      root.querySelector('[data-testid="contactos-dueno"]').textContent.trim(),
    ).toBe(`You receive all of them at ${OWNER}.`)
    expect(rowsOf('billing')).toEqual([CONTADOR])
    expect(rowsOf('technical')).toEqual([GERENTE])
    expect(
      root.querySelector('[data-testid="contactos-account"]').textContent,
    ).toContain('Only you receive these.')
    // Account notices cannot be paused; billing can.
    expect(
      root.querySelector('[data-testid="contactos-switch-account"]'),
    ).toBeNull()
    const sw = root.querySelector('[data-testid="contactos-switch-billing"]')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    // The switch says what it does beside it: the contacts, not the owner.
    expect(root.querySelector(`label[for="${sw.id}"]`).textContent.trim()).toBe(
      'Send to these contacts too',
    )
    expect(sw.getAttribute('aria-label')).toBe(
      'Billing: send to these contacts too',
    )
    sw.click()
    await flush()
    expect(state.seam).toHaveBeenLastCalledWith('contacts_toggle', {
      category: 'billing',
      enabled: 0,
    })
    expect(
      root
        .querySelector('[data-testid="contactos-switch-billing"]')
        .getAttribute('aria-checked'),
    ).toBe('false')
    expect(
      root.querySelector('[data-testid="contactos-pausa-billing"]'),
    ).not.toBeNull()
    expect(rowsOf('billing')).toEqual([CONTADOR])
  })

  it('adds an accountant: the address, the code Boat mailed, and the row receives', async () => {
    let list = answer()
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'contacts_get') return list
      if (method === 'contacts_add') {
        list = answer({ billing: [waiting(payload.email)] })
        return { ...list, sent: true }
      }
      if (method === 'contacts_verify') {
        if (payload.code !== '123456')
          return {
            ok: false,
            reason: 'wrong_code',
            message: 'El código no es correcto. Revísalo e intenta de nuevo.',
            attempts_left: 4,
          }
        list = answer({ billing: [verified(payload.email)] })
        return { ...list, verified: true, changed: true }
      }
      return { ok: false, reason: 'disabled' }
    })
    await page('/cuenta?tab=contactos', boot(['contacts']))
    ;(await find('[data-testid="contactos-agregar-billing"]')).click()
    const dialog = await find('[role="dialog"]')
    expect(dialog.getAttribute('aria-label')).toBe('Add an email to Billing')
    const save = () =>
      root.ownerDocument.querySelector('[data-testid="contacto-guardar"]')
    expect(save().textContent.trim()).toBe('Send code')
    expect(save().disabled).toBe(true)
    type(await find('[data-testid="contacto-correo"]'), OWNER)
    await flush()
    expect(save().disabled).toBe(true)
    expect(dialog.textContent).toContain(
      'That is your email: it already receives everything.',
    )
    type(document.querySelector('[data-testid="contacto-correo"]'), CONTADOR)
    await flush()
    save().click()
    await flush()
    expect(state.seam).toHaveBeenCalledWith('contacts_add', {
      category: 'billing',
      email: CONTADOR,
    })
    expect(
      document.querySelector('[data-testid="contacto-enviado"]').textContent,
    ).toContain(`We sent a code to ${CONTADOR}. It expires in 15 minutes.`)
    expect(rowsOf('billing')).toEqual([CONTADOR])
    expect(save().textContent.trim()).toBe('Confirm')
    type(document.querySelector('[data-testid="contacto-codigo"]'), '654 321')
    await flush()
    save().click()
    await flush()
    expect(
      document.querySelector('[data-testid="contacto-error"]').textContent,
    ).toContain('El código no es correcto.')
    expect(document.querySelector('#cuenta-contacto-falta')).toBeNull()
    type(document.querySelector('[data-testid="contacto-codigo"]'), '12')
    await flush()
    expect(document.querySelector('[data-testid="contacto-error"]')).toBeNull()
    expect(
      document.querySelector('#cuenta-contacto-falta').textContent.trim(),
    ).toBe('Type the 6-digit code.')
    type(document.querySelector('[data-testid="contacto-codigo"]'), '123456')
    await flush()
    save().click()
    await flush()
    expect(state.seam).toHaveBeenLastCalledWith('contacts_verify', {
      category: 'billing',
      email: CONTADOR,
      code: '123456',
    })
    expect(state.toast).toHaveBeenCalledWith(
      `${CONTADOR} now receives these notices`,
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(
      root.querySelector('[data-testid="contactos-filas-billing"]').textContent,
    ).toContain('Receives these notices')
  })

  it('a contact confirmed while its kind is paused is told it receives nothing yet', async () => {
    let list = answer({ billing: [waiting(CONTADOR)], off: ['billing'] })
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'contacts_get') return list
      if (method === 'contacts_verify') {
        list = answer({ billing: [verified(payload.email)], off: ['billing'] })
        return { ...list, verified: true, changed: true }
      }
      return { ok: false, reason: 'disabled' }
    })
    await page('/cuenta?tab=contactos', boot(['contacts']))
    ;(await find('[data-testid="contacto-codigo-abrir"]')).click()
    expect((await find('[role="dialog"]')).getAttribute('aria-label')).toBe(
      'Confirm an email for Billing',
    )
    type(await find('[data-testid="contacto-codigo"]'), '123456')
    await flush()
    document.querySelector('[data-testid="contacto-guardar"]').click()
    await flush()
    expect(state.seam).toHaveBeenLastCalledWith('contacts_verify', {
      category: 'billing',
      email: CONTADOR,
      code: '123456',
    })
    expect(state.toast).toHaveBeenCalledWith(
      `${CONTADOR} is confirmed. These notices are paused: it receives nothing until you turn them back on.`,
    )
    expect(state.toast).not.toHaveBeenCalledWith(
      `${CONTADOR} now receives these notices`,
    )
    expect(
      root.querySelector('[data-testid="contactos-filas-billing"]').textContent,
    ).toContain('Paused')
  })

  it('a row whose code no longer works asks Boat for a new one as the sheet opens', async () => {
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'contacts_get')
        return answer({ technical: [expired(GERENTE)] })
      if (method === 'contacts_add')
        return {
          ...answer({ technical: [waiting(payload.email)] }),
          sent: true,
        }
      return { ok: false, reason: 'disabled' }
    })
    await page('/cuenta?tab=contactos', boot(['contacts']))
    const open = await find('[data-testid="contacto-codigo-abrir"]')
    expect(open.textContent.trim()).toBe('Send a new code')
    open.click()
    await flush()
    expect(state.seam).toHaveBeenCalledWith('contacts_add', {
      category: 'technical',
      email: GERENTE,
    })
    expect(document.querySelector('[data-testid="contacto-codigo"]')).not.toBe(
      null,
    )
  })

  it('«Ya enviamos un código» moves to the code instead of an error', async () => {
    state.seam.mockImplementation(async (method) => {
      if (method === 'contacts_get') return answer()
      if (method === 'contacts_add')
        return {
          ok: false,
          reason: 'wait',
          message: 'Ya enviamos un código a ese correo. Espera un minuto.',
          retry_in: 40,
        }
      return { ok: false, reason: 'disabled' }
    })
    await page('/cuenta?tab=contactos', boot(['contacts']))
    ;(await find('[data-testid="contactos-agregar-account"]')).click()
    type(await find('[data-testid="contacto-correo"]'), GERENTE)
    await flush()
    document.querySelector('[data-testid="contacto-guardar"]').click()
    await flush()
    expect(
      document.querySelector('[data-testid="contacto-enviado"]').textContent,
    ).toContain('Ya enviamos un código a ese correo.')
    expect(document.querySelector('[data-testid="contacto-error"]')).toBeNull()
  })

  it('removes with the bin and «Borrar» in place, and a full kind says why it has no add', async () => {
    let list = answer({
      billing: ['a@despacho.mx', 'b@despacho.mx', CONTADOR].map(verified),
    })
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'contacts_get') return list
      if (method === 'contacts_remove') {
        list = answer({
          billing: ['a@despacho.mx', 'b@despacho.mx'].map(verified),
        })
        return { ...list, changed: payload.email === CONTADOR }
      }
      return { ok: false, reason: 'disabled' }
    })
    await page('/cuenta?tab=contactos', boot(['contacts']))
    await find('[data-testid="contactos-filas-billing"]')
    expect(
      root.querySelector('[data-testid="contactos-agregar-billing"]'),
    ).toBeNull()
    expect(
      root.querySelector('[data-testid="contactos-billing"]').textContent,
    ).toContain('Up to 3 emails here. Remove one to add another.')
    const bins = [...root.querySelectorAll('[data-testid="contacto-borrar"]')]
    expect(bins.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove a@despacho.mx',
      'Remove b@despacho.mx',
      `Remove ${CONTADOR}`,
    ])
    bins[2].click()
    await flush()
    expect(state.seam).not.toHaveBeenCalledWith(
      'contacts_remove',
      expect.anything(),
    )
    const confirm = root.querySelector('[data-testid="contacto-borrar-si"]')
    expect(confirm.textContent.trim()).toBe('Delete')
    confirm.click()
    await flush()
    expect(state.seam).toHaveBeenLastCalledWith('contacts_remove', {
      category: 'billing',
      email: CONTADOR,
    })
    expect(rowsOf('billing')).toEqual(['a@despacho.mx', 'b@despacho.mx'])
    expect(state.toast).toHaveBeenCalledWith(
      `${CONTADOR} no longer receives these notices`,
    )
    expect(
      root.querySelector('[data-testid="contactos-agregar-billing"]'),
    ).not.toBeNull()
  })

  it('a refused read says Boat’s sentence and offers to try again', async () => {
    state.seam.mockResolvedValue({
      ok: false,
      reason: 'disabled',
      message: 'Los contactos para tus avisos todavía no están disponibles.',
    })
    await page('/cuenta?tab=contactos', boot(['contacts']))
    const alert = await find('[data-testid="cuenta-contactos"] [role="alert"]')
    expect(alert.textContent).toContain(
      'Los contactos para tus avisos todavía no están disponibles.',
    )
    expect(button('Try again', alert)).toBeTruthy()
  })
})
