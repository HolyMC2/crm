// Vendored from muelle/workspace/packages/ui@0.1.0 (2914c0d19b1b). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
// The Muelle shell's shared screen kit: the crm shell, Taller and Clínica
// build their lists, records and sheets from it. Do and don't for each:
// crm/docs/design/MOBILE_REFERENCES.md «Componentes»; live demo at /crm/_ui.
// An app wires its translation, statuses and bell once with configureUi.
export { default as AppBar } from './AppBar.vue'
export { default as BottomSheet } from './BottomSheet.vue'
export { default as ChipDrill } from './ChipDrill.vue'
export { default as ChipGroup } from './ChipGroup.vue'
export { default as DateField } from './DateField.vue'
export { default as EmptyState } from './EmptyState.vue'
export { default as ExpandTransition } from './ExpandTransition.vue'
export { default as Fab } from './Fab.vue'
export { default as FilterChips } from './FilterChips.vue'
export { default as KpiGrid } from './KpiGrid.vue'
export { default as KpiTile } from './KpiTile.vue'
export { default as ListRow } from './ListRow.vue'
export { default as PageHeader } from './PageHeader.vue'
export { default as PaneState } from './PaneState.vue'
export { default as RecentPicks } from './RecentPicks.vue'
export { default as SearchPanel } from './SearchPanel.vue'
export { default as Segmented } from './Segmented.vue'
export { default as StatusChip } from './StatusChip.vue'
export { chipClass, dotBinding } from './chipClass'
export { primaryDock } from './primaryDock'
export { installSheetHistory } from './sheetHistory'
export {
  canReturnToReferrer,
  configureUi,
  initials,
  isMobile,
  statusLabel,
  statusTone,
  t,
} from './host'
