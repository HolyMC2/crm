# CRM CI

The frontend depends on `frappe-ui` from npm (1.0.2), with no git submodule and no
patch on it (`docs/FRAPPE_UI_1.md` records the migration). The pieces of
frappe's `@framework/ui` package that crm uses (telemetry, onboarding, the signup
and trial banners) are vendored under `frontend/src/framework-ui/`; its
`SOURCE.json` records the upstream commit and every local change, and
`frontend/tests/unit/crmOnboarding.test.js` covers the ported onboarding
behaviour. A frappe-ui bump therefore needs no lifecycle script; the build runs
`scripts/verify-vendor.mjs` for the byte-checked `src/vendor/` packages only.

This fork ships inside `ghcr.io/holymc2/doco-bench`, published by Muelle's
source-locked image pipeline. Its active `pyproject.toml` Bench constraint is
`frappe >=16.0.0-dev,<=17.0.0-dev`; Frappe 15 is outside that declaration.
The README compatibility table describes upstream `main` and `develop` branches,
not this fork's `doco-dev` deployment. Native CI validates the supported,
source-locked Frappe 16 multi-app image. It does not claim a Frappe 17 result.

Set repository variable `CRM_CI_IMAGE` to an approved immutable Muelle digest:
`ghcr.io/holymc2/doco-bench@sha256:<64 hex characters>`. All native jobs use the
same environment through `.github/actions/setup-native-environment/action.yml`.
That action also owns the immutable `frappe_whatsapp` companion revision, currently
`11c88901cb3f0909292453ed70fdb364b8bb79ec`. Bump it with the release source lock.
The runner checks the image's Frappe and installed Python dependencies against
both tested CRM revisions; incompatible images fail rather than silently testing
with stale dependencies. Update the approved image when requirements change.

The runner mounts the checkout read-only and copies CRM into a disposable
container. MariaDB 11.8 and Redis 6.2 use an internal Docker network, with no
production volumes, host ports, Docker socket, tenant credentials or outgoing
integrations. `GITHUB_TOKEN` needs read-only package pull access. Only synthetic
logs, revision IDs, migration snapshots and coverage reports leave the container
through `.ci-results`. Cleanup runs even if installation, migration or tests fail.

The image includes the complete app graph: Payments, ERPNext, Frappe WhatsApp,
CRM, Doco, Scanner Kit, POS Awesome, Doco Meta Catalog, Doco Marketing, Taller,
Mercado and the Mercado Pago connector (CRM's commerce broker drives its native
order payments).
Payments owns Payment Gateway; Doco Marketing owns Social Shop. Email is muted
before app setup. Native tests use USD fixtures without calling a live FX service.

## Initialized ERP test fixture

Before taking the migration baseline, the disposable base site creates the
canonical `All Item Groups` root through the native Item Group controller if the
tree is empty. An unexpected root or a rootless existing tree fails setup; no
existing group is renamed or reparented. The snapshot records the root and every
existing group's identity, parent and `is_group`, and verifies their preservation
before the full CRM test suite starts. No post-migration repair occurs. The preserved lead has a fixed historical
creation timestamp (`2000-01-01 00:00:00`): normal native insertion runs first,
then the framework database setter dates the synthetic baseline record. The
persisted value is reloaded and checked before the snapshot and after migration. This keeps historical upgrade data outside the current
month's dashboard test fixtures without deleting it or changing their expected
counts.

