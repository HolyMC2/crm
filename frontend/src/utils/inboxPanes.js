// Desktop inbox panes: queue | conversation | data (Datos del trato, or the
// capture form of an unknown number). The data pane sits beside the thread only
// while the thread keeps a reading width there; without that room it folds to a
// strip, and opening it folds the queue instead, so the thread never shrinks to
// a column of a few words (Marco 2026-11-12: 238 px at 1280, 400 px at 1440).
export const QUEUE_W = 286
export const PANEL_W = 320
export const READING_W = 560
export const ROOM_W = QUEUE_W + PANEL_W + READING_W

/**
 * @param {object} p
 * @param {boolean} p.room the panes' row is at least ROOM_W wide
 * @param {boolean} p.queueFolded the worker folded the queue
 * @param {boolean|null} p.panelChoice the worker's open (true) or fold (false)
 *   of the data pane at this width; null follows the room
 * @returns {{ queue: boolean, panel: boolean, fold: boolean }} which panes show,
 *   and whether the data pane's fold strip shows
 */
export function inboxPanes({ room, queueFolded, panelChoice }) {
  if (room) return { queue: !queueFolded, panel: true, fold: false }
  const panel = panelChoice === true
  return { queue: !queueFolded && !panel, panel, fold: true }
}
