import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

vi.mock('@/utils', () => ({ isTranslatable: () => false }))
vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  createResource: () => ({ data: [], update() {}, reload() {} }),
}))
import Link from '@/components/Controls/Link.vue'

const cleanups = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

async function mount(values = {}, withCompany = false) {
  const props = reactive({ doctype: 'Customer', label: 'Cliente', ...values })
  const el = document.createElement('form')
  document.body.append(el)
  const app = createApp({
    render: () => [
      h(Link, props),
      withCompany ? h(Link, { doctype: 'Company', label: 'Empresa' }) : null,
    ],
  })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  cleanups.push(() => {
    app.unmount()
    el.remove()
  })
  await nextTick()
  return {
    el,
    props,
    label: el.querySelector('label'),
    button: el.querySelector('button'),
  }
}

describe('record selector accessibility', () => {
  it('connects each visible field label to its own native selection button', async () => {
    const { el } = await mount({}, true)
    const [customer, company] = el.querySelectorAll('label')
    const [customerButton, companyButton] = el.querySelectorAll('button')
    expect(customer.control).toBe(customerButton)
    expect(company.control).toBe(companyButton)
    expect(customerButton.id).not.toBe(companyButton.id)
    expect(customerButton.getAttribute('aria-labelledby')).toBe(customer.id)
  })

  it('retains a caller-supplied control ID exactly once', async () => {
    const { el, label, button } = await mount({ id: 'order-customer' })
    expect(label.control).toBe(button)
    expect(button.id).toBe('order-customer')
    expect(el.querySelectorAll('#order-customer')).toHaveLength(1)
  })

  it('exposes the field name after a selected value replaces its placeholder', async () => {
    const { label, button, props } = await mount({
      placeholder: 'Selecciona un cliente',
    })
    props.modelValue = 'Cliente A'
    await nextTick()
    expect(button.textContent).toContain('Cliente A')
    expect(label.control).toBe(button)
    expect(button.getAttribute('aria-labelledby')).toBe(label.id)
    expect(label.textContent.trim()).toBe('Cliente')
    const valueId = button.getAttribute('aria-describedby')
    expect(valueId).toBeTruthy()
    expect(document.getElementById(valueId)?.textContent.trim()).toBe(
      'Cliente A',
    )
    props.modelValue = 'Cliente B'
    await nextTick()
    expect(document.getElementById(valueId)?.textContent.trim()).toBe(
      'Cliente B',
    )
    props.modelValue = ''
    await nextTick()
    expect(button.hasAttribute('aria-describedby')).toBe(false)
  })

  it('makes a disabled selector natively unfocusable and unable to open', async () => {
    const { button, props } = await mount({ disabled: true })
    expect(button.disabled).toBe(true)
    button.focus()
    button.click()
    await nextTick()
    expect(document.activeElement).not.toBe(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    props.disabled = false
    await nextTick()
    expect(button.disabled).toBe(false)
    button.focus()
    expect(document.activeElement).toBe(button)
  })

  it('does not submit the surrounding customer/order form', async () => {
    const { el, button } = await mount()
    const submit = vi.fn((event) => event.preventDefault())
    el.addEventListener('submit', submit)
    expect(button.type).toBe('button')
    button.click()
    await nextTick()
    expect(submit).not.toHaveBeenCalled()
  })
})
