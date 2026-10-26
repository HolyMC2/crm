import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

describe('the language dictionary is its own script, ahead of the app', () => {
  it('a classic deferred script fetches it from the whitelisted endpoint, versioned', () => {
    // ?v= is the payload hash (crm/shell_dictionary.py): that URL is immutable.
    expect(html).toMatch(
      /<script\s+defer\s+src="\/api\/method\/crm\.www\.crm\.translations\?v=\{\{ translations_version \}\}"\s*><\/script>/,
    )
  })

  it('it runs before the module entry, so App.vue and CrmRuntime.vue read it at load', () => {
    const script = html.indexOf('crm.www.crm.translations')
    const entry = html.indexOf('src="/src/main.js"')
    expect(script).toBeGreaterThan(-1)
    expect(entry).toBeGreaterThan(-1)
    expect(script).toBeLessThan(entry)
  })
})
