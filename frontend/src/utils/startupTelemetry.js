import { call } from 'frappe-ui'
import { telemetryPlugin } from 'frappe-ui/frappe'

export async function installTelemetry(app) {
  try {
    const config = await call('frappe.utils.telemetry.pulse.client.boot_config')
    if (
      config?.enabled !== true ||
      !['host', 'key', 'site', 'client_url'].every(
        (field) => typeof config[field] === 'string' && config[field].trim(),
      )
    ) {
      return false
    }

    // Native enabled config supplies this URL. Reject incomplete/untrusted
    // values before the plugin can fall back to its external default client.
    const host = new URL(config.host)
    const client = new URL(config.client_url)
    if (
      host.protocol !== 'https:' ||
      client.protocol !== 'https:' ||
      client.origin !== host.origin
    ) {
      return false
    }

    app.use(telemetryPlugin, {
      app_name: 'crm',
      enabled: true,
      host: config.host,
      apiKey: config.key,
      site: config.site,
      clientUrl: config.client_url,
      getContext: () => ({ user: config.user, team: config.team }),
    })
    return true
  } catch {
    // Optional telemetry must not prevent CRM startup or load a fallback client.
    return false
  }
}
