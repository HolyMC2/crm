# P6 Webchat local outbox: real process/commit/crash proof

**PASS: six required scenarios, actual separate Python processes/connections, real SQL transactions/commits and two SIGKILL checkpoints.** Final run exited0 and verified cleanup on the dedicated paused site `meta-reliability-test-20260910.lab.xoloitzcuintles.com`.

Source: `coordination/meta-reliability/webchat_outbox_concurrency.py`. Full successful raw log: `webchat_outbox_concurrency-20260910-03.log`. No runtime/model/authority/fence/transaction emulation was used. Current candidate `conversations.py`, `outbox.py` and `webchat.py` were imported from the isolated overlay. Fixture Channel/Profile/origin/session/user identities were newly randomized and separate from root's WSGI/browser fixture.

| Scenario | Actual committed observation |
| --- | --- |
| Concurrent same request | One request committed, the contender returned distinct controlled ReplyRequestPending. Its caller rolled back the entire failed transaction. A new process/connection checked the same request ID/body and returned the identical intent; one durable intent row. |
| Two workers | First worker paused after real local message insertion; second worker could not cross the conversation fence. Independent SQL still saw Queued/0 attempts/0 messages. After release both completed with exactly Accepted/1 attempt/1 Outgoing message. |
| SIGKILL after message insertion, before commit | Independent SQL saw Queued/0 attempts/0 messages before and after killing the worker. A real fresh worker recovered to Accepted/1 attempt/1 message. No durable Submitting/Accepted/transcript escaped the killed transaction. |
| SIGKILL after actual commit | Worker paused after real commit returned while retaining the conversation fence. Independent SQL saw Accepted/1 attempt/1 message. SIGKILL followed by a fresh replay worker preserved the exact row/provider ID/count; zero additional messages. |
| Takeover during local transaction | Transfer waited behind the active conversation fence until the message+Accepted commit completed. The winning message stayed Accepted. A second intent pinned to the old generation became Cancelled/conversation_changed with0 messages. |
| Direct forged authority | A caller-modified document claiming Submitting and forged dispatch flags did not acquire the private core grant. The real local gateway raised PermissionError before insertion; the intent remained Queued/0 attempts/0 messages until cleanup cancelled it. |

## Failure discovered and narrow correction

The first unmodified full run failed during the same-request race with MariaDB1020 / frappe.QueryDeadlockError at the locking outbound-intent lookup. Raw diagnostics are preserved unchanged in `webchat_outbox_concurrency-20260910-01.log`; its fictional fixtures were also cleaned up successfully. This is request contention and cannot justify rolling back the caller's unrelated transaction inside queue_message.

Root approved a narrow source change: `ReplyRequestPending(frappe.ValidationError)` with HTTP status409 and static text, “Request could not be confirmed. Check the same request again.” The `_pending_on_queue_contention` decorator catches only QueryDeadlockError around queue_message. It performs no commit/rollback and preserves TimestampMismatch/generation errors. Caller/request rollback and a fresh whole-request retry retain the same frozen request identity/body. Root owns the corresponding UI confirmation/retry acceptance.

A focused rollback-only test verifies the exact distinct exception/status/static message, absence of internal commit/rollback, and unchanged TimestampMismatch propagation. It passes in `webchat_outbox_queue_pending-20260910.log` (1 test,0.355s). The successful real-process run intentionally retains and reports its one controlled contention response; the proof does not conceal it as an immediate successful queue response.

While root reviewed the correction, the independent remaining five scenarios passed in `webchat_outbox_concurrency-20260910-02.log`. That log explicitly says PARTIAL_PASS and omits only the already-failed queue race. The final03 log runs all six without the skip option.

## Scope, mechanisms and cleanup

The proof blocks requests/urllib/SMTP/sendmail, suppresses metadata-only realtime hints and suppresses automatic outbox queue wakeups so explicitly spawned real workers exclusively drive the controlled races. The only fixture-only enqueue suppressed is User contact creation. These scheduling/egress seams are not replacements for SQL, commits, model validation, core grants, ownership checks, local delivery or conversation fences. Local delivery and commit wrappers call the actual functions, then emit pipe checkpoints; SIGKILL is sent by the independent parent process. No live provider request or customer send occurs.

The final successful evidence is under channel `19f2c43c7b87da1468a2a7156ccb5dcc6a31867bdfffe871de676b9c1264b84a`, conversation `c8487c67269106fee6139f1a5cb17173fe58b337b1bd9e9f5f4e4026e721ec85`, profile prefix `webchat-commit-4fdc64c577fa`. Immutable evidence is retained. Cleanup used the real control/cancel/configuration/session services: Conversation Closed, Channel disabled, Session revoked, fictional User disabled, and no Queued/Claimed/Submitting intents remain. Earlier01/02 fixtures received the same cleanup; their exact IDs and cleanup assertions remain in their raw logs. No consent chain or audit rows were deleted.

Site maintenance/pause/mute/scheduler-disabled guards were checked. Maintenance was overridden only in each proof process's local config to exercise the native service; persisted site settings were not changed. No schema migration, global cache change, production activity, commit/FF/deployment or unrelated source edits were performed.

Final owned additions are this proof/report and four raw logs. Explicitly expanded ownership covered only the queue contention class/decorator/import in `crm/api/outbox.py` and one focused test appended to `crm/tests/test_webchat.py`; all root-owned surrounding runtime changes were preserved. Python compilation and `git diff --check` pass.
