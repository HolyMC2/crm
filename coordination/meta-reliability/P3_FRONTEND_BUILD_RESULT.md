# P3 CRM isolated frontend build repair

The failed PWA build was dependency installation drift, not a source or lockfile
error. The prior candidate symlink exposed shared `crm/frontend/node_modules`.
Its `minimatch@10.2.6` declares `brace-expansion@^5.0.8`, but Node resolved the
shared root `brace-expansion@2.1.0`; that package exports a function without the
named `.expand` expected by minimatch. Workbox's glob step therefore produced
only one precache entry and the repository's verifier correctly rejected it.

The existing `frontend/yarn.lock` already pins both `brace-expansion@2.1.0` for
older minimatch and `brace-expansion@5.0.9` for minimatch 10. No manifest, lockfile,
source or shared dependency-tree change was necessary.

Using Node v24.20.0 and cached Yarn Classic 1.22.22, in the candidate `frontend/`:

```sh
node /home/holymc2/.npm/_npx/c80f0d1db4abac6f/node_modules/yarn/bin/yarn.js install --frozen-lockfile --offline --non-interactive
node /home/holymc2/.npm/_npx/c80f0d1db4abac6f/node_modules/yarn/bin/yarn.js build
```

The offline install used the existing Yarn cache; it downloaded nothing from a
registry. The first sandboxed attempt reached esbuild's binary check and failed
with `spawnSync /usr/bin/node EPERM`. The identical offline/frozen install passed
with local sandbox escalation. SHA-256 checks confirm `package.json` and
`yarn.lock` stayed byte-for-byte unchanged.

The candidate now has an ordinary isolated `node_modules` directory. Its
minimatch resolves v5's `brace-expansion/dist/commonjs/index.js` with a callable
`expand` export. The shared tree was inspected read-only and remains unchanged.

**Build passed (exit 0):** Vite production compilation completed in 48.41s;
Workbox generated 182 precache entries (17753.18 KiB); `copy-html-entry` completed;
`verify-pwa-build.mjs` confirmed all 178 required JavaScript/CSS assets are
precached. Total build command time was 52.01s. Existing nonfatal brand-icon,
peer/resolution and large-chunk warnings remain unrelated to this repair.

Logs: [frozen install](p3-frontend-frozen-install.log), [production build](p3-frontend-frozen-build.log).
Original failure: `/tmp/p3-crm-frontend-build.log`.

The full existing `yarn test:run` suite was then rerun once against the corrected
frozen dependency tree: **46 test files / 475 tests passed**, 4.36s test-runner
duration, 5.46s command duration. Log: [p3-frontend-frozen-tests.log](p3-frontend-frozen-tests.log).

The source-evidence component was reviewed in its existing Inquiry detail context. It uses Vue text interpolation, exposes no action or consent flag, and keeps the immutable original respondent separate from the editable people list. A Chromium rendering of the real component at 375px with 600–1,000-character evidence values had no horizontal overflow and no injected or interactive nodes. This is component layout evidence; live Meta delivery remains a separate rollout gate.
