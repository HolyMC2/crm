# Inbox: Artículos y ventas

The Artículos tab in Inbox and Deal 360 uses persistent ERP documents. The chat
catalog picker remains available separately for composing messages.

## Operator workflow

- Add catalog items with quantities, including optional out-of-stock results.
  Save into the deal's latest draft quotation, creating one if needed. Search
  selections survive subsequent searches. ERP pricing and validation remain authoritative.
- Select a quotation, order, invoice or POS invoice to see its item table.
  Draft quotation quantities can be changed and lines removed.
- Create a sales order after an explicit confirmation that submits the quotation.
  The resulting order is a draft; confirm it in ERP before creating an invoice.
- Create an invoice draft from a confirmed order. Retrying reuses an existing draft
  against that order. This action never submits the invoice.
- Link an unassigned order/invoice draft belonging to a customer linked to the deal.
  Cross-deal source chains and reassignment are rejected server-side.
- Open repair intake directly on tenants with Taller. Existing intake validation,
  permissions and repair workflows are reused.

## Scope and accounting

The history belongs to the selected deal. It uses document creation dates and
current statuses, including directly linked cancelled documents. Payments use
their accounting date. Type filters and ascending/descending order are available.

Summary scope switches between the selected deal and all linked customers across
conversations. Customer-wide queries retain ERP read permissions. Totals cover
posted invoices, include returns, exclude drafts, and separate company/currency.
Consolidated POS invoices are not counted a second time. Payments are history
detail; invoice outstanding balances determine paid/outstanding statistics.

Lead conversations explain that a deal is needed before saving ERP documents.
The tenant's sales-document feature flag and existing sales-role gates apply.

## Implementation and rollout

- CRM: `ItemWorkspace.vue`, `WorkspaceItemPicker.vue`, shared `DealWorkspace.vue`.
- Marketing: `api/item_workspace.py`; existing quotation API remains authoritative.
- Doco: `docoutils/customers.py` resolves valid tenant sales defaults without
  assuming English names or selecting an ambiguous classification.
- Marketing's `install.ensure_customer_deal_link()` creates the upstream-compatible
  `Customer.crm_deal` field only when missing. It preserves existing metadata and
  is included in install/migrate custom-field synchronization.

The lab rollout also repaired Mumu's missing customer bridge and empty Selling
Settings defaults using its existing Individual group and Mexico territory.
Production rollout requires all three app changes plus checking these prerequisites
on each target tenant. Do not enable the parallel native ERPNext CRM bridge.

Validation: `frontend/tests/unit/itemWorkspace.test.js`,
`doco_marketing.tests.test_item_workspace`, and
`doco.docoutils.test_customer_tree_defaults`. Backend workflow tests use synthetic
non-stock items and roll back all documents; they do not submit invoices or send messages.
