<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading" class="space-y-2" aria-busy="true" role="status">
      <p class="text-base text-ink-gray-7">
        {{ __('Loading your settings…') }}
      </p>
      <div class="h-9 animate-pulse rounded bg-surface-gray-2" />
    </div>
    <p v-else-if="loadError" role="alert" class="text-base text-ink-red-4">
      {{ loadError }}
      <Button
        class="ml-2 min-h-11"
        variant="ghost"
        :label="__('Try again')"
        @click="load"
      />
    </p>
    <form
      v-else-if="form"
      class="flex flex-col gap-5"
      novalidate
      @submit.prevent="save"
    >
      <section
        v-if="settings.problems.length"
        role="status"
        class="rounded-lg border border-outline-gray-2 p-3"
      >
        <p class="text-base font-medium text-ink-gray-9">
          {{ __('To take appointments online:') }}
        </p>
        <ul class="mt-1 list-disc pl-5 text-sm text-ink-gray-7">
          <li v-for="row in settings.problems" :key="row.code">
            {{ row.message }}
          </li>
        </ul>
      </section>

      <fieldset>
        <legend class="text-base font-semibold text-ink-gray-9">
          {{ __('Days and hours') }}
        </legend>
        <div
          v-for="(row, index) in form.hours"
          :key="index"
          class="mt-2 grid grid-cols-[1fr_auto_auto_auto] items-center gap-2"
        >
          <select
            v-model="row.day"
            class="min-h-11 rounded border border-outline-gray-2 bg-surface-white px-2 text-base"
            :aria-label="__('Day')"
          >
            <option v-for="day in WEEKDAYS" :key="day" :value="day">
              {{ __(day) }}
            </option>
          </select>
          <input
            v-model="row.from"
            type="time"
            class="min-h-11 rounded border border-outline-gray-2 bg-surface-white px-2 text-base"
            :aria-label="__('Opens')"
          />
          <input
            v-model="row.to"
            type="time"
            class="min-h-11 rounded border border-outline-gray-2 bg-surface-white px-2 text-base"
            :aria-label="__('Closes')"
          />
          <Button
            class="min-h-11 min-w-11"
            variant="ghost"
            icon="x"
            :aria-label="__('Remove')"
            @click="form.hours.splice(index, 1)"
          />
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <Button
            class="min-h-11"
            variant="subtle"
            icon-left="plus"
            :label="__('Add hours')"
            @click="addRow"
          />
          <Button
            v-if="form.hours.length"
            class="min-h-11"
            variant="ghost"
            :label="__('Same hours Monday to Saturday')"
            @click="weekdays"
          />
        </div>
      </fieldset>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-sm text-ink-gray-7">
          {{ __('Minutes per appointment') }}
          <input
            v-model.number="form.durationMinutes"
            type="number"
            min="10"
            max="480"
            step="5"
            class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-white px-2 text-base"
          />
        </label>
        <label class="text-sm text-ink-gray-7">
          {{ __('Days ahead customers can book') }}
          <input
            v-model.number="form.daysAhead"
            type="number"
            min="1"
            max="90"
            class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-white px-2 text-base"
          />
        </label>
      </div>

      <fieldset>
        <legend class="text-base font-semibold text-ink-gray-9">
          {{ __('Who takes appointments') }}
        </legend>
        <p class="mt-1 text-sm text-ink-gray-6">
          {{
            __(
              'Each person can attend one appointment at a time, so {0} can be booked at the same time.',
              [form.agents.length || 1],
            )
          }}
        </p>
        <div class="mt-2 grid gap-1 sm:grid-cols-2">
          <label
            v-for="row in settings.users"
            :key="row.user"
            class="flex min-h-11 items-center gap-2.5 text-base text-ink-gray-8"
          >
            <input
              v-model="form.agents"
              type="checkbox"
              class="h-4 w-4 rounded"
              :value="row.user"
            />{{ row.name }}
          </label>
        </div>
      </fieldset>

      <label class="text-sm text-ink-gray-7">
        {{ __('Rest days and holidays') }}
        <select
          v-model="form.holidayList"
          class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-white px-2 text-base"
        >
          <option value="">{{ __('Choose your rest days') }}</option>
          <option
            v-for="name in settings.holidayLists"
            :key="name"
            :value="name"
          >
            {{ name }}
          </option>
        </select>
        <span
          v-if="!form.holidayList && settings.suggestedHolidayList"
          class="mt-1 block"
        >
          <Button
            class="min-h-11"
            variant="ghost"
            :label="__('Use {0}', [settings.suggestedHolidayList])"
            @click="form.holidayList = settings.suggestedHolidayList"
          />
        </span>
        <span v-else-if="!settings.holidayLists.length" class="mt-1 block">
          {{ __('Create your rest days first.') }}
          <a
            class="underline"
            href="/app/holiday-list/new"
            target="_blank"
            rel="noopener"
            >{{ __('New list of rest days') }}</a
          >
        </span>
      </label>

      <fieldset v-if="settings.profiles.length">
        <legend class="text-base font-semibold text-ink-gray-9">
          {{ __('Your online shop') }}
        </legend>
        <label
          v-for="row in form.profiles"
          :key="row.name"
          class="mt-2 flex min-h-11 items-center gap-2.5 text-base text-ink-gray-8"
        >
          <input v-model="row.on" type="checkbox" class="h-4 w-4 rounded" />
          {{ __('Show «Book» on {0}', [row.label]) }}
        </label>
        <p v-if="settings.bookingUrl" class="mt-1 text-sm text-ink-gray-6">
          {{ __('Your booking link: {0}', [settings.bookingUrl]) }}
        </p>
      </fieldset>

      <fieldset>
        <legend class="text-base font-semibold text-ink-gray-9">
          {{ __('WhatsApp messages') }}
        </legend>
        <p v-if="settings.channel.reason" class="mt-1 text-sm text-ink-gray-7">
          {{ settings.channel.reason }}
        </p>
        <label
          class="mt-2 flex min-h-11 items-start gap-2.5 text-base text-ink-gray-8"
        >
          <input
            v-model="form.autoMessages"
            type="checkbox"
            class="mt-1 h-4 w-4 rounded"
            :disabled="settings.channel.mode !== 'api'"
          />
          <span>
            {{
              __(
                'Send the confirmation, the day-before reminder and the cancellation notice by themselves',
              )
            }}
            <span class="block text-sm text-ink-gray-6">{{
              __(
                'Only with your approved templates. Off: each one waits in Avisos for you to send it.',
              )
            }}</span>
          </span>
        </label>
        <ul class="mt-1 space-y-1 text-sm text-ink-gray-7">
          <li v-for="(row, stage) in settings.channel.templates" :key="stage">
            {{ stageLabel(stage) }}: {{ row.ready ? row.template : row.reason }}
          </li>
        </ul>
        <div
          class="mt-2 rounded-lg border border-outline-gray-2 p-3 text-sm text-ink-gray-7"
        >
          <p class="text-base text-ink-gray-9">
            {{ __('Booking form inside WhatsApp') }}
          </p>
          <p v-if="settings.flow.ready" class="mt-1">
            {{ __('Ready: «Send booking link» in the chat sends it.') }}
          </p>
          <template v-else-if="settings.flow.flow">
            <p class="mt-1">
              {{
                __(
                  'Created. Publish it on WhatsApp from its page so customers can use it.',
                )
              }}
            </p>
            <a
              class="mt-1 inline-flex min-h-11 items-center underline"
              :href="`/app/whatsapp-flow/${encodeURIComponent(settings.flow.flow)}`"
              target="_blank"
              rel="noopener"
              >{{ __('Open the form to publish it') }}</a
            >
          </template>
          <template v-else>
            <p class="mt-1">
              {{
                settings.flow.account
                  ? __(
                      'Customers choose a service and a free time without leaving the chat.',
                    )
                  : __(
                      'Connect your WhatsApp number to use it. Meanwhile the chat sends your booking link.',
                    )
              }}
            </p>
            <Button
              v-if="settings.flow.account"
              class="mt-2 min-h-11"
              variant="subtle"
              :label="__('Create the booking form')"
              :loading="busy"
              @click="createFlow"
            />
          </template>
        </div>
      </fieldset>

      <AgendaGuard
        v-if="constraints.length"
        :constraints="constraints"
        :busy="busy"
        @action="load"
        @dismiss="constraints = []"
      />
      <div class="flex flex-wrap gap-2">
        <Button
          type="submit"
          class="min-h-11 flex-1 sm:flex-none"
          variant="solid"
          :label="__('Save')"
          :loading="busy"
          :disabled="!validHours(form.hours)"
        />
        <Button
          class="min-h-11"
          variant="subtle"
          :label="__('Close')"
          @click="emit('close')"
        />
      </div>
      <p v-if="!validHours(form.hours)" class="text-sm text-ink-gray-6">
        {{ __('Add at least one row of hours, opening before closing.') }}
      </p>
    </form>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { Button, toast } from 'frappe-ui'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
