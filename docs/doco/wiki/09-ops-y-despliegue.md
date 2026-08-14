# 09 — Ops y despliegue del bundle de la SPA

> English is fine here — this is an operator document. Verified against
> `crm/frontend/package.json`, `crm/.gitignore`, `muelle/scripts/dev-refresh.sh`
> and `muelle/scripts/crm-push-prod.sh` at 2026-08-03.

---

## 1. Why the CRM deploys differently from every other app

Every other Frappe app in this stack ships by `git pull` on prod. **The CRM
cannot.** Both of its Vite build outputs are gitignored (`crm/.gitignore` L9-10):

| Artifact | What it is |
|---|---|
| `crm/crm/public/frontend/` | the hashed bundle — `assets/index-<hash>.js`, `index-<hash>.css`, chunks |
| `crm/crm/www/crm.html` | the SPA entry HTML, which **names that hash** |

So `git pull` on prod updates neither. `prod-refresh.sh crm` alone **cannot**
deploy a CRM frontend change.

Worse: the two artifacts are **coupled**. Syncing one without the other points
the entry at a hash that is absent from the bundle → 404 on the entry chunk →
**white page at `/crm`**. That is not hypothetical; it happened on 2026-06-03.

That coupling is the entire reason `crm-push-prod.sh` exists.

---

## 2. The build

`frontend/package.json` scripts:

```jsonc
"dev":             "vite",
"build":           "vite build --base=/assets/crm/frontend/ && yarn copy-html-entry",
"copy-html-entry": "cp ../crm/public/frontend/index.html ../crm/www/crm.html",
"test":            "vitest",
"test:run":        "vitest run",
"test:coverage":   "vitest run --coverage"
```

Note that `build` is what couples the two artifacts: it emits the hashed bundle
**and then** copies the entry HTML that names it. Running `vite build` alone
leaves a stale `crm.html` — never do that.

On the lab host, drive it through the stack helper so the assets also land on
the shared volume and the proxy cache is cleared:

```bash
cd ~/muelle-host/muelle
./scripts/dev-refresh.sh crm                    # build + asset-sync + restart py + proxy
./scripts/dev-refresh.sh crm --no-restart-py    # pure-frontend iteration
```

`dev-refresh.sh` detects a Vite SPA by the presence of
`<app>/frontend/package.json` with a `build` script, and runs the repo's
package manager (`yarn` here, from `frontend/yarn.lock`). It deliberately
swallows a failing SPA build with a warning instead of aborting the whole batch
— **so check its output**, a silent CRM build failure will not stop the script.

---

## 3. The prod deploy

```bash
cd ~/muelle-host/muelle
./scripts/crm-push-prod.sh --dry-run          # preview: build/staleness/gate, no sync
./scripts/crm-push-prod.sh --yes              # deploy the current lab build
./scripts/crm-push-prod.sh --build --yes      # rebuild on lab first, then deploy
./scripts/crm-push-prod.sh --build --strict --yes   # stale bundle = hard failure
```

It refuses to touch prod without `--yes` (or `--dry-run`).

### 3.1 What it does, in order

1. **(optional `--build`)** build the SPA on lab via `dev-refresh.sh crm --no-restart-py`.
2. **Staleness check** — if any file under `frontend/src` is newer than the
   built entry, the bundle predates your edits and you would ship the old UI.
   Warns; `--strict` turns it into exit 3. Skipped after `--build`.
3. **Consistency gate** — every `index-<hash>.js|css` named by `crm.html` must
   exist in the bundle. This is the invariant the white page violated. Exit 4.
4. **rsync BOTH artifacts together** — bundle (with `--delete`) and `crm.html`,
   in the same step. Never one without the other.
5. **Remote** `prod-refresh.sh crm --no-restart-py --yes` — re-runs the gates on
   prod, copies assets into the named volume, clears cache, restarts frontend +
   proxy, smokes.
6. **External smoke** — the entry `.js` and `.css` must return 200 on **both**
   tenants (`ventas.docomexico.com`, `ventas.mumulenceria.com`).

### 3.2 Exit codes

`0` ok · `1` args · `2` build · `3` staleness under `--strict` · `4` gate ·
`5` rsync · `6` remote · `7` smoke.

### 3.3 Order of operations with git

Frontend-only rolls need no `--restart-py`. But **commit and push the branch
prod tracks BEFORE deploying the bundle**, so the Python source prod pulls
matches the bundle you built. A bundle newer than its source is how you get an
SPA calling endpoints that do not exist yet on prod.

---

## 4. Tests

### 4.1 Frontend

```bash
cd frontend
yarn test:run       # single run
yarn test           # watch
```

- **32 vitest files** under `frontend/tests/unit/` (plus
  `tests/unit/social/`). Upstream ships none — every one is fork-owned.
- Only **pure logic** is unit-tested: the extracted helpers under `src/utils/`
  and the composables' pure parts. There are no Vue component tests.
- The house rule from `P2_WORKPLAN.md`: any new pure logic lands with a vitest
  file, and the whole suite must be green before commit.
- **Known vitest-4 trap** (documented in `tests/unit/outbox.test.js`): never
  return a rejected promise through a `vi.fn()` in a file that has mock hooks —
  use a plain behavior function instead.

### 4.2 Playwright

7 spec files in `frontend/tests/social/` (`smoke`, `calendar`, `heatmap`,
`composer`, `evergreen`, `mentions`, plus `helpers.js`), config at
`frontend/playwright.config.js`, environment template at `frontend/.env.example`.
These are the authenticated social-suite e2e runs (first green run: commit
`520375a7`).

### 4.3 Python

```bash
docker compose exec -T backend bench --site <site> run-tests --app crm
```

Fork-owned or fork-extended modules under `crm/tests/`:
`test_whatsapp.py`, `test_whatsapp_routing.py`, `test_conversation_enrich.py`,
`test_integrations.py`.

---

## 5. Known operational traps

| Trap | Symptom | Fix / guard |
|---|---|---|
| Entry/bundle hash desync | White page at `/crm` | The gate in step 3; never rsync one artifact alone |
| Stale bundle shipped | Prod shows yesterday's UI | Staleness check (step 2); use `--build` |
| Silent lab build failure | `dev-refresh.sh` prints a warning and continues | Read the output; the script does not abort on SPA build failure |
| Proxy serves a stale upstream IP | 502 / old assets after `docker compose up -d` | Use `muelle-restart.sh proxy --reason "stale upstream"`; never restart services directly |
| `bench build` inside the prod container | Broke prod on 2026-05-25 | Never build in prod — ship a pre-built bundle |
| Service worker caches the old app | Users keep seeing the fixed bug | The build-id staleness guard + SW update check in `main.js` (see `08-frontend-rediseno.md`) |
| Cold-load 429 | First load fails some asset requests | Known: the proxy `api_zone` rate limit vs the SW precache burst. Item 3.5 in the excellence spec. **TODO-VERIFY** whether the proxy template carve-out has landed — it is infra-side, not in this repo |

---

## 6. Where prod lives

Deployment topology is not owned by this repo. Short version, for orientation:
lab (`lab.xolo…`) is where you build and test, `contavm` is prod, and the CRM
serves two tenants. The authoritative description is in
`~/muelle-host/CLAUDE.md` and `muelle/ARCHITECTURE.md`; the deploy script reads
its targets from env overrides (`REMOTE`, `REMOTE_CRM`, `REMOTE_MUELLE`,
`CRM_DIR`, `TENANTS`) precisely so no host names are hardcoded in the repo.
</content>
