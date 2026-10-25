// Desktop bulk edit tells the person what Frappe's bulk update did: some
// documents refused (count and the first reason) or the batch went to the
// background. Bodies are the shapes Frappe 16.35 `bulk_update.py` returns.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bulkUpdate, bulkUpdateNotice } from '@/utils/bulkEdit'

const caught = (message) =>
  JSON.stringify({
    message,
    title: 'Message',
    indicator: 'red',
    raise_exception: 1,
  })

function answer(body, status = 200) {
  const fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => vi.unstubAllGlobals())

async function edit(names) {
  const outcome = await bulkUpdate('CRM Lead', names, { status: 'Junk' })
  return bulkUpdateNotice(outcome, names.length)
}

describe('bulk edit outcome', () => {
  it('names how many documents refused and the first reason', async () => {
    const fetch = answer({
      message: ['CRM-LEAD-2', 'CRM-LEAD-3'],
      _server_messages: JSON.stringify([
        caught('Value missing for Lead: <b>First Name</b>'),
        caught('Another reason'),
      ]),
    })
    expect(await edit(['CRM-LEAD-1', 'CRM-LEAD-2', 'CRM-LEAD-3'])).toEqual({
      type: 'warning',
      message:
        '2 of 3 records were not updated: Value missing for Lead: First Name',
    })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(
      '/api/method/frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs',
    )
    expect(JSON.parse(init.body)).toEqual({
      doctype: 'CRM Lead',
      docnames: ['CRM-LEAD-1', 'CRM-LEAD-2', 'CRM-LEAD-3'],
      action: 'update',
      data: { status: 'Junk' },
    })
  })

  it('is an error when every document refused, and gives the count alone when Frappe said no reason', async () => {
    answer({ message: ['CRM-LEAD-1'] })
    expect(await edit(['CRM-LEAD-1'])).toEqual({
      type: 'error',
      message: '1 of 1 records were not updated.',
    })
  })

  it('names a missing mandatory field, which Frappe prints without raising', async () => {
    answer({
      message: ['CRM-LEAD-1'],
      _server_messages: JSON.stringify([
        JSON.stringify({ message: 'Saved', alert: 1, indicator: 'green' }),
        JSON.stringify({
          message: 'Error: Value missing for Lead: First Name',
          title: 'Message',
        }),
      ]),
    })
    expect(await edit(['CRM-LEAD-1', 'CRM-LEAD-2'])).toEqual({
      type: 'warning',
      message:
        '1 of 2 records were not updated: Error: Value missing for Lead: First Name',
    })
  })

  it('says the edit went to the background when Frappe enqueued it', async () => {
    answer({
      _server_messages: JSON.stringify([
        JSON.stringify({
          message: 'Bulk operation is enqueued in background.',
          alert: 1,
        }),
      ]),
    })
    const names = Array.from({ length: 25 }, (_, i) => `CRM-LEAD-${i}`)
    expect(await edit(names)).toEqual({
      type: 'info',
      message:
        'Updating 25 records in the background. Reload the list in a moment to see the changes.',
    })
  })

  it('stays quiet when every document saved', async () => {
    answer({ message: [] })
    expect(await edit(['CRM-LEAD-1', 'CRM-LEAD-2'])).toBeNull()
  })

  it('rejects with the server reason when Frappe refuses the batch', async () => {
    answer(
      {
        exc_type: 'ValidationError',
        _server_messages: JSON.stringify([
          caught('Bulk operations only support up to 500 documents.'),
        ]),
      },
      417,
    )
    await expect(edit(['CRM-LEAD-1'])).rejects.toMatchObject({
      messages: ['Bulk operations only support up to 500 documents.'],
    })
  })
})
