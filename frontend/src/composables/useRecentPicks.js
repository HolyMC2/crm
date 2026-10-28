// Records a list opened lately on this device, for the search panel's
// «Recientes» bubbles. Kept in localStorage per list key; nothing leaves the
// device. Order is frecency: opens weigh more the more recent they are, so a
// chat used every day stays ahead of one opened once this morning.
import { computed, ref } from 'vue'

const MAX = 24
const DAY = 86400000

function read(key) {
  try {
    const rows = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function write(key, rows) {
  try {
    localStorage.setItem(key, JSON.stringify(rows))
  } catch {
    // private mode: the list lives for this tab only
  }
}

/**
 * @param {string} key localStorage key, e.g. 'muelle:inbox-recent'
 * @param {{ show?: number }} [opts] how many picks to offer (two rows of four)
 */
export function useRecentPicks(key, { show = 8 } = {}) {
  const items = ref(read(key))
  const id = (r) => `${r.doctype || ''}\u0000${r.name}`

  /** @param {{name: string, doctype?: string, label: string}} entry */
  function touch({ name, doctype = '', label }) {
    if (!name || !label) return
    const known = items.value.find((r) => id(r) === id({ name, doctype }))
    items.value = [
      { name, doctype, label, n: (known?.n || 0) + 1, at: Date.now() },
      ...items.value.filter((r) => id(r) !== id({ name, doctype })),
    ].slice(0, MAX)
    write(key, items.value)
  }

  function clear() {
    items.value = []
    write(key, [])
  }

  const picks = computed(() => {
    const now = Date.now()
    const score = (r) => r.n / (1 + (now - r.at) / DAY)
    return [...items.value].sort((a, b) => score(b) - score(a)).slice(0, show)
  })

  return { touch, clear, picks }
}
