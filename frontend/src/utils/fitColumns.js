// A table's chosen columns, fitted to the list's own width (Tratos, lane
// ventas-parejo): what does not fit steps aside in `dropOrder`, so the table
// never scrolls sideways. Before the list is measured (`room` 0) all show.

/**
 * @param {string[]} chosen  the columns the worker picked, in table order
 * @param {object} o
 * @param {Record<string, string|number>} o.widths  each column's width («150px» or 150)
 * @param {string[]} o.dropOrder  what steps aside first
 * @param {number} o.room  the list's width in px (0 = not measured yet)
 * @param {number} [o.fixed]  what the row always holds (checkbox, name, menu, gutters)
 * @param {number} [o.gap]  the gap between cells
 * @returns {Set<string>} the columns that show
 */
export function fitColumns(
  chosen,
  { widths, dropOrder, room, fixed = 0, gap = 0 },
) {
  const keep = new Set(chosen)
  if (!room) return keep
  const need = () =>
    fixed + [...keep].reduce((w, key) => w + parseInt(widths[key], 10) + gap, 0)
  for (const key of [...dropOrder, ...chosen]) {
    if (need() <= room) break
    keep.delete(key)
  }
  return keep
}
