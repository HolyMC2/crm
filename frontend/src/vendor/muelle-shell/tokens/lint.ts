// Vendored from muelle/workspace/packages/tokens@0.1.0 (b144ac6b7530). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
// Token-only color rule (spec §4.1): no raw hex, no non-frappe gray palettes,
// no `text-white`/`bg-white`/`*-black`, no arbitrary `[#…]` values and no
// inline `style="background:#…"` in shell, kit and module code. CI runs
// `scripts/check-colors.mjs <dirs>`; ESLint gets `ESLINT_RESTRICTED_SYNTAX`.
// A line may opt out with `muelle-tokens-allow` plus a reason.

export interface ColorViolation {
  line: number
  column: number
  match: string
  rule: 'hex' | 'palette-class' | 'arbitrary-color' | 'color-function'
}

export const ALLOW_MARKER = 'muelle-tokens-allow'

// 6/8-digit hex always; 3/4-digit only with a letter, so «Orden #123» passes.
const HEX = /(?<![\w&#])#(?:[0-9a-f]{8}|[0-9a-f]{6}|(?=[0-9a-f]{0,3}[a-f])[0-9a-f]{3,4})(?![\w-])/gi
const UTILITY = '(?:text|bg|border|ring|ring-offset|fill|stroke|from|via|to|outline|divide|placeholder|decoration|shadow|accent|caret)'
const PALETTE = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*!?${UTILITY}-(?:(?:slate|zinc|neutral|stone)-\\d{2,3}|white|black)(?:\\/\\d+)?(?![\\w-])`, 'g')
const ARBITRARY = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*!?${UTILITY}-\\[(?:#|rgb|hsl|oklch)[^\\]]*\\]`, 'gi')
const COLOR_FN = /(?<![\w-])(?:rgba?|hsla?)\((?=\s*\d)/gi

const RULES: ReadonlyArray<[ColorViolation['rule'], RegExp]> = [
  ['arbitrary-color', ARBITRARY],
  ['hex', HEX],
  ['palette-class', PALETTE],
  ['color-function', COLOR_FN],
]

/** Every raw color in `source`, with 1-based line/column. */
export function findRawColors(source: string): ColorViolation[] {
  const out: ColorViolation[] = []
  source.split('\n').forEach((text, index) => {
    if (text.includes(ALLOW_MARKER)) return
    const taken: Array<[number, number]> = []
    for (const [rule, pattern] of RULES) {
      pattern.lastIndex = 0
      for (const match of text.matchAll(pattern)) {
        const start = match.index ?? 0
        const end = start + match[0].length
        if (taken.some(([a, b]) => start < b && end > a)) continue
        taken.push([start, end])
        out.push({ line: index + 1, column: start + 1, match: match[0], rule })
      }
    }
  })
  return out.sort((a, b) => a.line - b.line || a.column - b.column)
}

/** For `no-restricted-syntax` in .js/.ts (string literals and template parts). */
export const ESLINT_RESTRICTED_SYNTAX = Object.freeze([
  {
    selector: 'Literal[value=/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]',
    message: 'Use a token (var(--muelle-*) or a frappe-ui semantic class), not a raw hex color.',
  },
  {
    selector: 'TemplateElement[value.raw=/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]',
    message: 'Use a token (var(--muelle-*) or a frappe-ui semantic class), not a raw hex color.',
  },
  {
    selector: 'Literal[value=/\\b(?:text|bg|border)-(?:slate|zinc|neutral|stone)-\\d|\\b(?:text|bg)-(?:white|black)\\b/]',
    message: 'Use frappe-ui semantic classes (text-ink-*, bg-surface-*, border-outline-*).',
  },
])
