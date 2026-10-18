import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { lastMessageText } from '@/utils/inboxMessage'

const here = dirname(fileURLToPath(import.meta.url))
const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
// the es.po catalogue as the running app sees it
const catalogue = Object.fromEntries(
  [...po.matchAll(/^msgid "(.*)"\nmsgstr "(.*)"$/gm)].map((m) => [m[1], m[2]]),
)
const original = globalThis.__
afterEach(() => {
  globalThis.__ = original
})

describe('inbox last message line', () => {
  it('names a provider system event in Spanish instead of its English text', () => {
    globalThis.__ = (msg) => catalogue[msg] || msg
    expect(lastMessageText('Flow completed')).toBe(
      'Flujo de WhatsApp completado',
    )
    expect(lastMessageText('New Order Received via WhatsApp')).toBe(
      'Nuevo pedido por WhatsApp',
    )
    expect(lastMessageText('[131052] Media file size too big')).toBe(
      'Archivo demasiado grande para recibirlo',
    )
  })

  it('leaves what a person wrote as it is', () => {
    globalThis.__ = (msg) => catalogue[msg] || msg
    expect(lastMessageText('Hola, ¿ya está mi celular?')).toBe(
      'Hola, ¿ya está mi celular?',
    )
    expect(lastMessageText('Flow completed, gracias')).toBe(
      'Flow completed, gracias',
    )
    expect(lastMessageText(null)).toBe('')
  })
})
