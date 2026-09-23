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
  The full native and migration logs and both revision IDs are retained.
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
