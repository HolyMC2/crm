// Staleness bucketing for the thread AI summary's "actualizado hace X" label
// (ThreadSummary.vue, spec 5.2). Pure + dependency-free — dayjs/tz formatting
// lives in utils/index.js, but this only needs an elapsed-time bucket, so it
// unit-tests without a clock or i18n catalog.
//
// `generatedAt` is epoch ms (UTC) exactly as the backend thread_summary endpoint
// returns it; `now` is epoch ms (defaults to Date.now()). Comparing two UTC
// epochs is timezone-proof — no site-tz vs device-tz drift.

export function stalenessBucket(generatedAt, now = Date.now()) {
  if (!generatedAt) return null
  const secs = Math.max(0, Math.floor((now - generatedAt) / 1000))
  if (secs < 45) return { unit: 'moment', value: 0 }
  const mins = Math.floor(secs / 60) || 1
  if (mins < 60) return { unit: 'min', value: mins }
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return { unit: 'hour', value: hrs }
  const days = Math.floor(hrs / 24)
  return { unit: 'day', value: days }
}

// es-MX label (the app's source locale). The component formats via __() so the
// numeric variants stay translatable; this convenience form is for tests /
// non-i18n callers.
export function stalenessLabel(generatedAt, now = Date.now()) {
  const b = stalenessBucket(generatedAt, now)
  if (!b) return ''
  if (b.unit === 'moment') return 'hace un momento'
  if (b.unit === 'min') return `hace ${b.value} min`
  if (b.unit === 'hour') return `hace ${b.value} h`
  return `hace ${b.value} d`
}
