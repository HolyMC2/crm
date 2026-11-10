// A record's bar, WhatsApp-style: llamar, WhatsApp and correo share one
// island, the bolt holds the steps and the follow-ups, «⋯» the rest.
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { recordActionsFor } from '@/documentos/acciones'
import RecordIsland from '@/components/documentos/RecordIsland.vue'

const labels = (group) => group.items.map((item) => item.label)

describe('recordActionsFor', () => {
  it('puts the steps and «Editar» first, then what keeps the record in sight', () => {
    const groups = recordActionsFor({
      steps: [
        { label: 'Confirmar', icon: 'lucide-check' },
        { label: 'Facturar' },
      ],
      canEdit: true,
      tools: [
        { key: 'assign', label: 'Asignar', allowed: true },
        { key: 'avisame', label: 'Avísame…', allowed: true },
        {
          key: 'repetir',
          label: 'Repetir cada…',
          allowed: true,
          hint: 'Se crea una copia sola',
        },
        { key: 'pendiente', label: 'Nuevo pendiente', allowed: true },
      ],
    })
    expect(groups.map((g) => g.title)).toEqual([
      'Siguiente paso',
      'Dar seguimiento',
    ])
    expect(labels(groups[0])).toEqual(['Confirmar', 'Facturar', 'Editar'])
    expect(groups[0].items.map((i) => i.key)).toEqual([
      'paso:0',
      'paso:1',
      'editar',
    ])
    expect(labels(groups[1])).toEqual([
      'Nuevo pendiente',
      'Avísame…',
      'Repetir cada…',
    ])
  })

  it('has nothing to show for a record with no step and no follow-up', () => {
    expect(recordActionsFor({ steps: [], canEdit: false, tools: [] })).toEqual(
      [],
    )
  })
})

let app
let root
function mount(props) {
  const events = []
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () =>
      h(RecordIsland, {
        who: 'Ana López',
        ...props,
        onMessage: () => events.push('message'),
        onMail: () => events.push('mail'),
        onTools: () => events.push('tools'),
      }),
  })
  app.mount(root)
  return events
}
afterEach(() => {
  app?.unmount()
  root?.remove()
})
const reach = (kind) => root.querySelector(`[data-reach="${kind}"]`)

describe('the record island', () => {
  it('calls, writes on WhatsApp and mails the record’s person', () => {
    const events = mount({
      reach: { phone: '+52 (667) 100-2000', email: 'ana@example.com' },
      mail: { allowed: true },
    })
    expect(reach('call').getAttribute('href')).toBe('tel:+526671002000')
    expect(reach('call').getAttribute('aria-label')).toBe('Llamar a Ana López')
    expect(reach('whatsapp').getAttribute('href')).toBe(
      'https://wa.me/526671002000',
    )
    reach('mail').click()
    root.querySelector('[data-testid="documentos-tools-open"]').click()
    expect(events).toEqual(['mail', 'tools'])
  })

  it('opens the shop’s composer for WhatsApp when Ventas is on', () => {
    const events = mount({ reach: { phone: '6671002000' }, composer: true })
    expect(reach('whatsapp').tagName).toBe('BUTTON')
    reach('whatsapp').click()
    expect(events).toEqual(['message'])
  })

  it('shows only the ways the record has; correo waits in «⋯» on a phone', () => {
    mount({ reach: { email: 'ana@example.com' }, mail: { allowed: true } })
    expect(reach('call')).toBeNull()
    expect(reach('whatsapp')).toBeNull()
    expect(reach('mail')).not.toBeNull()
    app.unmount()
    root.remove()
    mount({
      reach: { phone: '6671002000', email: 'ana@example.com' },
      mail: { allowed: true },
      phone: true,
    })
    expect(reach('call')).not.toBeNull()
    expect(reach('mail')).toBeNull()
  })

  it('keeps a refused correo in place and says why', () => {
    const events = mount({
      reach: {},
      mail: { allowed: false, reason: 'Guarda el borrador primero.' },
    })
    expect(reach('mail').getAttribute('title')).toBe(
      'Guarda el borrador primero.',
    )
    reach('mail').click()
    expect(events).toEqual(['mail'])
  })
})

// The island follows the name on a desk (ui/AppBar `island`): every bar that
// carries one has to say so, or a new record page puts it back at the far edge.
describe('record bars', () => {
  const src = path.resolve(__dirname, '../../src')
  const vueFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) return vueFiles(p)
      return entry.name.endsWith('.vue') ? [p] : []
    })
  // The opening tag ends at the first `>` outside a quoted attribute value.
  const openingTag = (text, from) => {
    let quote = ''
    for (let i = from; i < text.length; i += 1) {
      const c = text[i]
      if (quote) quote = c === quote ? '' : quote
      else if (c === '"' || c === "'") quote = c
      else if (c === '>') return text.slice(from, i + 1)
    }
    return text.slice(from)
  }
  it('pass `island` to the AppBar whenever its actions hold a RecordIsland', () => {
    const missing = []
    let bars = 0
    for (const file of vueFiles(src)) {
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(/<AppBar\b/g)) {
        const end = text.indexOf('</AppBar>', match.index)
        if (end < 0 || !text.slice(match.index, end).includes('<RecordIsland'))
          continue
        bars += 1
        if (!/\sisland(\s|>|=)/.test(openingTag(text, match.index)))
          missing.push(path.relative(src, file))
      }
    }
    expect(bars).toBeGreaterThanOrEqual(12)
    expect(missing).toEqual([])
  })
})
