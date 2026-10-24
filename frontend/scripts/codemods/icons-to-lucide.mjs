// FeatherIcon and feather-name icon strings to lucide (frappe-ui 1.0, B2).
//
//   node scripts/codemods/icons-to-lucide.mjs [--dry] [--root src]
//        [--tags Button,ButtonControl] [--keys-file sites.txt]
//
// What it rewrites, from frontend/:
//   <FeatherIcon name="x" …/>        -> <LucideX …/>   + import LucideX from '~icons/lucide/<canonical>'
//   <FeatherIcon :name="expr" …/>    -> <Icon :icon="expr" …/> (crm's sprite Icon; literal
//                                       names inside expr become canonical lucide names)
//   <Button icon-left="x">            -> <Button :icon-left="LucideX">   (tags from --tags)
//   <Button :icon="c ? 'a' : 'b'">    -> <Button :icon="c ? LucideA : LucideB">
//   icon: 'x' in script objects       -> icon: LucideX, only at the path:line sites listed in
//                                       --keys-file (one `path:L<line>` per line, relative to
//                                       --root), because crm's own data lists keep strings.
//   `FeatherIcon` import specifiers and `components: { FeatherIcon }` entries are dropped.
//
// Names come from lucide-static in node_modules: every alias file is mapped to the canonical
// icon with the same drawing, so `edit-2` becomes `pen` and `alert-circle` `circle-alert`.
// Existing `import X from '~icons/lucide/<name>'` bindings are reused; new ones are named
// Lucide<PascalName> and inserted after the last import of the (setup) script block.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { walk } from './inventory-frappe-ui.mjs'

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = args.indexOf(name)
  return i === -1 ? dflt : args[i + 1]
}
const DRY = args.includes('--dry')
const ROOT = flag('--root', 'src')
const TAGS = new Set(
  flag('--tags', 'Button,Dropdown,MultiActionButton')
    .split(',')
    .filter(Boolean),
)
const KEY_SITES = new Set(
  flag('--keys-file')
    ? fs
        .readFileSync(flag('--keys-file'), 'utf8')
        .split('\n')
        .map((l) => l.trim().split(/\s+/)[0])
        .filter(Boolean)
    : [],
)
const ICON_KEYS = ['icon', 'iconLeft', 'iconRight', 'icon-left', 'icon-right']
const SKIP_DIRS = ['src/vendor', 'src/framework-ui']

// ---- lucide names ------------------------------------------------------------------------
const LUCIDE_DIR = path.dirname(require.resolve('lucide-static/package.json'))
const canonical = new Set(
  Object.keys(
    JSON.parse(
      fs.readFileSync(path.join(LUCIDE_DIR, 'icon-nodes.json'), 'utf8'),
    ),
  ),
)
const svgBody = (name) =>
  fs
    .readFileSync(path.join(LUCIDE_DIR, 'icons', `${name}.svg`), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/class="[^"]*"/g, '')
    .replace(/\s+/g, '')
const byBody = new Map()
for (const c of canonical) byBody.set(svgBody(c), c)
/** feather/lucide alias -> canonical lucide name */
export const ALIASES = { tool: 'wrench' } // `tool` was redrawn as `wrench`; no shared body
for (const f of fs.readdirSync(path.join(LUCIDE_DIR, 'icons'))) {
  const name = f.replace(/\.svg$/, '')
  if (f.endsWith('.svg') && !canonical.has(name)) {
    const hit = byBody.get(svgBody(name))
    if (hit) ALIASES[name] = hit
  }
}
export const canonicalName = (name) =>
  ALIASES[name] || (canonical.has(name) ? name : null)
export const pascal = (name) =>
  'Lucide' + name.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase())

