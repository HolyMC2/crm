import { describe, expect, it } from 'vitest'
import { versionJson } from '../../scripts/version-json.mjs'

const MAIN = '/app/frontend/src/main.js'
const chunk = (fileName, moduleIds, extra = {}) => ({
  type: 'chunk',
  fileName,
  moduleIds,
  isEntry: false,
  ...extra,
})

function emitted(bundle) {
  const files = []
  const context = {
    emitFile: (file) => files.push(file),
    error: (message) => {
      throw new Error(message)
    },
  }
  versionJson(MAIN).generateBundle.call(context, {}, bundle)
  return JSON.parse(files.find((f) => f.fileName === 'version.json').source)
}

describe('version.json', () => {
  it('names the entry chunk when it holds main.js', () => {
    const bundle = {
      'assets/index-A.js': chunk('assets/index-A.js', [MAIN], {
        isEntry: true,
      }),
      'assets/Hoy-A.js': chunk('assets/Hoy-A.js', ['/app/src/pages/Hoy.vue']),
    }
    expect(emitted(bundle)).toEqual({ entry: 'assets/index-A.js' })
  })

  it('names the chunk main.js runs from when the entry is a facade', () => {
    const bundle = {
      'assets/index-B.js': chunk('assets/index-B.js', [], { isEntry: true }),
      'assets/frontend-B.js': chunk('assets/frontend-B.js', [
        '/app/frontend/node_modules/vue/index.js',
        MAIN,
      ]),
      'assets/index-B.css': { type: 'asset', fileName: 'assets/index-B.css' },
    }
    expect(emitted(bundle)).toEqual({ entry: 'assets/frontend-B.js' })
  })

  it('fails the build when no chunk holds main.js', () => {
    const bundle = {
      'assets/index-C.js': chunk('assets/index-C.js', [], { isEntry: true }),
    }
    expect(() => emitted(bundle)).toThrow(/main\.js is in no output chunk/)
  })
})
