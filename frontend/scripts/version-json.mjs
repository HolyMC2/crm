// version.json names the file the build's main.js runs from. main.js hands
// its own import.meta.url to the silent update (utils/silentUpdate.js), and a
// tab moves to a new build once version.json names another file. The entry
// file is not always that file: with Rolldown's inlined common chunks the
// entry is a facade that only starts the chunk holding main.js.
import { normalizePath } from 'vite'

export const VERSION_FILE = 'version.json'

/** The output chunk of `bundle` (generateBundle's) that holds module `id`. */
export function chunkHolding(bundle, id) {
  return Object.values(bundle).find(
    (chunk) => chunk.type === 'chunk' && chunk.moduleIds.includes(id),
  )
}

/** Vite plugin. `main`: absolute path of the module that reports the build. */
export function versionJson(main) {
  const id = normalizePath(main)
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle(_, bundle) {
      const chunk = chunkHolding(bundle, id)
      if (!chunk) this.error(`${VERSION_FILE}: ${id} is in no output chunk`)
      this.emitFile({
        type: 'asset',
        fileName: VERSION_FILE,
        source: JSON.stringify({ entry: chunk.fileName }),
      })
    },
  }
}
