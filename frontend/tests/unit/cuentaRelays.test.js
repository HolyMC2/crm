// Mi cuenta adds no money endpoint, checked by reading the source. Every call it
// makes is one of doco's Mi plan relays as develop had them when the lane began
// (doco 9318c0b, docoutils/miplan.py) plus the read-only activation_quote; only
// components/cuenta/api.js names the relay module, and crm's Python reaches no
// platform seam of its own. doco pins the relays themselves in
// tests/test_cuenta_money_seams.py.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../../src')
const APP = resolve(here, '../../../crm')

const BASE_RELAYS = new Set([
  'payment_state',
  'bootstrap',
  'wallet_txns',
  'topup_checkout',
  'toggle_addon',
  'pay_invoice',
  'request_plan',
  'activate_plan',
  'payment_methods',
  'start_card_setup',
  'replace_payment_method',
  'remove_payment_method',
  'download_invoice_cfdi',
  'download_topup_cfdi',
])
const BASE_WRITES = new Set([
  'topup_checkout',
  'toggle_addon',
  'pay_invoice',
  'request_plan',
  'activate_plan',
  'start_card_setup',
  'replace_payment_method',
  'remove_payment_method',
])
const ADDED_READS = new Set(['activation_quote'])

function walk(dir, keep) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name)
    if (statSync(path).isDirectory()) {
      if (!['node_modules', 'locale', 'public', 'tests'].includes(name))
        out.push(...walk(path, keep))
    } else if (keep(name)) out.push(path)
  }
  return out
}
const sources = walk(SRC, (name) => /\.(vue|[cm]?js|ts)$/.test(name))
const cuentaFiles = sources.filter((path) =>
  /components\/cuenta\/|pages\/Cuenta\.vue$/.test(path),
)
const calls = (pattern) =>
  new Set(
    cuentaFiles.flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(pattern)].map((m) => m[1]),
    ),
  )

describe('Mi cuenta reaches the plan only through Mi plan’s relays', () => {
  it('one module names the relay module', () => {
    // A string that names it, not a comment that mentions it.
    const naming = sources
      .filter((path) =>
        /['"`]\/?(api\/method\/)?doco\.docoutils\.miplan/.test(
          readFileSync(path, 'utf8'),
        ),
      )
      .map((path) => relative(SRC, path))
    expect(naming).toEqual(['components/cuenta/api.js'])
  })

  it('every read is a base relay or an added read', () => {
    const reads = calls(/\bread\(\s*'(\w+)'/g)
    expect(reads.size).toBeGreaterThan(0)
    for (const name of reads)
      expect(BASE_RELAYS.has(name) || ADDED_READS.has(name), name).toBe(true)
  })

  it('every write is one Mi plan already had', () => {
    const writes = calls(/\bmutate\(\s*'(\w+)'/g)
    expect([...writes].sort()).toEqual(
      [
        'activate_plan',
        'pay_invoice',
        'remove_payment_method',
        'request_plan',
        'toggle_addon',
        'topup_checkout',
      ].sort(),
    )
    for (const name of writes) expect(BASE_WRITES.has(name), name).toBe(true)
  })

  it('downloads use the existing CFDI relays', () => {
    const api = readFileSync(resolve(SRC, 'components/cuenta/api.js'), 'utf8')
    const named = new Set(
      [...api.matchAll(/'(download_\w+)'/g)].map((m) => m[1]),
    )
    expect([...named].sort()).toEqual([
      'download_invoice_cfdi',
      'download_topup_cfdi',
    ])
  })

  it('crm’s Python whitelists nothing for the account and calls no platform seam', () => {
    const python = walk(APP, (name) => name.endsWith('.py')).filter(
      (path) => !/\/tests\/|\/test_[^/]*$/.test(path),
    )
    for (const path of python) {
      const text = readFileSync(path, 'utf8')
      expect(
        /_seam_call\(|_relay\(|tenant_portal|pay_link\./.test(text),
        path,
      ).toBe(false)
    }
    for (const name of ['api/cuenta.py', 'cuenta_routes.py']) {
      const text = readFileSync(resolve(APP, name), 'utf8')
      expect(text.includes('frappe.whitelist'), name).toBe(false)
      expect(/^\s*import requests|^\s*from requests/m.test(text), name).toBe(
        false,
      )
    }
  })
})
