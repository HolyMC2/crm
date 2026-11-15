// The form builder says «Campos» while the Facebook lead form keeps «Preguntas»:
// the builder's words carry their own context in es.po.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
const src = (path) => readFileSync(resolve(here, '../../src', path), 'utf8')

function entry(msgid, msgctxt = null) {
  const blocks = po.split(/\n\n+/)
  const found = blocks.find((block) => {
    const lines = block.split('\n')
    const ctx = lines.find((line) => line.startsWith('msgctxt '))
    return (
      lines.includes(`msgid ${JSON.stringify(msgid)}`) &&
      (msgctxt === null ? !ctx : ctx === `msgctxt ${JSON.stringify(msgctxt)}`)
    )
  })
  const line = found?.split('\n').find((row) => row.startsWith('msgstr '))
  return line ? JSON.parse(line.slice(7)) : undefined
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
