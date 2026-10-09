<template>
  <section class="flex flex-col gap-4" :aria-label="__('Appointment')">
    <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-base">
      <dt class="text-ink-gray-6">{{ __('Customer') }}</dt>
      <dd class="text-ink-gray-9">
        <RouterLink
          v-if="partyLink.to"
          class="underline-offset-2 hover:underline"
          :to="partyLink.to"
          >{{ cita.customer }}</RouterLink
        >
        <span v-else>{{ cita.customer }}</span>
      </dd>
      <template v-if="cita.phone">
        <dt class="text-ink-gray-6">{{ __('Phone') }}</dt>
        <dd>
          <a
            class="text-ink-gray-9 underline-offset-2 hover:underline"
            :href="telHref(cita.phone)"
            >{{ cita.phone }}</a
          >
        </dd>
      </template>
      <template v-if="cita.service">
        <dt class="text-ink-gray-6">{{ __('Service') }}</dt>
        <dd class="text-ink-gray-9">{{ cita.service }}</dd>
      </template>
      <dt class="text-ink-gray-6">{{ __('Folio') }}</dt>
      <dd class="font-mono text-ink-gray-9">{{ cita.folio }}</dd>
      <template v-if="cita.source">
        <dt class="text-ink-gray-6">{{ __('Booked through') }}</dt>
        <dd class="text-ink-gray-9">{{ __(cita.source) }}</dd>
      </template>
      <template v-if="cita.assignedTo?.length">
        <dt class="text-ink-gray-6">{{ __('Attends') }}</dt>
        <dd class="text-ink-gray-9">{{ cita.assignedTo.join(', ') }}</dd>
      </template>
      <template v-if="cita.notes">
        <dt class="text-ink-gray-6">{{ __('Notes') }}</dt>
        <dd class="whitespace-pre-line text-ink-gray-9">{{ cita.notes }}</dd>
      </template>
      <template v-if="cita.outcome">
        <dt class="text-ink-gray-6">{{ __('Outcome') }}</dt>
        <dd class="text-ink-gray-9">
          {{ __(cita.outcome) }}
          <a
            v-if="cita.result?.doctype === 'Repair Order'"
            class="ml-1 underline-offset-2 hover:underline"
            :href="`/taller/orders/${encodeURIComponent(cita.result.name)}`"
            >{{ cita.result.name }}</a
          >
        </dd>
      </template>
    </dl>

    <div
      v-if="open && whatsapp && whatsapp.mode !== 'off'"
      class="flex flex-wrap gap-2"
    >
      <Button
        class="min-h-11"
        variant="ghost"
        icon-left="message-circle"
        :label="__('Confirm on WhatsApp')"
        @click="emit('message', 'confirmation')"
      />
      <Button
        class="min-h-11"
        variant="ghost"
        icon-left="bell"
        :label="__('Remind on WhatsApp')"
        @click="emit('message', 'reminder')"
      />
    </div>

    <div
      v-if="cita.state === 'missed' && whatsapp"
      class="rounded-lg border border-outline-gray-2 p-3"
      role="status"
    >
      <p class="text-base text-ink-gray-9">
        {{ __('Offer {0} another time.', [cita.customer]) }}
      </p>
      <a
        v-if="whatsapp.url"
        class="mt-2 inline-flex min-h-11 items-center rounded-md bg-surface-gray-2 px-3 text-base font-medium text-ink-gray-9 hover:bg-surface-gray-3"
        :href="whatsapp.url"
        target="_blank"
        rel="noopener"
        >{{ __('Rebook on WhatsApp') }}</a
      >
      <p v-else class="mt-1 text-sm text-ink-gray-7">{{ whatsapp.reason }}</p>
    </div>

    <div
      v-if="rescheduling"
      class="rounded-lg border border-outline-gray-2 p-3"
      :aria-label="__('Choose a new time')"
    >
      <label class="block text-sm text-ink-gray-7" :for="dayId">{{
        __('Day')
      }}</label>
      <select
        :id="dayId"
        v-model="day"
        class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-white px-2 text-base"
      >
        <option v-for="row in days" :key="row.date" :value="row.date">
          {{ dayLabel(row.date) }}
        </option>
      </select>
      <p v-if="!days.length" class="mt-2 text-sm text-ink-gray-7">
        {{
          loadingSlots
            ? __('Loading free times…')
            : __('No free times in the coming days.')
        }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <Button
          v-for="slot in slotsOn(days, day)"
          :key="slot.start"
          class="min-h-11"
          variant="subtle"
          :label="timeLabel(slot.start)"
          :loading="busy"
          @click="emit('move', slot)"
        />
      </div>
      <Button
        class="mt-2 min-h-11"
        variant="ghost"
        :label="__('Keep the time')"
        @click="rescheduling = false"
      />
    </div>

    <div
      v-if="open && actionIds.length"
      class="sticky bottom-0 flex flex-wrap gap-2 bg-surface-white pb-[env(safe-area-inset-bottom)] pt-2"
    >
      <a
        v-if="actionIds.includes('receive')"
        class="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-surface-gray-7 px-4 text-base font-medium text-ink-white hover:bg-surface-gray-6 sm:flex-none"
        :href="receiveUrl(cita, returnTo)"
        >{{ __('Receive device') }}</a
      >
      <Button
        v-if="actionIds.includes('arrived')"
        class="min-h-11"
        :class="actionIds.includes('receive') ? '' : 'flex-1 sm:flex-none'"
        :variant="actionIds.includes('receive') ? 'subtle' : 'solid'"
        :label="__('Arrived')"
        :loading="busy"
        @click="emit('action', 'arrived')"
      />
      <Button
        class="min-h-11"
        variant="subtle"
        :label="__('Reschedule')"
        @click="startReschedule"
      />
      <Button
        v-if="actionIds.includes('no_show')"
        class="min-h-11"
        variant="subtle"
        :label="__('Did not come')"
        :loading="busy"
        @click="emit('action', 'no_show')"
      />
      <Button
        v-if="actionIds.includes('cancel')"
        class="min-h-11"
        variant="ghost"
        theme="red"
        :label="__('Cancel appointment')"
        @click="confirmCancel = true"
      />
    </div>
    <p v-else-if="open" class="text-sm text-ink-gray-6">
      {{ __('Ask your manager for access to change appointments.') }}
    </p>
    <div
      v-if="confirmCancel"
      role="alertdialog"
      :aria-label="__('Cancel appointment')"
      class="rounded-lg border border-outline-gray-2 p-3"
    >
      <p class="text-base text-ink-gray-9">
        {{ __('Cancel the appointment of {0}?', [cita.customer]) }}
      </p>
      <div class="mt-2 flex gap-2">
        <Button
          class="min-h-11"
          variant="solid"
          theme="red"
          :label="__('Cancel appointment')"
          @click="(confirmCancel = false), emit('action', 'cancel')"
        />
        <Button
          class="min-h-11"
          variant="subtle"
          :label="__('Keep it')"
          @click="confirmCancel = false"
        />
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { recordLink } from '@/composables/useAgenda'
import {
  citaOptions,
  receiveUrl,
  slotsOn,
  telHref,
} from '@/composables/useCitas'

const props = defineProps({
  cita: { type: Object, required: true },
  timeZone: { type: String, required: true },
  locale: { type: String, default: undefined },
  hour12: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
  returnTo: { type: String, default: '' },
})
const emit = defineEmits(['action', 'move', 'message'])

const confirmCancel = ref(false)
const rescheduling = ref(false)
const loadingSlots = ref(false)
const days = ref([])
const day = ref('')
const dayId = `cita-day-${Math.random().toString(36).slice(2, 8)}`
watch(
  () => props.cita.name,
  () => {
    confirmCancel.value = false
    rescheduling.value = false
  },
)

const open = computed(() => ['scheduled', 'past'].includes(props.cita.state))
const actionIds = computed(() =>
  (props.cita.actions || []).map((row) => row.id),
)
const whatsapp = computed(() => props.cita.whatsapp || null)
const partyLink = computed(() =>
  props.cita.party?.name
    ? recordLink(props.cita.party.doctype, props.cita.party.name)
    : {},
)

async function startReschedule() {
  rescheduling.value = true
  loadingSlots.value = true
  try {
    const data = await citaOptions()
    days.value = data.days || []
    day.value = days.value[0]?.date || ''
  } finally {
    loadingSlots.value = false
  }
}
function dayLabel(date) {
  return new Intl.DateTimeFormat(props.locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`))
}
function timeLabel(instant) {
  return new Intl.DateTimeFormat(props.locale, {
    timeZone: props.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: props.hour12,
  }).format(new Date(instant))
}
</script>
