// Shell D3: the Forms list is on phones, the builder (/forms/:formId) is
// desk-only, so no action in the list's phone ⋯ sheet may route to a desk-only
// page (it would land on «Ábrelo en una computadora»).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formPhoneActions } from '@/components/Forms/formPhoneActions'

const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(resolve(here, '../../src', path), 'utf8')
const router = read('router.js')
const formsPage = read('pages/Forms.vue')

// Route names whose route block carries `desktopOnly: true`.
function desktopOnlyRouteNames() {
  const names = new Set()
  for (const match of router.matchAll(
    /^\s*\{\s*\n\s*path: '[^']*',\n([\s\S]*?)\n {2}\},?$/gmu,
  )) {
    const block = match[1]
    const name = block.match(/^\s*name: '([^']+)'/mu)?.[1]
    if (name && /desktopOnly: true/u.test(block)) names.add(name)
  }
  return names
}

const variants = [
  [{ name: 'f1', route: 'a', published: 1 }, {}],
  [{ name: 'f2', route: 'b', published: 0, incompatible_fields: 3 }, {}],
  [{ name: 'f3', route: 'c', published: 1 }, { confirmingDelete: true }],
]

describe('Forms list phone ⋯ sheet (Shell D3)', () => {
  const deskOnly = desktopOnlyRouteNames()

  it('reads the desk-only routes from router.js', () => {
    expect(deskOnly.has('Form')).toBe(true) // the builder
    expect(deskOnly.has('Forms')).toBe(false) // the list stays on phones
  })

  it('offers no action that targets a desktopOnly route', () => {
    for (const [form, opts] of variants) {
      const actions = formPhoneActions(form, opts)
      expect(actions.length).toBeGreaterThan(0)
      for (const a of actions) {
        if (a.to) expect(deskOnly.has(a.to.name), a.key).toBe(false)
      }
      const keys = actions.map((a) => a.key)
      expect(keys).not.toContain('edit')
      expect(keys).not.toContain('submissions')
      expect(keys).toEqual(
        expect.arrayContaining([
          'copy',
          'qr',
          'public',
          'publish',
          'duplicate',
          'delete',
        ]),
      )
    }
  })

  it('the page runs phone actions without opening a desk-only page', () => {
    expect(formsPage).toMatch(/formPhoneActions\(/u)
    const start = formsPage.indexOf('async function runPhoneAction')
    const end = formsPage.indexOf('function downloadQrPng')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const phoneCode = formsPage.slice(start, end)
    for (const [, name] of phoneCode.matchAll(/name: '([^']+)'/gu))
      expect(deskOnly.has(name), name).toBe(false)
    // «Duplicar» opens the builder only off a phone.
    expect(formsPage).toMatch(
      /if \(isMobile\.value\) forms\.reload\(\)\s*else router\.push\(\{ name: 'Form'/u,
    )
  })

  it('returns nothing without a form', () => {
    expect(formPhoneActions(null)).toEqual([])
  })
})
