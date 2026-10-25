<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading" class="space-y-2" aria-busy="true" role="status">
      <p class="text-base text-ink-gray-7">
        {{ __('Loading your settings…') }}
      </p>
      <div class="h-9 animate-pulse rounded-4 bg-surface-gray-2" />
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
      ref="root"
      class="flex flex-col gap-5"
      novalidate
      @submit.prevent="save"
    >
      <section
        v-if="settings.problems.length"
        role="status"
        class="rounded-6 border border-outline-gray-2 p-3"
      >
        <p class="text-base-medium text-ink-gray-9">
          {{ __('To take appointments online:') }}
        </p>
        <ul class="mt-1 space-y-2">
          <li
            v-for="row in settings.problems"
            :key="row.code"
            class="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-gray-7"
          >
            <span class="flex-1 basis-48">{{ row.message }}</span>
            <Button
              v-if="SETUP_SECTIONS[row.code]"
              class="min-h-11"
              variant="subtle"
              :label="__(SETUP_SECTIONS[row.code].label)"
              @click="focusSection(SETUP_SECTIONS[row.code].section)"
            />
          </li>
        </ul>
      </section>

      <fieldset data-section="hours scheduling">
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
            class="min-h-11 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9"
            :aria-label="__('Day')"
          >
            <option v-for="day in WEEKDAYS" :key="day" :value="day">
              {{ __(day) }}
            </option>
          </select>
          <input
            v-model="row.from"
            type="time"
            class="min-h-11 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9"
            :aria-label="__('Opens')"
          />
          <input
            v-model="row.to"
            type="time"
            class="min-h-11 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9"
            :aria-label="__('Closes')"
          />
          <Button
            class="min-h-11 min-w-11"
            variant="ghost"
            :icon="LucideX"
            :aria-label="__('Remove')"
            @click="form.hours.splice(index, 1)"
          />
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <Button
            class="min-h-11"
            variant="subtle"
            :icon-left="LucidePlus"
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
            class="mt-1 min-h-11 w-full rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9"
          />
        </label>
        <label class="text-sm text-ink-gray-7">
          {{ __('Days ahead customers can book') }}
          <input
            v-model.number="form.daysAhead"
            type="number"
            min="1"
            max="90"
            class="mt-1 min-h-11 w-full rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9"
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
              class="h-4 w-4 rounded-4"
              :value="row.user"
            />{{ row.name }}
          </label>
        </div>
      </fieldset>

      <label class="text-sm text-ink-gray-7" data-section="rest_days">
        {{ __('Rest days and holidays') }}
        <select
          v-model="form.holidayList"
          class="mt-1 min-h-11 w-full rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9"
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
          <input v-model="row.on" type="checkbox" class="h-4 w-4 rounded-4" />
          {{ __('Show «Book» on {0}', [row.label]) }}
        </label>
        <p v-if="settings.bookingUrl" class="mt-1 text-sm text-ink-gray-6">
          {{ __('Your booking link: {0}', [settings.bookingUrl]) }}
        </p>
      </fieldset>

      <fieldset v-if="services" data-section="services">
        <legend class="text-base font-semibold text-ink-gray-9">
          {{ __('Services') }}
        </legend>
        <p v-if="services.profile" class="mt-1 text-sm text-ink-gray-6">
          {{ __('Your online shop: {0}', [services.profile.label]) }}
          <span v-if="!services.profile.on">
            {{ __('«Book» is off there; turn it on above.') }}
          </span>
        </p>
        <p v-else class="mt-1 text-sm text-ink-gray-6">
          {{
            __(
              'This site has no online shop yet, so there is nowhere to publish services.',
            )
          }}
        </p>
        <label class="mt-2 block text-sm text-ink-gray-7">
          {{ __('Group that holds your services') }}
          <select
            v-model="servicesForm.group"
            class="mt-1 min-h-11 w-full rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9"
            :disabled="!services.can_fix || !services.profile"
            @change="loadServices(servicesForm.group)"
          >
            <option value="">{{ __('Choose a group') }}</option>
            <option
              v-for="row in services.groups"
              :key="row.name"
              :value="row.name"
            >
              {{ row.label }}
            </option>
          </select>
        </label>
        <p
          v-if="servicesForm.group && !services.items.length"
          class="mt-1 text-sm text-ink-gray-6"
        >
          {{ __('No services in this group yet.') }}
        </p>
        <label
          v-for="row in services.items"
          :key="row.id"
          class="flex min-h-11 items-center gap-2.5 text-base text-ink-gray-8"
        >
          <input
            v-model="servicesForm.published"
            type="checkbox"
            class="h-4 w-4 rounded-4"
            :value="row.id"
            :disabled="!services.can_fix"
          />{{ row.label }}
        </label>
        <ClaimGuard
          v-if="!services.can_fix"
          class="mt-2"
          :guard="setupGuard(settings.fixers)"
        />
        <Button
          v-else-if="services.profile"
          class="mt-2 min-h-11"
          variant="subtle"
          :label="__('Save services')"
          :loading="busy"
          :disabled="!servicesForm.group"
          @click="saveServices"
        />
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
            class="mt-1 h-4 w-4 rounded-4"
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
          class="mt-2 rounded-6 border border-outline-gray-2 p-3 text-sm text-ink-gray-7"
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
        @action="guardAction"
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
import { nextTick, reactive, ref } from 'vue'
import { Button, toast } from 'frappe-ui'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import {
  SETUP_SECTIONS,
  WEEKDAYS,
  citaServices,
  citaSettings,
  createCitaFlow,
  saveCitaServices,
  saveCitaSettings,
  setupGuard,
  validHours,
} from '@/composables/useCitas'
import LucideX from '~icons/lucide/x'
import LucidePlus from '~icons/lucide/plus'

