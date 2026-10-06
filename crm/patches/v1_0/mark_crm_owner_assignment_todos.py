"""Pendientes: hide CRM's automatic owner-assignment ToDos (see crm.owner_assignment)."""

from crm.owner_assignment import backfill


def execute():
	backfill()
