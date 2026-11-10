import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// A text colour is measured against what it sits on, in light and in dark
// mode, from the installed frappe-ui token table:
//   - a class string naming one bg-surface-* fill and one text colour is
//     measured against that fill;
//   - a chromatic text colour (red, amber, blue …) in a class string with no
//     fill is measured against surface-base, the page and card background.
// frappe-ui 1.0 turned chromatic ink steps 1-4 into tints and dropped the
// white -1 step, so names written for the older scale read near 2:1. Under
// FLOOR in either mode fails, naming the nearest class that reads TARGET in
// both modes. Variant classes (hover:, focus:, …) are not measured; dark:
// text overrides are.
const FLOOR = 3
const TARGET = 4.5

// A pair kept below the floor on purpose: file (relative to src), the pair as
// the failure prints it, a reason, an expiry date and who approved it. An
// entry that is past its date or names no approver fails.
const EXCEPTIONS = []

const root = path.resolve(__dirname, '../../src')
const TOKENS = path.resolve(
  __dirname,
  '../../node_modules/frappe-ui/tailwind/tokens.js',
)
const NAME = '[a-z]+(?:-[a-z]+)*(?:-\\d+)?'
const FILL = new RegExp(`(?<![\\w:-])bg-surface-(${NAME})(?![\\w-])`, 'g')
const TEXT = new RegExp(`(?<![\\w:-])text-(white|ink-${NAME})(?![\\w-])`, 'g')
const DARK_TEXT = new RegExp(
  `(?<![\\w-])dark:text-(white|ink-${NAME})(?![\\w-])`,
)
const SEGMENT = /'[^']*'|"[^"]*"|`[^`]*`/g

function luminance(value) {
  const m = String(value).match(/oklch\(([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/)
  if (!m) return null
  const l = m[2] ? Number(m[1]) / 100 : Number(m[1])
  const hue = (Number(m[4]) * Math.PI) / 180
  const a = Number(m[3]) * Math.cos(hue)
  const b = Number(m[3]) * Math.sin(hue)
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const unit = (x) => Math.min(1, Math.max(0, x))
  const r = unit(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S)
  const g = unit(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S)
  const bl = unit(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S)
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}

const ratio = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(p, out)
    else if (
      /\.(vue|js|ts)$/.test(entry.name) &&
      !/\.(test|spec)\./.test(entry.name)
    )
      out.push(p)
  }
  return out
}

function palette(tokens) {
  const lum = {}
  for (const mode of ['light', 'dark']) {
    lum[mode] = { ink: { white: 1 }, surface: {} }
    for (const [name, value] of Object.entries(tokens[mode].ink))
      lum[mode].ink[`ink-${name}`] = luminance(value)
    for (const [name, value] of Object.entries(tokens[mode].surface))
      lum[mode].surface[name] = luminance(value)
  }
  const pair = (fill, light, dark = light) => {
    const values = [
      lum.light.surface[fill],
      lum.light.ink[light],
      lum.dark.surface[fill],
      lum.dark.ink[dark],
    ]
    if (values.some((v) => v == null)) return null
    return [ratio(values[0], values[1]), ratio(values[2], values[3])]
  }
  return { lum, pair }
}

const family = (text) => text.match(/^ink-([a-z]+)-\d+$/)?.[1] ?? null
const chromatic = (text) => ![null, 'gray'].includes(family(text))
const step = (name) => Number(name.match(/-(\d+)$/)?.[1])
const shown = ([light, dark]) => `${light.toFixed(1)} / ${dark.toFixed(1)}`
const nearest = (names, current) =>
  names
    .filter((n) => !Number.isNaN(step(n)))
    .sort((a, b) => Math.abs(step(a) - current) - Math.abs(step(b) - current))

// What to write instead: the nearest text class that reads TARGET on the fill
// in both modes (same family and closest step first, then white and
// ink-base), else the nearest that clears FLOOR; for white or ink-base text,
// also the nearest step of the same fill that carries it.
function remedies({ lum, pair }, fill, text) {
  const pick = (options, measure) => {
    for (const floor of [TARGET, FLOOR]) {
      const hit = options.find((o) => Math.min(...(measure(o) ?? [0])) >= floor)
      if (hit) return hit
    }
    return null
  }
  const out = []
  const fam = family(text)
  const inks = Object.keys(lum.light.ink)
  const candidates = [
    ...(fam
      ? nearest(
          inks.filter((n) => family(n) === fam),
          step(text),
        )
      : []),
    'white',
    'ink-base',
  ]
  const textFix = pick(candidates, (c) => pair(fill, c))
  if (textFix) out.push(`text-${textFix} (${shown(pair(fill, textFix))})`)
  const hue = fill.match(/^([a-z]+)-\d+$/)?.[1]
  if (hue && !fam) {
    const fills = Object.keys(lum.light.surface).filter((n) =>
      n.startsWith(`${hue}-`),
    )
    const fillFix = pick(nearest(fills, step(fill)), (f) => pair(f, text))
    if (fillFix)
      out.push(`bg-surface-${fillFix} (${shown(pair(fillFix, text))})`)
  }
  return out.length
    ? out.join(' or ')
    : `another fill: no text colour reads on bg-surface-${fill} in both modes`
}

function findings(tokens, files) {
  const pal = palette(tokens)
  const found = []
  for (const file of files) {
    const rel = path.relative(root, file)
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (const [i, line] of lines.entries()) {
      for (const [segment] of line.matchAll(SEGMENT)) {
        const fills = [...segment.matchAll(FILL)].map((m) => m[1])
        const texts = [...segment.matchAll(TEXT)].map((m) => m[1])
        if (texts.length !== 1 || fills.length > 1) continue
        const [text] = texts
        if (!fills.length && !chromatic(text)) continue
        const fill = fills[0] ?? 'base'
        const dark = segment.match(DARK_TEXT)?.[1] ?? text
        const r = pal.pair(fill, text, dark)
        if (!r || Math.min(...r) >= FLOOR) continue
        const on = fills.length ? `bg-surface-${fill}` : 'surface-base'
        const darkPart = dark === text ? '' : ` dark:text-${dark}`
        const label = `text-${text}${darkPart} on ${on}`
        found.push({
          file: rel,
          pair: label,
          message: `${rel}:${i + 1} ${label} reads ${shown(r)} (light / dark, floor ${FLOOR}:1); write ${remedies(pal, fill, text)}`,
        })
      }
    }
  }
  return found
}

const today = () => new Date().toISOString().slice(0, 10)
const valid = (e) => e.approvedBy && e.reason && e.expires >= today()

describe('text colours', () => {
  it('read at least 3:1 on their fill in light and dark mode', async () => {
    const { semanticColors } = await import(
      /* @vite-ignore */ pathToFileURL(TOKENS).href
    )
    const excused = (f) =>
      EXCEPTIONS.some((e) => valid(e) && e.file === f.file && e.pair === f.pair)
    const unread = findings(semanticColors, sourceFiles(root))
      .filter((f) => !excused(f))
      .map((f) => f.message)
    expect(unread).toEqual([])
  })

  it('keep their exceptions reasoned, approved and unexpired', () => {
    const stale = EXCEPTIONS.filter((e) => !valid(e)).map(
      (e) =>
        `${e.file} ${e.pair}: needs a reason, an approver and a future expiry`,
    )
    expect(stale).toEqual([])
  })
})
