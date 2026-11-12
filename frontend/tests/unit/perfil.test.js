// Mi perfil (/crm/perfil) for every signed-in person, Ventas or not: the name
// and photo from their own User, the password through crm.api.user, theme,
// language and time zone. No login or email is shown.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn(), theme: null }))
vi.mock('frappe-ui', async () => {
  const { h, ref } = await import('vue')
  state.theme = ref('light')
  return {
    call: (...args) => state.call(...args),
    // Seguridad's reads are GETs; without doco they fail and the rows hide.
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

import {
  languageLabel,
  nameOf,
  passwordProblem,
  timezoneGroups,
  zoneLabel,
} from '@/components/perfil/perfil'
import Perfil from '@/pages/Perfil.vue'
import { shellBoot } from '@/composables/muelleShell'

const USER = {
  name: 'karla@example.test',
  first_name: 'Karla',
  last_name: 'Méndez',
  user_image: '',
  language: 'es-MX',
  time_zone: 'America/Mazatlan',
  email: 'karla@example.test',
}

describe('rules', () => {
  it('a password says what is missing, in the order it is fixed', () => {
    expect(passwordProblem('', '', '')).toBe('Type your current password.')
    expect(passwordProblem('Old1!aaa', 'Old1!aaa', '')).toBe(
      'The new password must be different from the current one.',
    )
    expect(passwordProblem('Old1!aaa', 'short', '')).toBe(
      'The new password needs at least 8 characters.',
    )
    expect(passwordProblem('Old1!aaa', 'longbutweak', '')).toBe(
      'Mix lowercase, uppercase, a number and a symbol.',
    )
    expect(passwordProblem('Old1!aaa', 'New2@bbbb', 'New2@bbbc')).toBe(
      'The two new passwords do not match.',
    )
    expect(passwordProblem('Old1!aaa', 'New2@bbbb', 'New2@bbbb')).toBe('')
  })

  it('a time zone reads as its clock and city, never its id', () => {
    const now = new Date(2026, 10, 11, 10, 0)
    const label = zoneLabel('America/Mexico_City', now)
    // Mexico's cities as their people write them, accents included.
    expect(label).toMatch(/\(Ciudad de México\)$/)
    expect(zoneLabel('America/Mazatlan', now)).toMatch(/\(Mazatlán\)$/)
    expect(zoneLabel('Europe/Madrid', now)).toMatch(/\(Madrid\)$/)
    expect(label).not.toContain('America/')
    expect(label).not.toContain('_')
    expect(label[0]).toBe(label[0].toUpperCase())
    expect(zoneLabel('')).toBe('')
  })

  it('the shop’s zone and the zones on its clock come first', () => {
    const now = new Date(2026, 10, 11, 10, 0)
    const { suggested, rest } = timezoneGroups(
      [
        'Africa/Abidjan',
        'America/Mexico_City',
        'Europe/Madrid',
        'America/Mazatlan',
      ],
      { shop: 'America/Mazatlan', mine: 'Europe/Madrid', now },
    )
    const ids = suggested.map((row) => row.value)
    expect(ids).toContain('America/Mazatlan')
    expect(ids).toContain('Europe/Madrid')
    expect(ids).not.toContain('Africa/Abidjan')
    expect(rest.map((row) => row.value)).toContain('Africa/Abidjan')
    expect(
      [...suggested, ...rest].every((row) => !row.label.includes('/')),
    ).toBe(true)
  })

  it('a language outside the list reads as its name, never its code', () => {
    expect(languageLabel('pt-BR')).toMatch(/^Portugués/)
    expect(languageLabel('xx-unknown-zz-1')).toBe('Your current language')
  })

  it('the name is what the person typed, never a login', () => {
    expect(nameOf(USER)).toBe('Karla Méndez')
    expect(nameOf({ full_name: 'Karla' })).toBe('Karla')
    expect(nameOf({ name: 'karla@example.test' })).toBe('')
  })
})

let app, root
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
// The sheets are async chunks: wait for their first render.
async function until(find, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const found = find()
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 10))
    await nextTick()
  }
  return find()
}
async function mount() {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(Perfil) })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  await flush()
}
beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  shellBoot.value = {
    user: { name: USER.name, full_name: 'Karla Méndez', puesto: 'Cajero' },
    modules: {},
  }
  state.call.mockReset()
  state.call.mockImplementation(async (method, args) => {
    if (method === 'frappe.client.get') return { ...USER }
    if (method === 'frappe.client.get_list')
      return [
        { name: 'es-MX', language_name: 'Español (México)' },
        { name: 'en', language_name: 'English' },
      ]
    if (method === 'frappe.core.doctype.user.user.get_timezones')
      return { timezones: ['America/Mazatlan', 'America/Mexico_City'] }
    if (method === 'frappe.client.set_value')
      return { ...USER, ...args.fieldname }
    if (method === 'crm.api.user.change_password') return null
    throw new Error(`unexpected ${method}`)
  })
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  shellBoot.value = null
})

