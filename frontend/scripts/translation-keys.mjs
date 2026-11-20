// The strings a build can pass to `__()`, so the server ships only those
// translations (crm/shell_dictionary.py) instead of every installed app's
// dictionary. `translation-keys.json` lists every string literal of every module
// in this build: compiled Vue templates, frappe-ui and vendored packages
// included. The server keeps the dictionary keys among them and adds what only
// arrives at runtime: DocType strings, record names, its own Python literals.
//
// `first` is the part of `literals` the first screen of a cold load can render:
// the modules of the entry chunk, of the chunks of FIRST_ROUTE (the shell and
// the landing page every worker opens on, Hoy) and of every chunk they import
// statically. The server ships those keys as a small first dictionary the page
// mounts with; the whole one follows after the first route is up
// (utils/translationsReady.js).
import { relative } from 'node:path'

export const KEYS_FILE = 'translation-keys.json'
// Module paths (relative to the frontend root) of the chunks the first screen
// renders besides the entry. FIRST_ROUTE_NAMES (utils/translationsReady.js)
// names the routes whose page is among them.
export const FIRST_ROUTE = [
  'src/components/shell/MuelleShell.vue',
  // The desktop rail's bell, which the rail loads on its own.
  'src/components/avisos/AvisosBell.vue',
  'src/pages/Hoy.vue',
]

const POSITION = new Set(['type', 'start', 'end', 'loc', 'range'])

// Every non-empty string literal and template-literal part of an ESTree
// program: `this.parse` in a plugin hook, or `parseAst` from vite.
export function stringLiterals(ast, into = new Set()) {
  const stack = [ast]
  while (stack.length) {
    const node = stack.pop()
    if (node.type === 'Literal' && typeof node.value === 'string') {
      if (node.value) into.add(node.value)
    } else if (node.type === 'TemplateElement') {
      if (node.value.cooked) into.add(node.value.cooked)
    }
    for (const key in node) {
      if (POSITION.has(key)) continue
      const value = node[key]
      if (Array.isArray(value)) {
        for (const child of value)
          if (child && typeof child === 'object') stack.push(child)
      } else if (value && typeof value === 'object') stack.push(value)
    }
  }
  return into
}

/**
 * The output chunks the first screen needs: the entry, the chunks that hold
 * one of `roots` (FIRST_ROUTE), and every chunk they import statically.
 * `bundle` is generateBundle's. A dynamic entry that shares its chunk with
 * other modules has no facade module, so a chunk is matched by its modules.
 */
export function firstChunks(bundle, root, roots = FIRST_ROUTE) {
  const chunks = Object.values(bundle).filter((item) => item.type === 'chunk')
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const wanted = new Set(roots)
  const holds = (chunk) =>
    [
      chunk.facadeModuleId,
      ...(chunk.moduleIds || Object.keys(chunk.modules || {})),
    ].some((id) => id && wanted.has(relative(root, id.split('?')[0])))
  const stack = chunks.filter((chunk) => chunk.isEntry || holds(chunk))
  const found = new Set()
  while (stack.length) {
    const chunk = stack.pop()
    if (found.has(chunk)) continue
    found.add(chunk)
    for (const file of chunk.imports || []) {
      const next = byFile.get(file)
      if (next) stack.push(next)
    }
  }
  return [...found]
}

// Vite plugin: emits translation-keys.json next to the bundle. It reads each
// module's transformed code (before tree-shaking drops unused exports), so
// the list is a superset of what the chunks contain.
export function translationKeys() {
  let root = process.cwd()
  return {
    name: 'translation-keys',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    generateBundle(_, bundle) {
      const perModule = new Map()
      const modules = new Set()
      const skipped = []
      for (const id of this.getModuleIds()) {
        const info = this.getModuleInfo(id)
        if (!info || info.isExternal || !info.code) continue
        // Listed even when it does not tokenize, so the verifier still checks its calls.
        if (!id.startsWith('\0')) modules.add(relative(root, id.split('?')[0]))
        try {
          // The bundler's own parser: no dependency of ours to install.
          perModule.set(id, stringLiterals(this.parse(info.code)))
        } catch {
          skipped.push(id)
        }
      }
      if (skipped.length) {
        this.warn(
          `translation-keys: ${skipped.length} modules are not JavaScript: ${skipped.slice(0, 5).join(', ')}`,
        )
      }
      const literals = new Set()
      for (const set of perModule.values()) for (const s of set) literals.add(s)
      const first = new Set()
      for (const chunk of firstChunks(bundle, root))
        for (const id of chunk.moduleIds || Object.keys(chunk.modules || {}))
          for (const s of perModule.get(id) || []) first.add(s)
      this.emitFile({
        type: 'asset',
        fileName: KEYS_FILE,
        source: JSON.stringify({
          version: 1,
          modules: [...modules].sort(),
          literals: [...literals].sort(),
          first: [...first].sort(),
        }),
      })
    },
  }
}
