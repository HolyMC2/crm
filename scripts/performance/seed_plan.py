"""Closed, deterministic recipes for the disposable native seed (no Frappe)."""

import re
from collections import Counter
from datetime import date, timedelta

from contract import require

SIZES = {
	"preflight": {"deals": 96, "tasks": 24, "comments": 12, "notes": 6, "calls": 6, "repairs": 6},
	"full": {"deals": 10000, "tasks": 25000, "comments": 15000, "notes": 5000, "calls": 5000, "repairs": 500},
}
STAGES = (
	("open", "Open", 20),
	("ongoing", "Ongoing", 50),
	("hold", "On Hold", 30),
	("won", "Won", 100),
	("lost", "Lost", 0),
	("history", "Ongoing", 40),
)
ACTORS = (*(f"seller_{i:02}" for i in range(12)), "manager_a", "manager_b", "broad_manager", "counter")
PROFILES = {
	"seller": "seller_00",
	"hierarchy_manager": "manager_a",
	"broad_manager": "broad_manager",
	"counter": "counter",
}


def namespace(site):
	require(isinstance(site, str) and re.fullmatch(r"crm-perf-[a-f0-9]{12}\.localhost", site), "seed_site")
	return site[9:21]


def label(site, kind, index):
	require(kind in {"deal", "task", "comment", "note", "call", "repair"}, "seed_kind")
	require(type(index) is int and 0 <= index < 50000, "seed_index")
	return f"PERF-{namespace(site)}-{kind}-{index:05}"


def actor_scope(actor):
	require(actor in ACTORS, "seed_actor")
	if actor == "broad_manager":
		return ("a", "b"), ("a", "b", "private")
	if actor == "seller_11":
		return ("b",), ("private",)
	branch = "b" if actor == "manager_b" or (actor.startswith("seller_") and int(actor[-2:]) >= 6) else "a"
	return (branch,), (branch,)


def deal_recipe(index, scale):
	require(scale in SIZES and 0 <= index < SIZES[scale]["deals"], "seed_index")
	actor = ACTORS[index % len(ACTORS)]
	# A declared, real unassigned queue; its creating actor uses the scoped counter shop pool.
	unassigned = index % 97 == 95
	actor = "counter" if unassigned else actor
	_companies, pipelines = actor_scope(actor)
	pipeline = "a" if actor == "broad_manager" else pipelines[0]
	return {
		"actor": actor,
		"owner": "" if unassigned else actor,
		"company": "b" if pipeline in ("b", "private") else "a",
		"pipeline": pipeline,
		"stage": STAGES[(index // len(ACTORS)) % len(STAGES)][0],
		"value": 100 + index % 1000,
		"probability": (0, 25, 50, 75)[index % 4],
	}


def repair_parent(index, scale):
	require(
		scale in SIZES and type(index) is int and 0 <= index < SIZES[scale]["repairs"], "seed_repair_index"
	)
	parent = 15 + index * len(ACTORS)
	require(parent < SIZES[scale]["deals"], "seed_repair_parent")
	return parent


def activity_parent(index, scale):
	total = sum(SIZES[scale][k] for k in ("tasks", "comments", "notes", "calls"))
	require(0 <= index < total, "seed_activity_index")
	if scale == "preflight":
		return index % SIZES[scale]["deals"]
	# Four roles each own a 5k hot record. Additional 50/500 histories are exact.
	for size, parent in ((5000, 0), (5000, 12), (5000, 14), (5000, 15), (50, 1), (500, 2)):
		if index < size:
			return parent
		index -= size
	# Exclude the six reserved histories from the ordinary distribution.
	ordinary = (3, 4, 5, 6, 7, 8, 9, 10, 11, 13)
	offset = index % (SIZES[scale]["deals"] - 6)
	return ordinary[offset] if offset < len(ordinary) else offset + 6


def activity_schedule(scale):
	require(scale in SIZES, "seed_scale")
	# Interleave the 5:3:1:1 mix, rather than putting only tasks in hot records.
	kinds = ("task",) * 5 + ("comment",) * 3 + ("note", "call")
	remaining = {k: SIZES[scale][k + "s"] for k in set(kinds)}
	counters = Counter()
	index = 0
	while any(remaining.values()):
		for kind in kinds:
			if remaining[kind]:
				yield kind, counters[kind], activity_parent(index, scale)
				counters[kind] += 1
				remaining[kind] -= 1
				index += 1


def due_date(anchor, index):
	day = date.fromisoformat(anchor)
	return None if index % 4 == 0 else str(day + timedelta(days=(-2, 0, 3)[index % 3])) + " 12:00:00"


def expected_visible(actor, recipe):
	companies, pipelines = actor_scope(actor)
	if recipe["company"] not in companies or recipe["pipeline"] not in pipelines:
		return False
	if actor in ("broad_manager", "counter"):
		return True
	owner = recipe["owner"]
	if not owner:
		return False
	if actor == "manager_a":
		return owner == actor or owner in ACTORS[:6]
	if actor == "manager_b":
		return owner == actor or owner in ACTORS[6:12]
	return owner == actor
