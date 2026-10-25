# frappe-ui 1.0.0-beta.29 → 1.0.2 in crm/frontend

Lane `crm-fui1-core` (branched from doco-dev 5434f2d96, 2026-10-24). Plan and counts:
`muelle/docs/research/frappe-ui-1.0-upgrade.md` §2 and §3 Track B. This file is the lane's
record: what the spike found, which plan decisions hold, and the list of silent breaks the
second lane (`FUI1-behavior`) starts from.

## 1. How the spike measured

Two levers under `frontend/scripts/codemods/`, both rerunnable:

- `inventory-frappe-ui.mjs` lists every static `import … from 'frappe-ui[/subpath]'` under
  `src/` and `tests/` by name (`--name X` or `--from frappe-ui/frappe` prints `path:line`).
  On the lane base: 119 distinct (name, subpath) pairs across 591 files.
- `check-frappe-ui-exports.mjs [--pkg <dir>]` resolves each imported name against the installed
  package's entry files (following `export *` and `export { } from`) and names the subpath that
  exports it now. Against beta.29: 1569 names, 0 missing. Against 1.0.2 (a scratch worktree at
  `/tmp/fui1/spike` with `yarn add frappe-ui@1.0.2 --ignore-scripts`): 32 missing pairs, table
  below.

A `vite build` of the scratch tree stops at the first unresolvable specifier (`Missing "./frappe"
specifier in "frappe-ui" package`), so the build alone would have surfaced one break per run; the
checker covers every import name in one pass. The build log is `/tmp/fui1/spike-build-1.log`.

## 2. Loud breaks (the build fails)

Files = distinct files importing the name on the lane base. Step = the brief's step that fixes it.

| Break                                                                                                                                                                                                                                                                   | Files                                                        | Lives now                                                                                                             | Step               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `frappe-ui/frappe` subpath removed (`useTelemetry` 40, `telemetryPlugin` 2, `minimize` 2, `useOnboarding`, `GettingStartedBanner`, `HelpModal`, `showHelpModal`, `SignupBanner`, `TrialBanner` 1 each, dynamic `IntermediateStepModal` in `CrmRuntime.vue:92`)          | 42                                                           | vendored `src/framework-ui/` (`@framework/ui`)                                                                        | 2                  |
| `FeatherIcon` root export removed; `frappe-ui-components/FeatherIcon.vue` alias path gone (`utils/lazyGlobals.js:16`)                                                                                                                                                   | 66 (+10 files using the global without import)               | `Icon` (root) renders `lucide-*` classes or a component; `~icons/lucide/<name>` components                            | 3                  |
| `useTheme` removed                                                                                                                                                                                                                                                      | 4                                                            | `useColorScheme` (root)                                                                                               | 4                  |
| `ListView` family moved: `ListView` 8, `ListFooter` 7, `ListHeader` 7, `ListHeaderItem` 7, `ListRowItem` 7, `ListSelectBanner` 6, `ListGroupHeader`, `ListGroupRows`, `ListRow`, `ListRows` 1 each                                                                      | 10                                                           | `frappe-ui/experimental` (not `frappe-ui/list`, see §4)                                                               | 5                  |
| `TextEditor` root export removed                                                                                                                                                                                                                                        | 15                                                           | `frappe-ui/experimental` (deprecated copy; `TextEditorFixedMenu` etc. with it)                                        | 6                  |
| Charts: `AxisChart` 2, `DonutChart` 1, `NumberChart` 1                                                                                                                                                                                                                  | 2 (`Dashboard/DashboardItem.vue`, `Reports/ReportChart.vue`) | `frappe-ui/charts` (`BarChart`/`LineChart`/`NumberCard`/`DonutChart`, `select` emits); interim copies in experimental | 6                  |
| `CalendarColorMap` moved                                                                                                                                                                                                                                                | 1                                                            | `frappe-ui/experimental`                                                                                              | 6                  |
| `ConfirmDialog` removed                                                                                                                                                                                                                                                 | 2                                                            | `dialog.confirm()` (root `dialog`)                                                                                    | 6                  |
| `Input` removed (also `frappe-ui-components/Input.vue` in `lazyGlobals.js:9`)                                                                                                                                                                                           | 2                                                            | `TextInput` / `FormControl`                                                                                           | 6                  |
| `CircularProgressBar`, `GridLayout`, `NestedPopover` removed                                                                                                                                                                                                            | 1 each                                                       | none; local replacements                                                                                              | 6                  |
| `IconPicker` left `frappe-ui/icons`; `spritePlugin` too (`utils/lucideSprite.js:6` dynamic import)                                                                                                                                                                      | 1 + 1                                                        | `frappe-ui/experimental` (`SpriteIcons`)                                                                              | 3                  |
| `frappeui()` vite plugin: `lucideIcons` defaults to `false` (crm passes `true`, so the unplugins still install); `optimizeDeps.include: ['feather-icons']` in `vite.config.js` names a package 1.0.2 no longer brings                                                   | config                                                       | `lucideIcons: true` stays; drop `feather-icons`                                                                       | 7                  |
| `FrappeUI` plugin: `socketio` option removed (`main.js:53` passes `{ socketio: false }`, warns in dev); `$call` global gone; `resources` now off by default                                                                                                             | 1 + test `bootstrapSocket.test.js:136` asserts `$call`       | `app.use(FrappeUI, { resources: true })` if any component still declares `resources:`; else `app.use(FrappeUI)`       | 7                  |
| patch-package lifecycle: `postinstall`, `prebuild`, `pretest*` run `verify-frappe-ui-patch.mjs`, which throws on any version change; `patches/frappe-ui+1.0.0-beta.29.patch` targets files 1.0.2 does not ship                                                          | scripts                                                      | patch, fingerprints and verifier removed with the vendoring                                                           | 2, 7               |
| `tests/unit/dataImportRealtime.test.js:59` imports `node_modules/frappe-ui/frappe/DataImport/PreviewStep.vue`; `crmOnboarding.test.js:210-217` and `startupTelemetry.test.js:12-18` import `node_modules/frappe-ui/frappe/...`; six tests `vi.mock('frappe-ui/frappe')` | 9 tests                                                      | re-point at `@framework/ui`; the DataImport test goes with the component it tested (see §4)                           | 2                  |
| `frappe-ui/tailwind/tokens.js` export key is now `frappe-ui/tailwind/tokens`; the vendored `src/vendor/muelle-shell/tokens/frappe-ui.ts` is generated from beta.29 (`FRAPPE_UI_VERSION`)                                                                                | generated                                                    | regenerate from the `@muelle/tokens` package                                                                          | FUI1-behavior (B9) |

