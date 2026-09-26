# Storefront order context in customer chat

The customer opens chat on an existing order page, explicitly shares that order,
then writes their question. Sharing alone does not send a message or notify an
unassigned queue. The next ordinary Webchat message enters the existing CRM
conversation with its linked order available to permitted staff.

`crm.api.webchat.share_order` accepts only POST JSON `{channel_id, order_token}`
under the same private visitor bearer protocol as chat history and messages.
The storefront BFF supplies the current bound channel and capability; browser
requests instead carry the current `view_revision`. The order proof is the
canonical 36-character alphanumeric token issued by checkout. It is never
stored in conversation metadata, events, messages or browser recovery storage.

The optional Doco adapter resolves the named enabled Storefront Profile and the
exact existing storefront Sales Order in one nonlocking SQL statement, requiring
matching profile and company. It reads the request's transaction snapshot;
each new request revalidates the proof. A concurrent token rotation or profile
disable may take effect after that snapshot, so this is not linearizable
revocation. It does not call `order_status`, poll a gateway, submit an
order, assert a Customer identity or merge a person. Canceled orders remain
supportable. Missing configuration or mismatched proof fails closed.

The visitor receives only `{shared: true, replayed: boolean}`. Existing
conversation context and its private event ledger provide idempotency under the
conversation fence. A staff unlink is preserved: retrying the old share cannot
restore that link. Closed conversations reject new shares. Replays revalidate
the active session and channel, then the profile and order token in the new
request's snapshot.

Staff context projections retain native order read permissions. Visitor-proof
links show only the order number and an explicit unverified-identity caption;
they never use the customer's name as a conversation label or grant staff
authority. A forwarded order URL is not buyer identification. Staff must follow
the existing identity-verification process before disclosing personal details
or accepting sensitive order changes such as a new delivery address. Ordinary
staff links retain title-field masks.

An older Doco without the support adapter refuses before any mutation. A busy
conversation fence is a retryable outage, never evidence that a prior share
failed. The storefront retains the same proof/revision pair for explicit
recheck while ordinary questions, history and ending the chat stay available.

Sharing changes no routing, owner, generation, bot grant or financial
status. An ordinary customer message uses the existing message/control policy.

`crm.tests.test_storefront_support` covers the real SQL/controller chain with
rollback-only fictional ERP fixtures and forbidden outbound transport. Tests
must run in the complete app graph; standalone CRM retains Webchat and exposes
no functioning commerce action without its owning app. Source checks alone are
not acceptance; consult the exact-source release receipt for native evidence.
