import { describe, expect, it } from 'vitest'
import { DAY_MS, planRetention } from '../../scripts/retain-builds.mjs'

// Deploy-safe chunks (D5): a rebuild never deletes the chunks an open tab runs.
const now = 10 * DAY_MS
const disk = (files, mtimeMs = now) => files.map((file) => ({ file, mtimeMs }))

describe('planRetention', () => {
  it('keeps the previous build however old it is', () => {
    const history = [
      {
        entry: 'assets/index-A.js',
        builtAt: 0,
        replacedAt: null,
        files: ['assets/index-A.js', 'assets/Palette-A.js'],
      },
    ]
    const { ledger, remove } = planRetention({
      history,
      current: ['assets/index-B.js', 'assets/Palette-B.js'],
      entry: 'assets/index-B.js',
      onDisk: disk(
        [
          'assets/index-A.js',
          'assets/Palette-A.js',
          'assets/index-B.js',
          'assets/Palette-B.js',
        ],
        0,
      ),
      now,
    })
    expect(remove).toEqual([])
    expect(ledger.map((b) => b.entry)).toEqual([
      'assets/index-B.js',
      'assets/index-A.js',
    ])
    expect(ledger[1].replacedAt).toBe(now)
  })

  it('keeps builds replaced within 24 h and prunes older ones', () => {
    const history = [
      {
        entry: 'assets/index-C.js',
        replacedAt: null,
        files: ['assets/index-C.js'],
      },
      {
        entry: 'assets/index-B.js',
        replacedAt: now - DAY_MS / 2,
        files: ['assets/index-B.js', 'assets/shared.js'],
      },
      {
        entry: 'assets/index-A.js',
        replacedAt: now - 2 * DAY_MS,
        files: ['assets/index-A.js', 'assets/shared.js'],
      },
    ]
    const { ledger, remove } = planRetention({
      history,
      current: ['assets/index-D.js'],
      entry: 'assets/index-D.js',
      onDisk: disk([
        'assets/index-A.js',
        'assets/index-B.js',
        'assets/index-C.js',
        'assets/index-D.js',
        'assets/shared.js',
      ]),
      now,
    })
    expect(remove).toEqual(['assets/index-A.js'])
    expect(ledger.map((b) => b.entry)).toEqual([
      'assets/index-D.js',
      'assets/index-C.js',
      'assets/index-B.js',
    ])
  })

  it('a rebuild of the same sources does not push the previous build out', () => {
    const history = [
      {
        entry: 'assets/index-B.js',
        replacedAt: null,
        files: ['assets/index-B.js'],
      },
      {
        entry: 'assets/index-A.js',
        replacedAt: now - 5 * DAY_MS,
        files: ['assets/index-A.js'],
      },
    ]
    const { ledger, remove } = planRetention({
      history,
      current: ['assets/index-B.js'],
      entry: 'assets/index-B.js',
      onDisk: disk(['assets/index-A.js', 'assets/index-B.js']),
      now,
    })
    expect(remove).toEqual([])
    expect(ledger.map((b) => b.entry)).toEqual([
      'assets/index-B.js',
      'assets/index-A.js',
    ])
  })

  it('the first build with a ledger keeps what was on disk as the previous build', () => {
    const { ledger, remove } = planRetention({
      history: [],
      current: ['assets/index-B.js'],
      entry: 'assets/index-B.js',
      onDisk: disk(
        ['assets/index-A.js', 'assets/index-A.js.map', 'assets/index-B.js'],
        0,
      ),
      now,
    })
    expect(remove).toEqual(['assets/index-A.js.map'])
    expect(ledger[1]).toMatchObject({
      replacedAt: now,
      files: ['assets/index-A.js'],
    })
  })

  it('prunes files no build names once they are older than 24 h, and old source maps at once', () => {
    const { remove } = planRetention({
      history: [
        {
          entry: 'assets/index-A.js',
          replacedAt: null,
          files: ['assets/index-A.js'],
        },
      ],
      current: ['assets/index-B.js', 'assets/index-B.js.map'],
      entry: 'assets/index-B.js',
      onDisk: [
        { file: 'assets/old.js', mtimeMs: now - 2 * DAY_MS },
        { file: 'assets/recent.js', mtimeMs: now - 1000 },
        { file: 'assets/recent.js.map', mtimeMs: now - 1000 },
        { file: 'assets/index-B.js', mtimeMs: now },
        { file: 'assets/index-B.js.map', mtimeMs: now },
        { file: 'assets/index-A.js', mtimeMs: 0 },
      ],
      now,
    })
    expect(remove.sort()).toEqual(['assets/old.js', 'assets/recent.js.map'])
  })
})
