// Adapters from the dashboard API's chart config (crm/api/dashboard.py) to the
// props of frappe-ui/charts.
//
// The API still answers in the shape frappe-ui's v1 charts took as one
// `config` prop (`xAxis.key`, `series[].name/type/axis`, `categoryColumn`),
// so stored dashboards and the Python side need no change. frappe-ui 1.0
// replaced those charts with a props-based family: the x column, the y
// columns, per-series style in `seriesConfig`, and separate `BarChart` /
// `LineChart` components instead of a `series[].type` per chart.
import { BarChart, LineChart } from 'frappe-ui/charts'

// A chart whose every series is a line is a LineChart; anything else (bars,
// or bars with a line on the second axis) is a BarChart whose line series
// keep `type: 'line'` in their seriesConfig.
export function axisChartComponent(config) {
  const series = config?.series || []
  return series.length && series.every((s) => s.type === 'line')
    ? LineChart
    : BarChart
}

export function axisChartProps(config) {
  const series = config?.series || []
  const y = series.filter((s) => s.axis !== 'y2').map((s) => s.name)
  const y2 = series.filter((s) => s.axis === 'y2').map((s) => s.name)
  const seriesConfig = Object.fromEntries(
    series.map(({ name, echartOptions, ...style }) => {
      // The axis is a column list (`y`/`y2`) in the new family, not a style.
      delete style.axis
      // v1 read the legend/tooltip label from echartOptions.name; the new
      // family has a `label` and keys hidden series by `name`, so the echarts
      // override must not rename the series.
      const { name: label, ...overrides } = echartOptions || {}
      return [
        name,
        {
          ...style,
          label: style.label ?? label,
          echartOptions: Object.keys(overrides).length ? overrides : undefined,
        },
      ]
    }),
  )
  const { key, ...xAxis } = config?.xAxis || {}
  const props = {
    data: config?.data || [],
    x: key,
    y,
    seriesConfig,
    xAxis,
    yAxis: valueAxis(config?.yAxis),
    title: config?.title,
    subtitle: config?.subtitle,
    palette: config?.colors,
    stacked: config?.stacked,
    echartOptions: config?.echartOptions,
  }
  if (y2.length) {
    props.y2 = y2
    props.y2Axis = valueAxis(config?.y2Axis)
  }
  // `swapXY` drew a horizontal bar chart; only BarChart has the prop.
  if (config?.swapXY && axisChartComponent(config) === BarChart) {
    props.horizontal = true
  }
  return props
}

function valueAxis(axis) {
  if (!axis) return undefined
  const { yMin, yMax, ...rest } = axis
  return { ...rest, min: rest.min ?? yMin, max: rest.max ?? yMax }
}

export function donutChartProps(config) {
  return {
    data: config?.data || [],
    category: config?.categoryColumn,
    value: config?.valueColumn,
    title: config?.title,
    subtitle: config?.subtitle,
    palette: config?.colors,
    maxSlices: config?.maxSlices,
  }
}

const NUMBER_CARD_KEYS = [
  'title',
  'value',
  'prefix',
  'suffix',
  'target',
  'delta',
  'deltaPrefix',
  'deltaSuffix',
  'deltaCaption',
  'negativeIsBetter',
]

export function numberCardProps(config) {
  const props = {}
  for (const key of NUMBER_CARD_KEYS) {
    if (config?.[key] !== undefined) props[key] = config[key]
  }
  // NumberCard renders an empty state for null; the API sends 0 for a real
  // permitted zero and marks the rest `unavailable`, which DashboardItem
  // handles before reaching the card.
  if (props.value === undefined) props.value = null
  if (props.title === undefined) props.title = ''
  return props
}
