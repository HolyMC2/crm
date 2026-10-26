// The strings a build can pass to `__()`, so the server ships only those
// translations (crm/shell_dictionary.py) instead of every installed app's
// dictionary. `translation-keys.json` lists every string literal of every module
// in this build: compiled Vue templates, frappe-ui and vendored packages
// included. The server keeps the dictionary keys among them and adds what only
// arrives at runtime: DocType strings, record names, its own Python literals.
import { relative } from 'node:path'
import { tokenizer, tokTypes } from 'acorn'

export const KEYS_FILE = 'translation-keys.json'

export function jsStringLiterals(code, into = new Set()) {
  for (const token of tokenizer(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowHashBang: true,
  })) {
    if (token.type === tokTypes.string || token.type === tokTypes.template) {
      if (token.value) into.add(token.value)
    }
  }
  return into
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
    generateBundle() {
      const literals = new Set()
      const modules = new Set()
      const skipped = []
      for (const id of this.getModuleIds()) {
        const info = this.getModuleInfo(id)
        if (!info || info.isExternal || !info.code) continue
        // Listed even when it does not tokenize, so the verifier still checks its calls.
        if (!id.startsWith('\0')) modules.add(relative(root, id.split('?')[0]))
        try {
          jsStringLiterals(info.code, literals)
        } catch {
          skipped.push(id)
        }
      }
      if (skipped.length) {
        this.warn(
          `translation-keys: ${skipped.length} modules are not JavaScript: ${skipped.slice(0, 5).join(', ')}`,
        )
      }
      this.emitFile({
        type: 'asset',
        fileName: KEYS_FILE,
        source: JSON.stringify({
          version: 1,
          modules: [...modules].sort(),
          literals: [...literals].sort(),
        }),
      })
    },
  }
}