const props = defineProps({
  // The fieldset to scroll to and focus on open (a SETUP_SECTIONS section).
  section: { type: String, default: '' },
})
const emit = defineEmits(['close', 'saved'])
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const settings = ref(null)
const form = ref(null)
const constraints = ref([])
const root = ref(null)
const services = ref(null)
const servicesForm = reactive({ group: '', published: [] })

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
function fillServices(data) {
  services.value = data
  servicesForm.group = data.group || ''
  servicesForm.published = data.items
    .filter((row) => row.published)
    .map((row) => row.id)
}
async function loadServices(group = '') {
  try {
    fillServices(await citaServices(group))
  } catch (error) {
    services.value = null
    toast.error(error?.messages?.[0] || error?.message || String(error))
  }
}
async function load() {
  loading.value = true
  loadError.value = ''
  constraints.value = []
  try {
    const [data] = await Promise.all([citaSettings(), loadServices()])
    fill(data)
  } catch (error) {
    loadError.value = error?.messages?.[0] || error?.message || String(error)
  } finally {
    loading.value = false
  }
  await nextTick()
  focusSection(props.section)
}
load()

// `data-section` lists the problem sections a fieldset fixes («hours scheduling»).
function focusSection(section) {
  if (!section) return
  const target = root.value?.querySelector(`[data-section~="${section}"]`)
  if (!target) return
  target.scrollIntoView({ block: 'start' })
  target.querySelector('select, input, button')?.focus({ preventScroll: true })
}
function guardAction(id) {
  if (id !== 'set_up') return load()
  const row = constraints.value.find((item) => SETUP_SECTIONS[item.code])
  constraints.value = []
  focusSection(SETUP_SECTIONS[row?.code]?.section)
}

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
async function saveServices() {
  busy.value = true
  try {
    const result = await saveCitaServices({
      group: servicesForm.group,
      published: servicesForm.published,
    })
    if (result?.constraints) return (constraints.value = result.constraints)
    fillServices(result)
    const data = await citaSettings()
    fill(data)
    toast.success(__('Services saved'))
    emit('saved', data)
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
