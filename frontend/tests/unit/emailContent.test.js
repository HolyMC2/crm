// The email frame styles itself with the page's own stylesheets, by reference:
// the Activities chunk no longer carries a copy of index.css.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import EmailContent from '@/components/Activities/EmailContent.vue'

let app
let root
const added = []

function addHead(tag, attrs, text) {
  const el = document.createElement(tag)
  Object.assign(el, attrs)
  if (text) el.textContent = text
  document.head.appendChild(el)
  added.push(el)
}

beforeEach(() => {
  // happy-dom would fetch the stylesheet the test links; the frame only names it.
  if (window.happyDOM?.settings)
    window.happyDOM.settings.disableCSSFileLoading = true
})

afterEach(() => {
  app?.unmount()
  root?.remove()
  added.splice(0).forEach((el) => el.remove())
})

describe('EmailContent frame styles', () => {
  it('links the stylesheets the page loaded instead of inlining them', async () => {
    addHead('link', {
      rel: 'stylesheet',
      href: '/assets/crm/frontend/assets/index-test.css',
    })
    addHead('style', {}, '.shell-mark{color:red}')
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () => h(EmailContent, { content: '<p>Hola <b>Marco</b></p>' }),
    })
    app.mount(root)
    await nextTick()

    const srcdoc = root.querySelector('iframe').getAttribute('srcdoc')
    expect(srcdoc).toContain('<p>Hola <b>Marco</b></p>')
    expect(srcdoc).toMatch(
      /<link rel="stylesheet" href="[^"]*\/assets\/crm\/frontend\/assets\/index-test\.css">/,
    )
    expect(srcdoc).toContain('<style>.shell-mark{color:red}</style>')
    expect(srcdoc).not.toContain('@font-face')
    expect(srcdoc.length).toBeLessThan(20_000)
  })
})