describe('the Perfil page', () => {
  it('a cashier without Ventas sees their name and puesto, never their login', async () => {
    await mount()
    expect(state.call).toHaveBeenCalledWith('frappe.client.get', {
      doctype: 'User',
      name: USER.name,
    })
    expect(
      root.querySelector('[data-testid="perfil-nombre-actual"]').textContent,
    ).toContain('Karla Méndez')
    expect(root.textContent).toContain('Cajero')
    expect(root.textContent).not.toContain('karla@example.test')
    expect(root.textContent).toContain('Password')
    expect(root.querySelector('[data-testid="perfil-idioma"]').value).toBe(
      'es-MX',
    )
  })

  it('the pencil opens the name sheet and «Guardar nombre» writes only the name', async () => {
    await mount()
    root.querySelector('[data-testid="perfil-editar-nombre"]').click()
    const form = await until(() =>
      document.querySelector('[data-testid="perfil-nombre"]'),
    )
    const [first] = form.querySelectorAll('input')
    first.value = 'Karlita'
    first.dispatchEvent(new Event('input'))
    await nextTick()
    form.dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenCalledWith('frappe.client.set_value', {
      doctype: 'User',
      name: USER.name,
      fieldname: { first_name: 'Karlita', last_name: 'Méndez' },
    })
    expect(
      root.querySelector('[data-testid="perfil-nombre-actual"]').textContent,
    ).toContain('Karlita Méndez')
    expect(shellBoot.value.user.full_name).toBe('Karlita Méndez')
  })

  it('the password sheet says what is missing and sends the change', async () => {
    await mount()
    root.querySelector('[data-testid="perfil-password-row"]').click()
    const form = await until(() =>
      document.querySelector('[data-testid="perfil-password"]'),
    )
    expect(
      document.querySelector('[data-testid="perfil-password-hint"]')
        .textContent,
    ).toContain('Type your current password.')
    const [current, next, confirm] = form.querySelectorAll('input')
    for (const [input, value] of [
      [current, 'Old1!aaa'],
      [next, 'New2@bbbb'],
      [confirm, 'New2@bbbb'],
    ]) {
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    await nextTick()
    form.dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenCalledWith('crm.api.user.change_password', {
      old_password: 'Old1!aaa',
      new_password: 'New2@bbbb',
    })
  })

  it('the theme applies at once; a new language saves and reopens Muelle', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    await mount()
    const dark = [...root.querySelectorAll('[role="radio"]')].find((b) =>
      b.textContent.includes('Dark'),
    )
    dark.click()
    expect(state.theme.value).toBe('dark')
    expect(
      root.querySelector('[data-testid="perfil-guardar-preferencias"]'),
    ).toBeNull()
    const language = root.querySelector('[data-testid="perfil-idioma"]')
    language.value = 'en'
    language.dispatchEvent(new Event('change'))
    await flush()
    root.querySelector('[data-testid="perfil-guardar-preferencias"]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith('frappe.client.set_value', {
      doctype: 'User',
      name: USER.name,
      fieldname: { language: 'en', time_zone: 'America/Mazatlan' },
    })
    expect(reload).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('a photo is removed with two taps in place', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method === 'frappe.client.get')
        return { ...USER, user_image: '/files/karla.jpg' }
      if (method === 'frappe.client.set_value')
        return { ...USER, ...args.fieldname }
      return []
    })
    await mount()
    const remove = () =>
      root.querySelector('[data-testid="perfil-quitar-foto"]')
    remove().click()
    await nextTick()
    expect(remove().textContent.trim()).toBe('Remove')
    expect(state.call).not.toHaveBeenCalledWith(
      'frappe.client.set_value',
      expect.anything(),
    )
    remove().click()
    await flush()
    expect(state.call).toHaveBeenCalledWith('frappe.client.set_value', {
      doctype: 'User',
      name: USER.name,
      fieldname: { user_image: '' },
    })
    expect(remove()).toBeNull()
  })

  it('an armed «Quitar» lets go when focus leaves or after a few seconds', async () => {
    state.call.mockImplementation(async (method) => {
      if (method === 'frappe.client.get')
        return { ...USER, user_image: '/files/karla.jpg' }
      return []
    })
    await mount()
    const remove = () =>
      root.querySelector('[data-testid="perfil-quitar-foto"]')
    remove().click()
    await nextTick()
    await nextTick()
    expect(remove().textContent.trim()).toBe('Remove')
    expect(document.activeElement).toBe(remove())
    remove().dispatchEvent(new Event('blur'))
    await nextTick()
    expect(remove().textContent.trim()).toBe('Remove photo')
    vi.useFakeTimers()
    try {
      remove().click()
      await nextTick()
      expect(remove().textContent.trim()).toBe('Remove')
      vi.advanceTimersByTime(4000)
      await nextTick()
      expect(remove().textContent.trim()).toBe('Remove photo')
    } finally {
      vi.useRealTimers()
    }
    expect(state.call).not.toHaveBeenCalledWith(
      'frappe.client.set_value',
      expect.anything(),
    )
  })

  it('the time zone list names the zones, the shop’s first', async () => {
    await mount()
    const select = root.querySelector('[data-testid="perfil-zona"]')
    expect(select.value).toBe('America/Mazatlan')
    const groups = [...select.querySelectorAll('optgroup')].map((g) =>
      g.getAttribute('label'),
    )
    expect(groups[0]).toBe('Suggested')
    expect(select.textContent).not.toContain('America/')
    expect(select.textContent).toContain('(Mazatlán)')
  })
})
