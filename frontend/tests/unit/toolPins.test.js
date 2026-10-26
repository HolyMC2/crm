// Local formatting is CI's formatting: the Prettier this package installs is
// the one the pre-commit hook pins, so `yarn format` never disagrees with CI.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('tool pins', () => {
  it('pins the same Prettier as the pre-commit hook', () => {
    const hook = read('../../../.pre-commit-config.yaml').match(
      /prettier@(\d+\.\d+\.\d+)/,
    )
    const pkg = JSON.parse(read('../../package.json'))
    expect(hook?.[1]).toBeTruthy()
    expect(pkg.devDependencies.prettier).toBe(hook[1])
  })
})
