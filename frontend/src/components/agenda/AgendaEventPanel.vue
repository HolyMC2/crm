<template>
  <article class="flex flex-col gap-4" :aria-label="event.title">
    <div class="-mr-2 flex items-center justify-end gap-0.5">
      <button
        v-if="event.canEdit && event.status === 'Scheduled' && !shift && !task"
        type="button"
        class="ag-tool"
        :aria-label="__('Edit')"
        :title="__('Edit')"
        @click="emit('edit')"
      >
        <span class="lucide-pencil h-4 w-4" aria-hidden="true" />
      </button>
      <button
        v-if="event.canEdit && event.status === 'Scheduled' && !shift && !task"
        type="button"
        class="ag-tool"
        :aria-label="event.seriesId ? __('Cancel series') : __('Cancel event')"
        :title="event.seriesId ? __('Cancel series') : __('Cancel event')"
        @click="confirmCancel = true"
      >
        <span class="lucide-trash-2 h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="ag-tool"
        :aria-label="__('Copy link')"
        :title="__('Copy link')"
        @click="emit('copy-link')"
      >
        <span class="lucide-link h-4 w-4" aria-hidden="true" />
      </button>
      <button
        v-if="event.source === 'Event'"
        type="button"
        class="ag-tool"
        :aria-label="__('Open the full record')"
        :title="__('Open the full record')"
        @click="emit('open-native')"
      >
        <span class="lucide-external-link h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="ag-tool hidden sm:grid"
        :aria-label="__('Close')"
        @click="emit('close')"
      >
        <span class="lucide-x h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    <header class="flex items-start gap-4">
      <span
        class="mt-2 h-3.5 w-3.5 shrink-0"
        :class="task ? 'rounded-full border-2' : 'rounded'"
        :style="task ? { borderColor: color } : { background: color }"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <h2
          class="text-xl font-normal text-ink-gray-9 sm:text-[22px]"
          :class="
            ['Done', 'Cancelled'].includes(event.status) ? 'line-through' : ''
          "
        >
          {{ event.title }}
        </h2>
        <p class="mt-1 text-sm text-ink-gray-7">{{ when }}</p>
        <p v-if="event.recurrenceLabel" class="text-sm text-ink-gray-6">
          {{ event.recurrenceLabel }}
        </p>
        <p v-if="calendar" class="mt-1 text-xs text-ink-gray-6">
          {{ calendar }}
        </p>
      </div>
      <Badge v-if="badge" :theme="badge.theme" :label="badge.label" />
    </header>

    <div
      v-if="
        event.canEdit &&
        !shift &&
        !task &&
        event.source === 'Event' &&
        event.status !== 'Cancelled'
      "
      class="flex flex-wrap items-center gap-1.5 pl-[30px]"
      role="radiogroup"
      :aria-label="__('Event color')"
    >
      <button
        v-for="swatch in swatches"
        :key="swatch.hex"
        type="button"
        class="grid h-5 w-5 place-items-center rounded-full"
        role="radio"
        :aria-checked="(event.color || '') === swatch.value"
        :aria-label="swatch.label"
        :title="swatch.label"
        :style="{ background: swatch.hex }"
        :disabled="busy"
        @click="emit('color', swatch.value)"
      >
        <span
          v-if="(event.color || '') === swatch.value"
          class="lucide-check h-3 w-3"
          :style="{ color: textOn(swatch.hex) }"
          aria-hidden="true"
        />
      </button>
    </div>

    <template v-if="task">
      <p
        v-if="event.referenceLabel || event.referenceName"
        class="pl-[30px] text-sm"
      >
        {{ __('Linked to') }}
        <component
          :is="taskReference.to ? RouterLink : 'a'"
          v-bind="
            taskReference.to
              ? { to: taskReference.to }
              : { href: taskReference.href, target: '_blank', rel: 'noopener' }
          "
          class="font-medium text-ink-gray-9 underline-offset-2 hover:underline"
          >{{ event.referenceLabel || event.referenceName }}</component
        >
      </p>
      <div class="flex flex-wrap gap-2 pt-1">
        <Button
          v-if="event.status !== 'Done'"
          class="min-h-11"
          variant="solid"
          icon-left="check"
          :loading="busy"
          :label="__('Mark as done')"
          @click="emit('task-done')"
        />
        <Button
          v-else
          class="min-h-11"
          variant="subtle"
          :loading="busy"
          :label="__('Reopen')"
          @click="emit('task-reopen')"
        />
        <Button
          class="min-h-11"
          variant="subtle"
          :label="__('Open task')"
          @click="emit('open-task')"
        />
      </div>
    </template>

    <AgendaGuard
      v-if="constraints.length"
      :constraints="constraints"
      :busy="busy"
      @action="(id) => emit('guard-action', id)"
      @dismiss="emit('dismiss-guard')"
    />

    <template v-if="shift">
      <p class="text-base text-ink-gray-7">
        {{
          event.estimated
            ? __(
                'Estimated from the rotation; it is confirmed when the schedule is published.',
              )
            : __(
                'Shifts are planned in Asistencia. Ask your manager for changes.',
              )
        }}
      </p>
      <Button
        class="min-h-11 self-start"
        variant="subtle"
        icon-left="external-link"
        :label="__('Open Turnos')"
        @click="emit('open-turnos')"
      />
    </template>

    <template v-else-if="!task">
      <div v-if="loading" class="space-y-2" aria-busy="true">
        <div class="h-4 w-2/3 animate-pulse rounded bg-surface-gray-2" />
        <div class="h-4 w-1/2 animate-pulse rounded bg-surface-gray-2" />
      </div>
      <p v-else-if="error" role="alert" class="text-base text-ink-red-4">
        {{ error }}
        <Button
          class="ml-2 min-h-11"
          variant="ghost"
          :label="__('Try again')"
          @click="emit('reload')"
        />
      </p>
      <dl
        v-else-if="detail"
        class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-base"
      >
        <template v-if="detail.location">
          <dt class="text-ink-gray-6">{{ __('Place') }}</dt>
          <dd class="text-ink-gray-9">{{ detail.location }}</dd>
        </template>
        <dt class="text-ink-gray-6">{{ __('Organizer') }}</dt>
        <dd class="text-ink-gray-9">
          {{ detail.organizer.me ? __('You') : detail.organizer.name }}
        </dd>
        <template v-if="detail.attendees.length">
          <dt class="text-ink-gray-6">{{ __('With') }}</dt>
          <dd class="text-ink-gray-9">
            <ul>
              <li
                v-for="person in detail.attendees"
                :key="`${person.doctype}:${person.name}`"
              >
                <RouterLink
                  v-if="person.doctype === 'Contact'"
                  class="underline-offset-2 hover:underline"
                  :to="`/contactos/contact/${encodeURIComponent(person.name)}`"
                  >{{ person.label || person.name }}</RouterLink
                >
                <span v-else>{{
                  person.label || person.email || person.name
                }}</span>
              </li>
            </ul>
          </dd>
        </template>
        <template v-if="detail.reminders.length">
          <dt class="text-ink-gray-6">{{ __('Reminder') }}</dt>
          <dd class="text-ink-gray-9">{{ reminderText }}</dd>
        </template>
        <template v-if="detail.reference">
          <dt class="text-ink-gray-6">{{ __('Linked to') }}</dt>
          <dd>
            <RouterLink
              v-if="referenceLink.to"
              class="font-medium text-ink-gray-9 underline-offset-2 hover:underline"
              :to="referenceLink.to"
              >{{ detail.reference.label || detail.reference.name }}</RouterLink
            >
            <a
              v-else
              class="font-medium text-ink-gray-9 underline-offset-2 hover:underline"
              :href="referenceLink.href"
              target="_blank"
              rel="noopener"
              >{{ detail.reference.label || detail.reference.name }}</a
            >
          </dd>
        </template>
        <template v-if="detail.description">
          <dt class="text-ink-gray-6">{{ __('Notes') }}</dt>
          <dd class="whitespace-pre-line text-ink-gray-9">
            {{ detail.description }}
          </dd>
        </template>
      </dl>

      <div
        class="sticky bottom-0 flex flex-wrap gap-2 bg-surface-elevation-2 pb-[env(safe-area-inset-bottom)] pt-2"
      >
        <template v-if="event.canEdit">
          <template v-if="event.status === 'Scheduled'">
            <Button
              class="min-h-11 flex-1 sm:flex-none"
              variant="solid"
              :label="__('Reschedule')"
              @click="emit('reschedule')"
            />
            <Button
              class="min-h-11"
              variant="subtle"
              :label="__('Mark as done')"
              :loading="busy"
              @click="emit('status', 'complete')"
            />
          </template>
          <Button
            v-else
            class="min-h-11"
            variant="subtle"
            :label="__('Reopen')"
            @click="emit('status', 'reopen')"
          />
        </template>
        <template v-else>
          <p class="w-full text-sm text-ink-gray-6">
            {{ __('Only {0} can change this event.', [event.organizerName]) }}
          </p>
          <Button
            class="min-h-11"
            variant="solid"
            :label="__('Ask the organizer')"
            @click="emit('request-change')"
          />
        </template>
      </div>
      <div
        v-if="confirmCancel"
        role="alertdialog"
        :aria-label="__('Cancel event')"
        class="rounded-lg border border-outline-gray-2 p-3"
      >
        <p class="text-base text-ink-gray-9">
          {{
            event.seriesId
              ? __('Cancel every date of «{0}»?', [event.title])
              : __('Cancel «{0}»?', [event.title])
          }}
        </p>
        <div class="mt-2 flex gap-2">
          <Button
            class="min-h-11"
            variant="solid"
            theme="red"
            :label="event.seriesId ? __('Cancel series') : __('Cancel event')"
            @click="(confirmCancel = false), emit('status', 'cancel')"
          />
          <Button
            class="min-h-11"
            variant="subtle"
            :label="__('Keep it')"
            @click="confirmCancel = false"
          />
        </div>
      </div>
    </template>
  </article>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge, Button } from 'frappe-ui'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
