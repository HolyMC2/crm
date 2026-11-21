// «Cómo registras prospectos» (crm.lead.settings): what the sheet shows, what
// a tap saves, how a refusal puts the tap back, and the origins the form offers.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: (...args) => state.call(...args) }))
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title }, slots.default?.())
            : null,
    },
    Segmented: {
      props: ['modelValue', 'options', 'label'],
      emits: ['update:modelValue'],
      setup:
        (p, { emit, attrs }) =>
        () =>
          h(
            'div',
            attrs,
            p.options.map((o) =>
              h(
                'button',
                {
                  'data-segment': o.value,
                  'aria-pressed': String(p.modelValue === o.value),
                  onClick: () => emit('update:modelValue', o.value),
                },
                o.label,
              ),
            ),
          ),
    },
  }
})

import Sheet from '@/components/ventas/ProspectosAjustesSheet.vue'
import {
  followUpSentence,
  rememberProspectSettings,
  shopProspectSettings,
} from '@/utils/prospects'

const SETTINGS = {
  companies: false,
  inquiries: true,
  phone_required: true,
  first_follow_up: 'none',
  ask_salutation: false,
  ask_gender: false,
  retry_after: 'tomorrow',
  follow_up_message: '',
}
const STATE = {
  settings: SETTINGS,
  sources: [
    { name: 'Walk In', label: 'Mostrador', offered: true },
    { name: 'Cold Calling', label: 'Llamada en frío', offered: false },
  ],
  can_change: true,
}

let app, root, changed
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  changed = vi.fn()
  app = createApp({
    render: () =>
      h(Sheet, {
        open: true,
        inquiriesAvailable: true,
        onChanged: changed,
        ...props,
      }),
  })
  app.mount(root)
  await flush()
}
const $ = (sel) => root.querySelector(sel)
const $$ = (sel) => [...root.querySelectorAll(sel)]
const switchOf = (key) => $(`[data-ajuste="${key}"]`)

afterEach(() => {
  app?.unmount()
  root?.remove()
  state.call.mockReset()
  delete globalThis.prospect_settings
})

describe('Cómo registras prospectos', () => {
  it('shows each choice with what it does now', async () => {
    state.call.mockResolvedValue(STATE)
    await mount()
    expect(state.call).toHaveBeenCalledWith(
      'crm.api.prospect_settings.get_settings',
    )
    expect(switchOf('companies').getAttribute('aria-checked')).toBe('false')
    expect(root.textContent).toContain(
      'Solo personas: prospectos y tratos sin empresa.',
    )
    expect(switchOf('phone_required').getAttribute('aria-checked')).toBe('true')
    expect($('[data-ajustes-seguimiento]').textContent).toContain(
      'Muelle no agenda nada',
    )
    const origins = $$('[data-ajustes-origen]').map((li) =>
      li.textContent.trim(),
    )
    expect(origins).toEqual(['Mostrador', 'Llamada en frío'])
    // what the page boot carries next
    expect(globalThis.prospect_settings).toEqual(SETTINGS)
  })

  it('leaves out the Consultas switch where the site has no Consultas', async () => {
    state.call.mockResolvedValue(STATE)
    await mount({ inquiriesAvailable: false })
    expect(switchOf('inquiries')).toBeNull()
    expect(switchOf('companies')).toBeTruthy()
  })

  it('saves a tap and tells the page', async () => {
    state.call.mockResolvedValueOnce(STATE)
    await mount()
    state.call.mockResolvedValueOnce({
      ...STATE,
      settings: { ...SETTINGS, companies: true },
    })
    switchOf('companies').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.prospect_settings.save_settings',
      { changes: { companies: true } },
    )
    expect(switchOf('companies').getAttribute('aria-checked')).toBe('true')
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({ companies: true }),
    )
    expect(globalThis.prospect_settings.companies).toBe(true)
  })

  it('puts a refused tap back and says why', async () => {
    state.call.mockResolvedValueOnce(STATE)
    await mount()
    state.call.mockRejectedValueOnce(
      Object.assign(new Error('x'), {
        messages: [
          'Solo el dueño o un gerente de ventas cambia cómo se registran los prospectos.',
        ],
      }),
    )
    $('[data-ajuste="first_follow_up"] [data-segment="tomorrow"]').click()
    await flush()
    expect(
      $('[data-ajuste="first_follow_up"] [data-segment="none"]').getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
    expect($('[data-ajustes-problema]').textContent).toContain('Solo el dueño')
    expect(changed).not.toHaveBeenCalled()
  })

  it('offers an origin again and adds a new one', async () => {
    state.call.mockResolvedValueOnce(STATE)
    await mount()
    state.call.mockResolvedValueOnce(STATE)
    $('[data-ajustes-origen="Cold Calling"] [role=switch]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.prospect_settings.set_source_offered',
      { name: 'Cold Calling', offered: 1 },
    )
    $('[data-ajustes-abrir-origen]').click()
    await flush()
    const input = $('[data-ajustes-nuevo-origen] input')
    input.value = '  TikTok '
    input.dispatchEvent(new Event('input'))
    state.call.mockResolvedValueOnce({
      ...STATE,
      sources: [
        ...STATE.sources,
        { name: 'TikTok', label: 'TikTok', offered: true },
      ],
    })
    $('[data-ajustes-nuevo-origen]').dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.prospect_settings.add_source',
      { name: 'TikTok' },
    )
    expect($('[data-ajustes-nuevo-origen]')).toBeNull()
    expect($('[data-ajustes-origen="TikTok"]')).toBeTruthy()
  })
})

