# Native inquiry frontend result

Implemented by the available Codex builder after the Fable usage-limit fallback recorded in D007. Shared DECISIONS.md was reread before completion.

## Files

- `frontend/src/pages/Inquiries.vue`: native `/inquiries` inbox, status/assignee filters, 20-row pagination, local next-action time and overdue display, manual capture and query-selected detail.
- `frontend/src/components/Inquiries/CaptureForm.vue`: manual URL/text capture, optional distinct people, bounded validation, preserved input and identical request snapshot/ID after failure. A successful capture or explicit new-capture action creates a new ID.
- `frontend/src/components/Inquiries/InquiryDetail.vue`: assignment, next action, close/reopen, add person, explicitly selected create/link CRM Lead and native lead navigation. Reload merges untouched fields and preserves dirty fields; save submits only dirty fields.
- `frontend/src/components/Inquiries/PersonFields.vue`: shared explicit person/role/contact fields.
- `frontend/src/components/Inquiries/useInquiryWorkspace.js`: core POST calls, permission/concurrency/unavailable errors, independent request revisions and actor checks, guarded mutation state, content-free realtime/focus list refresh and update-available notice. Removes the exact socket/focus callback on unmount.
- `frontend/src/utils/inquiries.js`: payload allowlist, limits, role/conversion checks, safe source URL, configured site/user datetime conversion, error mapping, request gates and inquiry notification route.
- `frontend/src/router.js`: only the new native inquiry route, preserving candidate capability changes.
- `frontend/src/composables/navModel.js`: shared desktop rail/mobile drawer inquiry entry and active-group mapping. Existing standalone availability gates remain intact.
- `frontend/src/pages/SocialMentions.vue`: explicit adapter capture action, inline capture/list errors, manual core links including empty state, honest coverage copy and parent-owned `SocialCaptureHealth` placement with `shop`.
- `frontend/src/components/Notifications.vue`: inquiry notifications route to `{name: 'Inquiries', query: {name: reference_name}}`; existing notification routes retained. Rows use the backend's stable notification `name` key.
- Tests: `frontend/tests/unit/{inquiries,inquiryWorkspace,inquiryComponents,inquiryMobileLayout,socialCapture}.test.js`.

## Boundaries and decisions

- All core calls use existing frappe-ui `call`, which uses POST. No marketing availability check is applied to core inquiries.
- No automatic person matching, referrer conversion, source HTML rendering, screenshot uploads or customer messages. Converted people with a redacted `lead` remain non-convertible via `converted_at`.
- `can_write` controls write UI. Assignees use the backend `{name,full_name}` contract. Source/person limits match the backend.
- The final `{name,access_revoked:true}` successful handoff response clears protected detail and its visible list summary immediately, refreshes the permission-filtered list and shows a transfer confirmation. It is neither an editable inquiry nor a retryable failure.
- Source strings remain plain text; source anchors accept only http/https without embedded credentials.
- Datetimes use the existing frappe-ui exported `dayjs`, `dayjsLocal` and `getConfig`; inverse conversion uses configured local/site timezones and emits seconds. The installed package does not publicly export its internal `dayjsSystem`, so it is not imported.
- Capture and pending edits stay in component memory. Hiding the capture form preserves its draft; actor changes clear it. Reloading/leaving the page does not persist drafts to browser storage.

## Validation completed

From `frontend/`:

```sh
./node_modules/.bin/vitest run tests/unit/inquiries.test.js tests/unit/inquiryWorkspace.test.js tests/unit/inquiryComponents.test.js tests/unit/inquiryMobileLayout.test.js tests/unit/socialCapture.test.js tests/unit/crmCapabilities.test.js
```

Result: **6 files, 51 tests passed** (34 new inquiry/social/layout tests; 17 existing capability tests). Covers retry identity, duplicate-submit guards, old actor/selection/mutation responses, pagination, timezone roundtrip, source text and URL safety, separate selected prospects, referrer and redacted-lead protection, conflict reload preserving dirty fields while updating untouched assignment, close/reopen, realtime cleanup, notification query routing and successful transfer access revocation.

Mobile route follow-up: a screenshot taken immediately after the desktop/mobile breakpoint showed only shell controls. Source inspection found that both layouts use the same default RouterView slot, with an async layout swap and a 180 ms `.page-in` opacity animation. `inquiryMobileLayout.test.js` now mounts the real App, RouterView, both responsive layouts and Inquiries page, isolating only peripheral shell widgets. It checks the inquiry heading, capture action and detail text after repeated 1440→390→1440→390 swaps and direct mobile navigation. This DOM regression passes; no route change was justified. Parent's settled-frame browser rerun passed with width=390, scrollWidth=390, pageCount=1, detailCount=1, no JS errors and no optional RPCs (`/tmp/crm-inquiry-mobile-20260909.log`). The initial blank frame was timing, not missing mobile routing.

Mobile visual follow-up: inspection of the settled `/tmp/crm-inquiry-browser-mobile.png` confirmed a separate header-sizing bug: the vertically bounded flex container shrank the header to its 52 px minimum while the wrapped description and capture button overflowed underneath the inbox card. The source fix adds only `flex-none` to the inquiry header so its natural wrapped height is retained in the scrolling page. The actual App/mobile DOM regression and inquiry page ESLint pass after the fix. An attempted offline Chromium geometry fixture could not launch because sandbox crashpad `setsockopt` was denied; it did not provide browser geometry evidence. Parent owns the rebuilt-site acceptance: capture button bottom within header, above inbox card, within the scrolling viewport above tabs, and a successful actual click opening the capture form. Page presence and no-horizontal-overflow alone do not establish this visual acceptance.

`yarn` is unavailable in this shell; the installed Vitest binary ran successfully. No dependencies were installed.

ESLint passed with zero errors across changed inquiry files, touched shared files and new tests. Warnings are two existing SocialMentions attribute-order warnings and test-stub component/prop convention warnings.

Vue compiler parse/script/template checks passed for Inquiries, CaptureForm, InquiryDetail, PersonFields, SocialMentions and Notifications. Tailwind/PostCSS compiled the inquiry page styles. `git diff --check` passed.

## Remaining release checks

No build publishing, migration, Frappe database integration or deployed browser check was performed by this builder. Parent owns integration/deployment evidence and the optional marketing adapter/readiness component. No commit was created.
