// Items for frappe-ui's `Tabs` shorthand (`:tabs` + `#tab-panel`).
//
// `Tabs` selects a trigger and mounts its panel by the item's `value`; it never
// falls back to the position. An item without one matches no v-model, so
// nothing is selected and no panel renders. Our callers keep a numeric v-model
// (`tabIndex`) over the list they already filtered, so each item's value is its
// position in that list.
export function indexTabs(tabs) {
  return tabs.map((tab, index) => ({ ...tab, value: index }))
}
