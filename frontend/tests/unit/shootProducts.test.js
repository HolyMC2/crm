// «Tomar fotos»: each photo of the walk goes up behind the shutter as the
// product's principal; «Repetir» replaces the photo it took; the answer counts
// the products saved once every photo has its answer.
import { describe, expect, it, vi } from 'vitest'
import { shootProducts } from '@/composables/useProductPhotos'

const products = [
  { key: 'A', title: 'Pantalla A23' },
  { key: 'B', title: 'Mica B' },
]
const file = (name) => new File([name], `${name}.jpg`, { type: 'image/jpeg' })

/** A camera that shoots as `script` says: [key, retake?] per shutter press. */
function camera(script, walk) {
  return async ({ photo, run }) => {
    expect(photo).toBe(true)
    expect(run.items).toEqual(products)
    for (const [key, retake] of script)
      run.onShot(
        run.items.find((item) => item.key === key),
        file(key),
        { retake: Boolean(retake) },
      )
    return walk
  }
}

describe('shootProducts', () => {
  it('sends each photo as the principal and says how many were saved', async () => {
    const send = vi.fn(async (item) => ({
      image: `/files/${item}.jpg`,
      row: { file_url: `/files/${item}.jpg` },
    }))
    const onSaved = vi.fn()
    const result = await shootProducts(products, {
      open: camera([['A'], ['B']], { shot: 2, skipped: 0, left: 0 }),
      send,
      onSaved,
    })
    expect(send).toHaveBeenCalledWith('A', expect.any(File), {
      principal: true,
    })
    expect(onSaved).toHaveBeenCalledWith(products[1], {
      image: '/files/B.jpg',
      row: { file_url: '/files/B.jpg' },
    })
    expect(result).toEqual({
      shot: 2,
      skipped: 0,
      left: 0,
      saved: 2,
      failed: 0,
    })
  })

  it('a retake replaces the photo the walk took of that product', async () => {
    const send = vi.fn(async () => ({ row: { file_url: '/files/A1.jpg' } }))
    const replace = vi.fn(async () => ({ row: { file_url: '/files/A2.jpg' } }))
    const result = await shootProducts(products, {
      open: camera([['A'], ['A', true]], { shot: 1, skipped: 1, left: 0 }),
      send,
      replace,
      prepare: async (picked) => picked,
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('A', '/files/A1.jpg', expect.any(File))
    expect(result.saved).toBe(1)
  })

  it('a refused photo is said and not counted; a retake that lands is', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('sin permiso'))
      .mockResolvedValue({ row: { file_url: '/files/A.jpg' } })
    const onFailed = vi.fn()
    const result = await shootProducts(products, {
      open: camera([['A'], ['A', true]], { shot: 1, skipped: 0, left: 1 }),
      send,
      onFailed,
    })
    expect(onFailed).toHaveBeenCalledWith(products[0], expect.any(Error))
    // the first upload failed, so the retake is a fresh one, not a replace
    expect(send).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ saved: 1, failed: 0 })
  })

  it('a walk closed before the first shot sends nothing', async () => {
    const send = vi.fn()
    const result = await shootProducts(products, {
      open: async () => null,
      send,
    })
    expect(send).not.toHaveBeenCalled()
    expect(result).toEqual({
      shot: 0,
      skipped: 0,
      left: 2,
      saved: 0,
      failed: 0,
    })
  })
})
