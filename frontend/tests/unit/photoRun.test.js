import { describe, expect, it } from 'vitest'
import {
  createRun,
  current,
  finished,
  position,
  retake,
  retaking,
  shoot,
  skip,
  summary,
} from '@/components/captura/photoRun'

const items = [
  { key: 'A', title: 'Pantalla A23' },
  { key: 'B', title: 'Mica B' },
  { key: 'C', title: 'Funda C' },
]

describe('photoRun', () => {
  it('walks the products: the shutter files one and moves to the next', () => {
    const run = createRun(items)
    expect(current(run).key).toBe('A')
    expect(position(run)).toEqual({ at: 1, of: 3 })
    shoot(run)
    expect(current(run).key).toBe('B')
    shoot(run)
    shoot(run)
    expect(finished(run)).toBe(true)
    expect(summary(run)).toEqual({ shot: 3, skipped: 0, left: 0 })
  })

  it('«Saltar» moves on without a photo', () => {
    const run = createRun(items)
    skip(run)
    shoot(run)
    expect(current(run).key).toBe('C')
    expect(summary(run)).toEqual({ shot: 1, skipped: 1, left: 1 })
  })

  it('«Repetir» goes back to the last shot and the walk resumes where it was', () => {
    const run = createRun(items)
    shoot(run)
    expect(current(run).key).toBe('B')
    retake(run)
    expect(current(run).key).toBe('A')
    expect(retaking(run)).toBe(true)
    shoot(run)
    expect(current(run).key).toBe('B')
    expect(retaking(run)).toBe(false)
    expect(summary(run)).toEqual({ shot: 1, skipped: 0, left: 2 })
  })

  it('a retake after a skip returns past the skipped product', () => {
    const run = createRun(items)
    shoot(run)
    skip(run)
    retake(run) // back to A, the last one shot
    expect(current(run).key).toBe('A')
    shoot(run)
    expect(current(run).key).toBe('C')
    expect(summary(run)).toEqual({ shot: 1, skipped: 1, left: 1 })
  })

  it('there is nothing to retake before the first shot', () => {
    const run = createRun(items)
    retake(run)
    expect(current(run).key).toBe('A')
    expect(createRun([]).items).toEqual([])
    expect(finished(createRun([]))).toBe(true)
  })
})
