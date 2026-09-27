# Pinned CRM lifecycle patches

`frappe-ui+1.0.0-beta.29.patch` changes the installed library's import preview
component before Vite or Vitest compiles it. It reuses the host application's
`$socket`, removes only its own listeners on unmount, and disconnects only a
fallback socket it created. Reconnection refreshes the active import through
the normal resource and permissions. No server method or import authority changes.

The component awaits the list reload before publishing an updated import,
coalesces refresh notifications, and rejects late preview/log completions after
the import identity changes or the component unmounts. Failed refreshes remain
visible with a read-only refresh action; they do not automatically retry an import.

Yarn Classic installation applies the patch with pinned `patch-package` and
`postinstall-postinstall`, following the [owning project's setup](https://github.com/ds300/patch-package#yarn-v1).
The patch tools are ordinary dependencies so production-mode installs also run
the same lifecycle. Root installation delegates to the frontend's install.

`scripts/verify-frappe-ui-patch.mjs` checks the exact library version and the
source hashes in `frappe-ui-source.json` after installation and before each build
or unit-test script. A missing patch, stale dependency cache, changed version or
partial patch fails visibly. Do not bypass lifecycle scripts, edit bundled assets
or patch a shared lab `node_modules` tree.

For an upstream upgrade, review the owning component's current implementation,
update or remove the patch and its fingerprints together, and run the mounted
component regressions, a clean frozen install, full frontend tests and build.
Native CSV import, worker progress, reconnect and return to permitted Lead rows
remain separate browser acceptance evidence; unit tests do not prove that journey.

The same versioned patch also makes the native onboarding helper return its
persistence promise through update, skip and reset actions. Local completion and
callbacks are published only after the owning native status POST succeeds. CRM
awaits that promise, retains a failed action, and exposes explicit Retry; a retry
never repeats an already successful Lead/Deal/Task creation. The endpoint, payload
and canonical storage/step definitions remain unchanged. The real helper and
active desktop/mobile shell are covered by `crmOnboarding.test.js`.

Onboarding registration and its resource cache are isolated per authenticated
user. Saved progress is matched by stable step name, retaining historical hidden
steps and adding newly eligible steps. Re-registration replaces callbacks for the
current app instance; changing roles must not shift progress by array position.
Per-user persistence keys and native server payloads remain unchanged.