Not loud, verified absent: `editor-style.css`, `list-style.css`, `hljs-theme.css` have no import
(`src/index.css:1` imports only `frappe-ui/style.css`); `fileToBase64`, `getMaxFileSize`,
`UploadError` have no reference; `formatBytes` is crm's own (`composables/useArchivos.js:396`);
no `FileUploader` template ref is read; `Rail`/`RailItem`/`KeyboardShortcutsModal`/`ThemeSwitcher`/
`PageHeader*` `#left`/`#right`: 0 sites on the lane base; `ListItem`, `Card`, `Autocomplete`,
`pageMetaPlugin`: 0 sites. `frappe-ui/editor` keeps every name crm imports (menu items included).

## 3. The plan's open points

- **`Onboarding`, `DataImport`, `TrialBanner`, `SignupBanner` at frappe v16.35.0:** absent.
  `ui/src/components` at `v16.35.0` has ActivityTimeline, ColumnSettings, Composer,
  ConditionBuilder, Fields, FileUpload, Filter, FormLayout, Grid, InviteUser, Link, ListView,
  Notifications, Phone, QuickFilter, SortBy, TableMultiSelect; no `telemetry/`, no `experimental/`.
  All four plus `telemetry/` exist at `version-16` head `e8d41dd0061a32ee781caefe5d0b0d2bb7c15362`
  (v16.53.0, 2026-10-22). Checked with `gh api repos/frappe/frappe/contents/ui/src/components?ref=…`.
  So B0a (ii), vendoring from `version-16` head, is the only way that does not wait for the pin.
- **Does beta.29 already ship `frappe-ui/list`, `frappe-ui/charts`, `frappe-ui/experimental`?**
  `./list` and `./experimental` yes, `./charts` no. But beta.29's `./list` is the new
  composition-based `List` family (`List`, `ListRow`, `ListCell`, `ListHeaderCell`…), not the
  `ListView` family, and beta.29's `experimental.ts` does not export `ListView`, `TextEditor`,
  `Calendar` or `ThemeSwitcher`; those arrive in experimental with 1.0.x. So the import moves of
  steps 5 and 6 cannot happen before the bump; they are made with codemods that run as part of
  the bump commit sequence.
- **Where `Dialogs` comes from:** crm's own `src/utils/dialogs.jsx:10` (`App.vue:14`,
  `CrmRuntime.vue:53`). 1.0.2 also exports a root `Dialogs` component; crm does not use it.
- **Do all 92 `$socket` sites use crm's own `socket.js`?** Yes. `main.js:53` installs the plugin
  with `socketio: false`; `main.js:81/89` assign `app.config.globalProperties.$socket =
initSocket()` from `src/socket.js` (socket.io-client direct). 14 sites read
  `getCurrentInstance().appContext.config.globalProperties.$socket`, 73 go through
  `stores/global.js:4-6`, 5 hand it to customization scripts (`data/script.js:72`). None depends
  on the plugin. 1.0.2 installs a throwing getter for `$socket`/`$call` unless the app assigned
  its own first; crm assigns after `app.use(FrappeUI)` but the setter replaces the guard, so the
  order is fine.

## 4. Where the spike departs from the plan and the brief

Decisions, accepted by the PM on 2026-10-24 after the spike: (1) and (2) below are how this
lane is built. The new composition-based `frappe-ui/list` family is a later, separate migration.

- **Counts are smaller than the plan's.** FeatherIcon 66 files (plan 78), TextEditor 15 (17),
  ListView family 10 files (plan: 59), charts 2 files (8), `Rail`/`RailItem` 0 (2+2),
  `ThemeSwitcher` 0 (2), `KeyboardShortcutsModal` 0. The plan counted occurrences over a wider
  tree; the lane base is the real surface. B0b (in-place) holds with more margin, not less.
