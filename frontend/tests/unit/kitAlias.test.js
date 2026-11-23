// frappe-ui's Button and Switch are the kit's (scripts/kit-controls.mjs, in
// vite.config.js and vitest.config.js): crm's `import { Button, Switch } from
// 'frappe-ui'` is the kit's Material control; every other name is frappe-ui's.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ui from 'frappe-ui'
import RealButton from 'frappe-ui-components/Button/Button.vue'
import RealSwitch from 'frappe-ui-components/Switch/Switch.vue'
import KitButton, { buttonProps } from '@/components/ui/Button.vue'
import KitSwitch from '@/components/ui/Switch.vue'

const here = dirname(fileURLToPath(import.meta.url))

describe('the frappe-ui alias', () => {
  it('gives the kit Button and Switch and frappe-ui for the rest', () => {
    expect(ui.Button).toBe(KitButton)
    expect(ui.Switch).toBe(KitSwitch)
    expect(ui.Button).not.toBe(RealButton)
    expect(ui.Switch).not.toBe(RealSwitch)
    for (const name of ['Dialog', 'Dropdown', 'FormControl', 'call', 'toast'])
      expect(ui[name], name).toBeTruthy()
  })

  it('takes every prop of frappe-ui 1.0.2’s Button with the same defaults', () => {
    const source = readFileSync(
      resolve(
        here,
        '../../node_modules/frappe-ui/src/components/Button/types.ts',
      ),
      'utf8',
    )
    const start = source.indexOf('export const buttonProps')
    const block = source.slice(start, source.indexOf('\n}\n', start))
    const names = [...block.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(10)
    expect(Object.keys(buttonProps).sort()).toEqual([...names].sort())
    for (const [name, value] of [
      ['theme', 'gray'],
      ['size', 'sm'],
      ['variant', 'subtle'],
      ['type', 'button'],
    ])
      expect(buttonProps[name].default, name).toBe(value)
  })

  it('is the same swap in the build and in the tests', () => {
    for (const file of ['vite.config.js', 'vitest.config.js']) {
      const config = readFileSync(resolve(here, '../..', file), 'utf8')
      expect(config, file).toContain('kitControls(__dirname)')
    }
  })
})
