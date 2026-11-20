import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
const main = readFileSync(resolve(__dirname, '../../src/main.js'), 'utf8')

describe('the language dictionary is its own script, loaded beside the app', () => {
  it('a classic deferred script fetches it from the whitelisted endpoint, versioned', () => {
    // The query is ?v=<payload hash> (crm/shell_dictionary.py), or on the
    // landing route ?part=first&v=<its hash> with data-full naming the whole
    // set (crm/www/crm.py): those URLs are immutable.
    expect(html).toMatch(
      /<script\s+defer\s+src="\/api\/method\/crm\.www\.crm\.translations\?\{\{ translations_query \}\}"\s+data-full="\{\{ translations_full_query \}\}"\s*><\/script>/,
    )
  })

  it('a route the first part does not cover waits for the whole set', () => {
    // beforeEach: the wait comes before the route's chunk loads and evaluates
    // (beforeResolve runs after it).
    expect(main).toMatch(/router\.beforeEach\(wholeDictionaryFor\)/)
    expect(main).not.toMatch(/router\.beforeResolve\(wholeDictionaryFor\)/)
    expect(main.indexOf('router.beforeEach(wholeDictionaryFor)')).toBeLessThan(
      main.indexOf('app.use(router)'),
    )
    expect(main).toMatch(/router\.isReady\(\)\)\.then\(loadWhole, loadWhole\)/)
  })

  it('it comes after the module entry, so the entry evaluates while it downloads', () => {
    const script = html.indexOf('crm.www.crm.translations')
    const entry = html.indexOf('src="/src/main.js"')
    expect(script).toBeGreaterThan(-1)
    expect(entry).toBeGreaterThan(-1)
    expect(script).toBeGreaterThan(entry)
  })

  it('the entry mounts only once the dictionary is in (App.vue reads it at setup)', () => {
    expect(main).toMatch(/mountWhenTranslated\(\(\) => app\.mount\('#app'\)\)/)
    expect(main).not.toMatch(/^\s*app\.mount\('#app'\)/m)
  })
})