- **Lists go to `frappe-ui/experimental`, not `frappe-ui/list`.** 1.0.2's `experimental.ts`:
  "ListView family. Moved out of root (#985) — `frappe-ui/list` is composition-based by design
  and doesn't replicate ListView's config-driven columns … this stays here until `frappe-ui/list`
  reaches parity." Migration is the import path only. Step 5 is therefore a 10-file import move;
  a rewrite onto `frappe-ui/list` is out of this lane's scope.
- **`frappeui()` still installs the unplugins.** 1.0.2's `vite/lucideIcons.js` adds
  `unplugin-auto-import`, `unplugin-vue-components` with the lucide resolver, and the
  `~icons/lucide/*` virtual module from `lucide-static` when `lucideIcons: true`, and the three
  unplugins are 1.0.2 dependencies. crm does not need to install them. The 7 unimported
  `<Lucide*>` tags in 4 files and the 174 `~icons/lucide/*` imports in 51 files keep working.
- **DataImport is not vendored.** crm renders no DataImport component: `router.js:833-854`
  redirects `/data-import*` to Desk (`toDesk`), and `ventasNav.test.js:182` asserts no
  `pages/DataImport.vue`. The only consumer of the patched `PreviewStep.vue` is
  `tests/unit/dataImportRealtime.test.js`, which mounts the library file from `node_modules`.
  Upstream `version-16` rewrote DataImport (`DataImportWizard` + `steps/`, pulling
  `experimental/List`, `ActivityTimeline/utils`, `Link`, `Filter`, `socket`): the beta.29
  `PreviewStep.vue` hunks have no file to land on. The vendored set is telemetry, Onboarding
  (with HelpModal and help state), TrialBanner, SignupBanner and `utils/session`; the
  `onboarding.js` hunks (per-user registry key, promise-returning update/skip/reset, name-keyed
  sync) are ported onto upstream's `onboarding.ts`, and `crmOnboarding.test.js` keeps covering
  them. The DataImport test is removed with the component it tested.
- **Charts are 2 files, not 8.** Step 6 rewrites `DashboardItem.vue` and `ReportChart.vue` onto
  `frappe-ui/charts` (`AxisChart` → `BarChart`/`LineChart` by type, `NumberChart` → `NumberCard`,
  `select` emits).

### Step 3 (B2 icons): how crm renders icons after 1.0.2

`FeatherIcon` is gone and frappe-ui components render only `lucide-*` class strings, emoji or
components in their icon props. The lane keeps the 61 KB CSS gate in mind: each new `lucide-*`
mask class costs 0.15–0.3 KB gzip, so string names were not converted to classes.

- Static names become components: `<FeatherIcon name="x">` → `<LucideX>` and `icon-left="x"` →
  `:icon-left="LucideX"` with an explicit `import LucideX from '~icons/lucide/<canonical>'`
  (`scripts/codemods/icons-to-lucide.mjs`; 157 files). Object literals feeding frappe-ui
  `Dropdown` options and `:button` objects were rewritten at the 93 sites the reader classed as
  frappe-ui sinks.
- Dynamic names stay strings and render through crm's sprite `Icon` (`src/components/Icon.vue`):
  `<FeatherIcon :name="expr">` → `<Icon :icon="expr">`. The sprite carries canonical ids only, so
  `src/utils/lucideNames.js` maps the 24 feather-era aliases crm used (`edit`→`square-pen`,
  `check-circle`→`circle-check-big`, `grid`→`grid-3x3`, `tool`→`wrench`…), derived from
  lucide-static by drawing. crm's own data lists (composables' view entries, page actions,
  `Settings.vue` tabs, `EmptyState`) keep their strings for the same reason.
- `utils/index.js` `DropdownOption`/`TemplateOption` and `CallLogDetailModal` render through
  `Icon`; `isEmoji` moved to `src/utils/emoji.js` so `Icon.vue` does not pull the utils barrel
  (its stores import the router, which the component tests mock partially).
- `lucide-*` strings already on `Button`/`Dropdown` props (about 40) stay: 1.0.2 renders them as
  mask classes. `Input icon-left="search"` (SlaPolicyList) waits for the `Input` replacement in
  step 6.
- Pre-existing bug fixed on the way: `Controls/ButtonControl.vue` passed `:icon-left="lucide - icon"`
  (a subtraction, `NaN`), so the button icons of `Grid.vue`, `FieldLayout/Field.vue` and
  `SidePanelLayout.vue` never rendered. It now renders the field's icon through `Icon` in the
  button's `#prefix` slot.
- The lazy global `FeatherIcon` registration (`utils/lazyGlobals.js`) is gone; ten files that used
  the global tag now import their icons.

### Steps 4–6: shell, lists, editor, charts and the removed components

- Shell (B3): `useTheme` → `useColorScheme` (`colorScheme`, `setColorScheme`; same `theme`
  storage key and `data-theme` attribute, and the composable now restores the saved value on its
  first call), Sidebar `:disable-collapse="mobile"` → `:collapsible="!mobile"`, SidebarItem
  `:to` → `:route`. crm's `useShellTheme` facade keeps `theme`/`setTheme` for UserMenu, MoreSheet
  and the palette.
- Lists (B5): the ListView family imports from `frappe-ui/experimental` (10 files), API unchanged.
  `frappe-ui/list` is a later migration.
