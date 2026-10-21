// Rules for the quote item picker (WorkspaceItemPicker). Quantities are kept
// as { [item_code]: qty } straight from the inputs, so a value may be a
// number, a numeric string or '' (an emptied input).

// A draft quotation keeps at most 30 lines (deal_quotes._MAX_LINES), and the
// lines it already has count against that.
export const MAX_ITEMS = 30
export const MAX_QTY = 999

// Finite and within 0..MAX_QTY. Empty means "skip this item", not an error.
export function isValidQty(value) {
  if (value === '' || value == null) return true
  const qty = Number(value)
  return Number.isFinite(qty) && qty >= 0 && qty <= MAX_QTY
}

// The add payload: [{ item_code, qty }] for every quantity above zero.
export function selectedLines(quantities) {
  return Object.entries(quantities || {})
    .filter(([, qty]) => Number(qty) > 0)
    .map(([item_code, qty]) => ({ item_code, qty: Number(qty) }))
}

// Only the selected entries, so a zero or negative quantity left on a row
// that a new search hides cannot block Save unseen.
export function keepSelected(quantities) {
  return Object.fromEntries(
    selectedLines(quantities).map(({ item_code, qty }) => [item_code, qty]),
  )
}

// Lines the draft has once the picks are saved. A pick of an item the draft
// already has only raises that line's qty, so it adds no line.
export function quoteLineCount(quantities, quoteCodes = []) {
  const onQuote = new Set(quoteCodes)
  const added = selectedLines(quantities).filter(
    ({ item_code }) => !onQuote.has(item_code),
  )
  return quoteCodes.length + added.length
}

// One more new line still fits under the cap.
export function canAddMore(quantities, quoteCodes = []) {
  return quoteLineCount(quantities, quoteCodes) < MAX_ITEMS
}

// Save stays blocked on a bad quantity or on more lines than the draft allows.
// The picker already stops the extra line; this is the safety net.
export function isSelectionInvalid(quantities, quoteCodes = []) {
  return (
    Object.values(quantities || {}).some((qty) => !isValidQty(qty)) ||
    quoteLineCount(quantities, quoteCodes) > MAX_ITEMS
  )
}

// One tap on [−] or [+]: empty or negative counts as 0, the result stays
// within 0..MAX_QTY and is rounded so 2.3 − 1 gives 1.3, not 1.2999….
export function stepQty(value, delta) {
  const next = Math.max(0, Number(value) || 0) + delta
  return Math.min(MAX_QTY, Math.max(0, Math.round(next * 1e9) / 1e9))
}

// catalog.search sends stock as a whole number; 0 or less reads «Sin
// existencias». A missing value is not a claim either way.
export function isOutOfStock(stock) {
  return stock != null && Number(stock) <= 0
}
