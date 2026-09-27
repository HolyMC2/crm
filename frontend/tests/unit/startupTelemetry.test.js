import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

const transport = vi.hoisted(() => ({
  call: vi.fn(),
  fetchBootConfig: vi.fn(),
  loadPulseClient: vi.fn(),
  client: { init: vi.fn(), capture: vi.fn(), stop: vi.fn() },
}))
vi.mock('frappe-ui', () => ({ call: transport.call }))
// Exercise the unchanged plugin, replacing only its native/CDN transport seam.
vi.mock('../../node_modules/frappe-ui/frappe/telemetry/pulse.ts', () => ({
  fetchBootConfig: transport.fetchBootConfig,
  loadPulseClient: transport.loadPulseClient,
}))
vi.mock('frappe-ui/frappe', async () => {
  const actual = await import(
    '../../node_modules/frappe-ui/frappe/telemetry/index.ts'
  )
  return { telemetryPlugin: actual.default, useTelemetry: actual.useTelemetry }
})
import { telemetryPlugin, useTelemetry } from 'frappe-ui/frappe'
import { installTelemetry } from '@/utils/startupTelemetry'

const enabled = {
  enabled: true,
  host: 'https://pulse.example.invalid',
  key: 'synthetic-public-ingest-key',
  site: 'crm.example.invalid',
  client_url: 'https://pulse.example.invalid/assets/pulse/js/pulse_client.js',
  user: 'native-anonymized-user',
  team: 'native-team',
}
let app, install
beforeEach(() => {
  useTelemetry().disable()
  vi.resetAllMocks()
  transport.loadPulseClient.mockResolvedValue(transport.client)
  transport.client.init.mockResolvedValue(true)
  app = createApp({ render: () => null })
  install = vi.spyOn(telemetryPlugin, 'install')
})
afterEach(() => {
  useTelemetry().disable()
  vi.restoreAllMocks()
})

describe('native telemetry startup consent', () => {
  it.each([false, undefined, null, 0, 1, 'false', 'true'])(
    'does not install or load a client without explicit boolean consent (%s)',
    async (consent) => {
      transport.call.mockResolvedValue({ ...enabled, enabled: consent })
      expect(await installTelemetry(app)).toBe(false)
      expect(install).not.toHaveBeenCalled()
      expect(transport.loadPulseClient).not.toHaveBeenCalled()
      expect(useTelemetry().isEnabled).toBe(false)
      useTelemetry().capture('must-not-send')
      expect(transport.client.capture).not.toHaveBeenCalled()
    },
  )

  it.each([
    null,
    {},
    { ...enabled, host: '' },
    { ...enabled, key: '  ' },
    { ...enabled, site: null },
    { ...enabled, client_url: undefined },
    { ...enabled, host: 'invalid-url' },
    { ...enabled, client_url: 'https://other.example.invalid/client.js' },
    { ...enabled, client_url: 'http://pulse.example.invalid/client.js' },
  ])(
    'rejects incomplete or invalid native config without a fallback client',
    async (config) => {
      transport.call.mockResolvedValue(config)
      expect(await installTelemetry(app)).toBe(false)
      expect(install).not.toHaveBeenCalled()
      expect(transport.loadPulseClient).not.toHaveBeenCalled()
    },
  )

  it('contains native request errors without affecting startup', async () => {
    transport.call.mockRejectedValue(new Error('Synthetic native outage'))
    await expect(installTelemetry(app)).resolves.toBe(false)
    expect(install).not.toHaveBeenCalled()
    expect(transport.loadPulseClient).not.toHaveBeenCalled()
    expect(useTelemetry().isEnabled).toBe(false)
  })

  it('keeps the client unloaded while native config is pending', async () => {
    let resolveConfig
    transport.call.mockReturnValue(
      new Promise((resolve) => {
        resolveConfig = resolve
      }),
    )
    const pending = installTelemetry(app)
    expect(install).not.toHaveBeenCalled()
    expect(transport.loadPulseClient).not.toHaveBeenCalled()
    resolveConfig({ enabled: false })
    expect(await pending).toBe(false)
  })

  it('preserves configured native context and uses the real plugin without refetching config', async () => {
    transport.call.mockResolvedValue(enabled)
    expect(await installTelemetry(app)).toBe(true)
    expect(transport.call).toHaveBeenCalledExactlyOnceWith(
      'frappe.utils.telemetry.pulse.client.boot_config',
    )
    expect(transport.fetchBootConfig).not.toHaveBeenCalled()
    expect(install).toHaveBeenCalledOnce()
    expect(transport.loadPulseClient).toHaveBeenCalledOnce()
    const options = transport.loadPulseClient.mock.calls[0][0]
    expect(options).toMatchObject({
      host: enabled.host,
      apiKey: enabled.key,
      site: enabled.site,
      enabled: true,
      clientUrl: enabled.client_url,
    })
    expect(options.getContext()).toEqual({
      user: enabled.user,
      team: enabled.team,
    })
    expect(transport.client.init).toHaveBeenCalledOnce()
    expect(useTelemetry().isEnabled).toBe(true)
    useTelemetry().capture('synthetic-event', { action: 'test' })
    expect(transport.client.capture).toHaveBeenCalledWith(
      'synthetic-event',
      'crm',
      { action: 'test' },
    )
  })

  it('retains native anonymous context without inventing an identity', async () => {
    transport.call.mockResolvedValue({ ...enabled, user: null, team: null })
    expect(await installTelemetry(app)).toBe(true)
    expect(transport.loadPulseClient.mock.calls[0][0].getContext()).toEqual({
      user: null,
      team: null,
    })
    expect(useTelemetry().isEnabled).toBe(true)
  })

  it('contains a rejected native client init without an unhandled startup error', async () => {
    transport.call.mockResolvedValue(enabled)
    transport.client.init.mockRejectedValue(
      new Error('Synthetic client init failure'),
    )
    await expect(installTelemetry(app)).resolves.toBe(false)
    expect(install).toHaveBeenCalledOnce()
    expect(transport.client.init).toHaveBeenCalledOnce()
    expect(useTelemetry().isEnabled).toBe(false)
    useTelemetry().capture('must-not-send')
    expect(transport.client.capture).not.toHaveBeenCalled()
  })
})
