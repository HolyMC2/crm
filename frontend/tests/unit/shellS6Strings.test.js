import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Strings SHELL-S6 added to Operación pages: each one has an es-MX entry.
const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
function entry(ctx, msgid) {
  const esc = msgid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return po.match(
    new RegExp(`msgctxt "${ctx}"\\nmsgid "${esc}"\\nmsgstr "([^"]+)"`),
  )?.[1]
}

describe('SHELL-S6 strings read in Spanish', () => {
  it.each([
    ['Encuestas', 'Settings', 'Ajustes'],
    [
      'Encuestas',
      'No answers yet in this period.',
      'Todavía no hay respuestas en este periodo.',
    ],
  ])('%s «%s»', (ctx, msgid, es) => {
    expect(entry(ctx, msgid)).toBe(es)
  })
})
