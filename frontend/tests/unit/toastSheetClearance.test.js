import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A toast on a phone covered an open bottom sheet's «Cancelar» and «Guardar»
// for its few seconds. While a sheet with actions is open the toasts rise
// above the action bar: one row is 68px (12 + 44 + 12), each stacked row
// adds 52px.
const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '../../src/index.css'), 'utf8')
const sheet = readFileSync(
  resolve(here, '../../src/components/ui/BottomSheet.vue'),
  'utf8',
)

function offset(selector) {
  const flat = css.replace(/\s+/g, ' ')
  const at = flat.indexOf(
    `${selector} [data-sonner-toaster][data-y-position='bottom'] {`,
  )
  expect(at, selector).toBeGreaterThan(-1)
  const body = flat.slice(at, flat.indexOf('}', at))
  return Number(body.match(/bottom: calc\((\d+)px/)?.[1])
}

describe('toasts and an open sheet', () => {
  it('the sheet still marks its action bar the way the rule reads it', () => {
    expect(sheet).toContain('data-ui-sheet-actions')
  })

  it('rise above one, two or three rows of actions', () => {
    const rows = (n) => 12 + n * 44 + (n - 1) * 8 + 12
    expect(offset('body:has([data-ui-sheet-actions])')).toBeGreaterThan(rows(1))
    expect(
      offset('body:has([data-ui-sheet-actions] > :nth-child(2))'),
    ).toBeGreaterThan(rows(2))
    expect(
      offset('body:has([data-ui-sheet-actions] > :nth-child(3))'),
    ).toBeGreaterThan(rows(3))
  })
})
