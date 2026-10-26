// The build lists the strings it can translate (scripts/translation-keys.mjs) and
// the verifier fails the build when a __() key in the sources is not listed
// (scripts/verify-translation-keys.mjs). These pin both halves.
import { describe, expect, it } from 'vitest'
import { parseAst } from 'vite'
import { stringLiterals } from '../../scripts/translation-keys.mjs'
import {
  callEnd,
  missingKeys,
  translationCalls,
} from '../../scripts/verify-translation-keys.mjs'

const messages = (source) => translationCalls(source).keys.map((k) => k.message)

describe('stringLiterals', () => {
  it('collects quoted and expression-free template strings, compiled templates included', () => {
    const code =
      'const a = "Hoy"; const b = \'Pendientes\'; const c = `Avisos`; const d = `${x} días`;' +
      ' function render(){ return _toDisplayString(_ctx.__("Guardar")) }'
    const literals = stringLiterals(parseAst(code))
    for (const key of ['Hoy', 'Pendientes', 'Avisos', ' días', 'Guardar']) {
      expect(literals.has(key)).toBe(true)
    }
    expect(literals.has('')).toBe(false)
  })

  it('reads every part of a template literal and nested strings', () => {
    const literals = stringLiterals(
      parseAst('f(`Total ${n} de ${g("Ventas")} hoy`, { label: "Cobrar" })'),
    )
    for (const key of ['Total ', ' de ', ' hoy', 'Ventas', 'Cobrar']) {
      expect(literals.has(key)).toBe(true)
    }
  })

  it('throws on code it cannot parse, so the plugin can report the module', () => {
    expect(() => stringLiterals(parseAst('const a = "unterminated'))).toThrow()
  })
})

describe('translationCalls', () => {
  it('reads every quoting style and the context argument', () => {
    const { keys } = translationCalls(
      `__('Save'); __("Open"); __(\`Close\`); __('Open', null, 'Compras'); globalThis.__('Member'); my__('Not a call')`,
    )
    expect(keys).toEqual([
      { message: 'Save', context: null },
      { message: 'Open', context: null },
      { message: 'Close', context: null },
      { message: 'Open', context: 'Compras' },
      { message: 'Member', context: null },
    ])
  })

  it('skips runtime messages and the empty string', () => {
    expect(messages("__(row.status); __(`${n} items`); __('')")).toEqual([])
  })

  it('ignores calls written in comments', () => {
    const source = [
      "// __('Line comment')",
      "/* __('Block comment') */",
      "<!-- __('Template comment') -->",
      'const accept = "image/*"; __(\'After glob\')',
      "const url = 'https://x'; __('After url')",
    ].join('\n')
    expect(messages(source)).toEqual(['After glob', 'After url'])
  })

  it('finds the end of a call past brackets and strings in its arguments', () => {
    const source = "__('Open', { a: [1, ')'], b: `}${f('(')}` }, 'Ctx') + x"
    expect(callEnd(source, 2)).toBe(source.length - 4)
    expect(translationCalls(source).keys).toEqual([
      { message: 'Open', context: 'Ctx' },
    ])
    expect(callEnd("__('never closed'", 2)).toBe(-1)
  })

  it('reads a call split over lines, as templates write them', () => {
    const { keys } = translationCalls(
      "{{\n  __(\n    'Pagar',\n    null,\n    'Cobranza',\n  )\n}}",
    )
    expect(keys).toEqual([{ message: 'Pagar', context: 'Cobranza' }])
  })

  it('falls back to the first token when the call is not plain JavaScript', () => {
    expect(messages("__('Typed' as string)")).toEqual(['Typed'])
  })
})

describe('missingKeys', () => {
  const sources = {
    'src/pages/Hoy.vue':
      "<template>{{ __('Hoy') }} {{ __('Abrir', null, 'Avisos') }}</template>",
    'src/utils/x.js': "__('Sin pendientes')",
    'node_modules/frappe-ui/x.js': "__('Library')",
    'src/style.css': "__('Not source')",
  }
  const read = (module) => sources[module] ?? null

  it('passes when every key and context is listed', () => {
    const listing = {
      modules: Object.keys(sources),
      literals: ['Hoy', 'Abrir', 'Avisos', 'Sin pendientes'],
    }
    expect(missingKeys(listing, read)).toEqual({
      missing: [],
      calls: 3,
      files: 2,
    })
  })

  it('fails when the build drops a key or a context', () => {
    const listing = {
      modules: Object.keys(sources),
      literals: ['Hoy', 'Abrir'],
    }
    expect(missingKeys(listing, read).missing).toEqual([
      { module: 'src/pages/Hoy.vue', key: 'Abrir:Avisos' },
      { module: 'src/utils/x.js', key: 'Sin pendientes' },
    ])
  })
})
