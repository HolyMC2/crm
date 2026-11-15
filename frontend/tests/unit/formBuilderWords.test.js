// The form builder says «Campos» while the Facebook lead form keeps «Preguntas»:
// the builder's words carry their own context in es.po.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
const src = (path) => readFileSync(resolve(here, '../../src', path), 'utf8')

// One entry's msgstr, read line by line: union merges can drop the blank line
// between two lanes' appended entries.
function entry(msgid, msgctxt = null) {
  const lines = po.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== `msgid ${JSON.stringify(msgid)}`) continue
    const ctx = lines[i - 1]?.startsWith('msgctxt ') ? lines[i - 1] : null
    const wanted =
      msgctxt === null ? null : `msgctxt ${JSON.stringify(msgctxt)}`
    if (ctx !== wanted) continue
    const str = lines[i + 1]
    if (str?.startsWith('msgstr ')) return JSON.parse(str.slice(7))
  }
  return undefined
}

describe('the form builder words', () => {
  it('reads «Campos» and «Agregar un campo» in the builder', () => {
    expect(entry('Questions', 'Form builder')).toBe('Campos')
    expect(entry('Add a question', 'Form builder')).toBe('Agregar un campo')
    expect(src('pages/FormBuilder.vue')).toContain(
      "__('Questions', null, 'Form builder')",
    )
    expect(src('components/Forms/FormCanvas.vue')).toContain(
      "__('Add a question', null, 'Form builder')",
    )
  })

  it('leaves the shared «Preguntas» of the Facebook lead form as it was', () => {
    expect(entry('Questions')).toBe('Preguntas')
  })
})