- Editor and calendar (B6): `TextEditor` (15 files) and `CalendarColorMap` import from
  `frappe-ui/experimental`, API unchanged; crm's Agenda is its own calendar, the frappe-ui
  `Calendar` component was never used. `IconPicker` moves from `frappe-ui/icons` to
  `frappe-ui/experimental`; the sprite it reads comes from crm's own loader
  (`src/utils/lucideSprite.js` injects `lucide-static/sprite.svg?raw` under `#lucide-sprite`,
  the id frappe-ui's sprite `Icon`/`IconPicker` look up).
- Charts (B6): `DashboardItem.vue` and `ReportChart.vue` render `frappe-ui/charts`
  (`BarChart`/`LineChart` by series type, `NumberCard`, `DonutChart`). The dashboard API keeps
  answering in the v1 `config` shape; `src/components/Dashboard/chartProps.js` maps it to the new
  props (`xAxis.key` → `x`, `series[].name` → `y`/`y2` by `axis`, `series[].echartOptions.name`
  → `seriesConfig[name].label`, `swapXY` → `horizontal`, `categoryColumn/valueColumn` →
  `category/value`). `ReportChart` listens to `select` (`{ name, value, row }`) instead of the
  v1 `events.click({ dataIndex })` and drops its CSS-variable colors and echarts tooltip
  override: the new family themes axes and tooltips from tokens itself.
- Removed components (B6): `GridLayout` is vendored from beta.29 as
  `src/components/Dashboard/GridLayout.vue` (the `grid-layout-plus` wrapper; crm now depends on
  `grid-layout-plus` directly) and `CircularProgressBar` as
  `src/components/FilesUploader/CircularProgressBar.vue`, props unchanged. `Input` → `TextInput`
  at the five sites (`SlaPolicyList`'s search gets the icon through `#prefix`, the clear button
  through `#suffix`, and listens to `update:modelValue`); the lazy `Input` global is gone.
  `NestedPopover` (SlaHolidays) → `Popover bare` with `#trigger`/`#default`. `ConfirmDialog` →
  `dialog.confirm({ title, message, onConfirm })` in `AssignmentRuleView` and `SlaPolicyView`,
  the `showConfirmDialog` state with it.
- The `move-imports` codemod inserted the new statement inside a multi-line import when the
  touched statement kept other names; fixed in this lane, the outputs repaired.

### Step 7 (B7): the bump

- `frappe-ui` is `1.0.2` from npm. The `frappe-ui` git submodule and `.gitmodules` are gone;
  `vite.config.js` no longer looks for `../frappe-ui/vite` in dev (`isDev` with it), it imports
  `frappe-ui/vite` like the build did. `patch-package` and `postinstall-postinstall` left with the
  last patch in step 2; `yarn.lock` was regenerated and `yarn install --frozen-lockfile` is green.
- The root `package.json` `build` script (what `bench build --app crm` runs) is
  `cd frontend && yarn install --frozen-lockfile && yarn build`, as posawesome's already was. The
  lab's `dev-refresh.sh` builds the tree it is given and installs nothing, so the first lab
  rebuild after the bump failed with «Missing "./charts" specifier in "frappe-ui"»: the lab tree's
  `node_modules` still held beta.29. With the install in the build command a dependency change
  deploys itself; `--frozen-lockfile` keeps the lab on the lockfile.
- Plugin: `app.use(FrappeUI)`. The `socketio: false` option no longer exists (1.0.2 opens no
  socket and `$socket` is the one `main.js` creates); the `resources` option API crm never used is
  off by default.
- Direct dependencies that 1.0.2 stopped hoisting: `@headlessui/vue ^1.7.23` (crm's own
  `components/frappe-ui/Autocomplete.vue` and `AssigneeSearch.vue` keep it; frappe-ui is on
  reka-ui), `grid-layout-plus ^1.1.1` (the vendored GridLayout), `lucide-static ^1.31.0` (the
  sprite and `~icons/lucide/*`), `@vueuse/core ^14.1.0` (five crm composables import it);
  `@vueuse/integrations` ^10 → ^14 to match. `dayjs` and `idb-keyval` stay transitive.
- Tailwind: the `frappe/` content globs are gone with the submodule. 1.0.2's preset dropped the
  named radius aliases (ADR-0006); `@apply rounded` in 26 scoped style blocks made the build fail,
  so `tailwind.config.js` keeps `rounded`, `rounded-sm/md/lg/xl/2xl` at beta.29's values on the
  preset's own variables (`--radius-1/4/5/6/7/8`, the same table `tailwind/migrate-tokens-v2.js`
  applies). A deviation from the plan: B9 renames the sites and deletes the block.
- Entry budget: `FrappeUIProvider` renders `<Dialogs/>`, whose `dialog.confirm`/`prompt` module
  imports `FormControl` and with it every reka-ui form control (DatePicker 30 KB minified,
  Combobox, MultiSelect, TimePicker, Select, dayjs…). Through the provider that was 220.9 KB gzip
  of entry JS against a 180 KB budget (base 178.7). `App.vue` now renders `ToastProvider` itself
  and mounts the imperative dialog host as an async component
  (`frappe-ui-components/Dialogs.vue`); the two Settings views that call `dialog.confirm` get it
  on the first render after the chunk loads. Entry JS 167.9 KB, CSS 58.7 KB (base 59.4) after
  step 7b; feather-icons (88 KB minified) left the entry, `@vueuse/core` (22 KB) entered it
  through the composables that already imported it from the hoisted copy.

