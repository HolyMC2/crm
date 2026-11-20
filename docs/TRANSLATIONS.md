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

   - every DocType name except child tables' (a notification or a link names its DocType; a
     child table is never shown by name);
   - the labels and Select options of the DocTypes the build names, and of the DocTypes their
     Link, Table and Table MultiSelect fields point to, one level deep (child tables, FieldLayout
     labels, status values the server sends, and the fields of a "create new" dialog for a linked
     record such as a Territory). Field descriptions are not shipped: the UI shows them as they
     are, and they were a fifth of the payload;
   - record names of non-child DocTypes the build names that have at most 500 records (stages,
     lead sources), and of translated DocTypes among the named ones and their link targets (a
     country list the whole site translates is vocabulary only where a form shows it);
   - string literals in crm's own Python, which sends some English for the client to translate
     (`api/workload.py`). Tests and patches are skipped.

   It also keeps `message:context` keys when both parts are in the set. Values are copied
   unchanged, so every key that is shipped translates exactly as it did before.

## Serving and caching

- `crm.html` loads `/api/method/crm.www.crm.translations?<query>` as a `defer` script placed after
  the module entry, so the entry evaluates while the dictionary downloads; `main.js` waits for the
  script (`utils/translationsReady.js`, 10 s cap) before mounting, so the first render reads it.
  The query is `v=<version>` (`context.translations_query`), or on the landing route the first part
  (below). The version is the first 16 hex characters of the payload's sha256
  (`context.translations_version`).
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

## The first part: the landing route does not wait for the whole set

The whole set is about 320 KB gzip, more than the app's entry. On a cold load over Slow 4G it came
in last and held the mount (go-live audit 11-19, finding 79). So every built set also carries a
**first part**: the shipped keys the first screen can render, 24 KB gzip and 1,923 keys on the lab
(2026-11-20) against 320 KB and 18,759 for the whole set.

- **Build.** `translation-keys.json` also lists `first`: the literals of the modules of the entry
  chunk, of the chunks that hold a `FIRST_ROUTE` module (`translation-keys.mjs`: the shell, the
  desktop rail's bell, Hoy, the page every worker lands on, and the four «Primeros pasos» sheets
  abordo's welcome opens on Hoy with `/crm/hoy?paso=…`; matched by module, since a dynamic entry
  that shares its chunk has no facade module) and of every chunk they import statically. Other
  sheets and routes they load on demand are not in it. The build fails when a `FIRST_ROUTE`
  module is in no chunk, so a rename cannot silently empty the part.
- **Server.** `shell_dictionary.build` keeps, from the shipped set, the keys among `first` plus the
  record names of the small DocTypes the build names (`record_keys`: a deal's stage on Hoy; not the
  records of translated DocTypes such as every DocType name, countries or units, which tripled it),
  and a `message:context` key whose message is among them. It is stored and cached with the set (`p|` holds both, `fv|` the first part's
  version, the site file `first_version`/`first_payload`) and served by
  `translations?part=first&v=<its version>`, immutable like the whole set. Its script sets
  `window.translated_messages_first`, never `window.translated_messages`. A set cached or stored by
  the code before first parts has none: the page then links the whole set as before, and a
  `part=first` request gets the whole set revalidating.
- **Page.** `crm.py` links the first part only for `/crm` and `/crm/hoy` (`FIRST_ROUTE_PATHS`), as
  `?part=first&v=…` with `data-full="v=<whole version>"`; any other path, a deep link from a push
  for instance, links the whole set with an empty `data-full`, as before.
- **Client.** `utils/translationsReady.js` mounts once the first part has run (or at once with a
  whole set this browser kept), then loads the whole set as a script when the router's first route
  is in (`main.js`, at most 10 s later), makes it the config and keeps it in IndexedDB. It repaints
  (`applyNewer`) only when a render asked for a key the first part lacks and the whole set has
  (`translation.js` notes those misses while the first part is the config), so a warm load whose
  screen the first part covers does not repaint. Until the whole set is in, code the first part
  does not cover waits for it (10 s cap):
  - a navigation to a route outside `FIRST_ROUTE_NAMES` (`router.beforeEach(wholeDictionaryFor)`,
    so the route's chunk loads and evaluates after it, and a table a module translates once, such
    as `utils/callLog.js` `statusLabelMap`, reads the whole set; that table now translates on
    access anyway);
  - a sheet or dialog the first screen loads on a tap (`afterWholeDictionary` wraps the
    `defineAsyncComponent` loaders of `MuelleShell.vue`: Más, the palette, Escanear, the camera,
    the assistant, the layout and sections sheets; of `Hoy.vue`'s «Completar»; and of the bell's
    Ventas panel) and the idle warm-up of route chunks (`utils/prefetch.js`).
  A whole set this browser kept (after a deploy) is a whole set: nothing waits for the new one,
  which repaints when it arrives, also when IndexedDB answers after the first part already ran.
  A first part that fails starts the whole set at once.

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
