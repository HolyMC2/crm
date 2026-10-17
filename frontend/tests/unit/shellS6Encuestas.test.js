import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('Encuestas «off» banner', () => {
  it('has an es-MX entry for the single banner shown when both surveys are off', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const m = po.match(
      /msgctxt "Encuestas"\nmsgid "The surveys are off: nobody is asked after buying or after a conversation\."\nmsgstr "([^"]+)"/,
    )
    expect(m?.[1]).toMatch(/^Las encuestas están apagadas/)
  })
})
