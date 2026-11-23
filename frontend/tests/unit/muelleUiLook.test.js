// The Material Design 3 look of @muelle/ui as the apps vendor it
// (components/ui): the bridge that points frappe-ui's variables at the
// --muelle-* roles, the state layer of `.press`, and what each primitive's
// look promises (which role a selected thing takes, what has no border).
// Behaviour (roles, ARIA, events) is muelleUiKit.test.js; this file is the
// look's contract, so a class is asserted only where it IS the contract.
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    // The bar's counts read the server through `call`; the look needs none.
    call: vi.fn(async () => ({})),
    createResource: () => ({
      data: null,
      fetch: vi.fn(),
      reload: vi.fn(),
      submit: vi.fn(),
    }),
    Button: {
      props: ['label', 'variant', 'size'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            { type: 'button', onClick: () => emit('click') },
            props.label,
          ),
    },
  }
})

import ShellBottomNav from '@/components/shell/ShellBottomNav.vue'
import { statusLabel, statusTone } from '@/utils/display'
import {
  AppBar,
  BottomSheet,
  ChipDrill,
  ChipGroup,
  DateField,
  EmptyState,
  Fab,
  FilterChips,
  KpiTile,
  ListRow,
  RecentPicks,
  SearchPanel,
  Segmented,
  StatusChip,
  chipClass,
  configureUi,
  primaryDock,
} from '@/components/ui'

const src = path.resolve(__dirname, '../../src')
const kit = path.join(src, 'components/ui')
const read = (file) => fs.readFileSync(file, 'utf8')
const shellCss = read(path.join(kit, 'shell.css'))
const tokensCss = read(path.join(src, 'vendor/muelle-shell/tokens/tokens.css'))

// --- a small reader for the two sheets --------------------------------------
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
/** Every rule as { selector, media, decls: Map }, one level of @media deep. */
function rules(css) {
  const out = []
  const text = noComments(css)
  const walk = (body, media) => {
    let i = 0
    while (i < body.length) {
      const open = body.indexOf('{', i)
      if (open < 0) break
      let depth = 1
      let close = open + 1
      for (; close < body.length && depth; close++) {
        if (body[close] === '{') depth++
        else if (body[close] === '}') depth--
      }
      const selector = body.slice(i, open).trim().replace(/\s+/g, ' ')
      const inner = body.slice(open + 1, close - 1)
      if (selector.startsWith('@media')) walk(inner, selector)
      else if (!selector.startsWith('@')) {
        const decls = new Map()
        for (const part of inner.split(/;(?![^(]*\))/)) {
          const at = part.indexOf(':')
          if (at > 0)
            decls.set(
              part.slice(0, at).trim(),
              part
                .slice(at + 1)
                .trim()
                .replace(/\s+/g, ' '),
            )
        }
        out.push({ selector, media, decls })
      }
      i = close
    }
  }
  walk(text, '')
  return out
}
const shellRules = rules(shellCss)
const tokenRules = rules(tokensCss)
const rule = (selector, list = shellRules) =>
  list.find((r) => r.selector === selector && !r.media)