// ---- per-file state ----------------------------------------------------------------------
class FileEdit {
  constructor(file, text) {
    this.file = file
    this.text = text
    this.imports = new Map() // lucide name -> binding
    this.needIcon = false
    this.usedAliases = new Set()
    for (const m of text.matchAll(
      /import\s+(\w+)\s+from\s+['"]~icons\/lucide\/([\w-]+)['"]/g,
    ))
      this.imports.set(m[2], m[1])
    this.newImports = []
  }
  binding(featherName) {
    const canon = canonicalName(featherName)
    if (!canon) return null
    if (canon !== featherName) this.usedAliases.add(featherName)
    if (!this.imports.has(canon)) {
      let b = pascal(canon)
      if (
        new RegExp(`import\\s+${b}\\s+from|\\b(const|let|var)\\s+${b}\\b`).test(
          this.text,
        )
      )
        b += 'Icon'
      this.imports.set(canon, b)
      this.newImports.push(`import ${b} from '~icons/lucide/${canon}'`)
    }
    return this.imports.get(canon)
  }
}

/** Rewrite the literal icon names that sit in value position of an expression. */
function rewriteExpr(expr, toValue) {
  let out = ''
  let pos = 0
  for (const m of expr.matchAll(/(['"])([a-z][a-z0-9-]*)\1/g)) {
    const quote = m[1]
    const lead = expr.slice(0, m.index).trimEnd()
    const tail = expr.slice(m.index + m[0].length).trimStart()
    const inValue =
      lead === '' ||
      /\?$/.test(lead) ||
      /\|\|$|&&$/.test(lead) ||
      /\s:$/.test(lead) ||
      /\b(icon|iconLeft|iconRight)\s*:$/.test(lead)
    if (!inValue || /^[=!]/.test(tail)) continue
    const value = toValue(m[2], quote)
    if (value === null) continue
    out += expr.slice(pos, m.index) + value
    pos = m.index + m[0].length
  }
  return out + expr.slice(pos)
}

/** `<Tag …>` starting at `start`; returns { attrs, end, selfClosing } honouring quotes. */
function readTag(text, start) {
  let i = start
  let quote = null
  while (i < text.length) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '>') break
    i++
  }
  const selfClosing = text[i - 1] === '/'
  return {
    end: i + 1,
    body: text.slice(start, selfClosing ? i - 1 : i),
    selfClosing,
  }
}

function rewriteTemplate(edit, template) {
  let out = ''
  let i = 0
  const tagRe = /<(FeatherIcon|[A-Z][\w]*)\b/g
  let m
  while ((m = tagRe.exec(template))) {
    const tagName = m[1]
    if (tagName !== 'FeatherIcon' && !TAGS.has(tagName)) continue
    const { end, body, selfClosing } = readTag(template, m.index)
    let attrs = body.slice(m[0].length)
    let newTag = tagName
    if (tagName === 'FeatherIcon') {
      const staticName = attrs.match(/(\n[ \t]*|^|\s)name=(["'])([a-z0-9-]+)\2/)
      const boundName = attrs.match(/(^|\s):name=(["'])([\s\S]*?)\2/)
      if (staticName) {
        const b = edit.binding(staticName[3])
        if (!b) {
          console.warn(
            `${edit.file}: unknown icon name "${staticName[3]}", left as is`,
          )
          continue
        }
        newTag = b
        // an attribute on its own line goes with its line
        attrs = attrs.replace(
          staticName[0],
          staticName[1].startsWith('\n') ? '' : staticName[1],
        )
      } else if (boundName) {
        newTag = 'Icon'
        edit.needIcon = true
        const expr = rewriteExpr(boundName[3], (n, q) => {
          const c = canonicalName(n)
          if (c && c !== n) edit.usedAliases.add(n)
          return c ? `${q}${c}${q}` : null
        })
        attrs = attrs.replace(
          boundName[0],
          `${boundName[1]}:icon=${boundName[2]}${expr}${boundName[2]}`,
        )
      } else {
        console.warn(`${edit.file}: FeatherIcon without name, left as is`)
        continue
      }
    } else {
      // icon props on a frappe-ui component, and Dropdown's `:button="{ icon }"`
      attrs = attrs.replace(
        /(^|\s)(:?)(icon|iconLeft|iconRight|icon-left|icon-right|button)=(["'])([\s\S]*?)\4/g,
        (whole, lead, bound, prop, q, value) => {
          if (prop === 'button' && !bound) return whole
          if (!bound) {
            const b = edit.binding(value)
            return b ? `${lead}:${prop}=${q}${b}${q}` : whole
          }
          const expr = rewriteExpr(value, (n) => edit.binding(n))
          return `${lead}:${prop}=${q}${expr}${q}`
        },
      )
    }
    out +=
      template.slice(i, m.index) +
      `<${newTag}${attrs}${selfClosing ? '/>' : '>'}`
    i = end
    if (!selfClosing && tagName === 'FeatherIcon') {
      const close = template.indexOf('</FeatherIcon>', end)
      if (close !== -1) {
        out += template.slice(i, close) + `</${newTag}>`
        i = close + '</FeatherIcon>'.length
      }
    }
    tagRe.lastIndex = i
  }
  return out + template.slice(i)
}

function rewriteScriptKeys(edit, script, scriptStartLine) {
  const lines = script.split('\n')
  const rel = path.relative(ROOT, edit.file)
  for (let n = 0; n < lines.length; n++) {
    const site = `${rel}:L${scriptStartLine + n}`
    if (!KEY_SITES.has(site)) continue
    const before = lines[n]
    lines[n] = before.replace(
      /\b(icon|iconLeft|iconRight)(\s*:\s*)(["'])([a-z0-9-]+)\3/g,
      (whole, key, sep, q, name) => {
        const b = edit.binding(name)
        return b ? `${key}${sep}${b}` : whole
      },
    )
    if (lines[n] === before) {
      lines[n] = rewriteExpr(before, (n2) => edit.binding(n2))
      if (lines[n] === before) console.warn(`${site}: no icon key rewritten`)
    }
    KEY_SITES.delete(site)
  }
  return lines.join('\n')
}

function dropFeatherImport(script) {
  let s = script.replace(
    /import\s*\{([^}]*)\}\s*from\s*(['"])frappe-ui\2;?\n?/g,
    (whole, names, q) => {
      const kept = names
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x && x !== 'FeatherIcon')
      if (!names.includes('FeatherIcon')) return whole
      if (!kept.length) return ''
      const multi = names.includes('\n')
      return multi
        ? `import {\n${kept.map((k) => '  ' + k).join(',\n')},\n} from ${q}frappe-ui${q}\n`
        : `import { ${kept.join(', ')} } from ${q}frappe-ui${q}\n`
    },
  )
  s = s.replace(/\n\s*FeatherIcon,\n/g, '\n') // components: { …, FeatherIcon, … }
  s = s.replace(/components:\s*\{\s*FeatherIcon\s*\},?\n?/g, '')
  return s
}

function insertImports(edit, script, isSetup) {
  const lines = []
  if (edit.needIcon && !/\bimport\s+Icon\s+from/.test(edit.text))
    lines.push(`import Icon from '@/components/Icon.vue'`)
  lines.push(...edit.newImports)
  if (!lines.length) return script
  const importRe = /^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm
  let last = null
  for (const m of script.matchAll(importRe)) last = m
  if (last) {
    const at = last.index + last[0].length
    return script.slice(0, at) + '\n' + lines.join('\n') + script.slice(at)
  }
  return lines.join('\n') + '\n' + script
}

function processVue(edit) {
  // key sites are file line numbers; template object literals count too
  let text = rewriteScriptKeys(edit, edit.text, 1)
  const tpl = text.match(/<template>[\s\S]*<\/template>/)
  if (tpl) {
    const rewritten = rewriteTemplate(edit, tpl[0])
    text =
      text.slice(0, tpl.index) +
      rewritten +
      text.slice(tpl.index + tpl[0].length)
  }
  const scripts = [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  if (!scripts.length) {
    if (edit.needIcon || edit.newImports.length)
      text =
        `<script setup>\n${insertImports(edit, '', true)}</script>\n\n` + text
    return text
  }
  const target = scripts.findIndex((s) => /\bsetup\b/.test(s[1]))
  const idx = target === -1 ? 0 : target
  let out = ''
  let pos = 0
  scripts.forEach((s, k) => {
    let body = dropFeatherImport(s[2])
    if (k === idx) body = insertImports(edit, body, /\bsetup\b/.test(s[1]))
    out += text.slice(pos, s.index) + `<script${s[1]}>${body}</script>`
    pos = s.index + s[0].length
  })
  return out + text.slice(pos)
}

function processScript(edit) {
  let body = rewriteScriptKeys(edit, edit.text, 1)
  body = dropFeatherImport(body)
  return insertImports(edit, body, false)
}

const files = walk(ROOT).filter(
  (f) => /\.(vue|js|ts)$/.test(f) && !SKIP_DIRS.some((d) => f.startsWith(d)),
)
let changed = 0
const aliasesUsed = new Set()
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const edit = new FileEdit(file, text)
  const out = file.endsWith('.vue') ? processVue(edit) : processScript(edit)
  edit.usedAliases.forEach((a) => aliasesUsed.add(a))
  if (out !== text) {
    changed++
    if (DRY)
      console.log(
        `${file}: ${edit.newImports.length} new imports${edit.needIcon ? ', Icon' : ''}`,
      )
    else fs.writeFileSync(file, out)
  }
}
for (const site of KEY_SITES) console.warn(`key site not found: ${site}`)
console.log(`${DRY ? 'would change' : 'changed'} ${changed} files`)
console.log(
  'aliases used:',
  [...aliasesUsed]
    .sort()
    .map((a) => `${a}->${ALIASES[a]}`)
    .join(' '),
)
