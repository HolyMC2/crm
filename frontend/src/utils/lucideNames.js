// Feather-era icon names that lucide renamed. Static sites were rewritten to
// the canonical names (scripts/codemods/icons-to-lucide.mjs); this map keeps
// dynamic names that still arrive from data or the server rendering in the
// sprite, which carries canonical ids only. Derived from lucide-static by
// matching each alias file to the icon with the same drawing.
export const LUCIDE_ALIASES = {
  'alert-circle': 'circle-alert',
  'alert-octagon': 'octagon-alert',
  'alert-triangle': 'triangle-alert',
  'align-left': 'text-align-start',
  'bar-chart-2': 'chart-no-axes-column',
  'check-circle': 'circle-check-big',
  'check-square': 'square-check-big',
  columns: 'columns-2',
  'download-cloud': 'cloud-download',
  edit: 'square-pen',
  'edit-2': 'pen',
  'edit-3': 'pen-line',
  filter: 'funnel',
  grid: 'grid-3x3',
  'minus-circle': 'circle-minus',
  'more-horizontal': 'ellipsis',
  'more-vertical': 'ellipsis-vertical',
  'pause-circle': 'circle-pause',
  'play-circle': 'circle-play',
  sidebar: 'panel-left',
  sliders: 'sliders-vertical',
  tool: 'wrench',
  unlock: 'lock-open',
  'upload-cloud': 'cloud-upload',
}

/** The sprite id for an icon name: `lucide-` stripped, aliases resolved. */
export function toLucideName(name) {
  const bare = String(name).replace(/^lucide-/, '')
  return LUCIDE_ALIASES[bare] || bare
}