const tokensOf = (selector) => rule(selector, tokenRules).decls
const LIGHT = tokensOf(':root')
const DARK = tokensOf(":root[data-theme='dark']")
const tokenNames = new Set([...LIGHT.keys(), ...DARK.keys()])
const muelleVars = (text) =>
  [...text.matchAll(/var\(\s*(--muelle-[a-z0-9-]+)/g)].map((m) => m[1])

describe('the bridge: frappe-ui names on the Material roles', () => {
  const bridge = rule('html:root')
  const dark = rule("html:root[data-theme='dark']")

  it('is written under html:root, so it wins in both themes whatever the import order', () => {
    expect(bridge, 'a rule with the selector html:root').toBeTruthy()
    expect(dark, 'and one for the dark theme').toBeTruthy()
    // frappe-ui declares the same names on `:root` and `[data-theme=dark]`
    // (0,1,0 each); html:root is (0,1,1).
    for (const r of shellRules)
      for (const name of r.decls.keys())
        if (/^--(surface|outline|radius|elevation)-/.test(name))
          expect(
            r.selector === ':root' || r.selector === "[data-theme='dark']",
            `${name} in «${r.selector}» would tie with frappe-ui`,
          ).toBe(false)
  })

  it('every value is a var(--muelle-…) that the tokens declare', () => {
    for (const block of [bridge, dark])
      for (const [name, value] of block.decls) {
        expect(value, name).toMatch(/^var\(--muelle-[a-z0-9-]+\)$/)
        expect(tokenNames.has(muelleVars(value)[0]), `${name}: ${value}`).toBe(
          true,
        )
      }
  })

  it('tone, the filled primary, hairlines, shape and elevation point where the spec says', () => {
    const at = (name) => bridge.decls.get(name)
    expect(at('--surface-gray-1')).toBe('var(--muelle-surface-container-low)')
    expect(at('--surface-gray-2')).toBe('var(--muelle-surface-container)')
    expect(at('--surface-gray-3')).toBe('var(--muelle-surface-container-high)')
    expect(at('--surface-gray-4')).toBe(
      'var(--muelle-surface-container-highest)',
    )
    expect(at('--surface-gray-10')).toBe('var(--muelle-accent)')
    expect(at('--surface-gray-9')).toBe('var(--muelle-accent-hover)')
    // The hairline: frappe-ui's own lightest outline in every shop, so a
    // divider never weighs more than it did before the roles (the tokens
    // package pins the value). A control's and a card's outline
    // (--outline-gray-2) keeps frappe-ui's strength: it is not bridged.
    expect(at('--outline-gray-1')).toBe('var(--muelle-outline-variant)')
    expect(at('--outline-gray-2')).toBeUndefined()
    expect(LIGHT.get('--muelle-outline-variant')).toBe(
      LIGHT.get('--muelle-outline-gray-1'),
    )
    expect(DARK.get('--muelle-outline-variant')).toBe(
      DARK.get('--muelle-outline-gray-1'),
    )
    // 8, 12, 16, 20 and 28 px, read through the tokens
    const px = (name) => LIGHT.get(muelleVars(at(name))[0])
    expect(
      [
        '--radius-3',
        '--radius-5',
        '--radius-6',
        '--radius-7',
        '--radius-8',
      ].map(px),
    ).toEqual(['8px', '12px', '16px', '20px', '28px'])
    // a card keeps an edge; what floats takes the one shadow
    for (const step of ['sm', 'base'])
      expect(at(`--elevation-${step}`)).toBe('var(--muelle-elevation-edge)')
    for (const step of ['md', 'lg', 'xl', '2xl'])
      expect(at(`--elevation-${step}`)).toBe('var(--muelle-elevation-float)')
    expect(LIGHT.get('--muelle-elevation-edge')).toMatch(/^0 0 0 1px /)
  })

  it('leaves --radius-4 at 8 px: the small controls keep their corner', () => {
    for (const r of shellRules)
      expect(r.decls.has('--radius-4'), r.selector).toBe(false)
  })

  it('in dark, the tinted chip backgrounds are the status tokens', () => {
    expect(Object.fromEntries(dark.decls)).toEqual({
      '--surface-blue-1': 'var(--muelle-status-blue-bg)',
      '--surface-green-1': 'var(--muelle-status-green-bg)',
      '--surface-amber-1': 'var(--muelle-status-orange-bg)',
      '--surface-red-1': 'var(--muelle-status-red-bg)',
    })
  })

  it('toasts, tooltips and .ui-inverse keep the inverse pair when the accent is a colour', () => {
    const toast = rule('[data-sonner-toast]')
    expect(toast.decls.get('--surface-gray-9')).toBe(
      'var(--muelle-inverse-surface)',
    )
    const inverse = shellRules.find(
      (r) =>
        r.selector.split(', ').includes('.ui-inverse') &&
        r.decls.has('--surface-gray-10'),
    )
    expect(inverse.selector.split(', ')).toEqual(
      expect.arrayContaining(["[data-slot='bubble']", "[data-slot='arrow']"]),
    )
    expect(inverse.decls.get('--surface-gray-10')).toBe(
      'var(--muelle-inverse-surface)',
    )
    const paint = rule('.ui-inverse')
    expect(paint.decls.get('background-color')).toBe(
      'var(--muelle-inverse-surface)',
    )
    expect(paint.decls.get('color')).toBe('var(--muelle-inverse-on-surface)')
  })

  it('no crm tooltip or floating bar pairs the filled-primary fill with a shadow', () => {
    // bg-surface-gray-10 and -9 are the shop's accent now: a tooltip that kept
    // them would turn the shop's colour. They take .ui-inverse.
    const FILL = /(?<![\w:-])bg-surface-gray-(?:9|10)(?![\w/])/
    const SHADOW = /(?<![\w:-])shadow(?:-(?:sm|md|lg|xl|2xl))?(?![\w-])/
    const found = []
    for (const file of sourceFiles(src, ['.vue'])) {
      if (file.startsWith(kit)) continue
      for (const tag of tags(read(file)))
        if (FILL.test(tag.text) && SHADOW.test(tag.text))
          found.push(`${path.relative(src, file)}:${tag.line}`)
    }
    expect(found).toEqual([])
  })

  it('every --muelle-* the kit names exists in the tokens (a typo paints nothing)', () => {
    const own = new Set(
      [...noComments(shellCss).matchAll(/(--muelle-[a-z0-9-]+)\s*:/g)].map(
        (m) => m[1],
      ),
    )
    const unknown = []
    for (const file of fs.readdirSync(kit)) {
      if (!/\.(vue|js|css)$/.test(file)) continue
      for (const name of muelleVars(read(path.join(kit, file))))
        if (!tokenNames.has(name) && !own.has(name))
          unknown.push(`${file}: ${name}`)
    }
    expect([...new Set(unknown)]).toEqual([])
    // each role the kit paints with is declared for both themes
    for (const name of [
      '--muelle-surface-container-low',
      '--muelle-surface-container-highest',
      '--muelle-secondary-container',
      '--muelle-on-secondary-container',
      '--muelle-on-surface-variant',
      '--muelle-outline-variant',
      '--muelle-accent-hover',
      '--muelle-inverse-surface',
    ]) {
      expect(LIGHT.has(name), name).toBe(true)
      expect(DARK.has(name), `${name} (dark)`).toBe(true)
    }
  })
})

// --- source scans -------------------------------------------------------------
function sourceFiles(dir, extensions, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(p, extensions, out)
    } else if (
      extensions.some((ext) => entry.name.endsWith(ext)) &&
      !/\.(test|spec)\./.test(entry.name)
    )
      out.push(p)
  }
  return out
}
/** Every opening tag of a file, with its line. */
function tags(text) {
  const out = []
  const TAG = /<[A-Za-z][^<>]*?(?:"[^"]*"[^<>]*?|'[^']*'[^<>]*?)*>/gs
  for (const m of text.matchAll(TAG))
    out.push({
      text: m[0],
      line: text.slice(0, m.index).split('\n').length,
    })
  return out
}

