import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ADMIN_SCREENS,
  DAILY_ROUTES,
  ROUTE_BUDGET,
  chunkFor,
  currentFiles,
  routeLoad,
} from '../../scripts/verify-bundle-budget.mjs'

// SPEC §4: a daily route statically loads ≤ 60 scripts / ≤ 2.5 MB and never an
// admin screen; the build (and CI's Production Build) fails otherwise.
let dir
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

function build(files) {
  dir = mkdtempSync(join(tmpdir(), 'crm-budget-'))
  mkdirSync(join(dir, 'assets'))
  for (const [name, source] of Object.entries(files))
    writeFileSync(join(dir, 'assets', name), source)
  return dir
}

describe('bundle budget', () => {
  it('follows static imports, not dynamic ones', () => {
    const out = build({
      'index-AAAAAAAA.js': 'import{a}from"./shared-BBBBBBBB.js";',
      'shared-BBBBBBBB.js': 'export const a=1',
      'Hoy-CCCCCCCC.js':
        'import"./shared-BBBBBBBB.js";const m=()=>import("./Forms-DDDDDDDD.js")',
      'Forms-DDDDDDDD.js': 'export default 1',
    })
    const load = routeLoad(out, 'assets/index-AAAAAAAA.js', currentFiles(out), [
      'Hoy',
    ])
    expect(load.files.sort()).toEqual([
      'assets/Hoy-CCCCCCCC.js',
      'assets/index-AAAAAAAA.js',
      'assets/shared-BBBBBBBB.js',
    ])
    expect(load.admin).toEqual([])
  })

  it('names an admin screen pulled statically into a daily route', () => {
    const out = build({
      'index-AAAAAAAA.js': '',
      'Hoy-CCCCCCCC.js': 'import"./Forms-DDDDDDDD.js";',
      'Forms-DDDDDDDD.js': '',
      'FormsHelp-EEEEEEEE.js': '',
    })
    const load = routeLoad(out, 'assets/index-AAAAAAAA.js', currentFiles(out), [
      'Hoy',
    ])
    expect(load.admin).toEqual(['assets/Forms-DDDDDDDD.js'])
    expect(chunkFor(currentFiles(out), 'Forms')).toBe(
      'assets/Forms-DDDDDDDD.js',
    )
  })

  it('only counts this build when old builds are kept beside it', () => {
    const out = build({ 'Hoy-OLDOLDOL.js': '', 'Hoy-NEWNEWNE.js': '' })
    writeFileSync(
      join(out, 'build-files.json'),
      JSON.stringify({ files: ['assets/Hoy-NEWNEWNE.js'] }),
    )
    expect(chunkFor(currentFiles(out), 'Hoy')).toBe('assets/Hoy-NEWNEWNE.js')
  })

  it('a renamed page fails loudly instead of passing unmeasured', () => {
    const out = build({ 'index-AAAAAAAA.js': '' })
    expect(() =>
      routeLoad(out, 'assets/index-AAAAAAAA.js', currentFiles(out), ['Hoy']),
    ).toThrow(/no chunk for Hoy/)
  })

  it('covers the daily routes with the SPEC budget', () => {
    expect(Object.keys(DAILY_ROUTES)).toEqual(
      expect.arrayContaining([
        '/crm/hoy',
        '/crm/deals',
        '/crm/inbox',
        '/crm/contactos',
        '/crm/prospectos',
      ]),
    )
    expect(ROUTE_BUDGET).toEqual({ files: 60, bytes: 2.5 * 1024 * 1024 })
    expect(ADMIN_SCREENS).toContain('FormBuilder')
  })
})
