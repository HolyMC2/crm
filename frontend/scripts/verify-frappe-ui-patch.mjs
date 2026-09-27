import { log } from 'node:console'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Cached dependencies and installs with disabled lifecycle scripts must not
// silently build the original import component or a partially applied patch.
const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const proof = JSON.parse(
  readFileSync(path.join(frontend, 'patches/frappe-ui-source.json'), 'utf8'),
)
const installed = path.join(frontend, 'node_modules', proof.package)
const pkg = JSON.parse(
  readFileSync(path.join(installed, 'package.json'), 'utf8'),
)
if (pkg.version !== proof.version) {
  throw new Error(
    'frappe-ui version changed; review the import lifecycle patch',
  )
}
for (const [name, expected] of Object.entries(proof.files)) {
  const actual = createHash('sha256')
    .update(readFileSync(path.join(installed, name)))
    .digest('hex')
  if (actual !== expected) {
    throw new Error(
      `frappe-ui patch mismatch: ${name}. Run the frozen install with lifecycle scripts enabled.`,
    )
  }
}
log(`Verified frappe-ui ${proof.version} import lifecycle patch`)
