# CRM identity brief

Date: 2026-09-26. Status: **name confirmed by the user: CRM**. Distinct icon and unified tenant-aware identity are in implementation; visual/PWA acceptance remains required.

Marco requested a distinct identity because the fork differs substantially from Frappe CRM, then confirmed that the name should stay **CRM**. Earlier Muelle Ronda/Ventas/Clientes proposals are superseded. Keep Muelle suite context and accurate upstream attribution. See the [product roadmap](CRM_PRODUCT_ROADMAP.md) and [acceptance contract](CRM_ACCEPTANCE.md).

## Naming decision

- Product and short navigation label: **CRM**.
- Suite attribution: Muelle; display separately where useful.
- Optional descriptive copy: Ventas y clientes.
- Tenant name/logo/favicon/accent remain intentional overrides.

## Icon direction

**Concept: an open relationship loop with a shared junction.** Two confident rounded strokes form an asymmetric loop around a small open centre; their meeting point suggests the handoff from conversation to an agreed next action. Give the silhouette a recognisable break rather than an arrowhead, so it does not read as refresh/sync. Keep the mark legible without initials or a wordmark.

Prepare two optical versions for the confirmed name: a simplified small mark for 16–24px and a full mark for launcher/PWA sizes. Deliver editable SVG, monochrome/light/dark treatments, transparent raster exports, favicon, Apple touch icon and 192/512 maskable icons. Test both the whole silhouette and its central negative space at actual size.

No drawing is accepted by this brief alone. The selection deliverable is a contact sheet showing the mark beside the existing POS/Taller/Mercado icons, on both themes, in the active desktop rail, phone header, Desk launcher and installed app icon. Choose one direction before generating the final asset set.

## Visual system

Proposed starting direction, subject to contrast and suite review:

| Token | Value | Use |
| --- | --- | --- |
| Product petrol | #0F6B78 | Product mark and primary emphasis |
| Deep petrol | #084C56 | Strong/pressed treatment |
| Pale petrol | #E8F3F5 | Quiet selection/background |
| Ink | #192B33 | Main light-theme text |
| Muted ink | #52636B | Secondary text |
| Canvas | #F7FAFB | Light working surface |

Use the suite's semantic surface/ink/outline tokens for application UI and add accessible dark equivalents; these proposed swatches are not a wholesale CSS replacement. Derive normal/soft/strong tenant accents together, rather than leaving hardcoded green highlights.

Typography: retain the existing Frappe UI body family for compatibility during rebrand, with a deliberate hierarchy for record identity, next action, monetary value and secondary metadata. An identity change should not trigger an unrelated font migration. Keep the wordmark compact and sentence-case, with no decorative all-caps labels.

The distinctive element is the mark. The working UI should be quiet: aligned lists, readable records, clear primary actions and purposeful spacing. A recognisable icon does not justify turning every screen into a brand showcase.

## Product and tenant identity

Product defaults identify CRM, part of Muelle. Existing tenant name/logo/favicon/accent settings remain intentional overrides; show the tenant's business identity separately where there is room and keep the product visible in About/help.

Implement one identity resolver and shared mark component, reusing the current settings service. Handle unavailable settings, invalid image, missing overrides and settings updates consistently. Never overwrite tenant custom values during migration.

Confirmed source defects to address with this slice:

- `getSettings().brand` is a reactive object, but desktop/mobile shells read `brand?.value?.name`, falling back to CRM.
- The desktop rail renders a literal C; the phone sidebar renders an initial instead of the existing configured-logo component.
- Tenant accent handling updates `--brand`, while soft/strong values and some active states remain independently green.

## Surface inventory and implementation checklist

| Surface | Source anchors | Required result |
| --- | --- | --- |
| App metadata and launcher | `crm/hooks.py` | New display name/description/mark; existing app identity and permission checks retained |
| Desktop/mobile navigation | `frontend/src/components/Layouts/DocoNavRail.vue`, `Mobile/MobileSidebar.vue`, `BrandLogo.vue`, `stores/settings.js` | One effective name/logo resolver; tenant overrides work on both shells |
| Browser and installed PWA | `frontend/index.html`, `frontend/vite.config.js`, `frontend/public/favicon.png`, `crm/public/manifest/` | Titles, shortcuts, maskable/Apple icons and splash assets agree; old installations upgrade coherently |
| Public app/form entry | `crm/www/crm.py`, `crm/www/crm_form.html` | Consistent product identity without changing form authority or URLs |
| About, help and permissions | `Modals/AboutModal.vue`, `pages/NotPermitted.vue`, `pages/PersonaForm.vue` | Fork/product/support identity is clear; upstream attribution retained |
| Invitations | `crm/fcrm/doctype/crm_invitation/crm_invitation.py`, `crm/templates/emails/crm_invitation.html` | New default identity in preview/subject/body; existing invitations continue to work |
| Desk workspace | `crm/fcrm/workspace/frappe_crm/frappe_crm.json` | Visible title/icon changes safely; links and workspace identity remain compatible |
| Documentation/assets | `README.md`, `.github/logo.svg`, package description and screenshots | Fork's features/setup/support are distinguished from upstream; no false hosting links |
| Sibling entry points | Taller and Mercado `frontend/src/components/AppMenu.vue`; inventory Doco/Boat/storefront discovery | Launchers use the selected product identity with the same routes and access checks |

Keep technical identifiers `crm`, `FCRM`, existing DocTypes, Python paths, endpoint names, `/crm`, `/crm-form`, database records and external callbacks stable in this phase. Changing a Workspace label is separate from renaming its record. Preserve license notices, copyright and upstream provenance; About can say “Built on Frappe CRM” while clearly identifying this product and its maintainers.

## Acceptance and rollout

- Review selected name/mark in real-size surface previews, including 16px favicon, 24px navigation and 192/512px installed icons.
- Check fresh default, existing default and tenant-customised branding; bad/missing image fallback; light/dark; long translated name; screen-reader name; keyboard focus.
- Check existing bookmarks, Desk links, public forms, invitation accept flow and PWA update/relaunch without data/session loss.
- Scan user-facing default strings/assets for accidental Frappe CRM branding; keep deliberate attribution and technical compatibility names.
- Build and inspect the actual served assets. Record source/CI, asset and deployment evidence separately. Email tests use preview/blocked transport, not customers.
- Publish product/site/app changes only within the current authorised release scope.

Name selection is complete. Visual implementation requires the same real-surface acceptance as other product changes; sales-model and correctness work continues in parallel.
