// The picture a catalog item paints in the /cat picker. The server sends the small
// copies it made of the item's photo (`media.variants`, doco.docoutils.media): «card»
// about 320 px and «detail» about 640 px, webp, at URLs the browser keeps for a year.
// A grid of 24 phone photos then weighs a few hundred KB instead of tens of MB. The
// original (`image_url`) is the fallback, and it stays what a send attaches.

/**
 * `{ src, srcset }` for an item's <img>. `srcset` names both copies by width, so a
 * sharp phone screen takes «detail» and the rest «card»; it is '' with one size only.
 */
export function catalogPhoto(item) {
  const copies = item?.media?.variants || {}
  const card = copies.card
  const detail = copies.detail
  const src = card?.url || detail?.url || item?.image_url || ''
  const srcset =
    card?.url && detail?.url && card.width && detail.width
      ? `${card.url} ${card.width}w, ${detail.url} ${detail.width}w`
      : ''
  return { src, srcset }
}

/** The original photo alone, for an item whose small copy failed to load. */
export function originalPhoto(item) {
  return { src: item?.image_url || '', srcset: '' }
}