### Step 7b: the slots and props that 1.0.2 dropped without a build error

beta.29 carried a compatibility layer (`warnDeprecated` in dev) for the beta-era API; 1.0.2
removed it, so the content behind the old slot names simply stopped rendering: every dialog body
(`#body-content` 53 sites, `#body` 14), every popover (`#target` 16, `#body` 10, `#body-main` 4),
every `:options="{ title, size }"` title (54). The full vitest run after the bump showed it (25 failed
tests in 11 files, all dialogs and selectors). `scripts/codemods/legacy-slots.mjs` does the
mechanical part and `check-frappe-ui-exports.mjs` cannot see any of it (it checks import names):

- Dialog: `#body-content` → `#default`; `#body` → `#default` on a `bare` dialog;
  `#body-header` (EventModal, ConvertToDealModal) → `#title` with `:show-close-button="false"`,
  since those headers draw their own close button; `:options="{…}"` → `title`/`size` props;
  `:disableOutsideClickToClose="x"` → `:dismissible="!(x)"`. Agenda's dynamic `#[formSlot]`
  (`'body-content'` for the dialog, `'default'` for the phone sheet) is `#default` for both.
- Popover: `#target` → `#trigger`, `#body` → `#default` + `bare`, `#body-main` → `#default`,
  `placement="side-align"` → `side` + `align`, `v-model:show` → `v-model:open`,
  `transition="default"` dropped. The slot props changed from `{ togglePopover, isOpen, open() }`
  to `{ open, close, setOpen }`, and reka's `PopoverTrigger` now wires the click itself, so the
  trigger buttons lost their `@click="togglePopover"` (a second toggle would close what reka
  opened) and the bodies call `close()`. Where the trigger must decide (FormBuilder publishes or
  opens the checklist; HierarchyRow's trigger sits inside a Tooltip; IconPicker and crm's
  Autocomplete expose `togglePopover` to their callers) the popover is `trigger="manual"` and the
  site calls `setOpen`. The three `trigger="hover"` info popovers (old SLA / assignment
  conditions) are `HoverCard` (`hover-delay` 250 ms).
- Tooltip: `#body` → `#content`, `placement` → `side`, `hoverDelay` seconds → ms (`:hover-delay`
  values under 10 were seconds; `1500` on the sidebar was already ms). Dropdown
  `placement="right"` → `align="end"` (beta.29's alias table). DatePicker/TimePicker
  `placement` → `side`.
- crm's `Autocomplete.vue` keeps its `#target` slot API (`open`, `togglePopover`, `isOpen`,
  `targetAttrs`) for `Link` and its six callers by owning those functions over `showOptions`; its
  `placement` prop splits into the popover's `side`/`align`.
- Test doubles that stubbed `Dialog` with `slots.body`/`slots['body-content']`/`options.title`
  render `slots.default`/`title` (17 files, 14 of them Dialog stubs).

## 5. Input list for `FUI1-behavior` (silent breaks)

Lab walk at step 8 (doco-mirror gen 1859, bundle from a8afd5bc7; owner and lab bot; 1440,
412 and 305 wide; dark and light; 118 shots in `shell-program/evidence/FUI1/`, every one viewed
against the E1/E7/E7b/S6/D2 baselines): no silent break visible. Every dialog (Nuevo evento,
the Nueva cita gate, Servicios), dropdown (Crear, Fase/Origen/Propietario, the phone title
menus), palette group and the assistant dock render with their content; zero page errors and
zero console errors on all six runs. The only differences from the baselines are not
frappe-ui's: the assistant sheet's snap height on the phone (animation timing), the services
dialog top cut (already in E1 04) and the «pruebas»/«Alta» pill clipping on Hoy at 412/305
(already in E7). What remains for `FUI1-behavior` is therefore the list below, known from the
sources and not visible in a static walk (timings, aria, focus and keyboard paths):

- Dialogs (step 7b): the body is the default slot; the 14 full-override bodies are `bare`
  dialogs, so they draw their own padding and close affordance exactly as before, but the size
  and title props are now flat (`title`/`size`); `.close()` on dialog refs is unverified.
- Popovers (step 7b): reka-ui opens on pointerdown/click and keyboard through `PopoverTrigger`;
  the trigger element gets `aria-expanded`/`data-state`. Sites on `trigger="manual"` (Autocomplete
  and every `Link`, IconPicker, FormBuilder publish, HierarchyRow) keep their own click handling
  and their own aria attributes. `HoverCard` replaces the hover popovers (delay 250 ms, leaves
  after 300 ms). Dropdown `align="end"` is what `placement="right"` resolved to.
- Tooltip delays are ms now; `:hover-delay="1"`/`"0.35"` were seconds and became 1000/350.
- `Button` string `icon`/`iconLeft`/`iconRight` props: 1.0.2 accepts `lucide-*` strings or
  components; any other string renders nothing and warns in dev.