import { PALETTE, textOn } from '@/components/agenda/agendaColors'
import { recordLink } from '@/composables/useAgenda'

const props = defineProps({
  event: { type: Object, required: true },
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  timeZone: { type: String, required: true },
  locale: { type: String, default: undefined },
  hour12: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
  constraints: { type: Array, default: () => [] },
  color: { type: String, default: '#039be5' },
  calendar: { type: String, default: '' },
})
const emit = defineEmits([
  'copy-link',
  'open-native',
  'color',
  'task-done',
  'task-reopen',
  'open-task',
  'close',
  'reschedule',
  'edit',
  'status',
  'request-change',
  'guard-action',
  'dismiss-guard',
  'open-turnos',
  'reload',
])
const confirmCancel = ref(false)
const task = computed(() => props.event.kind === 'task')
const swatches = computed(() => [
  {
    value: '',
    hex: props.calendar && !props.event.color ? props.color : '#9aa0a6',
    label: __('Calendar color'),
  },
  ...PALETTE.slice(0, 11).map((row) => ({
    value: row.hex,
    hex: row.hex,
    label: __(row.name),
  })),
])
const taskReference = computed(() =>
  props.event.referenceDoctype && props.event.referenceName
    ? recordLink(props.event.referenceDoctype, props.event.referenceName)
    : {},
)
watch(
  () => props.event.id,
  () => (confirmCancel.value = false),
)
const shift = computed(
  () => props.event.kind === 'shift' || props.event.kind === 'my_shift',
)
const when = computed(() => {
  const start = new Date(props.event.start)
  const end = new Date(props.event.end)
  const day = new Intl.DateTimeFormat(props.locale, {
    timeZone: props.timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  if (task.value) return `${day.format(start)} · ${__('Task')}`
  if (props.event.allDay) {
    const last = new Date(end.getTime() - 1)
    const lastText = day.format(last)
    return lastText === day.format(start)
      ? `${day.format(start)} · ${__('All day')}`
      : `${day.format(start)} – ${lastText}`
  }
  const time = new Intl.DateTimeFormat(props.locale, {
    timeZone: props.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: props.hour12,
  })
  return `${day.format(start)} · ${time.format(start)} – ${time.format(end)}`
})
const badge = computed(() => {
  if (shift.value)
    return {
      theme: 'gray',
      label: props.event.estimated ? __('Estimated shift') : __('Shift'),
    }
  if (props.event.status === 'Done')
    return { theme: 'green', label: __('Done') }
  if (props.event.status === 'Cancelled')
    return { theme: 'gray', label: __('Cancelled') }
  return null
})
const referenceLink = computed(() =>
  props.detail?.reference
    ? recordLink(props.detail.reference.doctype, props.detail.reference.name)
    : {},
)
const reminderText = computed(() =>
  (props.detail?.reminders || [])
    .map((row) => {
      const unit = {
        minutes: __('minutes'),
        hours: __('hours'),
        days: __('days'),
        weeks: __('weeks'),
      }[row.interval]
      return __('{0} {1} before', [row.before, unit || row.interval])
    })
    .join(', '),
)
</script>
<style scoped>
.ag-tool {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  color: var(--ink-gray-7);
}
.ag-tool:hover {
  background: var(--surface-gray-2);
}
</style>
