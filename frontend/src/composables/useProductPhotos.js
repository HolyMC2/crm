// A product's photos and videos as the worker handles them: what they do shows
// at once (a picked file is a tile before it has left the phone, the star and
// the bin answer on the tap) and the server follows in the background. When it
// refuses, the screen goes back to what is true and says why.
import { computed, onBeforeUnmount, ref } from 'vue'
import { mediaKind } from '@/components/ui/imageFiles'
import { openImage, prepareImage } from '@/components/ui/imageFiles'
import { bakeEdit, newEdit, turnEdit } from '@/components/ui/imageEdit'
import { postPicture } from '@/utils/catalogUpload'
import {
  CTX,
  photoOf,
  problemOf,
  productosApi,
  requestId,
} from '@/composables/useProductos'

const MEDIA = 'doco.workspaces.product_media'
// Pictures are small once prepared; three at a time keeps a slow line moving.
const TOGETHER = 3

function megabytes(bytes) {
  return Math.max(1, Math.floor(bytes / (1024 * 1024)))
}

/** A gallery row's small copy of `slot`, or '' while the server has none. */
function small(row, slot) {
  const copy = photoOf(row, slot)
  return copy === row.file_url ? '' : copy
}

/** Why the failed call failed, in one sentence for the worker. */
export function whyNot(error) {
  const found = problemOf(error)
  return found.detail || found.title
}

/**
 * Send one picture or video to a product: cut to size on the device, then one
 * request that files it (and makes it the principal when asked, or when the
 * product has none). Resolves the server's answer: { row, image, modified }.
 */
export async function sendProductPhoto(
  item,
  file,
  {
    principal = false,
    request = requestId(),
    onProgress,
    post = postPicture,
  } = {},
) {
  const ready = await prepareImage(file)
  const args = { request_id: request, item }
  if (principal) args.principal = 1
  return post(`${MEDIA}.add_photo`, args, ready, { onProgress })
}

/** Run `task` over `entries`, at most `limit` at a time, in order. */
async function together(entries, task, limit = TOGETHER) {
  const queue = [...entries]
  const lanes = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      while (queue.length) await task(queue.shift())
    },
  )
  await Promise.all(lanes)
}

