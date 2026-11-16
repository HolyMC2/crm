// Mutations that move cells (doco hojas/schema.py `structural`): rows, columns or
// tabs inserted, removed or moved. An edit addressed before they moved could land
// on another cell, so those never replay twice and a save that crosses them reloads.
// Shared by the page and the editor's own bundle (frontend/scripts/build-univer.mjs).
const MOVES =
  /\.mutation\.(insert|remove|move)-(row|rows|col|cols|column|columns|sheet)\b/

/** Whether any of these mutations moves cells. */
export function movesCells(mutations = []) {
  return mutations.some((m) => MOVES.test(m?.id || ''))
}