- Glyphs that changed with the lucide renames (step 3): `edit` → `square-pen`, `edit-2` → `pen`,
  `check-circle` → `circle-check-big`, `check-square` → `square-check-big`, `grid` → `grid-3x3`,
  `bar-chart-2` → `chart-no-axes-column`, `align-left` → `text-align-start`, `tool` → `wrench`.
  Lucide components carry `width`/`height` 24 attributes that the size classes override; where a
  FeatherIcon had no size class the icon may now draw at 24px.
- Icons bound through the sprite `Icon` appear after the sprite loads (idle after first paint);
  static icons are inline components and paint with the view.
- Charts (step 6): the dashboard and report charts are the new `frappe-ui/charts` family. Axis
  colors, legend, tooltip layout and the empty/loading states are frappe-ui's, not crm's
  overrides; the Lead-conversion bar chart's `colorBy: data` goes through `echartOptions` and
  may color differently; `NumberCard` lays out title/value/delta differently from `NumberChart`
  (crm passes `card: false` and keeps its own container). Check the Hoy dashboard and the
  Reports page in both schemes.
- `dialog.confirm` (step 6): Esc, overlay click and the close button now run the cancel path;
  the confirm button shows a loading state while `onConfirm` is pending. The v1 `ConfirmDialog`
  had no close button.
- `TextInput` for the SLA policy search (step 6): frappe-ui's subtle variant instead of the
  custom gray classes; the clear button sits inside the field.
- `Popover` (step 6): the holiday-list picker opens through reka-ui (portal, collision
  handling, Esc to close) instead of the v1 NestedPopover's popper.
- `useColorScheme` (step 4): the first call restores the saved preference itself; a stored
  value other than light/dark/system now resolves to `system` where v1 read it as light.
- Tailwind preset renames (`bg-surface-white`, named radius aliases, `text-base font-medium`,
  `--focus-*`, line-height 1.35), `dark:` redundancy, hover on touch.
- `call()` honours `requestBaseUrl`/`requestHeaders`/`serverMessagesHandler` (184 files).
- `@vueuse/core` and `@vueuse/integrations` are direct ^14 dependencies (step 7); the
  composables that used the hoisted ^10 copy (`breakpoint`, `settings`, `onboarding`,
  `ShortcutSheet`) run on 14.4.0.
- `FormControl :placement` (TelephonySettings, 3 sites) was always an unknown attribute on the
  input; still is.
- The vendored `@muelle/tokens` (`src/vendor/muelle-shell/tokens/`) is generated from beta.29.

## 6. Behavior, verified (`FUI1-behavior`)

