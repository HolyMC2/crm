// The chart an answer carries (doco assistant/graficas.py `contract`: kind,
// title, labels, series, format) as props for frappe-ui/charts. The Desk
// bubble draws the same contract with frappe-charts (doco
// public/js/assistant_answers.js `normalizeChart`); the shell reads it here.
import { formatMoney, formatMoneyCompact } from '@/utils/display'

const KINDS = new Set(['line', 'bar', 'stacked', 'donut'])
const FORMATS = new Set(['money', 'int', 'pct', 'num'])

/** The answer's chart, checked like the Desk bubble checks it, else null. */
export function chartOf(answer) {
  const raw = answer?.chart
  if (!raw || typeof raw !== 'object') return null
  let kind = raw.kind || raw.type || 'bar'
  kind = { percentage: 'stacked', pie: 'donut' }[kind] || kind
  if (!KINDS.has(kind)) kind = 'bar'
  const labels = (raw.labels || []).slice(0, 200).map(String)
  let series = raw.series || raw.datasets
  if (!series && 'values' in raw)
    series = [{ name: raw.label || '', values: raw.values }]
  series = (series || []).slice(0, 8).map((s) => ({
    name: String(s?.name || ''),
    values: (s?.values || []).slice(0, 200).map(Number),
  }))
  const drawable =
    labels.length &&
    series.length &&
    series.every(
      (s) =>
        s.values.length === labels.length &&
        s.values.every((v) => Number.isFinite(v)),
    )
  if (!drawable) return null
  return {
    kind,
    title: String(raw.title || raw.label || ''),
    subtitle: raw.subtitle ? String(raw.subtitle) : '',
    labels,
    series,
    format: FORMATS.has(raw.format) ? raw.format : 'num',
    currency: answer.spec?.currency || 'MXN',
  }
}

/** A value as the answer's table prints it: «$6,620.00», «12», «8.5 %». */
export function formatValue(value, chart) {
  const n = Number(value)
  if (chart.format === 'money') return formatMoney(n, chart.currency)
  if (chart.format === 'int')
    return n.toLocaleString('es-MX', { maximumFractionDigits: 0 })
  if (chart.format === 'pct')
    return `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`
  return n.toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

/** An axis tick: money short («$12.5 mil»), the rest as printed. */
function formatTick(value, chart) {
  return chart.format === 'money'
    ? formatMoneyCompact(value, chart.currency)
    : formatValue(value, chart)
}

const DAY = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const MONTH = new Intl.DateTimeFormat('es-MX', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A label as the worker reads it: «5 oct», «oct 2026»; any other label as is.
 * The shell page says lang="en", so frappe-ui's own time axis would print «Oct». */
export function formatLabel(label) {
  const text = String(label)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text))
    return DAY.format(new Date(`${text}T00:00:00Z`))
  if (/^\d{4}-\d{2}$/.test(text))
    return MONTH.format(new Date(`${text}-01T00:00:00Z`))
  return text
}

/** A ring reads up to eight slices; the rest is one «Otros» slice (the
 * library would group them too, but under an English name). */
const SLICES = 8
function slices(chart) {
  const rows = chart.labels
    .map((label, row) => ({
      label: formatLabel(label),
      s0: chart.series[0].values[row],
    }))
    .sort((a, b) => b.s0 - a.s0)
  if (rows.length <= SLICES + 1) return rows
  const rest = rows.slice(SLICES).reduce((sum, row) => sum + row.s0, 0)
  return [...rows.slice(0, SLICES), { label: __('Others'), s0: rest }]
}

/** Which frappe-ui chart draws it and with what props. */
export function chartProps(chart) {
  const keys = chart.series.map((_, i) => `s${i}`)
  const data = chart.labels.map((label, row) => ({
    label,
    ...Object.fromEntries(chart.series.map((s, i) => [keys[i], s.values[row]])),
  }))
  const format = (value) => formatValue(value, chart)
  if (chart.kind === 'donut')
    return {
      component: 'donut',
      props: {
        data: slices(chart),
        category: 'label',
        value: 's0',
        centerLabel: chart.series[0].name || chart.title,
        // the total sits in the ring's middle: short, or it is cut
        format: (value) => formatTick(value, chart),
      },
    }
  const seriesConfig = Object.fromEntries(
    chart.series.map((s, i) => [
      keys[i],
      // the tooltip prints the full figure; the axis keeps its short ticks
      { label: s.name || chart.title || __('Value'), format },
    ]),
  )
  return {
    component: chart.kind === 'line' ? 'line' : 'bar',
    props: {
      data,
      x: 'label',
      y: keys,
      // a month of days on a phone: upright labels, as many as fit
      xAxis: {
        type: 'category',
        format: formatLabel,
        echartOptions: { axisLabel: { rotate: 0, hideOverlap: true } },
      },
      seriesConfig,
      stacked: chart.kind === 'stacked',
      yAxis: { format: (value) => formatTick(value, chart) },
    },
  }
}

/** The table under the chart: the answer's own, else one row per label. */
export function tableOf(answer, chart) {
  const table = answer?.table
  if (
    Array.isArray(table?.columns) &&
    Array.isArray(table.rows) &&
    table.rows.every(Array.isArray)
  )
    return { columns: table.columns.map(String), rows: table.rows }
  return {
    columns: [
      __('Period'),
      ...chart.series.map(
        (s, i) => s.name || chart.title || __('Series {0}', [i + 1]),
      ),
    ],
    rows: chart.labels.map((label, row) => [
      label,
      ...chart.series.map((s) => formatValue(s.values[row], chart)),
    ]),
  }
}
