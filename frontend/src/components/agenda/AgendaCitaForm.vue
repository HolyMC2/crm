<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
    <div v-if="loading" class="space-y-2" aria-busy="true" role="status">
      <p class="text-base text-ink-gray-7">{{ __('Loading free times…') }}</p>
      <div class="h-9 animate-pulse rounded bg-surface-gray-2" />
    </div>
    <div
      v-else-if="loadError || problems.length"
      role="alert"
      class="rounded-lg border border-outline-gray-2 p-3"
    >
      <p class="text-base font-medium text-ink-gray-9">
        {{ __('Online appointments need a little setup first.') }}
      </p>
      <ul class="mt-1 list-disc pl-5 text-sm text-ink-gray-7">
        <li v-if="loadError">{{ loadError }}</li>
        <li v-for="row in problems" :key="row.code">{{ row.message }}</li>
      </ul>
      <div class="mt-2 flex flex-wrap gap-2">
        <Button
          v-if="canSetUp"
          class="min-h-11"
          variant="solid"
          :label="__('Set up appointments')"
          @click="emit('open-settings')"
        />
        <Button class="min-h-11" variant="subtle" :label="__('Try again')" @click="load" />
      </div>
    </div>
    <template v-else>
      <div>
        <label class="block text-sm text-ink-gray-7" :for="ids.person">{{
          __('Customer')
        }}</label>
        <div v-if="person" class="mt-1 flex items-center gap-2">
          <span class="min-h-11 flex-1 content-center text-base text-ink-gray-9">{{
            person.label
          }}</span>
          <Button
            class="min-h-11"
            variant="ghost"
            :label="__('Change')"
            @click="person = null"
          />
        </div>
        <template v-else>
          <input
            :id="ids.person"
            v-model="query"
            type="search"
            autocomplete="off"
            class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-white px-3 text-base"
            :placeholder="__('Search by name or phone')"
            @input="search"
          />
          <ul v-if="matches.length" class="mt-1 rounded border border-outline-gray-2">
            <li v-for="row in matches" :key="row.name">
              <button
                type="button"
                class="flex min-h-11 w-full flex-col items-start px-3 py-1 text-left hover:bg-surface-gray-2"
                @click="pick(row)"
              >
                <span class="text-base text-ink-gray-9">{{ row.label }}</span>
                <span class="text-xs text-ink-gray-6">{{ row.detail }}</span>
              </button>
            </li>
          </ul>
          <p v-else-if="query.length >= 2 && !searching" class="mt-1 text-sm text-ink-gray-6">
            {{ __('No contact found. Add them in Contactos first.') }}
            <RouterLink class="underline" to="/contactos">{{ __('Open Contactos') }}</RouterLink>
          </p>
        </template>
      </div>
      <div v-if="services.length">
        <label class="block text-sm text-ink-gray-7" :for="ids.service">{{
          __('Service')
        }}</label>
        <select
          :id="ids.service"
          v-model="service"
          class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-white px-2 text-base"
        >
          <option value="">{{ __('No service yet') }}</option>
          <option v-for="row in services" :key="row.id" :value="row.id">{{ row.label }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm text-ink-gray-7" :for="ids.day">{{ __('Day') }}</label>
        <select
          :id="ids.day"
          v-model="day"
          class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-white px-2 text-base"
        >
          <option v-for="row in days" :key="row.date" :value="row.date">{{ dayLabel(row.date) }}</option>
        </select>
        <p v-if="!days.length" class="mt-1 text-sm text-ink-gray-7">
          {{ __('No free times in the coming days.') }}
        </p>
      </div>
      <fieldset v-if="day">
        <legend class="text-sm text-ink-gray-7">{{ __('Time') }}</legend>
        <div class="mt-1 flex flex-wrap gap-2">
          <button
            v-for="slot in slotsOn(days, day)"
            :key="slot.start"
            type="button"
            class="min-h-11 rounded-md border px-3 text-base"
            :class="
              start === slot.start
                ? 'border-outline-gray-5 bg-surface-gray-3 font-semibold text-ink-gray-9'
                : 'border-outline-gray-2 text-ink-gray-8'
            "
            :aria-pressed="start === slot.start"
            @click="start = slot.start"
          >
            {{ timeLabel(slot.start) }}
          </button>
        </div>
      </fieldset>
      <div>
        <label class="block text-sm text-ink-gray-7" :for="ids.notes">{{
          __('What did they tell you?')
        }}</label>
        <textarea
          :id="ids.notes"
          v-model="notes"
          rows="3"
          maxlength="600"
          class="mt-1 w-full rounded border border-outline-gray-2 bg-surface-white px-3 py-2 text-base"
        />
      </div>
      <AgendaGuard
        v-if="constraints.length"
        :constraints="constraints"
        :busy="busy"
        @action="guard"
        @dismiss="emit('dismiss-guard')"
      />
      <p v-if="missing" class="text-sm text-ink-gray-6">{{ missing }}</p>
      <div class="flex flex-wrap gap-2">
        <Button
          type="submit"
          class="min-h-11 flex-1 sm:flex-none"
          variant="solid"
          :label="__('Book appointment')"
          :loading="busy"
          :disabled="Boolean(missing)"
        />
        <Button
          class="min-h-11"
          variant="subtle"
          :label="__('Cancel')"
          @click="emit('close', dirty)"
        />
      </div>
    </template>
  </form>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { Button } from 'frappe-ui'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
import { searchPeople } from '@/composables/useAgenda'
import { citaOptions, slotsOn } from '@/composables/useCitas'

const props = defineProps({
  initial: { type: Object, default: () => ({}) },
  timeZone: { type: String, required: true },
  locale: { type: String, default: undefined },
  hour12: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
  constraints: { type: Array, default: () => [] },
})
const emit = defineEmits(['save', 'close', 'dismiss-guard', 'open-settings'])

const suffix = Math.random().toString(36).slice(2, 8)
const ids = {
  person: `cita-person-${suffix}`,
  service: `cita-service-${suffix}`,
  day: `cita-day-${suffix}`,
  notes: `cita-notes-${suffix}`,
}
const loading = ref(true)
const loadError = ref('')
const problems = ref([])
const canSetUp = ref(false)
const services = ref([])
const days = ref([])
const person = ref(props.initial.contact || null)
const query = ref('')
const matches = ref([])
const searching = ref(false)
const service = ref('')
const day = ref('')
const start = ref('')
const notes = ref(props.initial.notes || '')

const dirty = computed(() => Boolean(start.value || notes.value || service.value))
const missing = computed(() => {
  if (!person.value) return __('Choose the customer.')
  if (!start.value) return __('Choose a free time.')
  return ''
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await citaOptions()
    problems.value = data.problems || []
    canSetUp.value = Boolean(data.canSetUp)
    services.value = data.services || []
    days.value = data.days || []
    day.value = days.value[0]?.date || ''
  } catch (error) {
    loadError.value = error?.messages?.[0] || error?.message || String(error)
  } finally {
    loading.value = false
  }
}
onMounted(load)

let timer
function search() {
  clearTimeout(timer)
  const text = query.value.trim()
  if (text.length < 2) return (matches.value = [])
  searching.value = true
  timer = setTimeout(async () => {
    try {
      const data = await searchPeople(text)
      if (query.value.trim() !== text) return
      matches.value = (data.people || []).filter((row) => row.doctype === 'Contact')
    } finally {
      searching.value = false
    }
  }, 250)
}
function pick(row) {
  person.value = { name: row.name, label: row.label }
  matches.value = []
  query.value = ''
}
function submit() {
  if (missing.value) return
  emit('save', {
    contact: person.value.name,
    service: service.value || undefined,
    start: start.value,
    notes: notes.value.trim(),
    ...(props.initial.conversation ? { conversation: props.initial.conversation } : {}),
  })
}
function guard(id) {
  if (id === 'pick_time' || id === 'retry') {
    start.value = ''
    emit('dismiss-guard')
    return load()
  }
  emit('dismiss-guard')
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
