import { callError } from '@/utils/contactos'

// Desk's bulk edit (Frappe 16.35 `frappe/desk/doctype/bulk_update/bulk_update.py`
// `submit_cancel_or_update_docs`): under 20 names it saves each document and
// returns the names that failed; a document's `frappe.throw` is caught there
// and its message rides `_server_messages` on a 200.
// From 20 to 500 it enqueues the work and returns nothing; over 500 it throws.
// `serverMessages.js` keeps caught throws out of the global toast, and
// frappe-ui's `call()` hands only `message` back, so this posts like
// `useContactos.postMethod` and reads both fields itself.
const METHOD =
  'frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs'

const plainText = (html) =>
  new DOMParser()
    .parseFromString(String(html), 'text/html')
    .body.textContent.replace(/\s+/g, ' ')
    .trim()

// A thrown error carries `raise_exception`; a missing mandatory field is a
// plain `msgprint` before `MandatoryError` (Frappe 16.35 `document.py`
// `_validate_mandatory`), so fall back to the first message that is not an alert.
function firstReason(rawMessages) {
  let entries
  try {
    entries = JSON.parse(rawMessages || '[]').map((raw) =>
      typeof raw === 'string' ? JSON.parse(raw) : raw,
    )
  } catch {
    return ''
  }
  const said = entries.filter((m) => m?.message && plainText(m.message))
  const reason =
    said.find((m) => m.raise_exception) || said.find((m) => !m.alert)
  return reason ? plainText(reason.message) : ''
}

/**
 * Update `data` on every named document.
 * Resolves to `{ state: 'saved' }`, `{ state: 'queued' }` or
 * `{ state: 'failed', failed: n, reason }`; rejects like `call()`.
 */
export async function bulkUpdate(doctype, docnames, data) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Frappe-Site-Name': window.location.hostname,
  }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const response = await fetch(`/api/method/${METHOD}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ doctype, docnames, action: 'update', data }),
  })
  let body
  try {
    body = await response.json()
  } catch {
    body = {}
  }
  if (!response.ok) throw callError(METHOD, response.status, body)
  if (!Array.isArray(body.message)) return { state: 'queued' }
  if (!body.message.length) return { state: 'saved' }
  return {
    state: 'failed',
    failed: body.message.length,
    reason: firstReason(body._server_messages),
  }
}

/** The toast for an outcome of `bulkUpdate` over `total` documents, or null. */
export function bulkUpdateNotice(outcome, total) {
  if (outcome.state === 'queued')
    return {
      type: 'info',
      message: __(
        'Updating {0} records in the background. Reload the list in a moment to see the changes.',
        [total],
      ),
    }
  if (outcome.state !== 'failed') return null
  return {
    type: outcome.failed >= total ? 'error' : 'warning',
    message: outcome.reason
      ? __('{0} of {1} records were not updated: {2}', [
          outcome.failed,
          total,
          outcome.reason,
        ])
      : __('{0} of {1} records were not updated.', [outcome.failed, total]),
  }
}
