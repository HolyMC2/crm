import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// `rounded-4` is 8px in the frappe-ui 1.0 radius scale: on a 16-20px checkbox it
// paints a circle that reads as a radio button. `src/index.css` pins those
// checkboxes to `--radius-1` by class name; the radius codemod renamed the class
// on the inputs (`rounded` → `rounded-4`) but not the guard's selector, and the
// FUI1-behavior styling re-walk caught the circles. This keeps both in step.
const root = path.resolve(__dirname, '../../src')

function vueFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) vueFiles(p, out)
    else if (entry.name.endsWith('.vue')) out.push(p)
  }
  return out
}

function checkboxRadiusSteps() {
  const steps = new Map()
  for (const file of vueFiles(root)) {
    const text = fs.readFileSync(file, 'utf8')
    for (const tag of text.match(/<input\b[^>]*>/gs) || []) {
      if (!/type=["']checkbox["']/.test(tag)) continue
      for (const [, step] of tag.matchAll(/\brounded-(\d)\b/g)) {
        if (!steps.has(step)) steps.set(step, path.relative(root, file))
      }
    }
  }
  return steps
}

describe('checkbox radius guard', () => {
  const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8')
  const steps = checkboxRadiusSteps()

  it('still has checkboxes that name a numbered radius', () => {
    expect(steps.size).toBeGreaterThan(0)
  })

  it('pins every numbered radius a checkbox uses to --radius-1', () => {
    for (const [step, example] of steps) {
      expect(
        css,
        `index.css guard for rounded-${step} (used by ${example})`,
      ).toMatch(
        new RegExp(
          `input\\[type='checkbox'\\]\\.rounded-${step}\\s*\\{\\s*border-radius: var\\(--radius-1\\)`,
        ),
      )
    }
  })
})
