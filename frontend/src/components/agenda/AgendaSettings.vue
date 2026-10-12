<template>
  <Dialog
    :open="true"
    :title="__('Agenda settings')"
    size="2xl"
    @update:open="(open) => !open && emit('close')"
  >
    <template #body-content>
      <div class="flex flex-col gap-5 sm:flex-row">
        <nav
          class="flex shrink-0 gap-1 overflow-x-auto sm:w-44 sm:flex-col"
          :aria-label="__('Sections')"
        >
          <button
            v-for="entry in sections"
            :key="entry.value"
            type="button"
            class="flex min-h-10 items-center gap-2 rounded-lg px-3 text-left text-sm"
            :class="
              section === entry.value
                ? 'bg-surface-gray-2 font-semibold text-ink-gray-9'
                : 'text-ink-gray-7 hover:bg-surface-gray-1'
            "
            :aria-current="section === entry.value ? 'page' : undefined"
            @click="section = entry.value"
          >
            <span :class="entry.icon" class="h-4 w-4" aria-hidden="true" />{{
              entry.label
            }}
          </button>
        </nav>

        <!-- General -->
        <div
          v-if="section === 'general'"
          class="flex min-w-0 flex-1 flex-col gap-4"
        >
          <FormControl
            v-model="prefs.view"
            type="select"
            :label="__('Open the Agenda in')"
            :options="viewOptions"
          />
          <FormControl
            :model-value="
              prefs.weekStart === null ? '' : String(prefs.weekStart)
            "
            type="select"
            :label="__('Start of the week')"
            :options="weekOptions"
            @update:model-value="
              (value) => (prefs.weekStart = value === '' ? null : Number(value))
            "
          />
          <FormControl
            v-model="prefs.density"
            type="select"
            :label="__('Hour height')"
            :options="densityOptions"
          />
          <FormControl
            :model-value="String(prefs.dayStartHour)"
            type="select"
            :label="__('The day opens at')"
            :options="hourOptions"
            @update:model-value="
              (value) => (prefs.dayStartHour = Number(value))
            "
          />
          <FormControl
            :model-value="String(prefs.defaultDuration)"
            type="select"
            :label="__('Default event length')"
            :options="durationOptions"
            @update:model-value="
              (value) => (prefs.defaultDuration = Number(value))
            "
          />
          <div class="flex flex-col gap-2">
            <FormControl
              v-model="prefs.showWeekends"
              type="checkbox"
              :label="__('Show weekends')"
            />
            <FormControl
              v-model="prefs.showDone"
              type="checkbox"
              :label="__('Show finished events and tasks')"
            />
            <FormControl
              v-model="prefs.showCancelled"
              type="checkbox"
              :label="__('Show cancelled events')"
            />
            <FormControl
              v-model="prefs.dimPast"
              type="checkbox"
              :label="__('Dim past events')"
            />
          </div>
          <div>
            <Button
              variant="subtle"
              :label="__('Restore defaults')"
              @click="emit('reset')"
            />
          </div>
        </div>

        <!-- Calendars -->
        <div
          v-else-if="section === 'calendars'"
          class="flex min-w-0 flex-1 flex-col gap-1"
        >
          <p class="pb-2 text-sm text-ink-gray-6">
            {{
              __(
                'Pick a color for each calendar. Each event can also have its own color.',
              )
            }}
          </p>
          <div
            v-for="calendar in calendars"
            :key="calendar.key"
            class="flex flex-col gap-2 border-b border-outline-gray-1 py-3"
          >
            <label class="flex items-center gap-3 text-sm text-ink-gray-9">
              <input
                type="checkbox"
                class="h-4 w-4 rounded"
                :checked="calendar.visible"
                :disabled="calendar.blocked"
                @change="emit('toggle', calendar.key)"
              />
              <span
                class="h-3 w-3 rounded-full"
                :style="{ background: calendar.color }"
                aria-hidden="true"
              />
              <span class="font-medium">{{ calendar.label }}</span>
              <span v-if="calendar.reason" class="text-xs text-ink-gray-6">{{
                calendar.reason
              }}</span>
            </label>
            <div
              v-if="!calendar.blocked"
              class="flex flex-wrap gap-2 pl-7"
              role="radiogroup"
              :aria-label="__('Color for {0}', [calendar.label])"
            >
              <button
                v-for="swatch in PALETTE"
                :key="swatch.id"
                type="button"
                class="grid h-6 w-6 place-items-center rounded-full"
                role="radio"
                :aria-checked="swatch.hex === calendar.color"
                :aria-label="__(swatch.name)"
                :title="__(swatch.name)"
                :style="{ background: swatch.hex }"
                @click="emit('color', calendar.key, swatch.hex)"
              >
                <span
                  v-if="swatch.hex === calendar.color"
                  class="lucide-check h-3.5 w-3.5"
                  :style="{ color: textOn(swatch.hex) }"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </div>

        <!-- Sync -->
        <div v-else class="flex min-w-0 flex-1 flex-col gap-5">
          <section class="rounded-xl border border-outline-gray-2 p-4">
            <div class="flex items-start gap-3">
              <span
                class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-gray-2 text-lg font-bold text-ink-gray-8"
                aria-hidden="true"
                >G</span
              >
              <div class="min-w-0 flex-1">
                <h3 class="text-base font-semibold text-ink-gray-9">
                  Google Calendar
                </h3>
                <p class="mt-0.5 text-sm text-ink-gray-7">{{ googleText }}</p>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <template v-if="google?.available">
                <template v-if="google.connected && google.authorized">
                  <Button
                    variant="solid"
                    icon-left="refresh-cw"
                    :loading="busy === 'sync'"
                    :label="__('Sync now')"
                    @click="emit('google', 'sync')"
                  />
                  <FormControl
                    :model-value="prefs.syncGoogle"
                    type="checkbox"
                    :label="__('Save my new events in Google too')"
                    @update:model-value="(value) => (prefs.syncGoogle = value)"
                  />
                  <Button
                    variant="ghost"
                    theme="red"
                    :loading="busy === 'disconnect'"
                    :label="__('Disconnect')"
                    @click="emit('google', 'disconnect')"
                  />
                </template>
                <Button
                  v-else
                  variant="solid"
                  :loading="busy === 'connect'"
                  :label="
                    google.connected
                      ? __('Finish connecting')
                      : __('Connect with Google')
                  "
                  @click="emit('google', 'connect')"
                />
              </template>
              <template v-else-if="google?.canConfigure">
                <Button
                  variant="subtle"
                  icon-left="external-link"
                  :label="__('Set up Google for this business')"
                  @click="openGoogleSettings"
                />
              </template>
            </div>
          </section>

          <section class="rounded-xl border border-outline-gray-2 p-4">
            <h3 class="text-base font-semibold text-ink-gray-9">
              {{ __('Subscribe from Outlook, Apple or any calendar') }}
            </h3>
            <p class="mt-0.5 text-sm text-ink-gray-7">
              {{
                __(
                  'A private link that keeps your Agenda on your phone or computer. Anyone with the link can see your events, so keep it to yourself.',
                )
              }}
            </p>
            <div v-if="ics?.url" class="mt-3 flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <input
                  :value="ics.url"
                  readonly
                  class="min-w-0 flex-1 rounded-md bg-surface-gray-2 px-2 py-1.5 font-mono text-xs text-ink-gray-8"
                  :aria-label="__('Subscription link')"
                  @focus="$event.target.select()"
                />
                <Button
                  variant="subtle"
                  icon-left="copy"
                  :label="__('Copy')"
                  @click="copy(ics.url)"
                />
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  v-if="ics.webcal"
                  variant="subtle"
                  :label="__('Open in Apple Calendar')"
                  @click="open(ics.webcal)"
                />
                <Button
                  variant="subtle"
                  :label="__('Add to Outlook')"
                  @click="open(outlookUrl)"
                />
                <Button
                  variant="subtle"
                  :label="__('Add to Google')"
                  @click="open(googleUrl)"
                />
                <Button
                  variant="ghost"
                  theme="red"
                  :loading="busy === 'rotate'"
                  :label="__('Reset link')"
                  @click="emit('ics', 'rotate')"
                />
              </div>
              <p v-if="copied" role="status" class="text-sm text-ink-green-3">
                {{ copied }}
              </p>
            </div>
            <Button
              v-else
              class="mt-3"
              variant="solid"
              :loading="busy === 'ics'"
              :label="__('Create my link')"
              @click="emit('ics', 'create')"
            />
          </section>
          <p v-if="error" role="alert" class="text-sm text-ink-red-4">
            {{ error }}
          </p>
        </div>
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import { PALETTE, textOn } from '@/components/agenda/agendaColors'
import { DENSITIES, useAgendaPrefs } from '@/composables/useAgendaPrefs'

