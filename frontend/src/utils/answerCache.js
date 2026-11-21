// Answers kept in memory by their question, for a search that runs as the worker
// types: a repeated question (a word erased, a filter toggled back, the picker opened
// again) paints at once. In memory only, so a reload or another person starts empty.

/**
 * A cache of at most `max` answers, each kept `keepMs`. Past the cap the oldest
 * saved answer goes first. `now` is injectable for tests.
 */
export function answerCache({
  max = 40,
  keepMs = 10 * 60_000,
  now = () => Date.now(),
} = {}) {
  const entries = new Map()
  return {
    /** `{ data, age }` of the kept answer, or null when there is none this young. */
    get(key) {
      const hit = entries.get(key)
      if (!hit) return null
      const age = now() - hit.at
      if (age >= keepMs) {
        entries.delete(key)
        return null
      }
      return { data: hit.data, age }
    },
    set(key, data) {
      entries.delete(key)
      entries.set(key, { at: now(), data })
      while (entries.size > max) entries.delete(entries.keys().next().value)
    },
    clear() {
      entries.clear()
    },
  }
}
