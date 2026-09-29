import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
vi.mock('frappe-ui', () => ({ call: vi.fn(), toast: { error: vi.fn() } }))
import { call, toast } from 'frappe-ui'
import WhatsAppManualBox from '@/components/Activities/WhatsAppManualBox.vue'

const cleanups = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.resetAllMocks()
})

function backend({ phone = '525512345678', business = '', prepared } = {}) {
  call.mockImplementation(async (method, params) => {
    switch (method) {
      case 'crm.api.whatsapp_channel.get_record_channel':
        return {
          mode: 'manual',
          phone,
          url: phone ? `https://wa.me/${phone}` : null,
          shop_number: business,
        }
      case 'crm.api.whatsapp_channel.list_manual_templates':
        return [{ name: 'bienvenida', template: 'Hola {{1}}' }]
      case 'crm.api.whatsapp.get_quick_replies':
        return [{ label: 'Cita', text: '¿Sigue en pie la cita?' }]
      case 'crm.api.whatsapp_channel.prepare_manual_message':
        return prepared || { text: `Hola ${params.template}`, missing: [] }
      case 'crm.api.whatsapp_channel.log_manual_open':
        return 'COMMENT-1'
    }
  })
}

async function mount(props = {}) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const logged = vi.fn()
  const app = createApp(WhatsAppManualBox, {
    doctype: 'CRM Lead',
    docname: 'LEAD-1',
    onLogged: logged,
    ...props,
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  // never let the test navigate; the component's own click handler still runs
  el.addEventListener('click', (e) => e.preventDefault())
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await vi.waitFor(() =>
    expect(el.querySelector('[data-testid="wa-manual-chips"]')).not.toBeNull(),
  )
  return { el, logged }
}

const chip = (el, label) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent.includes(label))
const openLink = (el) => el.querySelector('[data-testid="wa-manual-open"]')

describe('manual WhatsApp composer', () => {
  it('fills a template with the record and opens wa.me through a real new-tab link', async () => {
    backend({ business: '+52 55 0000 0000' })
    const { el, logged } = await mount()
    expect(el.textContent).toContain(
      'Envía desde el WhatsApp del negocio: +52 55 0000 0000',
    )

    chip(el, 'bienvenida').click()
    await vi.waitFor(() =>
      expect(el.querySelector('textarea').value).toBe('Hola bienvenida'),
    )
    expect(call).toHaveBeenCalledWith(
      'crm.api.whatsapp_channel.prepare_manual_message',
      {
        reference_doctype: 'CRM Lead',
        reference_name: 'LEAD-1',
        template: 'bienvenida',
      },
    )
    await nextTick()
    const link = openLink(el)
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('href')).toBe(
      'https://wa.me/525512345678?text=Hola%20bienvenida',
    )

    link.click()
    expect(call).toHaveBeenCalledWith(
      'crm.api.whatsapp_channel.log_manual_open',
      {
        reference_doctype: 'CRM Lead',
        reference_name: 'LEAD-1',
        text: 'Hola bienvenida',
        template: 'bienvenida',
      },
    )
    await vi.waitFor(() => expect(logged).toHaveBeenCalled())
    expect(el.textContent).toContain('envío no confirmado')
  })

  it('a quick reply or free text goes verbatim into the link', async () => {
    backend()
    const { el } = await mount()
    chip(el, 'Cita').click()
    await nextTick()
    expect(openLink(el).getAttribute('href')).toBe(
      'https://wa.me/525512345678?text=%C2%BFSigue%20en%20pie%20la%20cita%3F',
    )
    const area = el.querySelector('textarea')
    area.value = 'Listo & pagado'
    area.dispatchEvent(new Event('input'))
    await nextTick()
    expect(openLink(el).getAttribute('href')).toBe(
      'https://wa.me/525512345678?text=Listo%20%26%20pagado',
    )
  })

  it('warns about record fields the template could not fill', async () => {
    backend({ prepared: { text: 'Hola , tu folio', missing: ['lead_name'] } })
    const { el } = await mount()
    chip(el, 'bienvenida').click()
    await vi.waitFor(() =>
      expect(el.textContent).toContain('Faltan datos del registro: lead_name'),
    )
  })

  it('offers no link when the record has no dialable number', async () => {
    backend({ phone: null })
    const { el } = await mount()
    await nextTick()
    expect(openLink(el)).toBeNull()
    expect(el.textContent).toContain(
      'Este registro no tiene un número de WhatsApp válido.',
    )
    expect(toast.error).not.toHaveBeenCalled()
  })
})
