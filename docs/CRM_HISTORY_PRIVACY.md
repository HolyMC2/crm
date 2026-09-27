# CRM history visibility

Lead and Deal history is projected for the current reader, including native Desk
loads, save responses and Document Follow digest preparation. The stored Version
records remain unchanged. The same current parent permission, field levels and
masks apply when a digest is assembled by an administrative background session
for another recipient.

The supported Muelle Frappe base supplies `VERSION_HISTORY_FILTER_VERSION=1` and
the `filter_version_history` hook. CRM checks this requirement before installation,
migration, requests and background jobs. Install the compatible base before this
CRM revision. The build helper pins all three upstream source files and records
its modifications separately from the upstream source manifest. There is no
runtime replacement of framework functions.

Parent changes, added/removed child rows and every child-row difference retain
only currently readable, unmasked fields. Password values are excluded. Child
fields inherit their owning parent's permission levels; a denied table cannot
expose its row identities. Unknown or malformed data has no raw fallback.

Historical Link and Dynamic Link values are omitted while their field-change
event remains. Native Version data does not retain stable target IDs or the
historical title field, so current display settings cannot authorize old text.
This also covers renamed, replaced or removed title fields. Stored audit data is
preserved for native administrative review. Useful, permissioned target details
for future history require captured provenance; this projection does not guess
identity from legacy labels. Creation events retain a fixed source label instead
of an arbitrary historical label or source-document URL. Audit attribution is
HTML-encoded; impersonation links require current User record access.

Native query limits, order and outer Version metadata are preserved. Other
DocTypes keep their existing behavior. Direct administrative access to stored
Version records remains governed by native Version permissions. This change does
not paginate the complete CRM activity endpoint or alter native digest grouping.

`crm.tests.test_history_projection` exercises real parent permissions, masks,
child metadata, native load/save responses, digest recipients and unchanged
stored history. The focused and standalone native cohorts include it. Source
checks alone do not establish native or browser acceptance.
