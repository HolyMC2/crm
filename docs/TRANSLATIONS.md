# Translations: only the keys this build uses, from a versioned script

`/crm` used to load every installed app's dictionary (39,388 keys, 3.2 MB raw, 969 KB gzip for
es-MX on doco-mirror) on every page load, and revalidated it each time. It now loads the keys the
build can ask for: 14,445 keys, 871 KB raw, 269 KB gzip on the same site (2026-10-25, including
the DocTypes that named DocTypes link to). Each version of that file is cached by the browser for a
year.

## How the key set is chosen

1. **Build.** `frontend/scripts/translation-keys.mjs` is a Vite plugin. It emits
   `crm/public/frontend/translation-keys.json`, which holds every string literal of every module in
   the build, including compiled templates, frappe-ui and vendored packages. It reads them with the
   bundler's own parser (`this.parse`), so it adds no dependency. Only strings that are already
   public in the bundle go into this file.
2. **Check.** `yarn build` then runs `frontend/scripts/verify-translation-keys.mjs`. It reads every
   `__()` call in the sources of the modules the build contains. The build fails if a literal
   message or context is missing from the file. The check uses its own extractor, separate from the
   plugin: a scanner finds where each call ends and vite's `parseAst` reads its arguments. Tests: `frontend/tests/unit/translationKeys.test.js`.
3. **Server.** `crm/shell_dictionary.py` keeps the dictionary keys that are in that list and adds
   the strings that reach `__()` only at runtime:

   - every DocType name;
   - the labels, descriptions and Select options of the DocTypes the build names, and of the
     DocTypes their Link, Table and Table MultiSelect fields point to, one level deep (child
     tables, FieldLayout labels, status values the server sends, and the fields of a "create new"
     dialog for a linked record such as a Territory);
   - record names of translated DocTypes, and of non-child DocTypes the build names that have at
     most 500 records (stages, lead sources);
   - string literals in crm's own Python, which sends some English for the client to translate
     (`api/workload.py`). Tests and patches are skipped.

   It also keeps `message:context` keys when both parts are in the set. Values are copied
   unchanged, so every key that is shipped translates exactly as it did before.

## Serving and caching

- `crm.html` loads `/api/method/crm.www.crm.translations?v=<version>` as a `defer` script ahead of
  the module entry. The version is the first 16 hex characters of the payload's sha256 and comes from
  `context.translations_version`.
- A matching `v` is answered with `private, max-age=31536000, immutable`. Any other `v` (an old tab,
  or `""`) gets `private, no-cache` with an ETag.
- The server cache is the redis hash `crm_shell_dictionary`. Its fields are keyed by
  `<lang>|<sha1 of translation-keys.json>|<fingerprint of the user's Translation records>`.
  - Saving a Translation changes the fingerprint.
  - A new build changes the digest.
  - `bench migrate` clears the cache (`after_migrate` also calls `shell_dictionary.clear`).
  - Saving or deleting a DocType, Custom Field or Property Setter clears it, so a renamed label or a
    new field is in the set on the next page load.
  - The hash expires a day after its first field, so a new record name joins the set within a day.
- Building the key set reads DocType meta and the app's Python, which takes 2 to 5 s cold. So it runs
  as a background job (`shell_dictionary.build`, queue `short`) and never inside a page request.
  Until the job finishes, the page links `?v=` and gets the whole dictionary, as it did before this
  change.
- A queued build sets a marker that expires after 300 s (`QUEUED_SECONDS`), and the marker is
  removed when the job ends or `frappe.enqueue` raises. A lost job or a down queue delays the
  reduced set by five minutes at most, never by hours.

## Fallbacks

- A key outside the set: `translate()` returns the English source string. It never crashes.
- No `translation-keys.json` (the vite dev server, an unbuilt tree): the whole dictionary is served.
  Outside developer mode this is logged once per worker as a warning, since a deployed site should
  always have the file.
- `get_all_translations` fails: the page request serves an empty dictionary and logs the error. The
  background build stores nothing in that case, so no empty payload is cached or hashed, the next
  page load gets the whole dictionary and queues the build again.
- The version cannot be computed: the page links `?v=` and still renders.

Design, measurements and the live key capture are in muelle-host `shell-program/evidence/F20/`.
POS-Awesome uses the same rules (`posawesome/posawesome/api/translations.py`).
