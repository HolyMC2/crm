import { frappeRequest, setConfig } from 'frappe-ui'

// Settings and notifications fetch while the app's modules are imported.
// Configure their transport before importing those consumers, not at mount.
setConfig('resourceFetcher', frappeRequest)
