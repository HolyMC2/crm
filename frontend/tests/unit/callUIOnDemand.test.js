import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick } from 'vue'

// F22: a phone starts the calling SDK on its first call, not after load.
const line = vi.hoisted(() => ({ phone: false }))
const afterFirstRoute = vi.hoisted(() => vi.fn())
const setMakeCall = vi.hoisted(() => vi.fn())
const twilio = vi.hoisted(() => ({
  setup: vi.fn(async () => {}),
  makeOutgoingCall: vi.fn(),
  mounted: 0,
}))

vi.mock('@/utils/prefetch', () => ({
  afterFirstRoute,
  constrainedLine: () => line.phone,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({}) }))
vi.mock('@/stores/global', () => ({ globalStore: () => ({ setMakeCall }) }))
vi.mock('@/composables/telephony', async () => {
  const { ref } = await import('vue')
  return {
    defaultCallingMedium: ref(''),
    useTelephony: () => ({
      isEnabled: (key) => key === 'twilio',
      isAnyEnabled: computed(() => true),
    }),
  }
})
vi.mock('frappe-ui', () => ({
  FormControl: { render: () => null },
  call: vi.fn(),
  toast: { success: vi.fn() },
}))
vi.mock('@/components/Telephony/TwilioCallUI.vue', () => ({
  __esModule: true,
  default: defineComponent({
    setup(_, { expose }) {
      twilio.mounted++
      expose({ setup: twilio.setup, makeOutgoingCall: twilio.makeOutgoingCall })
      return () => h('div')
    },
  }),
}))
vi.mock('@/components/Telephony/ExotelCallUI.vue', () => ({
  __esModule: true,
  default: { render: () => null },
}))

const { default: CallUI } = await import('@/components/Telephony/CallUI.vue')

let app
function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(CallUI)
  app.config.globalProperties.__ = (text) => text
  // The Make Call dialog is a global component the app registers; unused here.
  app.config.warnHandler = () => {}
  app.mount(host)
}

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  twilio.mounted = 0
})

describe('CallUI on a phone or a slow line', () => {
  it('loads nothing until the first call', async () => {
    line.phone = true
    mount()
    await flush()
    expect(afterFirstRoute).not.toHaveBeenCalled()
    expect(twilio.mounted).toBe(0)
    expect(twilio.setup).not.toHaveBeenCalled()
    expect(setMakeCall).toHaveBeenCalledTimes(1)
  })

  it('starts the SDK on the first call, then places it', async () => {
    line.phone = true
    mount()
    await flush()
    const makeCall = setMakeCall.mock.calls.at(-1)[0]
    const placed = makeCall('+5215550000000')
    await flush()
    await placed
    expect(twilio.mounted).toBe(1)
    expect(twilio.setup).toHaveBeenCalledTimes(1)
    expect(twilio.makeOutgoingCall).toHaveBeenCalledWith('+5215550000000')
    expect(twilio.setup.mock.invocationCallOrder[0]).toBeLessThan(
      twilio.makeOutgoingCall.mock.invocationCallOrder[0],
    )
    await makeCall('+5215550000001')
    expect(twilio.setup).toHaveBeenCalledTimes(1)
    expect(twilio.makeOutgoingCall).toHaveBeenCalledTimes(2)
  })
})

describe('CallUI on a wide screen', () => {
  it('starts the SDK after the first route, as before', async () => {
    line.phone = false
    mount()
    await flush()
    expect(afterFirstRoute).toHaveBeenCalledTimes(1)
    expect(twilio.mounted).toBe(0)
    afterFirstRoute.mock.calls[0][1]()
    await flush()
    expect(twilio.mounted).toBe(1)
    expect(twilio.setup).toHaveBeenCalledTimes(1)
  })
})
