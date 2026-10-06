<template>
  <article class="flex flex-col gap-4" :aria-label="event.title">
    <header class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <h2
          class="text-xl font-semibold text-ink-gray-9"
          :class="event.status === 'Done' ? 'line-through' : ''"
        >
          {{ event.title }}
        </h2>
        <p class="mt-1 text-base text-ink-gray-7">{{ when }}</p>
        <p v-if="event.recurrenceLabel" class="text-sm text-ink-gray-6">
          {{ event.recurrenceLabel }}
        </p>
      </div>
      <Badge v-if="badge" :theme="badge.theme" :label="badge.label" />
      <Button
        icon="x"
        variant="ghost"
        class="hidden min-h-11 min-w-11 sm:inline-flex"
        :aria-label="__('Close')"
        @click="emit('close')"
      />
    </header>

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

    <template v-else>
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
        class="sticky bottom-0 flex flex-wrap gap-2 bg-surface-white pb-[env(safe-area-inset-bottom)] pt-2"
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
            <Button
              class="min-h-11"
              variant="subtle"
              :label="__('Edit')"
              @click="emit('edit')"
            />
            <Button
              class="min-h-11"
              variant="ghost"
              theme="red"
              :label="event.seriesId ? __('Cancel series') : __('Cancel event')"
              @click="confirmCancel = true"
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
import { Badge, Button } from 'frappe-ui'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
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
})
const emit = defineEmits([
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
  if (props.event.allDay) return `${day.format(start)} · ${__('All day')}`
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
