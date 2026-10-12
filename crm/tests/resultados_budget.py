"""Resultados latency budget probe (disposable sites only, never CI).

    lane test <slug> --profile full-retail -- \
      bench --site {site} execute crm.tests.resultados_budget.measure --kwargs "{'sales': 120}"

Seeds `sales` submitted counter sales across the two fixture shops (Mercado's
test fixtures), then times, as Administrator and as the shop supervisor:
the shell boot provider (permission checks only), `board` cold (generation
moved, nothing cached) and warm (cached). Prints one JSON line.
"""

import json
import time

import frappe


def _p95(samples):
	ordered = sorted(samples)
	return round(ordered[max(0, int(len(ordered) * 0.95) - 1)], 1)


def _ms(fn):
	start = time.perf_counter()
	fn()
	return (time.perf_counter() - start) * 1000


def measure(sales=120, runs=20):
	from mercado.tests import test_resultados_cards as fixtures

	from crm.api import resultados, shell

	fixtures.ensure_resultados_fixtures()
	for i in range(int(sales)):
		fixtures.make_sale(fixtures.PROFILE_A if i % 2 else fixtures.PROFILE_B, 50 + i, days_ago=i % 28)
	frappe.db.commit()
	out = {"sales": int(sales), "runs": int(runs), "users": {}}
	for user in ("Administrator", fixtures.SUPERVISOR):
		frappe.set_user(user)
		frappe.local._resultados_cards = None
		boot = [_ms(resultados.get_capabilities) for _ in range(runs)]
		provider = [_ms(shell._resultados) for _ in range(runs)]
		cold, warm = [], []
		for _ in range(runs):
			frappe.cache.incr(frappe.cache.make_key(resultados.GEN_KEY))
			frappe.local._resultados_cards = None
			cold.append(_ms(lambda: resultados.board(periodo="mes", compara="anterior")))
			frappe.local._resultados_cards = None
			warm.append(_ms(lambda: resultados.board(periodo="mes", compara="anterior")))
		out["users"][user] = {
			"boot_check_p95_ms": _p95(boot),
			"shell_provider_p95_ms": _p95(provider),
			"board_cold_p95_ms": _p95(cold),
			"board_warm_p95_ms": _p95(warm),
			"cards": [c["key"] for c in resultados.board(periodo="mes")["cards"]],
		}
	frappe.set_user("Administrator")
	print("RESULTADOS_BUDGET " + json.dumps(out))
	return out
