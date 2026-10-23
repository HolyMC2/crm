import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The words the new «Nuevo gasto» sheet adds: each one has its es-MX entry in
// the CRM catalogue (Spanish first: nobody on the shop floor reads English).
const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
function entry(msgid) {
  const esc = msgid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return po.match(new RegExp(`msgid "${esc}"\\nmsgstr "([^"]+)"`))?.[1]
}

describe('the expense sheet reads in Spanish', () => {
  it.each([
    ['Replace the photo', 'Cambiar la foto'],
    ['Choose a file', 'Elegir archivo'],
    ['The expense', 'El gasto'],
    ['Save as draft', 'Guardar borrador'],
    [
      'It goes with the expense and stays private.',
      'Va con el gasto y es privado.',
    ],
    [
      'When your accountant sets up the expense types, this screen fills in as usual.',
      'Cuando tu contador configure los tipos de gasto, esta pantalla se llena como siempre.',
    ],
    [
      '{0} expense types still have no account in {1}: they cannot be used until someone sets them up.',
      '{0} tipos de gasto todavía no tienen cuenta en {1}: no se pueden usar hasta que alguien los configure.',
    ],
    [
      'Only {0} can approve your expenses.',
      'Solo {0} puede aprobar tus gastos.',
    ],
  ])('«%s»', (msgid, spanish) => {
    expect(entry(msgid)).toBe(spanish)
  })
})
