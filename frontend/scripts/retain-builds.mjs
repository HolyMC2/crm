// Deploy-safe chunks (CRM program D5). A tab opened before a rebuild keeps
// lazy-loading the chunks of the build it booted from (Ctrl+K, Alt+H,
// notifications, route pages). Emptying the output directory on every build
// deleted those chunks at once, and `bench build` serves this directory
// directly (it relinks sites/assets/crm to it), so old tabs got 404s for the
// whole rebuild window.
//
// Instead the build keeps a ledger of its builds (build-history.json) and
// keeps, besides the current build:
//   - the previous build, however old (open tabs run it right now);
//   - every build replaced less than `keepMs` ago (24 h by default).
// Older builds are pruned. Without a ledger (the first such build) the files
// on disk count as the previous build. A file no ledger build names is pruned
// once it is older than `keepMs`.
// Source maps are kept for the current build only.
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export const HISTORY_FILE = 'build-history.json'
export const BUILD_FILES = 'build-files.json'
export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Pure planning step. `history` is the ledger before this build, `current`
 * the file names of this build, `onDisk` [{ file, mtimeMs }] under assets/.
 * Returns the new ledger and the files to delete.
 */
export function planRetention({
  history = [],
  current,
  entry,
  onDisk,
  now,
  keepMs = DAY_MS,
}) {
  let builds = history
    .filter((build) => Array.isArray(build?.files))
    .map((build) => ({ ...build, replacedAt: build.replacedAt ?? now }))
  if (!builds.length) {
    // First build with a ledger: what is on disk is the build open tabs run.
    const files = onDisk
      .map(({ file }) => file)
      .filter((file) => !file.endsWith('.map') && !current.includes(file))
    if (files.length)
      builds = [{ entry: null, builtAt: null, replacedAt: now, files }]
  }
  // A rebuild of the same sources (same entry) is not a new build.
  const previous = builds.filter((build) => build.entry !== entry)
  previous.sort((a, b) => b.replacedAt - a.replacedAt)
  const kept = previous.filter(
    (build, i) => i === 0 || now - build.replacedAt < keepMs,
  )
  const dropped = previous.filter((build) => !kept.includes(build))

  const currentSet = new Set(current)
  const keep = new Set(current)
  for (const build of kept) for (const file of build.files) keep.add(file)
  const known = new Set(keep)
  for (const build of dropped) for (const file of build.files) known.add(file)

  const remove = []
  for (const { file, mtimeMs } of onDisk) {
    if (keep.has(file)) continue
    if (file.endsWith('.map')) {
      if (!currentSet.has(file)) remove.push(file)
      continue
    }
    // Files of a dropped build go now; unknown files once they are old.
    if (known.has(file) || now - mtimeMs >= keepMs) remove.push(file)
  }
  const ledger = [
    { entry, builtAt: now, replacedAt: null, files: [...current].sort() },
    ...kept,
  ]
  return { ledger, remove }
}

function listAssets(outDir) {
  const dir = join(outDir, 'assets')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => `assets/${name}`)
    .filter((file) => statSync(join(outDir, file)).isFile())
    .map((file) => ({ file, mtimeMs: statSync(join(outDir, file)).mtimeMs }))
}

function readHistory(outDir) {
  try {
    const data = JSON.parse(readFileSync(join(outDir, HISTORY_FILE), 'utf8'))
    return Array.isArray(data?.builds) ? data.builds : []
  } catch {
    return []
  }
}

/**
 * Vite plugin. Use with `build.emptyOutDir: false`. `files()` returns this
 * build's files, so the service worker precaches only them.
 */
export function retainPreviousBuilds({ keepMs = DAY_MS } = {}) {
  let outDir = ''
  let current = []
  let entry = null
  return {
    name: 'crm-retain-previous-builds',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = config.build.outDir
    },
    // The final bundle: Vite drops pure-CSS chunks late in generateBundle.
    writeBundle(_, bundle) {
      current = Object.keys(bundle).filter((file) => file.startsWith('assets/'))
      entry =
        Object.values(bundle).find(
          (chunk) => chunk.type === 'chunk' && chunk.isEntry,
        )?.fileName || null
      writeFileSync(
        join(outDir, BUILD_FILES),
        JSON.stringify({ entry, files: [...current].sort() }),
      )
      const { ledger, remove } = planRetention({
        history: readHistory(outDir),
        current,
        entry,
        onDisk: listAssets(outDir),
        now: Date.now(),
        keepMs,
      })
      for (const file of remove) {
        try {
          unlinkSync(join(outDir, file))
        } catch {
          /* already gone */
        }
      }
      writeFileSync(
        join(outDir, HISTORY_FILE),
        JSON.stringify({ builds: ledger }),
      )
      const builds = ledger.length - 1
      console.log(
        `[crm-retain] kept ${builds} previous build(s); pruned ${remove.length} file(s)`,
      )
    },
    files: () => current,
  }
}
