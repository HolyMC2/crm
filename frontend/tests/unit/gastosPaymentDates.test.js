// «Pagar» keeps two dates apart: the bank's (reference) and the books'
// (posting), and names how it was paid. Both reach the server only when set,
// so a payment sent before this form existed replays exactly as first sent.
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

vi.mock('frappe-ui', () => ({
  FormControl: {
    props: ['modelValue', 'label', 'options', 'type', 'disabled', 'max'],
    emits: ['update:modelValue'],
    setup: (props) => () =>
      h('label', { 'data-label': props.label }, String(props.modelValue ?? '')),
  },
}))
globalThis.__ = (text, args = []) =>
  text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]))

const { booksFields, defaultMode, payBill, payMissing, bulkPayMissing } =
  await import('@/composables/useGastos')
const { default: PaymentDates } = await import(
  '@/components/gastos/PaymentDates.vue'
)

describe('Gastos payment dates and mode', () => {
  it('sends the books date and mode only when set', async () => {
    expect(booksFields({})).toEqual({})
    expect(
      booksFields({ posting_date: '2026-03-02', mode_of_payment: 'SPEI' }),
    ).toEqual({ posting_date: '2026-03-02', mode_of_payment: 'SPEI' })
    sessionStorage.clear()
    const api = vi.fn().mockResolvedValue({ payment_entry: 'PE-1' })
    await payBill(api, 'PINV-1', {
      account: 'Banco',
      amount: 10,
      reference_date: '2026-03-01',
      posting_date: '2026-03-02',
      mode_of_payment: 'SPEI',
    })
    expect(api.mock.calls[0][1]).toMatchObject({
      name: 'PINV-1',
      reference_date: '2026-03-01',
      posting_date: '2026-03-02',
      mode_of_payment: 'SPEI',
    })
  })

  it('picks the bill mode, else the account only mode', () => {
    const options = { modes: { Banco: ['SPEI'], Caja: ['Efectivo', 'Vale'] } }
    expect(defaultMode(options, 'Banco', '')).toBe('SPEI')
    expect(defaultMode(options, 'Caja', '')).toBe('')
    expect(defaultMode(options, 'Caja', 'Efectivo')).toBe('Efectivo')
  })

  it('asks for the books date like any other field', () => {
    const options = { accounts: [{ account: 'Caja', type: 'Cash' }] }
    expect(
      payMissing(
        { account: 'Caja', amount: 5, reference_date: '2026-03-01' },
        options,
      ),
    ).toEqual(['posting_date'])
    expect(
      bulkPayMissing({ account: 'Caja', reference_date: '2026-03-01' }, [
        { account: 'Caja', type: 'Cash' },
      ]),
    ).toEqual(['posting_date'])
  })

  it('shows both dates; the books date follows the bank date until set apart', async () => {
    const reference = ref('2026-10-26')
    const posting = ref('2026-10-26')
    const mode = ref('')
    const el = document.createElement('div')
    const app = createApp({
      render: () =>
        h(PaymentDates, {
          options: { today: '2026-10-26', modes: { Banco: ['SPEI'] } },
          account: 'Banco',
          referenceDate: reference.value,
          'onUpdate:referenceDate': (v) => (reference.value = v),
          postingDate: posting.value,
          'onUpdate:postingDate': (v) => (posting.value = v),
          mode: mode.value,
          'onUpdate:mode': (v) => (mode.value = v),
        }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(el)
    await nextTick()
    const labels = [...el.querySelectorAll('label')].map((n) => n.dataset.label)
    expect(labels).toEqual([
      'Date on the bank or receipt',
      'Posting date (in the books)',
      'Mode of payment',
    ])
    expect(mode.value).toBe('SPEI')
    reference.value = '2026-03-02'
    await nextTick()
    await nextTick()
    expect(posting.value).toBe('2026-03-02')
    expect(el.querySelector('[data-posting-hint]').textContent).toContain(
      'on 2026-03-02, not today',
    )
    posting.value = '2026-03-05'
    await nextTick()
    reference.value = '2026-03-01'
    await nextTick()
    await nextTick()
    expect(posting.value).toBe('2026-03-05')
    app.unmount()
  })
})