Lane `crm-fui1-behavior` (crm, from doco-dev `7bf0f41ec`) with `muelle-fui1-tokens` (muelle) as one
train. Walk script `shell-program/scripts/walk-fui1-behavior.mjs` (owner d1-dueno and the lab bot, 1440
and 412, dark and light; shots and `walk-log.txt` in `shell-program/evidence/FUI1-behavior/`), the
styling re-walk with `walk-fui1.mjs` in `evidence/FUI1-behavior/after-styling/`. Each §5 bullet ends
here as **verified** (frappe-ui's own behavior, acceptable, with the step that proved it) or **fixed**
(a crm change in this lane).

### 6.1 What the walk proved (per run, same assertions at 1440/412 × dark/light)

| Step | Assertion | Result | Shot |
|---|---|---|---|
| Theme | `localStorage.theme` = dark / light is restored on reload (`data-theme`); a stored `bogus` is repaired to `system` by `useColorScheme` (1.0.2 `ensureInitialized`) | verified | `01-tema-restaurado` |
| Nuevo evento (1440: «Crear › Evento»; 412: FAB) | opens; Escape closes; overlay click closes; close control closes | verified | `02`, `03` |
| Nueva cita gate | same four | verified | `04`, `05` |
| Servicios («Publicar servicios») | opens; Escape; close control | verified | `06`, `07` |
| Bare dialog (DealModal «Crear trato») | opens; Escape; overlay; close control | **fixed** (6.2 a) | `08`, `09` |
| Tab order | 14 Tabs stay inside the dialog; Link (combobox), Autocomplete and the date control are reached in order | verified | `10` |
| `trigger="manual"` (Link) | click opens the listbox, `aria-expanded=true`; Escape closes the list and keeps the dialog | verified | `11` |
| Tooltip (Button `:tooltip`, default 500 ms) | no bubble at 150 ms, one at 850 ms after hover; with a tooltip open, Escape closes the tooltip first and the dialog stays; the next Escape closes the dialog | verified (reka layering) | `12` |
| Dropdown (deal page, reka DropdownMenu) | click opens: `aria-expanded=true`, `data-state=open`, one menu; ArrowDown highlights; Escape closes and returns focus; Enter on the focused trigger opens | verified | `13` |
| Popover «Filtrar» (notes list, `align="end"`) | click opens (`aria-expanded`, `data-state`), content right edge = trigger right edge; Escape closes; Enter opens | verified | `14` |
| Tooltip `hover-delay` 1000 → ms | 0 at 150 ms, 2 at 950 ms on the list view's column tooltips | verified | `15` |
| Reports empty state | three «No hay grupos para esta métrica…» blocks for a period without data | verified | `17` |
| Settings (`dismissible` = not pending) | Escape closes, overlay closes, «Return to work» closes while nothing is pending | verified (6.2 d) | `18` |
| `dialog.confirm` (SLA policy «Unsaved Changes») | opens on back; Escape, overlay click, the X and «Cancelar» each cancel and keep the editor's text; «Confirmar» leaves | verified | `20`, `21` |
| `dialog.confirm` with a pending `onConfirm` | no crm site is async; `tests/unit/dialogConfirmPending.test.js` proves 1.0.2 holds the dialog, disables Cancel and ignores Escape until the promise settles, and a rejection shows inline and re-enables Cancel | verified (unit) | — |
| HoverCard («Condición antigua», assignment rules) | not reachable on the lab data (no old-style rule); `hover-delay` 250 ms is the source value | not walked | — |
| Hoy dashboard charts (bot, 1440) | 9 chart plots (SVG renderer, `data-slot="chart-plot"`); hover shows a `chart-tooltip`; legends present | verified | `22` |
| Reports charts (bot) | 3 plots with bars; hover tooltip; a bar click emits `select` → `drill_kind` query | **fixed** (6.2 b) | `23`, `24` |
| AboutModal | only `UserDropdown` (AppSidebar) opens it and the shell rail replaced that; unit test | **fixed** (6.2 c) | — |

Phone (412): the dashboard is desktop-only (its numbers live in Resultados); «Nueva cita» sits in the
drawer behind booking setup; everything else is the same list.

### 6.2 Fixed in crm

a. **Quick-entry dialogs opened with a tooltip showing and ate the first Escape.** 1.0.2's Dialog
   focuses the first tabbable on open; in `DealModal`, `LeadModal`, `CreateDocumentModal`,
   `DoctypeModal` and `GridRowModal` that is the edit-layout `Button :tooltip`, whose reka
   `TooltipTrigger` opens on focus (`data-state="instant-open"`); the first Escape then only dismissed
   the tooltip. An `autofocus` marker on the form wrapper (1.0.2 Dialog honours `[autofocus]` and
   walks into it) hands the initial focus to the first field. Shot `08` before/after: no tooltip on
   open, Escape closes.
b. **Report charts rendered 12 px high, nothing drawn.** `BarChart`'s root (`ChartContainer`) is
   `h-full`, which wins over the `h-44` `ReportChart` passed as a class; `useChart` waits for a
   `clientHeight` and never initialised. The height now sits on a wrapper box. (`reportsChart.test.js`
   asserts the props crm hands BarChart — that is crm's contract with the chart; the rendered ECharts
   option is frappe-ui's and is covered by the walk's tooltip/select steps, not by a unit test.)
c. **`AboutModal` is `bare` and had no close control** → its own labelled X (`aria-label="Close"`),
   `tests/unit/aboutModal.test.js`.
d. **`Settings.vue` `:dismissible="!(disableSettingModalOutsideClick || session.pending)"`**: in 1.0.2
   `dismissible=false` blocks Escape as well as the outside click. Kept: the flag is set while an
   assignment rule is dirty or a save is pending, and losing an unsaved rule to a stray Escape is the
   same loss as to a stray click; the header's «Return to work» still closes. Walked while not pending
   (`18`).
e. **`EventModal` DatePicker `#suffix="{ togglePopover }"`** was dead (1.0.2 passes
   `{ open, disabled, setOpen, close, displayLabel, inputValue }`) → `{ open, setOpen }`,
   `setOpen(!open)`. Its three icon-only buttons (delete, duplicate, close) now carry `aria-label`s.
f. **Leftover scanner.** `frontend/scripts/codemods/check-legacy-overlays.mjs` lists the beta.29
   overlay surfaces 1.0.2 drops without a compile error (Dialog `:options`,
   `disableOutsideClickToClose`, `#body*` slots, a template ref driven with `.close()`/`.open()`;
   Popover `placement`, `v-model:show`, `transition`, `#target`/`#body*`; Tooltip and HoverCard
   `placement` and seconds delays; Dropdown `placement`; picker slots reading `togglePopover`/`isOpen`).
   `tests/unit/legacyOverlays.test.js` asserts `src/` has none and that a fixture still trips every
   rule. Inventory at the lane base: Dialog ref `.close()` 0, `disableOutsideClickToClose` 0,
   `placement` on Tooltip/Popover 0 (the four `FormControl :placement` in TelephonySettings and
   DashboardSettings are an unknown attribute on an input and crm's own `Autocomplete`/`Link` prop is
   theirs), delays below 10: none (`:hover-delay="0"` twice is intentional), `trigger="manual"` 4,
   HoverCard 3 (250 ms), Dropdown `align="end"` 23, bare dialogs 14 static + 3 dynamic.
g. **Stale beta.29 references**: `frontend/patches/` (only a `.gitattributes`; patch-package is
   gone) removed; root `package.json` `upgrade-frappeui` (`yarn add frappe-ui@latest`) removed, the
   pin is `frontend/package.json`; `vite.config.js` `server.fs.allow` comment no longer claims a
   linked frappe-ui checkout; `README.md` names 1.0.2 and this file; `MERGE_NOTES_trackb.md` carries
   a «historical» note.

### 6.3 B7: `call()` and `serverMessagesHandler`

beta.29's `call()` was its own fetch and never read `serverMessagesHandler`; 1.0.2's `call()` is
`frappeRequest`, which on a **successful** response hands `_server_messages` to
`getConfig('serverMessagesHandler')` (or drops them when none is set), and on a failure puts them on
the rejection as `e.messages`, which the 228 crm catch sites already toast. crm set no handler, so
nothing double-toasted and the success-path `frappe.msgprint`s stayed silent, as before. Decision:
`src/utils/resourceConfig.js` registers `handleServerMessages` (`src/utils/serverMessages.js`): one
toast per distinct message, indicator → type (red error, orange/amber warning, green success, else
info), title as description; `tests/unit/serverMessages.test.js`. Exposure is small: one `msgprint`
in crm's own api (`crm/api/user.py:158`, user removed from CRM roles) and none in doco's contactos,
compras or gastos endpoints; the three flows the brief names (Compras › nueva, Gastos › registrar,
Contacto save with a validation error) go through crm's own fetch wrappers (`comprasApi`,
`gastosApi`, `contactosApi`), not frappe-ui `call`, so they are unchanged by B7 and were not
re-walked here. `requestBaseUrl`/`requestHeaders` stay unset (same-origin, cookie session).

