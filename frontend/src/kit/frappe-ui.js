// `frappe-ui` as crm imports it: the real package (frappe-ui-real, an alias of
// node_modules/frappe-ui past this one, vite.config.js and vitest.config.js)
// with the kit's Material 3 Button and Switch in place of its own. A named
// export here wins over the same name from `export *`, so every
// `import { Button } from 'frappe-ui'` gets the kit's.
export * from 'frappe-ui-real'
export { default as Button } from '@/components/ui/Button.vue'
export { default as Switch } from '@/components/ui/Switch.vue'
