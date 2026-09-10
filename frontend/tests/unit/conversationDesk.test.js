import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const source = readFileSync(
  resolve(
    process.cwd(),
    '../crm/fcrm/page/customer_conversations/customer_conversations.js',
  ),
  'utf8',
)
const roots = []
afterEach(() => roots.splice(0).forEach((root) => root.remove()))
const account = {
  provider: 'WhatsApp',
  account_id: '123',
  label: 'Fictional account',
}
const doc = {
  name: 'a'.repeat(64),
  ...account,
  peer_id: '5215550100000',
  generation: 1,
  control_state: 'Human',
  allowed_actions: ['take'],
}
function mount(rpc) {
  const root = document.createElement('div')
  document.body.append(root)
  roots.push(root)
  const frappe = {
    pages: { 'customer-conversations': {} },
    session: { user: 'one@example.invalid' },
    call: vi.fn(rpc),
    ui: { make_app_page: () => ({ main: root }) },
  }
  new Function('frappe', source)(frappe)
  frappe.pages['customer-conversations'].on_page_load(root)
  return { page: root.customer_conversations, root, frappe }
}
const response = (method) => {
  if (method.endsWith('list_intents')) return []
  if (method.endsWith('list_accounts')) return { accounts: [account] }
  if (method.endsWith('list_threads'))
    return {
      items: [{ ...doc, preview: '<script>queue</script>' }],
      next_cursor: null,
    }
  if (method.endsWith('get_history'))
    return {
      conversation: doc,
      messages: [
        {
          id: 'one',
          content: '<img src=x onerror="alert(1)">',
          timestamp: '2026-01-01',
        },
      ],
      next_cursor: null,
    }
  return doc
}
describe('native Desk customer page', () => {
  it('consumes an exact authorized route account instead of selecting the first account', async () => {
    const requested = {
      ...account,
      account_id: '456',
      label: 'Requested account',
    }
    const { page, frappe } = mount(async ({ method }) => ({
      message: method.endsWith('list_accounts')
        ? { accounts: [account, requested] }
        : response(method),
    }))
    frappe.route_options = { provider: 'WhatsApp', account_id: '456' }
    await page.load()
    expect(page.account).toEqual(requested)
    expect(frappe.route_options).toBeNull()
    expect(
      frappe.call.mock.calls.find(([args]) =>
        args.method.endsWith('list_threads'),
      )[0].args.account_id,
    ).toBe('456')
  })
  it.each([
    { provider: 'WhatsApp', account_id: 'denied' },
    { provider: 'Instagram', account_id: '123' },
    { provider: 'WhatsApp' },
  ])(
    'does not fall back to another account when route scope is unavailable: %j',
    async (requested) => {
      const { page, root, frappe } = mount(async ({ method }) => ({
        message: response(method),
      }))
      frappe.route_options = requested
      await page.load()
      expect(page.account).toBeUndefined()
      expect(page.items).toEqual([])
      expect(root.textContent).toContain(
        'La cuenta solicitada no está disponible',
      )
      expect(root.querySelector('select').value).toBe('')
      expect(frappe.route_options).toBeNull()
      expect(
        frappe.call.mock.calls.some(([args]) =>
          args.method.endsWith('list_threads'),
        ),
      ).toBe(false)
    },
  )
  it('walks exact account list to history/control and CRM deep link with inert text', async () => {
    const { page, root, frappe } = mount(async ({ method }) => ({
      message: response(method),
    }))
    await page.load()
    await page.select(doc)
    expect(root.textContent).toContain('123')
    expect(root.textContent).toContain('5215550100000')
    expect(root.textContent).toContain('<img src=x onerror="alert(1)">')
    expect(root.querySelector('img, script, textarea')).toBeNull()
    expect(root.querySelector('a').getAttribute('href')).toBe(
      '/crm/inbox?conversation=' + doc.name,
    )
    expect(
      frappe.call.mock.calls.some(([args]) =>
        /send_message|enqueue|set_value/.test(args.method),
      ),
    ).toBe(false)
  })
  it('keeps the same command after response loss and blocks account refresh until resolved', async () => {
    let fail = true
    const { page, frappe } = mount(async ({ method }) => {
      if (method.endsWith('apply_control') && fail)
        throw new TypeError('Lost response')
      return { message: response(method) }
    })
    await page.load()
    await page.select(doc)
    await page.control('take', null, 'Reason')
    const before = { ...page.pending },
      count = frappe.call.mock.calls.length
    await page.load()
    expect(frappe.call.mock.calls).toHaveLength(count)
    fail = false
    await page.control()
    const commands = frappe.call.mock.calls.filter(([args]) =>
      args.method.endsWith('apply_control'),
    )
    expect(commands[0][0].args).toEqual(before)
    expect(commands[1][0].args).toEqual(before)
    expect(page.pending).toBeNull()
  })
  it('discards a response when the authenticated actor changes', async () => {
    let resolve
    const { page, root, frappe } = mount(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const loading = page.load()
    frappe.session.user = 'two@example.invalid'
    resolve({ message: { accounts: [account] } })
    await loading
    expect(page.accounts).toEqual([])
    expect(root.textContent).not.toContain(account.label)
  })
  it('reuses the same reply UUID/body after response loss and shows the durable row', async () => {
    let fail = true
    const row = {
      name: 'intent1',
      state: 'Queued',
      text: 'Frozen reply',
      can_cancel: true,
      actor_user: 'one@example.invalid',
      conversation_generation: 1,
    }
    const { page, frappe, root } = mount(async ({ method }) => {
      if (method.endsWith('queue_message')) {
        if (fail) throw new TypeError('Lost response')
        return { message: row }
      }
      if (method.endsWith('list_intents')) return { message: fail ? [] : [row] }
      return { message: response(method) }
    })
    await page.load()
    await page.select(doc)
    page.doc = {
      ...doc,
      human_owner: frappe.session.user,
      send_available: true,
      allowed_actions: ['release'],
    }
    page.draft = 'Frozen reply'
    await page.queueReply()
    const command = structuredClone(page.replyPending)
    expect(root.querySelector('textarea').disabled).toBe(true)
    page.draft = 'Must not replace frozen request'
    fail = false
    await page.queueReply()
    const calls = frappe.call.mock.calls.filter(([args]) =>
      args.method.endsWith('queue_message'),
    )
    expect(calls[0][0].args).toEqual(command)
    expect(calls[1][0].args).toEqual(command)
    expect(root.textContent).toContain('En cola')
    expect(page.replyPending).toBeNull()
  })
  it('never retries or cancels Unknown and only reads after an uncertain retry response', async () => {
    let state = 'Failed'
    const row = () => ({
      name: 'intent1',
      state,
      text: '<script>inert</script>',
      can_retry: true,
      can_cancel: true,
      actor_user: 'one@example.invalid',
      conversation_generation: 1,
    })
    const { page, root, frappe } = mount(async ({ method }) => {
      if (method.endsWith('retry_intent')) {
        state = 'Unknown'
        throw new TypeError('Lost response')
      }
      if (method.endsWith('get_intent')) return { message: row() }
      if (method.endsWith('list_intents')) return { message: [row()] }
      return { message: response(method) }
    })
    await page.load()
    await page.select(doc)
    page.doc = {
      ...doc,
      human_owner: frappe.session.user,
      allowed_actions: ['release'],
    }
    await page.changeIntent('retry', row())
    await page.reconcileIntent()
    expect(root.textContent).toContain('Resultado incierto')
    expect(root.querySelector('script')).toBeNull()
    expect(root.textContent).not.toContain('Reintentar envío')
    expect(root.textContent).not.toContain('Cancelar envío')
    expect(
      frappe.call.mock.calls.filter(([args]) =>
        args.method.endsWith('retry_intent'),
      ),
    ).toHaveLength(1)
    expect(
      frappe.call.mock.calls.filter(([args]) =>
        args.method.endsWith('get_intent'),
      ),
    ).toHaveLength(1)
  })
})
