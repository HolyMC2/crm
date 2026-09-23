# CRM CI

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
`933fa2ca544ecf0857e37d6beb04bd052a602345`. Bump it with the release source lock.
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
CRM, Doco, Scanner Kit, POS Awesome, Doco Meta Catalog, Doco Marketing and Taller.
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

The synthetic migration fixture permits at most one deletion of each of nine
exact metadata identities, only with these owner and replacement checks:

- Scanner Kit's `Escáner` Workspace is removed by native orphan synchronization
  because its source is a fixture. Scanner Kit's `after_migrate` hook restores it;
  module, app, visibility and the `/scan` shortcut must match before and after.
- Mercado's six named Number Cards and `Mercado: Cambios de precio por día`
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
`ghcr.io/holymc2/doco-bench@sha256:0c78449c7e9ab01406b8c58f7459d071b50b67c23b61b89c0763a7abdb802171`,
from [Muelle source lock f27125fe](https://github.com/HolyMC2/muelle/blob/f27125fe18958a1a7910399aa16ad07b44b0af1e/build/source-lock.json).
Its owning sources are
[Frappe 988e54f3](https://github.com/frappe/frappe/blob/988e54f3c4c291e2077a83809663f123731abe76/frappe/model/sync.py),
[Scanner Kit bae4f299](https://github.com/HolyMC2/scanner_kit/blob/bae4f2991116bf17dd33bf0f2bae877eefb46b94/scanner_kit/install.py)
and [Mercado 02bfc46f](https://github.com/HolyMC2/mercado/blob/02bfc46fb2cef16f80c226edba51b92bc2dd8f8b/mercado/desk.py).
The probe checks source-file SHA-256 fingerprints and records the matching
revision evidence in the baseline. An image update changing those files requires
re-auditing this narrow metadata contract; a version label alone cannot waive it.

## Gates

- **Server** installs the candidate and executes the complete native CRM suite
  with coverage. No modules or tests are excluded. The pinned, hash-checked
  coverage wheel is downloaded on the runner and installed offline in the test
  container; the image does not need developer-only packages. A missing coverage
  XML fails the job. Every successful run publishes a coverage artifact. The
  existing narrow undefined-name gate remains separate.
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
  a revision with itself fails instead of masquerading as an upgrade.
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
