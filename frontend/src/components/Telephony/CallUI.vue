<template>
  <TwilioCallUI v-if="mediaReady && isEnabled('twilio')" ref="twilio" />
  <ExotelCallUI v-if="mediaReady && isEnabled('exotel')" ref="exotel" />
  <Dialog
    v-model:open="show"
    :title="__('Make Call')"
    :actions="[
      {
        label: __('Call using {0}', [callMedium]),
        variant: 'solid',
        onClick: makeCallUsing,
      },
    ]"
  >
    <template #default>
      <div class="flex flex-col gap-4">
        <FormControl
          v-model="mobileNumber"
          type="text"
          :label="__('Mobile Number')"
        />
        <FormControl
          v-model="callMedium"
          type="select"
          :label="__('Calling Medium')"
          :options="['Twilio', 'Exotel']"
        />
        <div class="flex flex-col gap-1">
          <FormControl
            v-model="isDefaultMedium"
            type="checkbox"
            :label="__('Make {0} as default calling medium', [callMedium])"
          />

          <div v-if="isDefaultMedium" class="text-sm text-ink-gray-4">
            {{
              __('You can change the default calling medium from the settings')
            }}
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { defaultCallingMedium, useTelephony } from '@/composables/telephony'
import { globalStore } from '@/stores/global'
import { FormControl, call, toast } from 'frappe-ui'
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { afterFirstRoute, constrainedLine } from '@/utils/prefetch'

// Each calling medium (the Twilio SDK, Exotel's panel with its text editor)
// loads only when it is enabled, not with every Ventas page (bundle budget).
const TwilioCallUI = defineAsyncComponent(
  () => import('@/components/Telephony/TwilioCallUI.vue'),
)
const ExotelCallUI = defineAsyncComponent(
  () => import('@/components/Telephony/ExotelCallUI.vue'),
)

// The ref of a lazily loaded component is set once its chunk has loaded.
function loaded(target) {
  if (target.value) return Promise.resolve(target.value)
  return new Promise((resolve) => {
    const stop = watch(target, (value) => {
      if (!value) return
      stop()
      resolve(value)
    })
  })
}

const { setMakeCall } = globalStore()
const { isEnabled, isAnyEnabled } = useTelephony()

const twilio = ref(null)
const exotel = ref(null)

const callMedium = ref('Twilio')
const isDefaultMedium = ref(false)

const show = ref(false)
// The calling SDKs (Twilio is ~185 KB) start once the first page is up, a few
// seconds after load, never during it (SPEC §4 first-route budget). A phone or
// a slow line starts them on its first call instead (F22): the SDK, its token
// and the onboarding status it reads (about 55 KB, 2 calls) no longer compete
// with the first tap, and that tab rings for incoming calls only after it.
const onDemand = constrainedLine()
const mediaReady = ref(false)
if (!onDemand) afterFirstRoute(useRouter(), () => (mediaReady.value = true))
const mobileNumber = ref('')

const enabledIntegrations = computed(() =>
  [
    { key: 'twilio', label: 'Twilio', ref: twilio },
    { key: 'exotel', label: 'Exotel', ref: exotel },
  ].filter(({ key }) => isEnabled(key)),
)

function makeCall(number) {
  if (enabledIntegrations.value.length > 1 && !defaultCallingMedium.value) {
    mobileNumber.value = number
    show.value = true
    return
  }

  callMedium.value = enabledIntegrations.value[0]?.label ?? 'Twilio'
  if (defaultCallingMedium.value) {
    callMedium.value = defaultCallingMedium.value
  }

  mobileNumber.value = number
  makeCallUsing()
}

function makeCallUsing() {
  if (isDefaultMedium.value && callMedium.value) {
    setDefaultCallingMedium()
  }

  if (callMedium.value === 'Twilio') {
    twilio.value.makeOutgoingCall(mobileNumber.value)
  }

  if (callMedium.value === 'Exotel') {
    exotel.value.makeOutgoingCall(mobileNumber.value)
  }
  show.value = false
}

async function setDefaultCallingMedium() {
  await call('crm.integrations.api.set_default_calling_medium', {
    medium: callMedium.value,
  })

  defaultCallingMedium.value = callMedium.value
  toast.success(
    __('Default calling medium set successfully to {0}', [callMedium.value]),
  )
}

// Twilio's setup fetches the token and creates the device the call needs.
let mediaOnDemand = null
function makeCallOnDemand(number) {
  mediaReady.value = true
  mediaOnDemand ??= Promise.all(
    enabledIntegrations.value.map(async ({ ref: integrationRef }) =>
      (await loaded(integrationRef)).setup(),
    ),
  )
  return mediaOnDemand.then(() => makeCall(number))
}

watch(
  isAnyEnabled,
  () =>
    nextTick(async () => {
      if (!onDemand)
        for (const {
          label,
          ref: integrationRef,
        } of enabledIntegrations.value) {
          ;(await loaded(integrationRef)).setup()
          callMedium.value = label
        }

      if (isAnyEnabled.value) {
        callMedium.value = enabledIntegrations.value[0]?.label ?? 'Twilio'
        setMakeCall(onDemand ? makeCallOnDemand : makeCall)
      }
    }),
  { immediate: true },
)
</script>
