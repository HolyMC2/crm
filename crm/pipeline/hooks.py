# Copyright (c) 2026, Doco and contributors
# For license information, please see license.txt

"""Document hooks wired from crm/hooks.py doc_events."""

from crm.pipeline.services.next_activity import refresh


def on_task_change(doc, method=None):
	"""Mirror the task onto its reference record after insert, update or delete."""
	# on_trash fires while the row is still in the table: hide it from the read.
	exclude_task = doc.name if method == "on_trash" else None
	for doctype, name in _touched_references(doc):
		refresh(doctype, name, exclude_task=exclude_task)


def _touched_references(doc) -> set[tuple[str, str]]:
	"""The task's reference plus, when it was just re-pointed, the one it left."""
	references = {(doc.reference_doctype, doc.reference_docname)}
	before = doc.get_doc_before_save()
	if before:
		references.add((before.reference_doctype, before.reference_docname))
	return {(doctype, name) for doctype, name in references if doctype and name}
