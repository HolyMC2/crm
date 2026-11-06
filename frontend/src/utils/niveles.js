// Niveles de surtido: the pure parts of CompraNiveles.vue — which levels a
// filter shows, the tone bar of a level, the mix presets and the mix check.
// The rows come from doco.workspaces.sourcing.levels (books/stock_levels).

/** Rows for a filter: 'faltan' (short of their level), a group, or all. */
export function visibleLevels(rows = [], filter = 'todos') {
  if (filter === 'faltan') return rows.filter((r) => r.need > 0)
  if (filter && filter !== 'todos')
    return rows.filter((r) => r.item_group === filter)
  return rows
}

/** The bar of a level: per tone, its pieces (on hand and coming) as a share of
 *  the target, then the pieces of no tone (`untoned`); without a mix, one
 *  segment for every piece. Shares add up to at most 100. */
export function toneSegments(row) {
  const target = Number(row?.target) || 0
  if (target <= 0) return []
  const pct = (n) => (Math.max(Number(n) || 0, 0) / target) * 100
  const on = Number(row.on) || 0
  const parts = row.tones?.length
    ? row.tones.map((t) => ({ tone: t.tone, pieces: Number(t.have) || 0 }))
    : [{ tone: '', pieces: on }]
  const rest = on - parts.reduce((sum, p) => sum + p.pieces, 0)
  if (row.tones?.length && rest > 0)
    parts.push({ tone: '', pieces: rest, untoned: true })
  let left = 100
  return parts.map((p) => {
    const share = Math.min(pct(p.pieces), left)
    left -= share
    return { ...p, pct: Math.round(share * 10) / 10 }
  })
}

/** 'short' (it buys now), 'full' (at its target) or 'waiting' (under its target
 *  but not under its minimum: nothing is bought yet). */
export function levelState(row) {
  if (Number(row?.need) > 0) return 'short'
  const on = row?.on ?? (Number(row?.have) || 0) + (Number(row?.incoming) || 0)
  return Number(on) >= Number(row?.target) ? 'full' : 'waiting'
}

/** The models whose items carry reorder levels (`levels().erp`) for a filter: a
 *  group shows its own, any other filter all of them. */
export function visibleErp(rows = [], filter = 'todos') {
  if (filter && filter !== 'todos' && filter !== 'faltan')
    return rows.filter((r) => r.item_group === filter)
  return rows
}

/** A model's reorder levels as the row the level sheet opens: a new level with
 *  the items' «pedir con menos de» and «llenar hasta», and no mix yet. */
export function adoptedLevel(row) {
  return {
    level: '',
    item_group: row.item_group,
    level_model: row.model,
    target: row.target_qty,
    min: row.min_qty,
  }
}

/** «2 Oscuros, 3 Vivos» (the tones still to buy). */
export function buyText(row) {
  return (row?.tones || [])
    .filter((t) => t.buy > 0)
    .map((t) => `${t.buy} ${t.tone}`)
    .join(', ')
}

/** Mix presets over the first two tones (the dark and the bright suggestion). */
export function mixPresets(tones = []) {
  const [dark, bright] = tones
  if (!dark || !bright) return []
  return [
    { value: 'none', mix: [] },
    {
      value: 'half',
      mix: [
        { tone: dark, share: 50 },
        { tone: bright, share: 50 },
      ],
    },
    {
      value: 'dark',
      mix: [
        { tone: dark, share: 60 },
        { tone: bright, share: 40 },
      ],
    },
    {
      value: 'bright',
      mix: [
        { tone: dark, share: 40 },
        { tone: bright, share: 60 },
      ],
    },
  ]
}

/** The preset a mix is, or 'custom'. */
export function presetOf(mix = [], tones = []) {
  const shares = (m) =>
    m
      .filter((r) => Number(r.share) > 0)
      .map((r) => `${r.tone}:${Number(r.share)}`)
      .join('|')
  const found = mixPresets(tones).find((p) => shares(p.mix) === shares(mix))
  return found ? found.value : 'custom'
}

/** null when the mix can be saved (empty, or its shares add up to 100), else its total. */
export function mixProblem(mix = []) {
  const used = mix.filter((r) => Number(r.share) > 0)
  if (!used.length) return null
  const total = used.reduce((sum, r) => sum + Number(r.share), 0)
  return Math.abs(total - 100) < 0.01 ? null : total
}

/** The level a sheet saves: whole numbers, an empty «pedir con menos de» means
 *  «al bajar del nivel», tones without a share dropped. */
export function levelPayload(form) {
  const floor = String(form.min_qty ?? '').trim()
  return {
    item_group: form.item_group,
    model: String(form.model || '').trim(),
    target_qty: Math.round(Number(form.target_qty) || 0),
    min_qty: floor === '' ? 0 : Math.round(Number(floor) || 0),
    mix: JSON.stringify(
      (form.mix || [])
        .filter((r) => Number(r.share) > 0)
        .map((r) => ({ tone: r.tone, share: Number(r.share) })),
    ),
    ...(form.name ? { name: form.name } : {}),
  }
}
