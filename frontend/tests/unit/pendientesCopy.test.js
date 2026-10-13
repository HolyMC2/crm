// Pendientes speaks shop words: no «Desk», and every line it shows has Spanish.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(
  resolve(here, '../../src/pages/Pendientes.vue'),
  'utf8',
)
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
const catalog = new Map()
for (const m of po.matchAll(
  /^(msgctxt .*\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
))
  if (!m[1]) catalog.set(m[2], m[3])

describe('Pendientes subtitle', () => {
  it('names where the follow-ups come from without ERP words', () => {
    const subtitle = source.match(/__\(\s*'(Your follow-ups[^']*)'/)?.[1]
    expect(subtitle).toBeTruthy()
    expect(subtitle).not.toMatch(/\bDesk\b/)
    expect(catalog.get(subtitle)).toBeTruthy()
    expect(catalog.get(subtitle)).not.toMatch(/\bDesk\b/)
  })
})