describe('.press: the tactile press and its state layer', () => {
  const selectorsOf = (pseudo) =>
    shellRules.filter(
      (r) => r.selector.includes(pseudo) && r.decls.has('background-image'),
    )

  it('keeps the 0.96 scale', () => {
    const active = rule('.press:active')
    expect(active.decls.get('--tw-scale-x')).toBe('0.96')
    expect(active.decls.get('--tw-scale-y')).toBe('0.96')
    // through Tailwind's variables, so a moved or turned control keeps its place
    expect(active.decls.get('transform')).toContain('var(--tw-translate-x')
    expect(active.decls.get('transform')).toContain('var(--tw-scale-x')
  })

  it('paints the layer with the control’s own ink: 8 % under a pointer, 10 % pressed or focused', () => {
    const hover = selectorsOf(':hover')
    expect(hover.length).toBeGreaterThan(0)
    for (const r of hover) {
      // a tap leaves :hover on the control it landed on: pointer only
      expect(r.media, r.selector).toBe('@media (hover: hover)')
      expect(r.decls.get('background-image')).toBe(
        'linear-gradient( color-mix(in srgb, currentColor 8%, transparent) 0 0 )',
      )
    }
    const pressed = selectorsOf(':active')
    expect(pressed.length).toBeGreaterThan(0)
    for (const r of pressed) {
      expect(r.media).toBe('')
      expect(r.selector).toContain(':focus-visible')
      expect(r.decls.get('background-image')).toBe(
        'linear-gradient( color-mix(in srgb, currentColor 10%, transparent) 0 0 )',
      )
    }
    for (const r of [...hover, ...pressed]) {
      expect(r.selector).toContain('.press')
      expect(r.selector).toContain('.state-layer')
    }
  })

  it('never takes the chevron of a select or the tick of a checkbox', () => {
    // @tailwindcss/forms draws both as a background-image; the layer is one too.
    for (const r of [...selectorsOf(':hover'), ...selectorsOf(':active')])
      for (const part of r.selector.split(/,\s*(?=:is)/))
        expect(part, part).toMatch(/:not\([^)]*select, input\)/)
  })

  it('stops under prefers-reduced-motion', () => {
    const still = shellRules.find(
      (r) =>
        r.media.includes('prefers-reduced-motion') &&
        r.selector.split(', ').includes('.press'),
    )
    expect(still.decls.get('transition')).toBe('none !important')
  })

  it('no element pairs .press or .state-layer with a background-image of its own', () => {
    // The layer would replace it on hover. Two ways to set one: a class on the
    // tag (bg-gradient-*, bg-[url(…)]) and a class a stylesheet gives an image.
    const IMAGE_UTILITY =
      /(?<![\w-])(?:bg-gradient-|bg-\[(?:url|image|linear|radial|conic|repeating)|bg-none(?![\w-]))/
    const LAYER =
      /(?<![\w-])(?:press|state-layer)(?![\w-])|(?<![\w.])chipClass\(/
    const OWN = new Set(['press', 'state-layer', 'dock-icon', 'skel', 'dark'])
    const withImage = new Set()
    const files = sourceFiles(src, ['.vue', '.css'])
    for (const file of files) {
      const text = read(file)
      const css = file.endsWith('.css')
        ? text
        : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
            .map((m) => m[1])
            .join('\n')
      for (const r of rules(css)) {
        const image = [...r.decls].some(
          ([name, value]) =>
            /^background(-image)?$/.test(name) &&
            /url\(|gradient\(/.test(value),
        )
        if (image)
          for (const m of r.selector.matchAll(/\.([A-Za-z_][\w-]*)/g))
            if (!OWN.has(m[1])) withImage.add(m[1])
      }
    }
    const found = []
    for (const file of files.filter((f) => f.endsWith('.vue')))
      for (const tag of tags(read(file))) {
        if (!LAYER.test(tag.text)) continue
        const named = [...withImage].filter((name) =>
          new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(tag.text),
        )
        if (IMAGE_UTILITY.test(tag.text) || named.length)
          found.push(
            `${path.relative(src, file)}:${tag.line} ${named.join(' ')}`.trim(),
          )
      }
    expect(found).toEqual([])
    // the scan can see: it finds a class a stylesheet paints, and the layer's tags
    expect(withImage.size).toBeGreaterThan(0)
  })
})

// --- the primitives, mounted --------------------------------------------------
const state = { phone: ref(true) }
configureUi({ statusLabel, statusTone, isMobile: state.phone })

let app, root
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
async function mount(component, props = {}, slots = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const bound = reactive({ ...props })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  })
  router.push('/')
  await router.isReady()
  app = createApp({ render: () => h(component, { ...bound }, slots) })
  app.use(router)
  app.mount(root)
  await flush()
  return bound
}
const all = (selector) => [...document.querySelectorAll(selector)]
const one = (selector) => document.querySelector(selector)
const SELECTED = [
  'bg-[var(--muelle-secondary-container)]',
  'text-[var(--muelle-on-secondary-container)]',
]
const classes = (el) => [...el.classList]

beforeEach(() => {
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.phone.value = true
  primaryDock.value = false
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.body.innerHTML = ''
  primaryDock.value = false
})

describe('one chip', () => {
  const flat = (on) => chipClass(on).join(' ')

  it('on is the secondary container, never green: selection is not success', () => {
    for (const name of SELECTED) expect(flat(true)).toContain(name)
    expect(flat(true)).not.toMatch(/green/)
    expect(flat(false)).not.toMatch(/green|secondary-container/)
    expect(flat(false)).toContain('border-outline-gray-2')
  })

  it('is 32 px in a 44 px target, on the chip shape token, with the press', () => {
    for (const on of [true, false]) {
      const list = flat(on).split(' ')
      expect(list).toContain('min-h-8') // 32 px
      expect(list).toContain('my-1.5') // 6 px above and below: 44 px of row
      // the margin is part of the tap: 6 px + the 1 px border on each side
      expect(list).toContain('after:-inset-y-[7px]')
      expect(list).toContain('rounded-[var(--muelle-shape-chip)]')
      expect(list).toContain('text-[14px]')
      expect(list).toContain('press')
    }
    expect(LIGHT.get('--muelle-shape-chip')).toBe('8px')
  })

  it('a chip that is on shows a check, drawn once by the sheet', () => {
    const check = shellRules.find(
      (r) =>
        r.selector.includes('.ui-chip-on') && r.selector.endsWith('::before'),
    )
    const selector = check.selector.replace(/\s+/g, '')
    // the state on the chip itself, or on the button around a chip span
    expect(selector).toContain(
      ".ui-chip-on:is([aria-pressed='true'],[aria-checked='true'])",
    )
    expect(selector).toContain(
      ":is([aria-pressed='true'],[aria-checked='true'])>.ui-chip-on",
    )
    // a chip that draws its own check keeps that one
    for (const part of selector.split('::before').filter(Boolean))
      expect(part).toContain(':not(:has(.lucide-check))')
    expect(check.decls.get('mask')).toContain('var(--ui-chip-check)')
    expect(flat(true).split(' ')).toContain('ui-chip-on')
    expect(flat(false).split(' ')).not.toContain('ui-chip-on')
  })

  it('FilterChips, ChipGroup and ChipDrill all draw it', async () => {
    await mount(FilterChips, {
      modelValue: 'b',
      chips: [
        { value: '', label: 'Todas' },
        { value: 'b', label: 'Vencidas', count: 3 },
      ],
    })
    const on = one('[data-chip="b"]')
    expect(on.getAttribute('aria-pressed')).toBe('true')
    expect(classes(on)).toEqual(
      expect.arrayContaining(chipClass(true)[1].split(' ')),
    )
    expect(classes(one('[data-chip=""]'))).toEqual(
      expect.arrayContaining(chipClass(false)[1].split(' ')),
    )
    // the chip is the button: its own box is the 44 px target
    expect(on.tagName).toBe('BUTTON')
    expect(on.querySelector('.lucide-check')).toBeNull()
    app.unmount()
    root.remove()

    await mount(ChipGroup, {
      modelValue: 'x',
      options: [
        { value: '', label: 'Todos' },
        { value: 'x', label: 'Nuevo' },
      ],
    })
    const [first, second] = all('button[aria-pressed]')
    expect(first.getAttribute('aria-pressed')).toBe('false')
    expect(classes(second)).toContain('ui-chip-on')
    app.unmount()
    root.remove()

    await mount(ChipDrill, {
      sections: [
        {
          key: 'a',
          label: 'Origen',
          selected: ['fb'],
          toggle() {},
          options: [],
        },
      ],
    })
    expect(classes(one('[data-testid="drill-a"]'))).toContain('ui-chip-on')
  })

  it('a count beside a label keeps the label’s ink: lighter in weight, never faded', async () => {
    // The label of a chip that is off is on-surface-variant, which the tokens
    // hold at 4.5:1 on every container. Faded to 70 % it read 4.0:1 on the
    // dark page and 3.3:1 on a segment's track, and a coloured shop's
    // on-secondary-container fades under AA too.
    await mount(FilterChips, {
      modelValue: 'b',
      chips: [
        { value: '', label: 'Todas', count: 31 },
        { value: 'b', label: 'Vencidas', count: 3 },
      ],
    })
    const counts = all('[data-chip] .tabular-nums')
    expect(counts.map((el) => el.textContent.trim())).toEqual(['31', '3'])
    for (const el of counts) {
      expect(classes(el)).toContain('font-normal')
      expect(el.className).not.toMatch(/opacity-/)
    }
    app.unmount()
    root.remove()
    await mount(Segmented, {
      modelValue: 'a',
      options: [
        { value: 'a', label: 'Selladas', count: 18 },
        { value: 'b', label: 'En camino', count: 0 },
      ],
    })
    const figures = all('[data-ui-segmented] .tabular-nums')
    expect(figures).toHaveLength(2)
    for (const el of figures) expect(el.className).not.toMatch(/opacity-/)
    // and nowhere else in the kit is a figure beside a label faded
    for (const file of fs.readdirSync(kit))
      if (/\.(vue|js)$/.test(file))
        expect(read(path.join(kit, file)), file).not.toMatch(
          /tabular-nums[^"']*opacity-|opacity-[^"']*tabular-nums/,
        )
  })

  it('the «Filtros» chip counts on the accent', async () => {
    await mount(
      FilterChips,
      { modelValue: '', chips: [], filtersCount: 2 },
      { filters: () => h('p', 'x') },
    )
    const chip = one('[data-ui-filters-chip]')
    expect(classes(chip)).toContain('ui-chip-on')
    const count = chip.querySelector('[aria-hidden="true"]:last-child')
    expect(count.textContent.trim()).toBe('2')
    expect(classes(count)).toEqual(
      expect.arrayContaining([
        'bg-[var(--muelle-accent)]',
        'text-[var(--muelle-accent-ink)]',
      ]),
    )
  })
})

describe('what is selected takes the secondary container', () => {
  it('Segmented: a tonal track with no border or dividers, the chosen segment a pill', async () => {
    await mount(Segmented, {
      modelValue: 'b',
      options: [
        { value: 'a', label: 'Lista' },
        { value: 'b', label: 'Semana' },
        { value: 'c', label: 'Mes' },
      ],
    })
    const track = one('[data-ui-segmented]')
    // the role by name: inside a sheet the bridge lifts --surface-gray-3 a step
    expect(classes(track)).toContain(
      'bg-[var(--muelle-surface-container-high)]',
    )
    expect(classes(track).some((c) => c.startsWith('border'))).toBe(false)
    const [a, b, c] = all('[role="radio"]')
    for (const segment of [a, b, c]) {
      expect(classes(segment).some((name) => name.startsWith('border'))).toBe(
        false,
      )
      expect(classes(segment)).toContain('rounded-full')
    }
    expect(classes(b)).toEqual(expect.arrayContaining(SELECTED))
    expect(classes(a)).not.toEqual(expect.arrayContaining(SELECTED))
    expect(classes(a)).toContain('text-[var(--muelle-on-surface-variant)]')
  })

  it('ListRow: the selected row; a 40 px disc on container-highest; the layer only where it can be tapped', async () => {
    await mount(ListRow, {
      title: 'Papelera del Norte',
      avatar: 'Papelera del Norte',
      selected: true,
      onClick: () => {},
    })
    const row = one('[data-ui-list-row]')
    expect(row.getAttribute('aria-current')).toBe('true')
    expect(classes(row)).toEqual(expect.arrayContaining(SELECTED))
    expect(classes(row)).toContain('state-layer')
    // it does not shrink under the finger: the layer without the press
    expect(classes(row)).not.toContain('press')
    const disc = row.querySelector('[aria-hidden="true"]')
    expect(classes(disc)).toEqual(
      expect.arrayContaining(['size-10', 'bg-surface-gray-4', 'rounded-full']),
    )
    app.unmount()
    root.remove()

    await mount(ListRow, { title: 'Sin tocar', icon: 'lucide-store' })
    const plain = one('[data-ui-list-row]')
    expect(plain.tagName).toBe('DIV')
    expect(classes(plain)).not.toContain('state-layer')
    expect(classes(plain)).not.toEqual(expect.arrayContaining(SELECTED))
    // density unchanged: a row without a second line is still 48 px
    expect(classes(plain)).toEqual(expect.arrayContaining(['min-h-12', 'py-2']))
  })

  it('AppBar: the scope that is on, in the list sheet', async () => {
    await mount(AppBar, {
      title: 'Vencido',
      scope: 'b',
      scopes: [
        { value: 'a', label: 'Todo' },
        { value: 'b', label: 'Vencido', count: 9 },
      ],
    })
    one('[data-appbar] button[aria-haspopup="dialog"]').click()
    await flush()
    await vi.dynamicImportSettled()
    await flush()
    const on = one('nav [aria-current="true"]')
    expect(on.textContent).toContain('Vencido')
    expect(classes(on)).toEqual(expect.arrayContaining(SELECTED))
    const off = all('nav button').find((b) => !b.getAttribute('aria-current'))
    expect(classes(off)).not.toEqual(expect.arrayContaining(SELECTED))
    expect(classes(off)).toContain('state-layer')
  })

  it('KpiTile: a tonal tile with no border; pressed, the secondary container', async () => {
    await mount(KpiTile, { label: 'Vencidas', value: '3', pressed: true })
    const tile = one('[data-ui-kpi]')
    expect(tile.getAttribute('aria-pressed')).toBe('true')
    expect(classes(tile)).toEqual(expect.arrayContaining(SELECTED))
    expect(classes(tile).some((c) => c.startsWith('border'))).toBe(false)
    expect(classes(tile)).toContain('rounded-7') // 20 px through the bridge
    app.unmount()
    root.remove()

    await mount(KpiTile, { label: 'Por cobrar', value: '$1' })
    const plain = one('[data-ui-kpi]')
    expect(classes(plain)).toContain('bg-surface-gray-1') // container-low
    expect(classes(plain).some((c) => c.startsWith('border'))).toBe(false)
  })

  it('DateField: the day and the shortcut that are picked', async () => {
    await mount(DateField, { modelValue: '2026-11-22', label: 'Vence' })
    const css = read(path.join(kit, 'DateField.vue'))
    // the picked day is the filled accent, so the eye lands on it, not on today's ring
    expect(css).toMatch(
      /\.date-day\.is-picked \{\s*background-color: var\(--muelle-accent,/,
    )
    // tone, not borders: the field is filled, and only its chips keep a hairline
    const inputs = all('[data-ui-date-field] input')
    expect(inputs.length).toBe(1)
    for (const input of inputs) {
      expect(classes(input)).toContain('bg-surface-gray-4')
      expect(classes(input)).toContain('border-0')
    }
    // its shortcuts are the kit's chip; the one for the picked day is on
    const chips = all('[data-ui-date-field] button[aria-pressed]')
    expect(chips.map((chip) => chip.textContent.trim())).toEqual([
      'Hoy',
      'Mañana',
      'En una semana',
    ])
    for (const chip of chips) expect(classes(chip)).toContain('press')
    const bordered = all('[data-ui-date-field] [class*="border-outline"]')
    expect(bordered.every((el) => chips.includes(el))).toBe(true)
    app.unmount()
    root.remove()

    // the month, opened: a tonal tile with no border
    await mount(DateField, { modelValue: '2026-11-22', label: 'Vence' })
    one('[data-ui-date-field] button[aria-expanded]').click()
    await flush()
    const month = one('.date-month')
    expect(classes(month)).toContain('bg-surface-gray-2')
    expect(classes(month).some((c) => c.startsWith('border'))).toBe(false)
    expect(one('.date-day.is-picked').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('the phone nav: a tonal bar, the open place on a pill', () => {
  const RouterLinkStub = {
    props: ['to'],
    setup(props, { slots, attrs }) {
      return () => h('a', { href: props.to, ...attrs }, slots.default?.())
    },
  }
  let navApp
  let navHost
  afterEach(() => {
    navApp?.unmount()
    navHost?.remove()
  })
  function mountNav(active) {
    navHost = document.createElement('div')
    document.body.append(navHost)
    navApp = createApp({
      render: () =>
        h(ShellBottomNav, {
          active,
          slots: [
            { key: 'hoy', label: 'Hoy', icon: 'lucide-house', to: '/hoy' },
            {
              key: 'dinero',
              label: 'Dinero',
              icon: 'lucide-wallet',
              to: '/efectivo',
            },
          ],
        }),
    })
    navApp.config.globalProperties.__ = globalThis.__
    navApp.component('RouterLink', RouterLinkStub)
    navApp.mount(navHost)
    return navHost.querySelector('nav')
  }
  // A tab is [pill box [pill, icon], label].
  const parts = (tab) => {
    const box = tab.firstElementChild
    return { box, pill: box.children[0], icon: box.children[1] }
  }

  it('sits on the container role with no rule above it', () => {
    const nav = mountNav('hoy')
    expect(nav.className).toContain('bg-[var(--muelle-surface-container)]')
    expect(nav.className).not.toMatch(/(^|\s)border(-|\s|$)/)
  })

  it('the open place: the secondary container under its icon, the icon in its ink', () => {
    const nav = mountNav('dinero')
    const [off, on, more] = nav.children
    expect(on.getAttribute('aria-current')).toBe('page')
    const lit = parts(on)
    expect(lit.pill.className).toContain(
      'bg-[var(--muelle-secondary-container)]',
    )
    expect(lit.pill.className).toContain('opacity-100')
    expect(lit.icon.className).toContain(
      'text-[var(--muelle-on-secondary-container)]',
    )
    // The others keep the pill folded away and take the secondary ink.
    for (const tab of [off, more]) {
      const idle = parts(tab)
      expect(idle.pill.className).toContain('opacity-0')
      expect(idle.icon.className).not.toContain('on-secondary-container')
      expect(tab.className).toContain('text-[var(--muelle-on-surface-variant)]')
    }
    // The pill is never the filled accent: that is for the one primary action.
    expect(nav.innerHTML).not.toMatch(/bg-surface-gray-10|muelle-accent\b/)
  })

  it('«Más» takes the pill while the page is a place the bar does not hold', () => {
    const nav = mountNav('cobranza')
    const more = parts(nav.lastElementChild)
    expect(more.pill.className).toContain('opacity-100')
    expect(more.icon.className).toContain(
      'text-[var(--muelle-on-secondary-container)]',
    )
  })

  it('the press layer is the pill, not the tab’s rectangle', () => {
    const nav = mountNav('hoy')
    for (const tab of nav.children) {
      // .press gives the 0.96 scale; its rectangular layer is switched off…
      expect(tab.classList).toContain('press')
      expect(tab.classList).toContain('!bg-none')
      // …and the pill box paints it, in the tab’s own ink.
      const { box } = parts(tab)
      expect(box.className).toContain('rounded-full')
      expect(box.className).toContain(
        'group-active:bg-[color:color-mix(in_srgb,currentColor_10%,transparent)]',
      )
      expect(tab.classList).toContain('group')
    }
  })
})

describe('nothing on the filled accent is faded', () => {
  it('no hint or count inside a filled button carries an opacity', () => {
    // A filled primary is the shop's accent now. Its label (ink-base or
    // accent-ink) holds 4.5:1 on every accent; the same ink at 70 % does not:
    // a «N» key hint read 3.3:1 on Morado's dark accent. A hint there takes
    // the label's ink at a lighter weight instead.
    const control =
      /<(button|a|RouterLink|router-link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1>/g
    const filled =
      /bg-surface-gray-10\b|bg-\[var\(--muelle-accent\)\]|BTN_FILLED\b/
    const faded =
      /<(kbd|span|small|em|b|strong|p)\b[^>]*class="[^"]*(?<![\w:-])opacity-(?:[1-8]0|[1-8]5)\b/
    const found = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(file)
        else if (entry.name.endsWith('.vue')) {
          const text = read(file)
          for (const m of text.matchAll(control))
            if (filled.test(m[2]) && faded.test(m[3]))
              found.push(
                `${path.relative(src, file)}:${text.slice(0, m.index).split('\n').length}`,
              )
        }
      }
    }
    walk(src)
    expect(found).toEqual([])
  })
})

describe('the shell slides the whole app bar away', () => {
  it('hides by the kit bar’s own height, so no strip of it stays on screen', () => {
    // The phone header leaves on scroll down by a negative margin
    // (MuelleShell HEADER_HEIGHT). The bar is the kit's: when its height
    // changes (56 to 64 px with this look) the margin must follow.
    const bar = read(path.join(kit, 'AppBar.vue'))
    const minH = bar.match(/<div class="flex min-h-(\d+) items-center/)
    expect(minH, 'the bar row and its min-h-* class').toBeTruthy()
    const shell = read(path.join(src, 'components/shell/MuelleShell.vue'))
    const height = shell.match(/const HEADER_HEIGHT = (\d+)/)
    expect(height, 'HEADER_HEIGHT in MuelleShell.vue').toBeTruthy()
    expect(Number(height[1])).toBe(Number(minH[1]) * 4)
    expect(Number(height[1])).toBe(64)
  })
})

describe('the filled accent is for the one primary action', () => {
  it('Fab: the accent floating and docked, 16 px corners, 48 px docked', async () => {
    await mount(Fab, { label: 'Nuevo pendiente' })
    const floating = one('[data-ui-fab]')
    const ACCENT = [
      'bg-[var(--muelle-accent)]',
      'text-[var(--muelle-accent-ink)]',
    ]
    expect(classes(floating)).toEqual(expect.arrayContaining(ACCENT))
    expect(classes(floating)).toContain('rounded-6') // 16 px through the bridge
    expect(floating.className).not.toMatch(/surface-gray-10|ink-base/)
    app.unmount()
    root.remove()

    const target = document.createElement('div')
    target.id = 'shell-primary-action'
    document.body.appendChild(target)
    primaryDock.value = true
    await mount(Fab, { label: 'Nuevo pendiente' })
    const docked = target.querySelector('[data-ui-fab]')
    expect(classes(docked)).toEqual(
      expect.arrayContaining([...ACCENT, 'size-12', 'rounded-6']),
    )
    expect(docked.getAttribute('aria-label')).toBe('Nuevo pendiente')
  })
})

describe('tone instead of borders', () => {
  it('AppBar: 64 px, no rule under it, 48 px icon buttons with the layer, a 22 px back-bar title', async () => {
    await mount(AppBar, {
      title: 'CellCity del Pacífico',
      back: '/compras',
      searchable: true,
    })
    const bar = one('[data-appbar]')
    expect(classes(bar).some((c) => c.startsWith('border'))).toBe(false)
    expect(classes(bar.firstElementChild)).toContain('min-h-16')
    for (const button of [
      one('[data-appbar-back]'),
      one('[data-appbar-search-open]'),
    ])
      expect(classes(button)).toEqual(
        expect.arrayContaining(['size-12', 'press', 'rounded-full']),
      )
    expect(classes(one('[data-appbar-title]'))).toContain('text-[22px]')
  })

  it('AppBar: no rule above the summary either', async () => {
    await mount(
      AppBar,
      { title: 'Cobranza' },
      { summary: () => h('span', 'Por cobrar') },
    )
    expect(
      classes(one('[data-appbar-summary]')).some((c) => c.startsWith('border')),
    ).toBe(false)
  })

  it('BottomSheet: container-low, 28 px corners (dialog too), a 22 px title, no rule above the actions', async () => {
    await mount(
      BottomSheet,
      { open: true, title: 'Registrar pago' },
      { default: () => h('p', 'x'), actions: () => h('button', 'Guardar') },
    )
    const sheet = one('[data-ui-sheet]')
    expect(classes(sheet)).toEqual(
      expect.arrayContaining(['ui-sheet-surface', 'rounded-t-8']),
    )
    expect(sheet.className).not.toMatch(/bg-surface-base/)
    const surface = rule('.ui-sheet-surface')
    expect(surface.decls.get('background-color')).toBe(
      'var(--muelle-surface-container-low)',
    )
    // one step of tone inside: a fill a page draws still shows on the sheet
    expect(surface.decls.get('--surface-gray-1')).toBe(
      'var(--muelle-surface-container)',
    )
    expect(classes(one('[data-ui-sheet] h2'))).toContain('text-[22px]')
    expect(
      classes(one('[data-ui-sheet-actions]')).some((c) =>
        c.startsWith('border'),
      ),
    ).toBe(false)
    expect(classes(one('.ui-sheet-scrim'))).toContain('ui-scrim')
    app.unmount()
    root.remove()

    state.phone.value = false
    await mount(BottomSheet, { open: true, title: 'Registrar pago' })
    expect(classes(one('[data-ui-sheet]'))).toEqual(
      expect.arrayContaining(['ui-sheet-surface', 'rounded-8']),
    )
  })

  it('the scrim is 36 % in light and 56 % in dark, under every sheet and panel', () => {
    expect(rule('.ui-scrim').decls.get('background-color')).toBe(
      'rgb(0 0 0 / 0.36)',
    )
    expect(
      rule("[data-theme='dark'] .ui-scrim").decls.get('background-color'),
    ).toBe('rgb(0 0 0 / 0.56)')
    expect(rule('.tool-dock-scrim').decls.get('background')).toBe(
      'rgb(0 0 0 / 0.36)',
    )
    expect(
      rule("[data-theme='dark'] .tool-dock-scrim").decls.get('background'),
    ).toBe('rgb(0 0 0 / 0.56)')
  })

  it('SearchPanel and RecentPicks: a 48 px pill on container-highest, discs on tone', async () => {
    await mount(SearchPanel, { open: false, query: '', placeholder: 'Buscar' })
    const pill = one('[data-list-search]').parentElement
    expect(classes(pill)).toEqual(
      expect.arrayContaining(['min-h-12', 'bg-surface-gray-4', 'rounded-full']),
    )
    expect(pill.className).not.toMatch(/border-outline|ring-outline/)
    app.unmount()
    root.remove()

    await mount(RecentPicks, {
      picks: [{ doctype: 'Customer', name: 'c1', label: 'Papelera del Norte' }],
    })
    const pick = one('[data-testid="recent-picks"] .grid button')
    expect(classes(pick)).toContain('press')
    expect(classes(pick.firstElementChild)).toContain('bg-surface-gray-4')
  })

  it('ToolDock: the docked search is 48 px on container-highest; the panel is a tonal sheet', () => {
    expect(rule('.dock-pill').decls.get('min-height')).toBe('48px')
    // the paint also under the dock's id: it out-ranks the page's own field class
    const paint = rule('.dock-pill, #shell-page-tools .dock-pill')
    expect(paint.decls.get('background')).toBe(
      'var(--muelle-surface-container-highest)',
    )
    expect(paint.decls.get('border')).toBe('0')
    const panel = rule('.tool-dock-panel')
    expect(panel.decls.get('background')).toBe(
      'var(--muelle-surface-container-low)',
    )
    expect(
      [...panel.decls.keys()].some((name) =>
        /^border-top$|^box-shadow$/.test(name),
      ),
    ).toBe(false)
    // A docked icon is 48 px as the pill; its box and paint are also written
    // under the dock's id, so the page's class for the same button (a
    // bordered, filled «Filtros») does not show as a box in the bar.
    const icon = rule('.dock-icon, #shell-page-tools .dock-icon')
    expect(icon.decls.get('width')).toBe('48px')
    expect(icon.decls.get('height')).toBe('48px')
    expect(icon.decls.get('border')).toBe('0')
    // background-color, never the shorthand: the state layer is a
    // background-image and must survive this rule's higher specificity
    expect(icon.decls.get('background-color')).toBe('transparent')
    expect(icon.decls.has('background')).toBe(false)
    const on = rule(
      ".dock-icon[aria-expanded='true'], .dock-icon[aria-pressed='true'], #shell-page-tools .dock-icon[aria-expanded='true'], #shell-page-tools .dock-icon[aria-pressed='true']",
    )
    expect(on.decls.get('background-color')).toBe(
      'var(--muelle-secondary-container)',
    )
    expect(on.decls.get('color')).toBe('var(--muelle-on-secondary-container)')
  })

  it('PaneState: the icon on a 56 px disc; the message stays', async () => {
    await mount(EmptyState, {
      state: 'denied',
      title: 'Sin acceso',
      message: 'Pide acceso a tu encargado.',
    })
    const pane = one('[data-pane-state="denied"]')
    const disc = pane.firstElementChild
    expect(classes(disc)).toEqual(
      expect.arrayContaining(['size-14', 'rounded-full', 'bg-surface-gray-4']),
    )
    expect(disc.querySelector('.lucide-lock')).toBeTruthy()
    expect(pane.textContent).toContain('Pide acceso a tu encargado.')
  })
})

describe('StatusChip', () => {
  it('each hue is its status token pair, declared for both themes', async () => {
    const HUES = {
      info: 'blue',
      success: 'green',
      warning: 'orange',
      danger: 'red',
    }
    for (const [tone, hue] of Object.entries(HUES)) {
      await mount(StatusChip, { label: 'Estado', tone })
      const chip = one('[data-ui-status]')
      expect(chip.getAttribute('data-tone')).toBe(tone)
      expect(classes(chip)).toEqual(
        expect.arrayContaining([
          `bg-[var(--muelle-status-${hue}-bg)]`,
          `text-[var(--muelle-status-${hue}-ink)]`,
        ]),
      )
      for (const theme of [LIGHT, DARK]) {
        expect(theme.has(`--muelle-status-${hue}-bg`)).toBe(true)
        expect(theme.has(`--muelle-status-${hue}-ink`)).toBe(true)
      }
      app.unmount()
      root.remove()
    }
    await mount(StatusChip, { label: 'Borrador', tone: 'neutral' })
    expect(one('[data-ui-status]').className).not.toMatch(/muelle-status/)
  })
})
