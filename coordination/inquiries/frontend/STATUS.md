# Frontend inquiry implementation

Status: DONE — mobile header source fix ready for parent browser acceptance

- Read API contract, project guidance, shared decisions and current standalone navigation changes.
- Implemented native capture/list/detail with race-safe requests, explicit people/lead actions and shared desktop/mobile navigation.
- Rendered parent-owned `SocialCaptureHealth.vue` below the Social Menciones toolbar; added adapter capture and core manual capture links.
- Added dirty-field-preserving reload, content-free inquiry realtime/focus refresh and native assignment notification routing per parent's final instructions.
- Successful reassignment tombstones clear protected detail/list state, show transfer confirmation and refresh permitted results without offering a retry. Notifications use their stable `name` keys.
- Validation: 51 passing tests across six focused files (34 inquiry/social/layout tests plus 17 existing capability tests); changed Vue template/script and inquiry Tailwind compilation; ESLint zero errors; `git diff --check` clean.
- Mobile route follow-up: actual App + RouterView + responsive layouts + inquiry page render regression passes desktop/mobile swaps and direct mobile navigation. Parent's settled-frame browser check confirmed page/detail rendering at 390 px with no overflow, JS errors or optional RPCs; the initial blank screenshot was timing.
- Mobile visual follow-up: confirmed a separate header shrink defect in the settled screenshot. Added only `flex-none` to the inquiry header so wrapped description/action retain their full height instead of overlapping the inbox. ESLint and mobile App/layout regression pass. Parent owns final button/card/tab geometry and actual click acceptance after rebuilding.
- No migration, deployment, commit or backend change. Details and remaining release checks are in RESULT.md.
