# Native Desk Webchat configuration acceptance

Passed against the fixed eight-app isolated site
`meta-reliability-test-20260910.lab.xoloitzcuintles.com`, through root's loopback
WSGI/bridge. Only the fictional fixture user was temporarily granted System Manager
by root. No product code, production configuration, global cache or saved additional
user permission was changed by this browser lane.

The actual native Page configuration button and broker demonstrated:

- Dialog mounts without a temporal-dead-zone or other JavaScript error. Selecting
  the existing fixture channel displays its immutable profile/origin as read-only.
- Editing the label keeps the same binding and enabled state and sends the exact
  saved `expected_modified` revision. Actual `list_channels` confirms the update.
- New-channel UI defaults to disabled. One unique profile with
  `https://example.invalid` was saved. Its successful server response was deliberately
  dropped; the stale Save remained disabled and the dialog instructed the operator
  to close/reopen and check the saved channel. No second create was submitted.
- A fresh browser reopened the same saved, disabled channel. “Asignar agente” opened
  an actual **unsaved** User Permission with `allow=CRM Webchat Channel`, exact main
  fixture `for_value`, `apply_to_all_doctypes=1`, and no selected user. No grant was saved.
- Read-only database verification confirmed exactly one row for the new binding,
  zero visitor sessions for it, new channel `enabled=0`, and main fixture `enabled=1`.
- The actual dialog fits at 375×812 without horizontal overflow. No client-side
  runtime override was applied to obtain these results.

Evidence:

- [Browser script](webchat_config_browser.mjs)
- [Committed update/create and dropped response](WEBCHAT_CONFIG_BROWSER.txt)
- [Actual reopen, permission prefill and DB verification](WEBCHAT_CONFIG_RESUME.txt)
- [375px dialog](WEBCHAT_CONFIG_375.png)
- [Safe retained channel identity](WEBCHAT_CONFIG_CREATED.json)

The first phase completed all update/create assertions but its harness initially
tried to close the underlying dialog before the overlaid notice. The script was
corrected to close the top modal and await that exact node's hidden transition.
Recovery ran with `--resume-created`, using the already committed row rather than
creating another fixture. Frappe's numeric `is_new()` was normalized to a boolean
in the test assertion. Neither correction changed application behavior.

The lab's saved homepage was `setup-wizard`, which looped for the manager. Root
provided a process-only complete-boot projection; the proof entered the real
`/app/customer-conversations` Page directly, avoiding that unfinished fixture
homepage. Earlier Sales User acceptance separately proved Desk search entry.

Commands: `node coordination/meta-reliability/webchat_config_browser.mjs`, followed
by `node coordination/meta-reliability/webchat_config_browser.mjs --resume-created`;
`node --check coordination/meta-reliability/webchat_config_browser.mjs` passed.

Retained disabled channel:
`e3b7117c473e88b9338f0449f4c244458b8bd5c34bf9de006d7b05701342bdbd`,
profile `chat-config-proof-7317845155`. Main fixture remains enabled for root's
session revocation/cleanup. All browser contexts from this lane are closed. Root
owns final fixture user/channel cleanup and the WSGI/bridge lifecycle. The private
credential manifest is not copied into source or evidence.