describe('the shop settings the pages read', () => {
  it('keeps the upstream forms on a server without them, and the boot after a save', () => {
    expect(shopProspectSettings().companies).toBe(true)
    rememberProspectSettings({ ...SETTINGS })
    expect(shopProspectSettings()).toEqual(SETTINGS)
    delete globalThis.prospect_settings
  })

  it('says what a new prospect gets under each first follow-up', () => {
    expect(followUpSentence('2h')).toContain('2 horas después')
    expect(followUpSentence('tomorrow')).toContain('al día siguiente')
    expect(followUpSentence('none')).toContain('no agenda nada')
  })

  it('saves when a follow-up nobody answered comes back', async () => {
    state.call.mockResolvedValueOnce(STATE)
    await mount()
    expect($('[data-ajustes-reintento]').textContent).toContain('mañana')
    state.call.mockResolvedValueOnce({
      ...STATE,
      settings: { ...SETTINGS, retry_after: '2h' },
    })
    $('[data-ajuste="retry_after"] [data-segment="2h"]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.prospect_settings.save_settings',
      { changes: { retry_after: '2h' } },
    )
    expect($('[data-ajustes-reintento]').textContent).toContain('2 horas')
  })

  it('writes the follow-up message with the tapped words and saves it', async () => {
    state.call.mockResolvedValueOnce(STATE)
    await mount()
    const box = $('[data-ajuste="follow_up_message"]')
    expect($('[data-ajustes-guardar-mensaje]')).toBeNull()
    box.value = 'Hola'
    box.dispatchEvent(new Event('input'))
    box.setSelectionRange(4, 4)
    $('[data-ajustes-token="{nombre}"]').click()
    await flush()
    expect(box.value).toBe('Hola {nombre}')
    state.call.mockResolvedValueOnce({
      ...STATE,
      settings: { ...SETTINGS, follow_up_message: 'Hola {nombre}' },
    })
    $('[data-ajustes-guardar-mensaje]').click()
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'crm.api.prospect_settings.save_settings',
      { changes: { follow_up_message: 'Hola {nombre}' } },
    )
    expect($('[data-ajustes-guardar-mensaje]')).toBeNull()
  })
})
