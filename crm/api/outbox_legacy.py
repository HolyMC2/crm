"""Fence legacy HTTP sends against the first native open and later control changes.

This is a compatibility hold, not a legacy producer's ownership grant. The caller
must keep this context open through its physical HTTP attempt. No transaction is
committed or discarded here, and an absent conversation is never materialized.
"""

from contextlib import ExitStack, contextmanager

import frappe


class LegacySendBlocked(frappe.PermissionError):
    def __init__(self, reason="native_outbound_intent_required"):
        self.reason_code = reason
        super().__init__(reason)


@contextmanager
def guard_legacy_send(provider, account_id, peer_id, *, payload):
    """Allow unowned legacy traffic; existing native rows require real dispatch."""
    with ExitStack() as stack:
        try:
            from crm.api import conversations as control, outbox

            if not all(frappe.db.exists("DocType", name) for name in (
                control.DOCTYPE, control.EVENT, outbox.DOCTYPE
            )):
                raise LegacySendBlocked("legacy_control_unavailable")
            name = control.conversation_key(provider, account_id, peer_id)
            stack.enter_context(control.conversation_fence(name))
            # This must be a current read after waiting, including absence. An
            # ordinary RR snapshot could miss a newly committed first open.
            row = frappe.db.get_value(control.DOCTYPE, name,
                ["name", "provider", "account_id", "peer_id"], as_dict=True, for_update=True)
            if row:
                if (row.provider, row.account_id, row.peer_id) != (provider, account_id, peer_id):
                    raise LegacySendBlocked("legacy_conversation_scope_invalid")
                grant = outbox._dispatch.get()
                if not isinstance(grant, tuple) or len(grant) != 6 or grant[1:4] != (provider, account_id, peer_id):
                    raise LegacySendBlocked()
                # Context presence alone is insufficient: this revalidates the
                # current Submitting row, claim token, payload and eligibility.
                outbox.require_dispatch(grant[0], provider, account_id, peer_id, payload=payload)
        except LegacySendBlocked:
            raise
        except (frappe.QueryDeadlockError, frappe.TimestampMismatchError):
            # MariaDB can reject a current read against a pre-fence RR snapshot.
            # The caller must end that request; never discard its earlier work.
            raise LegacySendBlocked("legacy_control_conflict") from None
        except frappe.PermissionError:
            raise LegacySendBlocked() from None
        except Exception:
            raise LegacySendBlocked("legacy_control_unavailable") from None
        # HTTP exceptions are the caller's concern; never reinterpret/retry them.
        yield
