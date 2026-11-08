// Where a supplier list stands (doco books.catalogs.progress) as the bar, its
// line and its note: the chat card and Compras › Surtido say the same thing
// while a list is indexed and its products are read.

/** The stages that move on their own; the bar polls while it is in one. */
export const BUSY = ['index', 'read']

const count = (n) => Math.max(0, Number(n) || 0)

/**
 * A list's progress: the server's (doco books.catalogs.progress), or what its
 * status alone says when the server predates it.
 */
export function progressOf(c) {
  if (c?.progress?.stage) return c.progress
  if (!c?.status) return null
  const base = {
    pages: c.page_count,
    indexed: c.index_progress,
    lines: c.lines,
    pct: 0,
  }
  if (c.status === 'Esperando archivo') return { ...base, stage: 'upload' }
  if (c.status === 'Recibido' || c.status === 'Indexando') {
    const pages = count(c.page_count)
    const pct = pages ? Math.round((100 * count(c.index_progress)) / pages) : 0
    return { ...base, stage: 'index', pct: Math.min(100, pct) }
  }
  if (c.status === 'Error') return { ...base, stage: 'failed', error: c.error }
  if (c.reading) return { ...base, stage: 'read' }
  return { ...base, stage: 'done', pct: 100 }
}

/**
 * `p`: {stage, pages, indexed, to_read, read, lines, pct, error, units}.
 * Returns {stage, busy, tone, pct (null: no bar), line, note}.
 */
export function progressView(p) {
  if (!p?.stage) return null
  const pages = count(p.pages)
  const toRead = count(p.to_read)
  const lines = count(p.lines)
  const pct = Math.min(100, count(p.pct))
  const base = { stage: p.stage, busy: BUSY.includes(p.stage), pct: null }
  if (p.stage === 'upload')
    return {
      ...base,
      tone: 'warning',
      line: __('Waiting for the file', null, 'Surtido'),
      note: '',
    }
  if (p.stage === 'index')
    return {
      ...base,
      tone: 'neutral',
      pct,
      line: pages
        ? __(
            'Indexing: {0} of {1} pages',
            [Math.min(count(p.indexed), pages), pages],
            'Surtido',
          )
        : __('Indexing the list…', null, 'Surtido'),
      note: __(
        'Indexing is free. Its products are read right after.',
        null,
        'Surtido',
      ),
    }
  if (p.stage === 'read')
    return {
      ...base,
      tone: 'neutral',
      pct: toRead ? pct : 0,
      line: toRead
        ? __(
            'Reading products: {0} of {1} pages, {2} products so far',
            [Math.min(count(p.read), toRead), toRead, lines],
            'Surtido',
          )
        : __('Starting to read the products…', null, 'Surtido'),
      note: __(
        'You can keep working. Muelle tells you in the chat when it is done.',
        null,
        'Surtido',
      ),
    }
  if (p.stage === 'confirm')
    return {
      ...base,
      tone: 'warning',
      line: __(
        'Reading its products uses {0} units of your plan; it waits for your OK',
        [count(p.units)],
        'Surtido',
      ),
      note: '',
    }
  if (p.stage === 'failed')
    return {
      ...base,
      tone: 'danger',
      line: p.error || __('The list stopped without a reason', null, 'Surtido'),
      note: '',
    }
  return {
    ...base,
    tone: 'success',
    line: lines
      ? __('Ready: {0} products', [lines], 'Surtido')
      : __('Read, no products with a price', null, 'Surtido'),
    note: '',
  }
}
