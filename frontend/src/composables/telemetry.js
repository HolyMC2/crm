// Frontend error telemetry (spec 3.6). We only ever see the errors users bother
// to screenshot; this captures window.onerror + unhandledrejection and posts a
// scrubbed, sampled, self-limiting record to the site DB (the monitoring stack
// is down, so the landing zone is a CRM Client Error row viewable in Desk).
//
// Hard contract — this code MUST NEVER throw. Telemetry that crashes the app is
// worse than no telemetry, so every path is wrapped. It also stores NO customer
// or form data: only the error message, stack, route, and build id.
//
// Backend: doco_marketing.api.client_error.report (session-only, rate-limited,
// upsert-by-hash, retention-capped).

const ENDPOINT = '/api/method/doco_marketing.api.client_error.report'
const MAX_MESSAGE = 500
const MAX_STACK = 4000
const REPEAT_SAMPLE_RATE = 0.1 // repeats within a session sent at 10%

// __BUILD_ID__ is a vite `define` (see vite.config.js) — a bare literal in a
// real build, undefined under vitest. `typeof` guards the ReferenceError.
function releaseId() {
  try {
    return typeof __BUILD_ID__ !== 'undefined' ? String(__BUILD_ID__) : ''
  } catch (e) {
    return ''
  }
}

// djb2 — tiny, stable, dependency-free string hash. Returned as an unsigned
// base-36 string so the same message+frame always groups to the same row.
export function djb2(str) {
  let hash = 5381
  const s = String(str == null ? '' : str)
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

// The route the error fired on, WITHOUT the query string or fragment — those
// can carry deal ids / search terms we don't want in an observability row.
export function scrubUrl(url) {
  const s = String(url || '')
  const cut = Math.min(
    ...[s.indexOf('?'), s.indexOf('#')].filter((i) => i >= 0).concat([s.length]),
  )
  return s.slice(0, cut)
}

export function capStack(stack, max = MAX_STACK) {
  const s = String(stack || '')
  return s.length > max ? s.slice(0, max) : s
}

// Benign runtime noise that fires as a global error but isn't a real crash:
// the ResizeObserver loop notification (floods the channel) and cross-origin
// "Script error." (opaque, no stack — nothing actionable).
const NOISE = /ResizeObserver|^Script error/
export function isNoise(message) {
  return NOISE.test(String(message || ''))
}

// First stack line that looks like a frame — the hash's second input, so two
// different call sites throwing the same message stay distinct.
export function topFrame(stack) {
  const lines = String(stack || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  for (const l of lines) {
    if (l.startsWith('at ') || /:\d+:\d+/.test(l)) return l
  }
  return lines[0] || ''
}

export function hashError(message, stack) {
  return djb2(`${String(message || '')}|${topFrame(stack)}`)
}

export function buildPayload(message, stack, url) {
  return {
    hash: hashError(message, stack),
    message: String(message || '').slice(0, MAX_MESSAGE),
    stack: capStack(stack),
    url: scrubUrl(url),
    release: releaseId(),
  }
}

// Per-session dedupe: first sighting of a hash is always sent; further sightings
// within the same tab session are sampled at REPEAT_SAMPLE_RATE. Bounds volume
// when one broken render loops the same throw thousands of times.
let _seen = new Set()
export function shouldSend(hash, rand = Math.random) {
  if (!_seen.has(hash)) {
    _seen.add(hash)
    return true
  }
  return rand() < REPEAT_SAMPLE_RATE
}

// test-only: reset the per-session sampling memory between scenarios.
export function _resetSession() {
  _seen = new Set()
}

export function encodeBody(payload) {
  return new URLSearchParams({ payload: JSON.stringify(payload) }).toString()
}

function send(payload) {
  try {
    const body = encodeBody(payload)
    // sendBeacon survives a page unload (an error during navigation is exactly
    // when we most want the report to land). It can't carry a CSRF header, so
    // a keepalive fetch — which can — is the fallback.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/x-www-form-urlencoded' })
      if (navigator.sendBeacon(ENDPOINT, blob)) return
    }
    if (typeof fetch === 'function') {
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
      try {
        const token = (typeof window !== 'undefined' && window.csrf_token) || ''
        if (token) headers['X-Frappe-CSRF-Token'] = token
      } catch (e) {
        /* header is best-effort */
      }
      fetch(ENDPOINT, {
        method: 'POST',
        headers,
        body,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => {})
    }
  } catch (e) {
    /* telemetry must never throw */
  }
}

// Build → sample-gate → send. Exported so tests can drive it directly.
export function reportError(message, stack, url) {
  try {
    if (isNoise(message)) return
    const payload = buildPayload(message, stack, url)
    if (!shouldSend(payload.hash)) return
    send(payload)
  } catch (e) {
    /* telemetry must never throw */
  }
}

function currentUrl() {
  try {
    return (typeof location !== 'undefined' && location.href) || ''
  } catch (e) {
    return ''
  }
}

// Exported for unit tests — the listeners initTelemetry() attaches point here.
export function _onError(ev) {
  try {
    const message = (ev && (ev.message || (ev.error && ev.error.message))) || ''
    const stack = (ev && ev.error && ev.error.stack) || ''
    reportError(message, stack, currentUrl())
  } catch (e) {
    /* telemetry must never throw */
  }
}

export function _onRejection(ev) {
  try {
    const reason = ev && ev.reason
    const message =
      (reason && reason.message) ||
      (typeof reason === 'string' ? reason : '') ||
      'unhandledrejection'
    const stack = (reason && reason.stack) || ''
    reportError(message, stack, currentUrl())
  } catch (e) {
    /* telemetry must never throw */
  }
}

let _inited = false
// Skip the actual listener wiring under vitest — the same guard composables/
// outbox.js uses so importing the module in a test doesn't attach stray global
// handlers that fire across test boundaries. The pure logic + exported handlers
// stay fully testable; only the window.addEventListener side effect is gated.
const _UNDER_VITEST = !!globalThis.process?.env?.VITEST

export function initTelemetry() {
  try {
    if (_inited || _UNDER_VITEST) return
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
    _inited = true
    window.addEventListener('error', _onError)
    window.addEventListener('unhandledrejection', _onRejection)
  } catch (e) {
    /* telemetry must never throw */
  }
}