export function useProductPhotos(
  item,
  { onChange = () => {}, say = () => {} } = {},
) {
  const data = ref(null)
  const tiles = ref([])
  const problem = ref('')
  const loading = ref(false)
  let serial = 0
  let alive = true
  const urls = new Set()

  const canManage = computed(() => Boolean(data.value?.can_manage))
  // A server that predates `can_edit` lets whoever keeps the catalogue edit.
  const canEdit = computed(() =>
    Boolean(data.value?.can_edit ?? data.value?.can_manage),
  )
  const limits = computed(() => data.value?.limits || {})

  function localUrl(blob) {
    const url = URL.createObjectURL(blob)
    urls.add(url)
    return url
  }
  function tileOf(row) {
    serial += 1
    return {
      key: `p${serial}`,
      file_url: row.file_url,
      thumb: small(row, 'card'),
      preview: small(row, 'detail'),
      name: row.file_name || '',
      kind: row.kind || mediaKind(row.file_url) || 'image',
      principal: Boolean(row.principal),
      state: 'saved',
      progress: 0,
      error: '',
      local: '',
    }
  }
  /** What a tile shows in the grid, and what the viewer opens. */
  function tileSrc(tile) {
    return tile.local || tile.thumb || tile.file_url
  }
  const media = computed(() =>
    tiles.value
      .filter((tile) => tile.state !== 'failed')
      .map((tile) => ({
        key: tile.key,
        url: tile.local || tile.file_url,
        thumb: tile.kind === 'video' ? '' : tileSrc(tile),
        preview: tile.local ? '' : tile.preview,
        kind: tile.kind,
        name: tile.name,
        tile,
      })),
  )
  const principal = computed(
    () => tiles.value.find((tile) => tile.principal) || null,
  )
  // What stands for the product right now: a picture on its way to being the
  // principal shows at once, before the server has said so.
  const lead = computed(
    () =>
      tiles.value.find((tile) => tile.leading && tile.state === 'sending') ||
      principal.value,
  )

  function fail(error) {
    problem.value = whyNot(error)
  }
  /** The principal as the server has it now: one tile carries it, first. */
  function markPrincipal(url) {
    for (const tile of tiles.value)
      tile.principal = Boolean(url) && tile.file_url === url
    const at = tiles.value.findIndex((tile) => tile.principal)
    if (at > 0) tiles.value.unshift(...tiles.value.splice(at, 1))
  }
  function settled(answer) {
    if (!answer || !alive) return
    markPrincipal(answer.image || '')
    onChange({ image: answer.image || '', modified: answer.modified || '' })
  }

  let shownFor = ''
  async function load() {
    const name = item()
    if (name !== shownFor) {
      // Another product: nothing of the last one stays on screen.
      shownFor = name
      tiles.value = []
      data.value = null
      problem.value = ''
    }
    loading.value = true
    try {
      const answer = await productosApi(`${MEDIA}.photos`, { item: name })
      if (!alive || name !== item()) return
      data.value = answer
      // What is still on its way (or failed) stays where the worker left it.
      const pending = tiles.value.filter((tile) => tile.state !== 'saved')
      const known = new Map(
        tiles.value
          .filter((tile) => tile.state === 'saved')
          .map((tile) => [tile.file_url, tile]),
      )
      const fresh = answer.rows.map((row) => {
        const kept = known.get(row.file_url)
        if (!kept) return tileOf(row)
        // Same picture: keep its key (the viewer's place) and its local copy.
        Object.assign(kept, {
          thumb: small(row, 'card') || kept.thumb,
          preview: small(row, 'detail') || kept.preview,
          principal: Boolean(row.principal),
        })
        return kept
      })
      const lead = fresh.findIndex((tile) => !tile.principal)
      fresh.splice(lead < 0 ? fresh.length : lead, 0, ...pending)
      tiles.value = fresh
    } catch (error) {
      fail(error)
    } finally {
      loading.value = false
    }
  }

  // ── adding ─────────────────────────────────────────────────────────────
  function refusal(file) {
    const kind = mediaKind(file.name, file.type)
    if (!kind) return __('Only photos and videos go here.', null, CTX)
    const cap = limits.value.video_bytes
    if (kind === 'video' && cap && file.size > cap)
      return __(
        'The video is over {0} MB. Trim it or record it at a lower quality.',
        [megabytes(cap)],
        CTX,
      )
    return ''
  }
  async function send(tile, asPrincipal) {
    tile.state = 'sending'
    tile.error = ''
    tile.progress = 0
    try {
      const answer = await sendProductPhoto(tile.item, tile.file, {
        principal: asPrincipal,
        request: tile.request,
        onProgress: (done) => (tile.progress = done),
      })
      if (!alive || tile.item !== item()) return
      const twin = tiles.value.find(
        (other) => other !== tile && other.file_url === answer.row.file_url,
      )
      if (twin) {
        // The same picture was already here: one tile, and say so.
        tiles.value = tiles.value.filter((other) => other !== tile)
        say(__('That photo was already on this product.', null, CTX))
      } else {
        Object.assign(tile, {
          file_url: answer.row.file_url,
          name: answer.row.file_name || tile.name,
          kind: answer.row.kind || tile.kind,
          state: 'saved',
          file: null,
        })
      }
      settled(answer)
    } catch (error) {
      if (!alive || tile.item !== item()) return
      tile.state = 'failed'
      tile.error = whyNot(error)
    }
  }
  /**
   * Add the picked, dropped or pasted files. Each shows at once; they go up a
   * few at a time. `principal`: the first one becomes the product's photo.
   */
  async function add(files, { principal: first = false } = {}) {
    problem.value = ''
    const fresh = []
    for (const file of files) {
      const why = refusal(file)
      if (why) {
        problem.value = why
        continue
      }
      serial += 1
      fresh.push({
        key: `p${serial}`,
        file_url: '',
        thumb: '',
        preview: '',
        name: file.name || '',
        kind: mediaKind(file.name, file.type),
        principal: false,
        state: 'sending',
        progress: 0,
        error: '',
        local: localUrl(file),
        file,
        item: item(),
        request: requestId(),
      })
    }
    if (!fresh.length) return
    const lead = tiles.value.findIndex((tile) => !tile.principal)
    tiles.value.splice(lead < 0 ? tiles.value.length : lead, 0, ...fresh)
    // The tiles the page holds (reactive), not the plain objects built above.
    const held = fresh.map((entry) =>
      tiles.value.find((tile) => tile.key === entry.key),
    )
    // The one that decides the principal goes alone; the rest go together.
    const [head, ...rest] = held
    const decides = first || !principal.value
    if (decides) {
      head.leading = head.kind === 'image'
      await send(head, first && head.kind === 'image')
      head.leading = false
    }
    await together(decides ? rest : held, (tile) => send(tile, false))
  }
  function retry(tile) {
    return send(tile, false)
  }

  // ── the principal: the star answers on the tap ────────────────────────────
  let chain = Promise.resolve()
  function makeMain(tile) {
    if (tile.principal || tile.state !== 'saved' || tile.kind !== 'image')
      return chain
    problem.value = ''
    const was = principal.value?.file_url || ''
    markPrincipal(tile.file_url)
    // One at a time, in the order tapped: the last tap is what stays.
    chain = chain.then(async () => {
      try {
        settled(
          await productosApi('set_photo', {
            request_id: requestId(),
            item: item(),
            file_url: tile.file_url,
          }),
        )
      } catch (error) {
        if (!alive) return
        markPrincipal(was)
        fail(error)
      }
    })
    return chain
  }

  // ── deleting: gone on the tap, back if the server refuses ───────────────
  async function remove(tile) {
    problem.value = ''
    const at = tiles.value.indexOf(tile)
    if (at < 0) return
    tiles.value.splice(at, 1)
    // A picture that never arrived has nothing to delete on the server.
    if (tile.state !== 'saved') return
    try {
      settled(
        await productosApi(`${MEDIA}.delete_photo`, {
          request_id: requestId(),
          item: item(),
          file_url: tile.file_url,
        }),
      )
    } catch (error) {
      if (!alive) return
      tiles.value.splice(Math.min(at, tiles.value.length), 0, tile)
      fail(error)
    }
  }

  // ── an edit: the new picture shows at once, the upload follows ───────────
  async function replace(tile, blob) {
    problem.value = ''
    const before = { local: tile.local, state: tile.state }
    tile.local = localUrl(blob)
    tile.state = 'sending'
    tile.progress = 0
    const extension = blob.type === 'image/png' ? 'png' : 'jpg'
    const stem = (tile.name || 'foto').replace(/\.[a-z0-9]{1,5}$/i, '')
    const file = new File([blob], `${stem}.${extension}`, { type: blob.type })
    try {
      const answer = await postPicture(
        `${MEDIA}.replace_photo`,
        { request_id: requestId(), item: item(), file_url: tile.file_url },
        file,
        { onProgress: (done) => (tile.progress = done) },
      )
      if (!alive) return
      Object.assign(tile, {
        file_url: answer.row.file_url,
        name: answer.row.file_name || tile.name,
        thumb: '',
        preview: '',
        state: 'saved',
      })
      settled(answer)
    } catch (error) {
      if (!alive) return
      Object.assign(tile, before)
      fail(error)
    }
  }
  /** «Girar»: a quarter turn to the right, drawn on the device, saved as an edit. */
  async function turn(tile, { read = openImage } = {}) {
    if (tile.state !== 'saved' || tile.kind !== 'image') return
    problem.value = ''
    tile.state = 'sending'
    let picture
    let blob
    try {
      picture = await read(tile.local || tile.file_url)
      blob = await bakeEdit(
        picture.source,
        picture.width,
        picture.height,
        turnEdit(newEdit(), 1),
        { type: picture.type === 'image/png' ? 'image/png' : 'image/jpeg' },
      )
    } catch {
      blob = null
    } finally {
      picture?.close?.()
      tile.state = 'saved'
    }
    if (blob) return replace(tile, blob)
    problem.value = __(
      'This photo could not be turned here. Try «Editar».',
      null,
      CTX,
    )
  }

  onBeforeUnmount(() => {
    alive = false
    for (const url of urls) URL.revokeObjectURL(url)
    urls.clear()
  })

  return {
    data,
    tiles,
    media,
    principal,
    lead,
    problem,
    loading,
    canManage,
    canEdit,
    limits,
    tileSrc,
    load,
    add,
    retry,
    makeMain,
    remove,
    replace,
    turn,
  }
}
