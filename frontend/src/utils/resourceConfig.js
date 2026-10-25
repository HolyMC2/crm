import { frappeRequest, setConfig } from 'frappe-ui'
import { handleServerMessages } from './serverMessages'

// Settings and notifications fetch while the app's modules are imported.
// Configure their transport before importing those consumers, not at mount.
setConfig('resourceFetcher', frappeRequest)
// `frappe.msgprint` on a successful call becomes a toast (docs/FRAPPE_UI_1.md §6, B7).
setConfig('serverMessagesHandler', handleServerMessages)
