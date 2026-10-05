// The vendored @muelle/shell-contracts and @muelle/tokens copies must be
// byte-identical to what their package's scripts/vendor.mjs wrote: every file
// starts with a two-line header naming the package hash, and the hash of the
// bodies must still match it. (CI checks out only this repo; the package's own
// `vendor.mjs --check` runs in the muelle repo.)
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../src/vendor/muelle-shell')
let failures = 0
for (const name of ['contracts', 'tokens']) {
  const dir = join(root, name)
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()
  if (readdirSync(dir).includes('tokens.css')) files.push('tokens.css')
  const digest = createHash('sha256')
  let stamped = null
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8')
    const lines = text.split('\n')
    const hash = lines[0].match(/@[\d.]+ \(([0-9a-f]{12})\)\. DO NOT EDIT/)?.[1]
    if (!hash || (stamped && hash !== stamped)) {
      console.error(`vendor header missing or mixed: ${name}/${file}`)
      failures += 1
      continue
    }
    stamped = hash
    digest.update(file).update(lines.slice(2).join('\n'))
  }
  const actual = digest.digest('hex').slice(0, 12)
  if (stamped && actual !== stamped) {
    console.error(`vendored ${name} was edited (${actual} ≠ ${stamped}); re-vendor from the package`)
    failures += 1
  }
}
if (failures) process.exit(1)
console.log('vendored muelle-shell contracts and tokens: intact')