import {
  WEEKDAYS,
  citaSettings,
  createCitaFlow,
  saveCitaSettings,
  validHours,
} from '@/composables/useCitas'

const emit = defineEmits(['close', 'saved'])
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const settings = ref(null)
const form = ref(null)
const constraints = ref([])

function fill(data) {
  settings.value = data
  form.value = {
    version: data.version,
    durationMinutes: data.durationMinutes,
    daysAhead: data.daysAhead || 14,
    holidayList: data.holidayList || data.suggestedHolidayList || '',
    hours: data.hours.map((row) => ({ ...row })),
    agents: data.agents.map((row) => row.user),
    autoMessages: data.autoMessages,
    profiles: data.profiles.map((row) => ({
      name: row.name,
      label: row.label,
      on: row.on,
    })),
  }
}
async function load() {
  loading.value = true
  loadError.value = ''
  constraints.value = []
  try {
    fill(await citaSettings())
  } catch (error) {
    loadError.value = error?.messages?.[0] || error?.message || String(error)
  } finally {
    loading.value = false
  }
}
load()

function addRow() {
  const last = form.value.hours[form.value.hours.length - 1]
  form.value.hours.push({
    day: 'Monday',
    from: last?.from || '10:00',
    to: last?.to || '18:00',
  })
}
function weekdays() {
  const { from, to } = form.value.hours[0]
  form.value.hours = WEEKDAYS.slice(0, 6).map((day) => ({ day, from, to }))
}
function stageLabel(stage) {
  return (
    {
      confirmation: __('Confirmation'),
      reminder: __('Reminder'),
      cancellation: __('Cancellation'),
    }[stage] || stage
  )
}
async function save() {
  busy.value = true
  try {
    const result = await saveCitaSettings(form.value)
    if (result?.constraints) return (constraints.value = result.constraints)
    fill(result)
    toast.success(__('Appointment settings saved'))
    emit('saved', result)
  } catch (error) {
    constraints.value = [
      {
        code: 'unavailable',
        message: error?.messages?.[0] || error?.message || String(error),
        severity: 'block',
      },
    ]
  } finally {
    busy.value = false
  }
}
async function createFlow() {
  busy.value = true
  try {
    const result = await createCitaFlow()
    if (result?.constraints) return (constraints.value = result.constraints)
    settings.value = { ...settings.value, flow: result.flow }
  } finally {
    busy.value = false
  }
}
</script>