### 6.4 B9: the preset renames, measured

Measured on the lab's built stylesheet (`index-*.css`, 1.0.2): `.bg-surface-white` 0 rules and no
`--surface-white` (the 33 crm sites painted nothing), `.rounded-md`/`.rounded-lg` present only
through crm's alias block, `.text-base-medium` generated, `dark:` variants compile to
`[data-theme=dark]` selectors (62 rules), `--focus-*` unused by crm, `text-base` is 14px / 1.35 /
weight 420 in 1.0.2. Codemods (`frontend/scripts/codemods/preset-renames.mjs`, one commit per
rename, the codemod committed first):

| Rename | Sites | Visual effect |
|---|---|---|
| `bg-surface-white` → `bg-surface-base` | 33 / 17 files | intended: those surfaces get their background back |
| named radius → numbered (`frappe-ui/tailwind/migrate-tokens-v2.js --radius-only`): `rounded`→4, sm→1, md→5, lg→6, xl→7, 2xl→8 and directional forms; alias block in `tailwind.config.js` removed | 1755 / 436 files | none by construction (the aliases mapped to the same variables). The codemod also rewrote one prose string (`useCompras.js` «rounded up to» → «rounded-4 up to», caught by the Spanish catalog test); reverted by hand, nothing else outside class lists matched |
| `text-base font-medium` → `text-base-medium` | 88 / 66 files | none visible (14px, 1.35, 500; the utility adds its tracking) |
| redundant `dark:` ink overrides (`text-ink-gray-8 dark:text-ink-gray-7` and identical pairs) | 16 / 7 files | dark inks one step brighter where the override dimmed them; the 18 `bg-surface-base dark:bg-surface-gray-1` elevation pairs are kept as design intent, and `dark:` on raw palette colours stays |
| `--focus-*` | 0 | — |
| `--brand*` | 76 `var(--brand)` + 12 other in 43 files | unchanged: `index.css` aliases `--brand*` to `--muelle-accent*` (the tokens README's «during migration» state); `stores/settings.js` still overrides `--brand*` from `FCRM Settings.brand_color`. Deleting the alias means routing that tenant colour through `applyShellAppearance` (a whole-shell accent, with the AA re-check) — a product decision, left for Marco |
| line-height 1.35 | preset | `text-base` lines are 1.35 (1.15 in v1 per the plan); compared shot by shot in the re-walk |
| hover on touch | preset `future.hoverOnlyWhenSupported: true` | `hover:` rules apply only where a hover-capable pointer exists; nothing to rename |

CSS budget: `scripts/verify-bundle-budget.mjs` keeps 61 KB gzip (`docs/PRODUCTOS_RESULTADOS_HANDOFF_2026-10-15.md`
said 60; now 61). Lane build (`vite build` + the script): entry JS 168.1 KB, CSS 58.5 KB gzip; the
FUI1 lane measured 167.9 KB / 58.7 KB at its end (§5). The 0.2 KB of JS is the server-messages
handler and the `autofocus` wrappers; the CSS drops with the 16 `dark:` overrides and the 88 merged
`text-base-medium` sites.

### 6.5 Tokens, deps and docs

- `@muelle/tokens` regenerated from 1.0.2 (`workspace/packages/tokens/scripts/generate.mjs` now
  reads `tailwind/tokens/{colors,typography,radius}.js`, oklch → sRGB hex; radii keep the shell's
  `DEFAULT/lg/xl` names on steps 4/6/7). Status inks moved with the palette; every pair passes AA on
  its first ink. The vendored copy in `src/vendor/muelle-shell/tokens/` is `vendor.mjs` output and
  `--check` is green.
- `frontend/package.json` against 1.0.2's peers: `vue`, `vue-router`, `tailwindcss` in range;
  `@vueuse/core`/`integrations` ^14 direct; `echarts` 6 is frappe-ui's own dependency (crm imports
  `frappe-ui/charts` only); the `@codemirror/lang-*` peers are optional and crm renders none of
  frappe-ui's `CodeEditor` (`ImpresionFormato` uses crm's own editor), so none is added.
