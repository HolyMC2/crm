// The sheet editor (src/hojas/univer.js: Univer and the React its UI uses) as its
// own bundle in crm/public/univer, built with esbuild before the Vite build. Split:
// Univer's ~80 hyphenation dictionaries stay chunks of their own, loaded only for
// text that needs them, so a sheet opens on ~7 MB (1.7 MB gzip) instead of 12.
// Univer is thousands of modules; inside Vite's chunking it runs the build out of
// memory, and only the Hoja page needs it. Hoja.vue reads manifest.json for the
// hashed file names and loads the bundle when a sheet opens.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const outdir = resolve(here, '../../crm/public/univer')
rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

const result = await build({
  entryPoints: [resolve(here, '../src/hojas/univer.js')],
  bundle: true,
  format: 'esm',
  splitting: true,
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  outdir,
  entryNames: 'hoja-editor-[hash]',
  chunkNames: 'c-[hash]',
  legalComments: 'external',
  metafile: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
})

const outputs = Object.entries(result.metafile.outputs)
const [entryFile, entry] = outputs.find(
  ([file, o]) => o.entryPoint && basename(file).startsWith('hoja-editor-'),
)
const manifest = {
  js: basename(entryFile),
  css: entry.cssBundle ? basename(entry.cssBundle) : '',
  // what the entry loads before it runs, for <link rel=modulepreload>
  preload: entry.imports
    .filter((i) => i.kind === 'import-statement')
    .map((i) => basename(i.path)),
}
writeFileSync(resolve(outdir, 'manifest.json'), JSON.stringify(manifest))
process.stdout.write(`sheet editor: ${manifest.js} ${manifest.css}\n`)
