# Vendored @muelle/calendar-core + @muelle/calendar-vue

crm/frontend is not a member of the muelle pnpm workspace, so the shell Agenda carries a
verbatim copy of the shared calendar packages (as `../muelle-forms` does for the form packages).

- Source: `HolyMC2/muelle` `workspace/packages/calendar-{core,vue}/src` at
  `6b6772b7336cd785a8a126a137ad31d61e11b23f`.
- Only change: `@muelle/calendar-core` imports in `vue/` point at `../core`.
- Do not edit behavior here. Fix it upstream and re-copy; Agenda-specific behavior
  (drag-to-reschedule, all-day strip, shift rows) lives in `src/components/agenda/`.
