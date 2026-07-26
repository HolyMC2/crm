# Upstream-file touches ledger (spec 8.5)

Every pre-existing `frappe/crm` file this fork modifies, so each upstream rebase
reviews a KNOWN list instead of discovering conflicts. New doco-owned files
(`components/doco/*`, `pages/*View.vue`, `composables/*`, `utils/*` additions,
`doco_marketing` app) are NOT listed — they can't conflict.

Regenerate the raw list any time:

```bash
base=$(git merge-base doco-dev upstream/develop)
git diff $base..doco-dev --name-only | while read f; do
  git cat-file -e $base:"$f" 2>/dev/null && \
    echo "$f $(git diff $base..doco-dev --numstat -- "$f" | awk '{print "+"$1" -"$2}')"
done
```

Review rule at each rebase: HIGH files get a line-by-line conflict review;
LIGHT files usually auto-merge — verify the doco lines survived, nothing more.

## HIGH — heavy rewrites, expect conflicts

| File | Δ | Why touched |
|---|---|---|
| frontend/src/components/Activities/WhatsAppBox.vue | +728 −13 | Voice notes, camera attach, composerDraft handoff, suggested replies, quick-bar fold, template chip |
| frontend/src/components/Activities/Activities.vue | +606 −20 | Superset reuse seams: showWhatsappTemplates defineModel, WhatsApp-scoped tabs, doco slots |
| crm/api/whatsapp.py | +380 −51 | Provenance fields, routing, review-gated send path, media handling |
| frontend/src/components/Mobile/MobileSidebar.vue | +305 −88 | Rail-language reskin, dark toggle, apps switcher, settings mount, badges |
| frontend/src/components/Activities/WhatsAppArea.vue | +253 −30 | Bubble layout fixes (absolute media width, basis-full meta row), provenance, sticky header hide |
| frontend/src/components/Modals/DealModal.vue | +243 −12 | doco capture fields + validations |
| frontend/src/router.js | +106 −24 | doco routes (/inbox /workload /campaigns …), landing flip, dropped upstream aliases |
| frontend/src/utils/dialogs.jsx | +106 −1 | confirmDialog/inputDialog central primitives |
| crm/integrations/twilio/twilio_handler.py | +103 −17 | Telephony agent wiring, SIP, call-log lifecycle |
| frontend/src/index.css | +138 −0 | brand vars, press/skel/sheet-in/page-in/cv-row/cb-token utilities, color-scheme |

## MEDIUM — real logic, usually mergeable

| File | Δ | Why touched |
|---|---|---|
| crm/api/dashboard.py | +53 −56 | Reports backend reuse (manager gating) |
| crm/permissions/org_hierarchy.py | +62 −15 | Shop scoping / row-level perms |
| crm/integrations/twilio/api.py | +72 −2 | Telephony endpoints |
| crm/locale/es.po | +80 −0 | es-MX additions (recompile MO after rebase!) |
| frontend/src/components/ViewControls.vue | +60 −6 | Column config hooks |
| frontend/src/main.js | +41 −0 | Build-id staleness guard + SW update (scope-explicit) |
| frontend/vite.config.js | +51 −2 | PWA manifest/workbox importScripts, build-id emit |
| frontend/src/components/Layouts/MobileLayout.vue | +71 −2 | Offline strip, outbox strip, install nudge, side-scroll choke point (min-w-0 — do NOT lose) |
| crm/fcrm/doctype/crm_deal/crm_deal.py, crm_lead.py, crm_call_log.py | ~+20 each | doco hooks/fields |
| crm/tests/test_whatsapp.py | +34 −18 | Provenance/routing tests |
| frontend/src/components/Activities/DataFields.vue | +30 −0 | doco fields |
| frontend/src/stores/statuses.js | +21 −3 | status-type helpers |
| frontend/src/components/Telephony/TwilioCallUI.vue | +20 −1 | SIP tweaks |

## LIGHT — additive few-liners (verify doco lines survive, that's all)

.gitignore, AGENTS.md, crm/api/doc.py (+3), crm/hooks.py (+2),
crm/integrations/api.py, crm/patches.txt, fcrm_settings.json (+brand fields),
crm_telephony_agent.{json,py}, crm_twilio_settings.{json,py},
frontend/index.html (viewport comma fix — do NOT lose), frontend/package.json,
frontend/auto-imports.d.ts, App.vue (+8: theme boot, prefetch), DesktopLayout.vue,
CallLogDetailModal.vue, LeadModal.vue, CallArea/CommentArea/EmailArea/NoteArea/
ActivityHeader.vue (activity-header class, ±3), pages/Deal.vue, Deals.vue, Lead.vue,
socket.js, stores/session.js, stores/settings.js (brand_color boot), utils/index.js,
utils/numberFormat.js, vitest.config.js, yarn.lock, patches/v1_0/*provenance*.

Last regenerated: 2026-07-26 against merge-base `91996b8f`.
