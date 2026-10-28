<template>
  <article class="flex flex-col gap-4" :aria-label="event.title">
    <div class="-mr-2 flex items-center justify-end gap-0.5">
      <button
        v-if="
          event.canEdit &&
          event.status === 'Scheduled' &&
          !shift &&
          !task &&
          event.source === 'Event'
        "
        type="button"
        class="ag-tool"
        :aria-label="__('Edit')"
        :title="__('Edit')"
        @click="emit('edit')"
      >
        <span class="lucide-pencil h-4 w-4" aria-hidden="true" />
      </button>
      <button
        v-if="
          event.canEdit &&
          event.status === 'Scheduled' &&
          !shift &&
          !task &&
          event.source === 'Event'
        "
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
      <a
        v-if="clinicLink"
        class="ag-tool"
        data-testid="open-in-clinica"
        :href="clinicLink"
        :aria-label="__('Open in Clínica')"
        :title="__('Open in Clínica')"
      >
        <span class="lucide-stethoscope h-4 w-4" aria-hidden="true" />
      </a>
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
        :class="task ? 'rounded-full border-2' : 'rounded-4'"
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
        <p class="mt-1 text-sm text-ink-gray-7">
          {{ when.day
          }}<span
            v-if="when.time"
            class="num block text-base text-ink-gray-8"
            >{{ when.time }}</span
          >
        </p>
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

    <!-- a doctor's or technician's event: hand it to another person -->
    <label
      v-if="people.length > 1 && event.status !== 'Cancelled'"
      class="flex items-center gap-3 pl-[30px] text-sm text-ink-gray-7"
    >
      <span class="shrink-0">{{ __('Assigned to') }}</span>
      <select
        class="ag-panel__people min-h-9 min-w-0 flex-1 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-9"
        :value="assignee"
        :disabled="busy"
        :aria-label="__('Assigned to')"
        @change="emit('reassign', $event.target.value)"
      >
        <option v-for="person in people" :key="person.id" :value="person.id">
          {{ person.label }}
        </option>
      </select>
    </label>

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
          :icon-left="LucideCheck"
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
        :icon-left="LucideExternalLink"
        :label="__('Open Turnos')"
        @click="emit('open-turnos')"
      />
    </template>

    <template v-else-if="!task">
      <div
        v-if="
          detail && event.source === 'Event' && detail.reference && !detail.cita
        "
        class="flex items-center gap-2"
      >
        <component
          :is="referenceLink.to ? RouterLink : 'a'"
          v-bind="
            referenceLink.to
              ? { to: referenceLink.to }
              : {
                  href: referenceLink.href,
                  target: '_blank',
                  rel: 'noopener',
                }
          "
          class="ag-rec press"
          data-testid="event-record"
        >
          <span
            :class="recordIcon"
            class="h-5 w-5 shrink-0 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span v-if="recordKind" class="block text-xs text-ink-gray-6">{{
              recordKind
            }}</span>
            <span
              class="block truncate text-base font-medium text-ink-gray-9"
              >{{ detail.reference.label || detail.reference.name }}</span
            >
          </span>
          <span
            class="lucide-chevron-right h-4 w-4 shrink-0 text-ink-gray-5"
            aria-hidden="true"
          />
        </component>
        <span
          v-if="reach && reach.doctype === detail.reference.doctype"
          class="ag-reach"
          role="group"
          :aria-label="__('Contact')"
        >
          <a
            :href="`tel:${reach.phone}`"
            class="ag-reach__btn press"
            data-reach="call"
            :aria-label="__('Call {0}', [reach.who || recordKind])"
            :title="__('Call {0}', [reach.who || recordKind])"
            ><span class="lucide-phone h-4 w-4" aria-hidden="true"
          /></a>
          <a
            :href="whatsappHref"
            target="_blank"
            rel="noopener"
            class="ag-reach__btn press"
            data-reach="whatsapp"
            :aria-label="__('WhatsApp {0}', [reach.who || recordKind])"
            :title="__('WhatsApp {0}', [reach.who || recordKind])"
            ><WhatsAppIcon class="h-4 w-4" aria-hidden="true"
          /></a>
        </span>
      </div>
      <div v-if="loading" class="space-y-2" aria-busy="true">
        <div class="h-4 w-2/3 animate-pulse rounded-4 bg-surface-gray-2" />
        <div class="h-4 w-1/2 animate-pulse rounded-4 bg-surface-gray-2" />
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
      <AgendaCitaPanel
        v-else-if="detail?.cita"
        :cita="detail.cita"
        :time-zone="timeZone"
        :locale="locale"
        :hour12="hour12"
        :busy="busy"
        :return-to="returnTo"
        @action="(id) => emit('cita-action', id)"
        @move="(slot) => emit('cita-move', slot)"
        @message="(purpose) => emit('cita-message', purpose)"
      />
      <dl
        v-else-if="panelFields.length"
        class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-base"
        data-testid="source-fields"
      >
        <template v-for="field in panelFields" :key="field.label">
          <dt class="text-ink-gray-6">{{ field.label }}</dt>
          <dd class="text-ink-gray-9">{{ field.value }}</dd>
        </template>
      </dl>
      <dl
        v-else-if="detail && event.source === 'Event'"
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
          <dt class="flex min-h-9 items-center text-ink-gray-6">
            {{ __('With') }}
          </dt>
          <dd class="text-ink-gray-9">
            <ul>
              <li
                v-for="person in detail.attendees"
                :key="`${person.doctype}:${person.name}`"
              >
                <span class="flex min-h-9 items-center gap-2">
                  <RouterLink
                    v-if="person.doctype === 'Contact'"
                    class="min-w-0 truncate underline-offset-2 hover:underline"
                    :to="`/contactos/contact/${encodeURIComponent(person.name)}`"
                    >{{ person.label || person.name }}</RouterLink
                  >
                  <span v-else class="min-w-0 truncate">{{
                    person.label || person.email || person.name
                  }}</span>
                  <span
                    v-if="
                      reach &&
                      reach.doctype === person.doctype &&
                      reach.name === person.name
                    "
                    class="ag-reach"
                    role="group"
                    :aria-label="__('Contact')"
                  >
                    <a
                      :href="`tel:${reach.phone}`"
                      class="ag-reach__btn press"
                      data-reach="call"
                      :aria-label="__('Call {0}', [reach.who || person.label])"
                      :title="__('Call {0}', [reach.who || person.label])"
                      ><span class="lucide-phone h-4 w-4" aria-hidden="true"
                    /></a>
                    <a
                      :href="whatsappHref"
                      target="_blank"
                      rel="noopener"
                      class="ag-reach__btn press"
                      data-reach="whatsapp"
                      :aria-label="
                        __('WhatsApp {0}', [reach.who || person.label])
                      "
                      :title="__('WhatsApp {0}', [reach.who || person.label])"
                      ><WhatsAppIcon class="h-4 w-4" aria-hidden="true"
                    /></a>
                  </span>
                </span>
              </li>
            </ul>
          </dd>
        </template>
        <template v-if="detail.reminders.length">
          <dt class="text-ink-gray-6">{{ __('Reminder') }}</dt>
          <dd class="text-ink-gray-9">{{ reminderText }}</dd>
        </template>
        <template v-if="detail.description">
          <dt class="text-ink-gray-6">{{ __('Notes') }}</dt>
          <dd class="whitespace-pre-line text-ink-gray-9">
            {{ detail.description }}
          </dd>
        </template>
      </dl>

      <div
        v-if="event.kind !== 'cita' && event.source === 'Event'"
        class="sticky bottom-0 flex flex-wrap gap-2 bg-surface-elevation-2 pb-[env(safe-area-inset-bottom)] pt-2"
      >
        <template v-if="event.canEdit">
          <!-- The next step first: an event that already ended is marked done;
               a coming one is moved. -->
          <template v-if="event.status === 'Scheduled' && ended">
            <Button
              class="min-h-11 flex-1 sm:flex-none"
              variant="solid"
              :icon-left="LucideCheck"
              :label="__('Mark as done')"
              @click="emit('status', 'complete')"
            />
            <Button
              class="min-h-11"
              variant="subtle"
              :label="__('Reschedule')"
              @click="emit('reschedule')"
            />
          </template>
          <template v-else-if="event.status === 'Scheduled'">
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
              @click="emit('status', 'complete')"
            />
          </template>
          <template v-else>
            <!-- Done: the next visit or call with the same person and record. -->
            <Button
              v-if="event.status === 'Done'"
              class="min-h-11 flex-1 sm:flex-none"
              variant="solid"
              :label="__('Schedule follow-up')"
              data-testid="event-follow-up"
              @click="emit('follow-up')"
            />
            <Button
              class="min-h-11"
              variant="subtle"
              :label="__('Reopen')"
              @click="emit('status', 'reopen')"
            />
          </template>
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
        v-else-if="sourceOpen"
        class="sticky bottom-0 flex flex-wrap gap-2 bg-surface-elevation-2 pb-[env(safe-area-inset-bottom)] pt-2"
      >
        <!-- another app's record: one way into it, keeping the way back to this agenda view -->
        <component
          :is="sourceOpen.to ? RouterLink : 'a'"
          v-bind="
            sourceOpen.to ? { to: sourceOpen.to } : { href: sourceOpen.href }
          "
          data-testid="open-source-record"
          class="inline-flex min-h-11 items-center justify-center gap-2 rounded-4 bg-surface-gray-10 px-3 text-base-medium text-ink-base transition-colors hover:bg-surface-gray-9"
        >
          <span class="lucide-external-link h-4 w-4" aria-hidden="true" />
          {{ __('Go to record') }}
        </component>
      </div>
      <div
        v-if="confirmCancel"
        role="alertdialog"
        :aria-label="__('Cancel event')"
        class="rounded-6 border border-outline-gray-2 p-3"
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
import AgendaCitaPanel from '@/components/agenda/AgendaCitaPanel.vue'
import AgendaGuard from '@/components/agenda/AgendaGuard.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import { PALETTE, textOn } from '@/components/agenda/agendaColors'
import { timeAt, timeSpan } from '@/components/agenda/agendaCard'
import { reachFor, whatsappLink } from '@/components/agenda/agendaReach'
import { kindLabel } from '@/utils/display'
import { recordLink, withAgendaReturn } from '@/composables/useAgenda'
import LucideCheck from '~icons/lucide/check'
import LucideExternalLink from '~icons/lucide/external-link'

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
  // People this event may be handed to (doctors, technicians), when the worker may.
  people: { type: Array, default: () => [] },
  returnTo: { type: String, default: '' },
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
  'reassign',
  'cita-action',
  'cita-move',
  'cita-message',
  'follow-up',
])
const confirmCancel = ref(false)
const assignee = computed(
  () =>
    (props.event.sourceResourceIds || props.event.resourceIds || [])[0] || '',
)
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
// The day on one line, the time under it in figures («9:00–9:30 a.m.»).
const when = computed(() => {
  const start = new Date(props.event.start)
  const end = new Date(props.event.end)
  const day = new Intl.DateTimeFormat(props.locale, {
    timeZone: props.timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1)
  if (task.value) return { day: capital(day.format(start)), time: __('Task') }
  if (props.event.allDay) {
    const last = new Date(end.getTime() - 1)
    const lastText = day.format(last)
    return lastText === day.format(start)
      ? { day: capital(day.format(start)), time: __('All day') }
      : { day: capital(`${day.format(start)} – ${lastText}`), time: '' }
  }
  const clock = {
    locale: props.locale,
    timeZone: props.timeZone,
    hour12: props.hour12,
  }
  if (day.format(start) !== day.format(end))
    return {
      day: capital(`${day.format(start)} ${timeAt(start, clock)}`),
      time: `${__('Until')} ${day.format(end)} ${timeAt(end, clock)}`,
    }
  return {
    day: capital(day.format(start)),
    time: timeSpan(start, end, clock),
  }
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
  if (props.event.status === 'Missed')
    return { theme: 'orange', label: __('Did not come') }
  if (props.event.kind === 'cita')
    return { theme: 'blue', label: __('Appointment') }
  return null
})
// A clinic appointment is Clínica's record: open it there, with the way back to this agenda view.
const clinicLink = computed(() =>
  props.event.source === 'Patient Appointment' && props.event.id
    ? withAgendaReturn(
        recordLink('Patient Appointment', props.event.id).href,
        window.location.pathname + window.location.search,
      )
    : '',
)
// The fields a source from another app projects for its panel (doco.agenda.contract).
const panelFields = computed(() =>
  (props.detail?.fields || []).filter((row) => row?.label && row?.value),
)
// A source record in another app: the panel shows its fields and one way into it, with the
// way back to this agenda view (the shell's return protocol).
const sourceOpen = computed(() => {
  if (
    props.event.source === 'Event' ||
    props.event.kind === 'cita' ||
    shift.value ||
    task.value
  )
    return null
  // The provider's panel wins; a source that only returned its own detail still names
  // its record on the event itself (Taller sends referenceDoctype/referenceName).
  const reference =
    props.detail?.reference ||
    (props.detail && props.event.referenceDoctype && props.event.referenceName
      ? {
          doctype: props.event.referenceDoctype,
          name: props.event.referenceName,
        }
      : null)
  const link = props.detail?.url
    ? { href: props.detail.url }
    : reference
      ? recordLink(reference.doctype, reference.name)
      : null
  if (!link) return null
  return link.to
    ? { to: link.to }
    : { href: withAgendaReturn(link.href, props.returnTo) }
})
const referenceLink = computed(() => {
  const link = props.detail?.reference
    ? recordLink(props.detail.reference.doctype, props.detail.reference.name)
    : null
  if (!link) return {}
  return link.to ? link : { href: withAgendaReturn(link.href, props.returnTo) }
})
// Who the event is with and their number: a contact guest, else the linked deal or lead.
const reach = ref(null)
let reachRequest = 0
watch(
  () => props.detail,
  async (detail) => {
    const request = ++reachRequest
    reach.value = null
    if (!detail || props.event.source !== 'Event') return
    const found = await reachFor(detail)
    if (request === reachRequest) reach.value = found
  },
  { immediate: true },
)
const ended = computed(() => Date.parse(props.event.end) < Date.now())
// A coming event: WhatsApp opens with a short confirmation the worker can edit.
const whatsappHref = computed(() => {
  if (!reach.value) return ''
  if (ended.value) return whatsappLink(reach.value.phone)
  const first = String(reach.value.who || '').split(' ')[0]
  const day = new Intl.DateTimeFormat(props.locale, {
    timeZone: props.timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(props.event.allDay
      ? {}
      : { hour: 'numeric', minute: '2-digit', hour12: props.hour12 }),
  }).format(new Date(props.event.start))
  return whatsappLink(
    reach.value.phone,
    first
      ? __('Hi {0}, I confirm «{1}» on {2}.', [first, props.event.title, day])
      : __('Hello, I confirm «{0}» on {1}.', [props.event.title, day]),
  )
})
const RECORD_ICONS = {
  'CRM Deal': 'lucide-handshake',
  'CRM Lead': 'lucide-user-round',
  Contact: 'lucide-user-round',
  Customer: 'lucide-user-round',
  'Repair Order': 'lucide-wrench',
}
const recordIcon = computed(
  () => RECORD_ICONS[props.detail?.reference?.doctype] || 'lucide-link',
)
const recordKind = computed(() =>
  kindLabel(props.detail?.reference?.doctype || ''),
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
/* The linked record: one row that opens it, its kind above its name. */
.ag-rec {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 52px;
  padding: 6px 12px;
  border-radius: 12px;
  background: var(--surface-gray-1);
}
.ag-rec:hover {
  background: var(--surface-gray-2);
}
/* Ways to reach the person, as on a record's bar: one island beside them. */
.ag-reach {
  display: inline-flex;
  flex: none;
  align-items: center;
  padding: 2px;
  border-radius: 999px;
  background: var(--surface-gray-1);
}
.ag-reach__btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  color: var(--ink-gray-7);
}
.ag-reach__btn:active,
.ag-reach__btn:hover {
  background: var(--surface-gray-3);
}
</style>
