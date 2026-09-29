# Frappe UI Starter

This template should help get you started developing custom frontend for Frappe
apps with Vue 3 and the Frappe UI package.

This boilerplate sets up Vue 3, Vue Router, TailwindCSS, and Frappe UI out of
the box.

## Usage

This template is meant to be cloned inside an existing Frappe App. Assuming your
apps name is `todo`. Clone this template in the root folder of your app using `degit`.

```
cd apps/todo
npx degit netchampfaris/frappe-ui-starter frontend
cd frontend
yarn
yarn dev
```

In a development environment, you need to put the below key-value pair in your `site_config.json` file:

```
"ignore_csrf": 1
```

This will prevent `CSRFToken` errors while using the vite dev server. In production environment, the `csrf_token` is attached to the `window` object in `index.html` for you.

The Vite dev server will start on the port `8080`. This can be changed from `vite.config.js`.
The development server is configured to proxy your frappe app (usually running on port `8000`). If you have a site named `todo.test`, open `http://todo.test:8080` in your browser. If you see a button named "Click to send 'ping' request", congratulations!

If you notice the browser URL is `/frontend`, this is the base URL where your frontend app will run in production.
To change this, open `src/router.js` and change the base URL passed to `createWebHistory`.

## Build memory

`yarn build` puts a default Node heap of 4096 MB at the FRONT of `NODE_OPTIONS`. When the
same V8 flag appears twice, the later one wins, so a heap the caller already set takes
precedence:

- muelle's image bake (`scripts/lib/build_assets.py`, 3072 MB) and Frappe's own
  `bench build` value win over the default;
- with nothing set (plain `yarn build`, devflow `heavy`, CI), the build gets 4096 MB. Under
  any memory cap, Node's own default drops to about 2.2 GB, which is too small.
- `CRM_BUILD_HEAP_MB` changes the default.

Measured 2026-09-28: 2560 MB fails and 3072 MB builds. The bake's 3072 therefore has little
headroom; raise it in muelle's bake when the bundle grows. Keep any heap below the build
environment's memory cap, so the build fails with a clear heap error instead of pushing the
machine into swap.

## Resources

- [Vue 3](https://v3.vuejs.org/guide/introduction.html)
- [Vue Router](https://next.router.vuejs.org/guide/)
- [Frappe UI](https://github.com/frappe/frappe-ui)
- [TailwindCSS](https://tailwindcss.com/docs/utility-first)
- [Vite](https://vitejs.dev/guide/)