This follows the pinned
[ERPNext 4048fb70 setup fixture](https://github.com/frappe/erpnext/blob/4048fb70e14d1843956fcdabb7c3cca75a1cbcdd/erpnext/setup/setup_wizard/operations/install_fixtures.py).
Its test bootstrap uses the existing tree root for presets but hardcodes
`All Item Groups` for test children. On an otherwise uninitialized site,
[Taller f79e80f9](https://github.com/HolyMC2/taller/blob/f79e80f99c81e9dd3705ae1644968a620e563c67/taller/install.py)
creates its trade-in group without a parent during `after_migrate`, leaving a
root incompatible with those ERPNext test records. Preparing the canonical base
fixture models an initialized ERP tenant and keeps the upgrade assertion intact.

## Audited migration metadata

The synthetic migration fixture permits at most one deletion of each of eight
exact metadata identities, only with these owner and replacement checks:

- Scanner Kit's `Escáner` Workspace is removed by native orphan synchronization
  because its source is a fixture. Scanner Kit's `after_migrate` hook restores it;
  module, app, visibility and the `/scan` shortcut must match before and after.
- The Mercado Pago connector's `MercadoPago` Workspace is likewise created in code
  and removed by orphan synchronization; the connector's `after_migrate`
  recreates it. Label, module, visibility and its four `MercadoPago:` Number Card
  links must match before and after.
- Mercado's four named Number Cards and `Mercado: Cambios de precio por día`
  chart are deliberately deleted and recreated by `mercado.desk.ensure`.
  Every canonical query, filter, module and visibility field must match before
  and after, and the Mercado Workspace must retain their widget links.
- Frappe's `Frappe Framework` Desktop Icon is removed by
  `frappe.model.sync.delete_duplicate_icons`, not by a CRM data patch. The
  pre-upgrade state must contain both App icons for `frappe`, with a source JSON
  for `Framework` and none for the old identity. After migration the obsolete
  icon must be absent and canonical `Framework` must still open `/desk/build`.

No other deletion is accepted, including CRM records, DocTypes, similarly named
metadata or repeated deletion of an allowed identity. The existing app, DocType
and CRM data/link/write checks remain mandatory. These are synthetic CI records,
not a claim about live tenant data preservation. Deleted Document contents are
never copied into artifacts; only the row ID, deleted DocType and record name.

The audited image is
`ghcr.io/holymc2/doco-bench@sha256:6ae759948de11c60f9950d2d3c8aef40026309d915e1fc63d8ae181e9d00f675`,
from [Muelle source lock 64893b89](https://github.com/HolyMC2/muelle/blob/64893b89a4d394abf5372bf6cea2330c2c5e60f4/build/source-lock.json) (`v88`, which carries the Muelle framework scope patch).
Its owning sources are
[Frappe 012667b9](https://github.com/frappe/frappe/blob/012667b9c4e7f66d5e1ff5858d2e922331d4300a/frappe/model/sync.py),
[Scanner Kit 0dc76fc8](https://github.com/HolyMC2/scanner_kit/blob/0dc76fc8fb1c168be45169211f9a8145aef797fb/scanner_kit/install.py),
[Mercado Pago connector 535d408c](https://github.com/HolyMC2/mercadopago_connector/blob/535d408c5675154b5858d33b2bfcf6bf405678ae/mercadopago_connector/install.py)
and [Mercado d34e88b1](https://github.com/HolyMC2/mercado/blob/d34e88b1d1d000f10927657600aa9580922fefab/mercado/desk.py).
The probe checks source-file SHA-256 fingerprints and records the matching
revision evidence in the baseline. An image update changing those files requires
re-auditing this narrow metadata contract; a version label alone cannot waive it.

## Mandatory standalone conversation cohort

The Muelle roadmap runner explicitly executes
`crm.tests.standalone_conversations` on its isolated Frappe+CRM-only site. Its
three native tests check private conversation schema, rejection of absent
channel adapters, and rejection of forged service records. Every test first
requires exactly those two installed and available apps and verifies that the
optional companion packages cannot be imported. Installed-app or importability
mismatches fail; they never skip or substitute mocked absence.

The module intentionally lacks the `test_` discovery prefix because provider
absence cannot be tested on the full-app site. Full-app discovery retains all
20 account-backed tests in `crm.tests.test_conversations`, including their
existing inheritance into the 55-case OutboxBridge suite. Release evidence needs
both cohorts; a full-app result alone does not prove standalone operation. The
same strict log guard rejects skipped or empty standalone results. Relocating
the three tests does not waive them or establish native passing evidence.

## Fast path and the Shell APIs job

Decided in Shell SPEC §6.4 A6 (2026-10-18): shell APIs stay in crm, so crm CI must
test them against the doco services they read, and frontend-only lanes must not wait
for the native suite.

- **Changed scope.** Server and Migration start with a `Changed scope` job that runs
  `scripts/ci/changed_scope.py` on the diff between the candidate and its merge base
  with `doco-dev` (a PR uses its base SHA; Migration uses `base_ref`). It skips the
  native suite and the upgrade only when every changed path is on the fast path:
  `frontend/**`, `docs/**`, `*.md`, `crm/locale/*.pot`, and `crm/locale/*.po` diffs
  that only add lines. A changed or removed translation runs everything, because
  server tests assert Spanish text (`test_pipeline_labels`, `test_form_wiring`).
  Python, hooks, patches, doctypes, fixtures, `crm/public`, `crm/www`, `pyproject.toml`
  and CI files always run Server and Migration. A run on `doco-dev` itself, an unknown
  base or a git failure runs everything.
- **Gates.** Each of the two workflows ends with an always-run job, `Server gate` and
  `Migration gate`; they are the required checks in devflow's `repos.toml`.
  `scripts/ci/gate.py` passes a job that the change did not need only when it was
  skipped, and fails a needed job that did not succeed, a failed `Changed scope`, or a
  failed `Undefined names (ruff)`. A cancelled run skips its gate, so devflow
  re-dispatches it instead of reading red. The workflows have no `paths` filter: a
  workflow that never starts leaves no check to read.
- **What a frontend-only lane still runs.** Linters (pre-commit on all files,
  Semgrep), Frontend (ESLint, Oxlint, production build with
  `verify-pwa-build.mjs` and the `verify-bundle-budget.mjs` CSS/route budgets, unit
  tests), `Undefined names (ruff)`, both gates, and devflow's local jargon guard.
- **Shell APIs (ERPNext + doco image).** A third Server job, in parallel with the
  native suite, runs when the diff touches `crm/api/shell*`, `crm/api/documentos*`,
  `crm/tests/test_shell*`, `crm/tests/test_documentos*`, the shell contracts registry,
  `scripts/ci/**`, `server-tests.yml` or the native setup action, or a test module
  with a line starting `# ci: shell-apis` (that marker also adds the module to the
  job). It runs `CRM_CI_MODE=shell`: the same install as Server (ERPNext, doco and the
  rest of the app graph), the shell contracts registry copied next to CRM, then only
  those modules. It uses `SHELL_CI_IMAGE` in `server-tests.yml`, a newer
  `doco-bench` release digest than `CRM_CI_IMAGE`: the audited Server image predates
  the doco services the shell boots from, so 40 shell tests skip there (run
  39161222934). The job summary counts passed, failed and skipped tests. doco is
  private and crm is public: the job cannot clone doco's mainline without a read
  token, and the self-hosted runner never serves public repositories. Marco chose
  (2026-10-18) the image only, with no token: bump `SHELL_CI_IMAGE` to the newest
  `doco-bench` release digest after each release.
- **The Shell APIs job is advisory for now.** On the all-lanes-20261014 image its
  doco reads `Employee.leave_approver` without HRMS, and 55 of the 72 shell tests
  error on it (run 39166087010); doco fixed it afterwards (6e8b250). Until a release
  image carries that fix, the job has `continue-on-error` and the Server gate passes
  `shell=…:advisory` (reported, never failing). To make it gate: bump the digest, see
  the job green, then drop both.

## Gates

- **Server** installs the candidate and executes the complete discoverable
  full-app native CRM suite with coverage. No full-app tests are excluded; the
  three mandatory standalone tests run in the separate cohort described above.
  The pinned, hash-checked
  coverage wheel is downloaded on the runner and installed offline in the test
  container; the image does not need developer-only packages. A missing coverage
  XML fails the job. Every successful run publishes a coverage artifact. The
  existing narrow undefined-name gate remains separate and runs on every change.
  Fast-path lanes skip the suite (see above).
- **Migration** checks out the actual PR base SHA from this fork, installs that
  CRM revision and its native dependencies, and persists an organization, lead
  and linked activity. It replaces CRM with the candidate, checks both cached
  and rebuilt module maps for orphan risks, then runs native `bench migrate`.
  Afterwards it verifies installed apps, all original DocTypes, record values
  and links, and a write through the upgraded controller. It also rejects
  unexpected Deleted Document entries and runs the complete candidate CRM suite.
  The full native and migration logs, both revision IDs, pre-upgrade baseline,
  individual deletion identities and available metadata postconditions are retained even on
  verification failure. Artifact collection is restricted to `.ci-results/`; its
  hidden directory is explicitly included, not other hidden checkout files.
  Manual dispatch requires a distinct `base_ref` (default `doco-dev`); comparing
  a revision with itself fails instead of masquerading as an upgrade. Fast-path
  lanes skip the upgrade (see above).
- **Frontend** runs the existing full lint, production build and unit test gates.
  `yarn test:coverage` creates `frontend/coverage/lcov.info`; that artifact is
  collected on every successful test run and its absence is an error.
- **Linters** retains all-file pre-commit and Semgrep checks. Commitlint checks
  PR base through head. Manual dispatch uses the merge base with `base_ref`
  (default `origin/doco-dev`), or the latest commit when dispatched on the base
  itself; it never receives empty PR-only refs.
- **CRM release CI** runs frontend tests/build and the same complete native
  environment for reviewed release branches, tags and manual dispatch.

Codecov publication retains its existing `develop` branch condition; coverage
collection and retained artifacts are independent of publication credentials.

Runner failure handling can be verified without a site or Docker:

```bash
python3 -m unittest discover -s scripts/ci -p 'test_*.py' -v
```

Record the exact CRM revision, CI run URLs, approved base image digest and final
Muelle image digest in the release receipt. An older green run or image build
alone does not prove that the current source passed.
