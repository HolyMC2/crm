// Select options are a doctype's English words (CRM Task status «Todo»): the
// form shows them in Spanish and still stores the option itself.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { translateSelectOptions } from '@/utils/fieldTransforms'

const here = dirname(fileURLToPath(import.meta.url))
const identity = globalThis.__
const CATALOG = { Todo: 'Por hacer', Backlog: 'Sin planear', Low: 'Baja' }

beforeEach(() => {
  globalThis.__ = (text) => CATALOG[text] || text
})
afterEach(() => {
  globalThis.__ = identity
})

describe('translateSelectOptions', () => {
  it('labels each option in Spanish and keeps the stored value', () => {
    expect(
      translateSelectOptions([
        { label: 'Backlog', value: 'Backlog' },
        { label: 'Todo', value: 'Todo' },
        { label: 'Hecho a mano', value: 'Hecho a mano' },
      ]),
    ).toEqual([
      { label: 'Sin planear', value: 'Backlog' },
      { label: 'Por hacer', value: 'Todo' },
      { label: 'Hecho a mano', value: 'Hecho a mano' },
    ])
  })
  it('keeps the blank option and plain strings selectable', () => {
    expect(translateSelectOptions([{ label: '', value: '' }, 'Low'])).toEqual([
      { label: '', value: '' },
      { label: 'Baja', value: 'Low' },
    ])
    expect(translateSelectOptions('Low\nHigh')).toBe('Low\nHigh')
  })
})

describe('CRM Task status catalog', () => {
  const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
  const entries = [
    ...po.matchAll(
      /^(msgctxt "(.*)"\n)?msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
    ),
  ].map((m) => ({ context: m[2] || '', id: m[3], text: m[4] }))
  it('reads every task status in Spanish', () => {
    for (const status of ['Backlog', 'Todo', 'In Progress', 'Done', 'Canceled'])
      expect(
        entries.find((e) => e.id === status && !e.context)?.text,
        status,
      ).toBeTruthy()
    expect(entries.find((e) => e.id === 'Todo' && !e.context).text).toBe(
      'Por hacer',
    )
  })
  it('no screen asks the catalog for the Spanish word «Todo» (all)', () => {
    const src = resolve(here, '../../src')
    const asking = readdirSync(src, { recursive: true })
      .filter((file) => /\.(vue|js|ts)$/.test(file))
      .filter((file) =>
        /__\(\s*['"]Todo['"]/.test(readFileSync(resolve(src, file), 'utf8')),
      )
    expect(asking).toEqual([])
    expect(
      entries.find((e) => e.id === 'All' && e.context === 'Workload')?.text,
    ).toBe('Todo')
  })
})
