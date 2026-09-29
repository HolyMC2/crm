import { describe, expect, it, vi } from 'vitest'
import {
  EXPORT_METHOD,
  buildExportParams,
  downloadListExport,
  exportListUrl,
  filenameFromDisposition,
  legacyExportUrl,
  shouldFallbackToLegacyExport,
} from '@/utils/listExport'

const columns = [
  { key: 'name' },
  { key: 'status' },
  { key: '_v_next_step' },
  { key: 'deal_value' },
]

function base(overrides = {}) {
  return buildExportParams({
    doctype: 'CRM Deal',
    columns,
    defaultFilters: { converted: 0 },
    filters: { status: 'Open', next_activity_at: ['<', '@today'] },
    orderBy: 'modified desc',
    pageLength: 20,
    totalCount: 340,
    ...overrides,
  })
}

function params(url) {
  return new URL(url, 'https://x.test').searchParams
}

describe('export params', () => {
  it('carries the list columns, filters and order', () => {
    const p = base()
    expect(p).toEqual({
      doctype: 'CRM Deal',
      fields: ['name', 'status', '_v_next_step', 'deal_value'],
      filters: {
        converted: 0,
        status: 'Open',
        next_activity_at: ['<', '@today'],
      },
      order_by: 'modified desc',
      page_length: 20,
      file_format: 'Excel',
    })
  })

  it('exports every record when asked, ignoring the selection', () => {
    const p = base({ exportAll: true, selectedItems: ['D-1'] })
    expect(p.page_length).toBe(340)
    expect(p.selected_items).toBeUndefined()
  })

  it('exports only the selection otherwise', () => {
    const p = base({ selectedItems: ['D-1', 'D-2'], fileFormat: 'CSV' })
    expect(p.selected_items).toEqual(['D-1', 'D-2'])
    expect(p.file_format).toBe('CSV')
  })

  it('passes search and view only when set', () => {
    expect(base().or_filters).toBeUndefined()
    const p = base({
      orFilters: { deal_name: ['LIKE', '%ana%'] },
      view: 'VIEW-1',
    })
    expect(p.or_filters).toEqual({ deal_name: ['LIKE', '%ana%'] })
    expect(p.view).toBe('VIEW-1')
  })
})

describe('export urls', () => {
  it('calls export_list with JSON-encoded arguments', () => {
    const url = exportListUrl(base({ selectedItems: ['D-1'] }))
    expect(url.startsWith(`/api/method/${EXPORT_METHOD}?`)).toBe(true)
    const q = params(url)
    expect(JSON.parse(q.get('fields'))).toContain('_v_next_step')
    expect(JSON.parse(q.get('filters')).next_activity_at).toEqual([
      '<',
      '@today',
    ])
    expect(q.get('file_format')).toBe('Excel')
    expect(JSON.parse(q.get('selected_items'))).toEqual(['D-1'])
  })

  it('falls back to export_query without virtual columns', () => {
    const q = params(legacyExportUrl(base({ selectedItems: ['D-1'] })))
    expect(JSON.parse(q.get('fields'))).toEqual([
      'name',
      'status',
      'deal_value',
    ])
    expect(q.get('file_format_type')).toBe('Excel')
    expect(q.get('doctype')).toBe('CRM Deal')
    expect(q.get('view')).toBe('Report')
    expect(q.get('page_length')).toBe('20')
    expect(JSON.parse(q.get('selected_items'))).toEqual(['D-1'])
  })

  it('omits the selection from the legacy url when there is none', () => {
    expect(params(legacyExportUrl(base())).has('selected_items')).toBe(false)
  })
})

describe('fallback decision', () => {
  it('falls back when the method does not exist', () => {
    expect(shouldFallbackToLegacyExport(404, '')).toBe(true)
    expect(
      shouldFallbackToLegacyExport(
        417,
        '{"exception":"Failed to get method for command crm.api.list_export.export_list"}',
      ),
    ).toBe(true)
    expect(
      shouldFallbackToLegacyExport(
        500,
        "No module named 'crm.api.list_export'",
      ),
    ).toBe(true)
  })

  it('reports a real refusal instead of falling back', () => {
    expect(
      shouldFallbackToLegacyExport(403, '{"exc_type":"PermissionError"}'),
    ).toBe(false)
  })

  it('reads the file name from the response', () => {
    expect(
      filenameFromDisposition('attachment; filename="CRM Deal.xlsx"', 'x'),
    ).toBe('CRM Deal.xlsx')
    expect(
      filenameFromDisposition(
        "attachment; filename*=UTF-8''Tratos%20hoy.csv",
        'x',
      ),
    ).toBe('Tratos hoy.csv')
    expect(filenameFromDisposition(null, 'fallback.xlsx')).toBe('fallback.xlsx')
  })
})

describe('download', () => {
  function response(status, body, headers = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      blob: async () => ({ size: 3 }),
      headers: { get: (k) => headers[k] ?? null },
    }
  }

  it('saves the export_list file when the site has it', async () => {
    const navigate = vi.fn()
    const saveBlob = vi.fn()
    const fetchImpl = vi.fn(async () =>
      response(200, '', {
        'Content-Disposition': 'attachment; filename="Deals.xlsx"',
      }),
    )
    const how = await downloadListExport(base(), {
      fetchImpl,
      navigate,
      saveBlob,
    })
    expect(how).toBe('export_list')
    expect(fetchImpl.mock.calls[0][0]).toContain(EXPORT_METHOD)
    expect(saveBlob).toHaveBeenCalledWith({ size: 3 }, 'Deals.xlsx')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('falls back to the legacy url on a 404', async () => {
    const navigate = vi.fn()
    const how = await downloadListExport(base(), {
      fetchImpl: async () => response(404, 'Not Found'),
      navigate,
      saveBlob: vi.fn(),
    })
    expect(how).toBe('legacy')
    expect(navigate.mock.calls[0][0]).toContain(
      'frappe.desk.reportview.export_query',
    )
  })

  it('throws on a permission error', async () => {
    await expect(
      downloadListExport(base(), {
        fetchImpl: async () => response(403, '{"exc_type":"PermissionError"}'),
        navigate: vi.fn(),
        saveBlob: vi.fn(),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
