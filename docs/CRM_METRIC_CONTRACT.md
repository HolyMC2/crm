# CRM metric contract (v2, 2026-10-15)

One definition of the commercial numbers for every CRM surface. Source:
`crm/pipeline/queries/stages.py` (`metric_expressions`, `metric_query`, `deal_metrics`,
`deal_amounts`, `outlier_threshold`, `contract_info`). Owner: CRM program S1. Change it there,
bump `METRIC_CONTRACT_VERSION`, update this page and tell the consumers.

## Per deal

| Amount | Definition |
| --- | --- |
| expected | `expected_deal_value` when positive, else `deal_value` |
| recorded (`commercial_value`) | `deal_value` for a Won deal that has one, else expected |
| probability | the deal's own; else the pipeline stage's; else the status's. Explicit 0 is kept; clamped 0–100 |
| open | status type Open, Ongoing or On Hold, on a stage and pipeline that are not archived or hidden |
| `open_expected_value` | expected when open, else 0 |
| `weighted_forecast` | expected × probability / 100 when open, else 0. **Won and Lost add nothing** |
| `won_value` | recorded when the status type is Won, else 0 |
| `invoiced_value` | submitted Sales Invoices with `crm_deal` = the deal, plus submitted POS Invoices with `crm_deal` not yet consolidated; credit notes subtract. ERP documents only, never the deal fields |
| `collected_value` | invoiced minus outstanding |

Currency: aggregates are in the FCRM base currency (`FCRM Settings.currency`). A foreign deal
uses its stored `exchange_rate`; without a positive rate its amounts are NULL and counted in
`missing_exchange_rate_count`. `deal_amounts()` / `get_deal_amounts` return each deal in its own
currency. Invoices count only for companies whose currency is the base currency; invoiced and
collected are NULL when ERP is absent, the invoice has no `crm_deal` link, or the user cannot
read invoices.

## Outlier guard

`outlier_threshold()` = 100 × the nearest-rank p95 of the larger of expected and recorded
amount, in base currency, over **every** priced deal of the tenant (not the caller's scope, so
every user flags the same deals). No guard below 20 priced deals. Cached 10 minutes.

A deal above the threshold keeps its stored values but is NULL in every amount above, so it is
never summed or averaged. It is counted in `outlier_count` and `outlier_value`. Surfaces show it:
the list «Valor» cell and Deal 360 «Valor» mark it (⚠ with an explanation), board columns and
dashboard notes say how many were left out.

## Consumers

| Surface | Call |
| --- | --- |
| Deals list summary strip, board column totals (`DealsView.vue`, `dealsListSummary.js`) | `crm.api.doc.aggregate_deal_metrics` → `deal_metrics` + `contract` |
| Pipeline analysis (Embudo) | `aggregate_deal_metrics`, `crm.api.dashboard.get_pipeline_funnel` (counts) |
| Dashboard number cards and charts | `crm/api/dashboard.py` `_metric_base` → `metric_query` |
| Sales report | `crm.api.sales_reports.get_report` → `deal_metrics` |
| List row «Valor», cards | `pipelineMath.displayValue` (client mirror of recorded) + `isOutlier(row, contract)` |
| List virtual column `_v_weighted` | `deal_amounts` |
| Deal 360 «Valor», «Pronóstico ponderado», «Facturado · cobrado» | `crm.pipeline.api.get_deal_amounts` |

The forecast chart (`get_forecasted_revenue`) returns one category per month of the period,
zero-filled, labelled in the user's language: an ECharts time axis over one or two points ticks
in hours. `get_sales_trend` zero-fills every day of the period for the same reason.

Tests: `crm/tests/test_sales_metrics.py` (`test_list_board_funnel_report_dashboard_and_records_reconcile`
reconciles one fixture across every surface), `frontend/tests/unit/pipelineMath.test.js`.

Repair shops: the Repair Order quote is not a deal amount. Deal 360 shows it as «Cotizado en
reparaciones» when it differs from «Valor». Copying RO quotes into `expected_deal_value` belongs
to Taller's quote sync (S1.3).