const props = defineProps({
  calendars: { type: Array, default: () => [] },
  sync: { type: Object, default: null },
  initial: { type: String, default: 'general' },
  busy: { type: String, default: '' },
  error: { type: String, default: '' },
  locale: { type: String, default: undefined },
})
const emit = defineEmits(['close', 'toggle', 'color', 'reset', 'google', 'ics'])
// The shared, persisted preferences: changes apply at once and follow the worker.
const { prefs } = useAgendaPrefs()

const section = ref(
  ['general', 'calendars', 'sync'].includes(props.initial)
    ? props.initial
    : 'general',
)
const sections = [
  { value: 'general', label: __('General'), icon: 'lucide-settings' },
  { value: 'calendars', label: __('Calendars'), icon: 'lucide-palette' },
  { value: 'sync', label: __('Sync and subscribe'), icon: 'lucide-refresh-cw' },
]
const viewOptions = [
  { label: __('Automatic'), value: '' },
  { label: __('Day'), value: 'day' },
  { label: __('4 days'), value: '4day' },
  { label: __('Week'), value: 'week' },
  { label: __('Month'), value: 'month' },
  { label: __('Schedule view'), value: 'list' },
]
const weekOptions = computed(() => {
  const names = [0, 1, 6].map((index) => ({
    value: String(index),
    // 2024-01-07 was a Sunday.
    label: new Intl.DateTimeFormat(props.locale, {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, 7 + index, 12))),
  }))
  return [{ label: __('Business setting'), value: '' }, ...names]
})
const densityOptions = [
  { label: __('Compact'), value: 'compact' },
  { label: __('Comfortable'), value: 'comfortable' },
  { label: __('Spacious'), value: 'spacious' },
].filter((row) => row.value in DENSITIES)
const hourOptions = Array.from({ length: 13 }, (_, hour) => ({
  value: String(hour + 5),
  label: `${String(hour + 5).padStart(2, '0')}:00`,
}))
const durationOptions = [15, 30, 45, 60, 90, 120].map((minutes) => ({
  value: String(minutes),
  label:
    minutes < 60
      ? `${minutes} min`
      : minutes % 60
        ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
        : `${minutes / 60} h`,
}))

const google = computed(() => props.sync?.google || null)
const ics = computed(() => props.sync?.ics || null)
const googleText = computed(() => {
  const value = google.value
  if (!value) return __('Checking the connection…')
  if (!value.available)
    return (
      value.reason ||
      __(
        'Google is not set up for this business yet. Ask your manager to enable it.',
      )
    )
  if (value.connected && value.authorized)
    return __(
      'Your Google events show here and your Agenda goes to Google. Changes go both ways.',
    )
  if (value.connected)
    return __('Almost there: allow access in Google to finish.')
  return __(
    'Sign in with Google once and your calendars stay in sync both ways.',
  )
})
const copied = ref('')
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Link copied')
  } catch {
    copied.value = text
  }
}
const open = (url) => window.open(url, '_blank', 'noopener')
const outlookUrl = computed(
  () =>
    `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(ics.value?.url || '')}&name=${encodeURIComponent('Muelle')}`,
)
const googleUrl = computed(
  () =>
    `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(ics.value?.webcal || ics.value?.url || '')}`,
)
const openGoogleSettings = () =>
  window.open('/app/google-settings', '_blank', 'noopener')
</script>
