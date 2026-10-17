import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { vacationCompanies } from '../../src/composables/useEquipo.js'

describe('Vacaciones de ley opens on a company where the law applies', () => {
  const companies = [
    { company: '_Test Company', mexico: false },
    { company: 'Best Test', mexico: false },
    { company: 'Grupo Doco', mexico: true },
  ]

  it('drops ERPNext test companies and opens on the first Mexican one', () => {
    const { list, pick } = vacationCompanies(companies, '')
    expect(list.map((c) => c.company)).toEqual(['Best Test', 'Grupo Doco'])
    expect(pick).toBe('Grupo Doco')
  })

  it('keeps the company the worker already picked', () => {
    expect(vacationCompanies(companies, 'Best Test').pick).toBe('Best Test')
  })

  it('falls back to the first company when none is Mexican', () => {
    expect(vacationCompanies([{ company: 'Acme' }], '').pick).toBe('Acme')
    expect(vacationCompanies([], '').pick).toBe('')
  })
})

describe('Equipo access banner', () => {
  it('has an es-MX entry, so the worker never reads it in English', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const entry = po.match(
      /msgctxt "Equipo"\nmsgid "To see the team you need access to employee records\. Ask whoever runs the shop to give it to you\."\nmsgstr "([^"]+)"/,
    )
    expect(entry?.[1]).toMatch(/^Para ver al equipo/)
    expect(entry?.[1]).not.toMatch(/HR User/)
  })
})
