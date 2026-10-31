<template>
  <!-- One task editor for every source (Shell D8): a line to capture, then the
       details one tap away. A bounded task: the shared bottom sheet. -->
  <BottomSheet
    ref="sheet"
    :open="modelValue"
    :title="editing ? __('Edit pendiente') : __('New pendiente')"
    :dismissible="!dirty"
    @update:open="$emit('update:modelValue', $event)"
  >
    <form
      id="pendiente-task-form"
      class="space-y-4 pb-2"
      @submit.prevent="save"
    >
      <p
        v-if="fixedReference"
        class="rounded-6 bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-7"
      >
        {{
          __('On {0}', [
            fixedReference.reference_label || fixedReference.reference_name,
          ])
        }}
        <span
          v-if="savesAsSalesTask(fixedReference)"
          class="block text-ink-gray-6"
        >
          {{ __('Saved as a sales task: the record keeps its owner.') }}
        </span>
      </p>
      <FormControl
        ref="titleInput"
        v-model="form.title"
        type="textarea"
        :rows="2"
        :label="__('What needs to happen?')"
        :placeholder="__('Call to confirm, send the quote…')"
        @keydown.enter.exact.prevent="save"
      />
      <!-- es-MX date and 24 h time (D1's DateField), never the browser's
           mm/dd/yyyy; «Quitar» under Vence is «sin fecha». -->
      <div class="space-y-1.5">
        <span class="block text-xs text-ink-gray-5">{{ __('Due') }}</span>
        <DateField v-model="form.date" mode="date" :label="__('Due')" />
      </div>
      <div v-if="form.date" class="flex flex-wrap items-end gap-3">
        <div class="space-y-1.5">
          <span class="block text-xs text-ink-gray-5">{{ __('Time') }}</span>
          <DateField v-model="timeValue" mode="time" :label="__('Time')" />
        </div>
        <Button
          v-if="form.time"
          variant="ghost"
          class="min-h-11 sm:min-h-8"
          :label="__('No time')"
          @click="form.time = ''"
        />
      </div>
      <DayPeek
        v-if="form.date"
        :date="form.date"
        :time="form.time"
        :today="today"
        :skip-id="row ? `${row.doctype}:${row.name}` : ''"
        :linkable="!dirty"
        @pick="form.time = $event"
        @leave="$emit('update:modelValue', false)"
      />

      <!-- «Para» in one tap: me, the people I hand pendientes to most, then search. -->
      <div class="space-y-1.5">
        <span class="block text-xs text-ink-gray-5">{{
          __('For', null, 'Pendiente')
        }}</span>
        <div
          class="flex flex-wrap gap-2"
          role="radiogroup"
          :aria-label="__('For', null, 'Pendiente')"
          data-testid="pendiente-para"
        >
          <button
            v-for="person in quickPeople"
            :key="person.user"
            type="button"
            role="radio"
            class="press flex min-h-11 max-w-full items-center gap-1.5 rounded-full border pl-1 pr-3 text-sm sm:min-h-8"
            :class="
              isFor(person)
                ? 'border-transparent bg-surface-green-2 text-ink-green-8'
                : 'border-outline-gray-2 text-ink-gray-7'
            "
            :aria-checked="String(isFor(person))"
            :title="person.me ? undefined : person.name"
            @click="pickPerson(person)"
          >
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 text-[10px] font-semibold text-ink-gray-7"
              aria-hidden="true"
              >{{ initials(person.name) }}</span
            >
            <span class="truncate">{{
              person.me ? __('Me') : shortName(person.name)
            }}</span>
          </button>
          <button
            type="button"
            class="press flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-outline-gray-3 px-3 text-sm text-ink-gray-7 sm:min-h-8"
            :aria-expanded="String(open === 'person')"
            data-testid="pendiente-para-otro"
            @click="open = open === 'person' ? '' : 'person'"
          >
            <Icon icon="search" class="size-4 shrink-0" aria-hidden="true" />
            {{ __('Someone else') }}
          </button>
        </div>
      </div>

      <!-- The quick details as chips (Google Tasks): each opens its field here. -->
      <div
        ref="chipsEl"
        class="flex scroll-mt-3 flex-wrap gap-2"
        role="group"
        :aria-label="__('Details')"
      >
        <button
          v-for="chip in chips"
          :key="chip.key"
          type="button"
          class="flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm sm:min-h-8"
          :class="
            open === chip.key
              ? 'border-outline-gray-4 bg-surface-gray-3 text-ink-gray-9'
              : chip.set
                ? 'border-transparent bg-surface-gray-2 text-ink-gray-8'
                : 'border-outline-gray-2 text-ink-gray-6'
          "
          :aria-expanded="String(open === chip.key)"
          @click="open = open === chip.key ? '' : chip.key"
        >
          <!-- Feather icons live in this chunk; lucide classes cost global CSS. -->
          <Icon :icon="chip.icon" class="size-4 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ chip.label }}</span>
        </button>
      </div>

      <section v-if="open === 'notes'" class="space-y-1">
        <FormControl
          v-model="form.notes"
          type="textarea"
          :rows="4"
          :label="__('Details')"
          :placeholder="__('Add details')"
        />
        <p class="text-xs text-ink-gray-5">
          {{ __('A line that starts with «- [ ]» becomes a checklist item.') }}
        </p>
      </section>

      <section v-else-if="open === 'person'" class="space-y-2">
        <FormControl
          v-model="peopleQuery"
          type="search"
          :label="__('For', null, 'Pendiente')"
          :placeholder="__('Search a coworker')"
        />
        <ul
          class="divide-y divide-outline-gray-1"
          role="listbox"
          :aria-label="__('For', null, 'Pendiente')"
        >
          <li v-for="person in peopleShown" :key="person.user">
            <button
              type="button"
              role="option"
              :aria-selected="form.assigned_to === person.user"
              class="flex min-h-11 w-full items-center gap-3 px-1 text-left text-base"
              @click="pickPerson(person)"
            >
              <span
                class="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 text-xs font-semibold"
                aria-hidden="true"
                >{{ initials(person.name) }}</span
              >
              <span class="min-w-0 flex-1 truncate">{{
                person.me ? __('Me ({0})', [person.name]) : person.name
              }}</span>
              <span
                v-if="form.assigned_to === person.user"
                class="lucide-check size-5 text-ink-gray-8"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
        <p v-if="peopleProblem" class="text-sm text-ink-red-7">
          {{ peopleProblem }}
        </p>
      </section>

      <fieldset v-else-if="open === 'priority'" class="flex flex-wrap gap-2">
        <legend class="sr-only">{{ __('Priority') }}</legend>
        <Button
          v-for="option in priorities"
          :key="option.value"
          class="min-h-11 sm:min-h-8"
          :variant="form.priority === option.value ? 'subtle' : 'ghost'"
          :aria-pressed="form.priority === option.value"
          :label="option.label"
          @click="form.priority = option.value"
        />
      </fieldset>

      <fieldset v-else-if="open === 'state'" class="flex flex-wrap gap-2">
        <legend class="sr-only">{{ __('Status') }}</legend>
        <Button
          v-for="state in row?.states || []"
          :key="state"
          class="min-h-11 sm:min-h-8"
          :variant="form.state === state ? 'subtle' : 'ghost'"
          :aria-pressed="form.state === state"
          :label="stateLabel(state)"
          @click="form.state = state"
        />
      </fieldset>

      <section v-else-if="open === 'reminder'" class="space-y-2">
        <p v-if="!form.date" class="text-sm text-ink-gray-6">
          {{ __('Pick a day first; the reminder goes to whoever does it.') }}
        </p>
        <div v-else class="flex flex-wrap gap-2">
          <Button
            class="min-h-11 sm:min-h-8"
            :variant="!form.remind_at ? 'subtle' : 'ghost'"
            :label="__('No reminder')"
            @click="form.remind_at = ''"
          />
          <Button
            v-for="option in reminders"
            :key="option.value"
            class="min-h-11 sm:min-h-8"
            :variant="form.remind_at === option.value ? 'subtle' : 'ghost'"
            :aria-pressed="form.remind_at === option.value"
            :label="option.label"
            @click="form.remind_at = option.value"
          />
        </div>
      </section>

      <fieldset v-else-if="open === 'repeat'" class="flex flex-wrap gap-2">
        <legend class="sr-only">{{ __('Repeat') }}</legend>
        <Button
          v-for="value in ['', ...REPEATS]"
          :key="value || 'none'"
          class="min-h-11 sm:min-h-8"
          :variant="form.repeat === value ? 'subtle' : 'ghost'"
          :aria-pressed="form.repeat === value"
          :label="repeatLabel(value)"
          @click="form.repeat = value"
        />
      </fieldset>

      <section v-else-if="open === 'link'" class="space-y-2">
        <div
          class="flex flex-wrap gap-2"
          role="group"
          :aria-label="__('Kind of record')"
        >
          <Button
            v-for="kind in linkKinds"
            :key="kind.doctype"
            class="min-h-11 sm:min-h-8"
            :variant="linkDoctype === kind.doctype ? 'subtle' : 'ghost'"
            :aria-pressed="linkDoctype === kind.doctype"
            :label="kind.label"
            @click="linkDoctype = kind.doctype"
          />
        </div>
        <FormControl
          v-model="linkQuery"
          type="search"
          :label="__('Search')"
          :placeholder="__('Name or number')"
        />
        <ul class="divide-y divide-outline-gray-1">
          <li v-if="form.reference_name">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-2 px-1 text-left text-base text-ink-red-7"
              @click="setLink(null)"
            >
              <span class="lucide-x size-4" aria-hidden="true" />{{
                __('Remove link')
              }}
            </button>
          </li>
          <li v-for="option in linkOptions" :key="option.value">
            <button
              type="button"
              class="flex min-h-11 w-full flex-col justify-center px-1 py-1 text-left"
              @click="setLink(option)"
            >
              <span class="text-base text-ink-gray-9">{{
                option.label || option.value
              }}</span>
              <span
                v-if="option.description"
                class="line-clamp-1 text-sm text-ink-gray-6"
                >{{ option.description }}</span
              >
            </button>
          </li>
        </ul>
      </section>

      <div
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      </div>
    </form>
    <template #actions>
      <Button
        size="lg"
        class="min-h-11 w-full"
        :label="__('Cancel')"
        @click="$emit('update:modelValue', false)"
      />
      <Button
        type="submit"
        form="pendiente-task-form"
        variant="solid"
        size="lg"
        class="min-h-11 w-full"
        :loading="saving"
        :disabled="!form.title.trim()"
        :label="editing ? __('Save changes') : __('Save pendiente')"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  reactive,
  ref,
  watch,
} from 'vue'
import { Button, FormControl, call } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import DateField from '@/components/ui/DateField.vue'
import { stableRequest } from '@/utils/contactos'
import { initials, kindLabel } from '@/utils/display'
import { shellBoot } from '@/composables/muelleShell'
import {
  REPEATS,
  pendienteError,
  pendientesApi,
  priorityLabel,
  reminderOptions,
  reminderText,
  repeatLabel,
  savesAsSalesTask,
  stateLabel,
} from '@/composables/usePendientes'
import Icon from '@/components/Icon.vue'

// The day's Agenda loads with the agenda helpers, apart from the sheet.
const DayPeek = defineAsyncComponent(
  () => import('@/components/pendientes/DayPeek.vue'),
)

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  today: { type: String, default: '' },
  // {reference_type, reference_name, reference_label} from the calling record
  reference: { type: Object, default: null },
  /** Edit this pendiente (the record's projection) instead of creating one. */
  row: { type: Object, default: null },
  /** Open on one detail (the record's «Para» or «Recordarme»). */
  focus: { type: String, default: '' },
  /** Prefilled values for a new pendiente (the Agenda's «Más opciones»). */
  prefill: { type: Object, default: null },
  // Kept for callers that still pass it; sales tasks are created here now.
  salesTask: { type: Boolean, default: false },
})
const emit = defineEmits([
  'update:modelValue',
  'created',
  'saved',
  'sales-task',
])

const boot = computed(() => shellBoot.value?.modules?.pendientes || null)
const me = computed(() => boot.value?.user || '')
const editing = computed(() => Boolean(props.row))
const fixedReference = computed(() =>
  !editing.value && props.reference?.reference_name ? props.reference : null,
)
const blank = () => ({
  title: '',
  notes: '',
  date: '',
  time: '',
  priority: 'Medium',
  assigned_to: '',
  assigned_name: '',
  state: '',
  remind_at: '',
  repeat: '',
  reference_type: '',
  reference_name: '',
  reference_label: '',
})
const form = reactive(blank())
let initial = blank()
const open = ref(''),
  saving = ref(false),
  problem = ref(null),
  titleInput = ref(null)
let receipt = null

const priorities = computed(() =>
  ['High', 'Medium', 'Low'].map((value) => ({
    value,
    label: priorityLabel(value),
  })),
)
const reminders = computed(() => {
  const options = reminderOptions(form.date, form.time)
  // A stored reminder that is none of the presets stays choosable.
  if (
    form.remind_at &&
    !options.some((option) => option.value === form.remind_at)
  )
    options.unshift({
      value: form.remind_at,
      label: reminderText(form.remind_at),
    })
  return options
})
const dirty = computed(() =>
  Object.keys(initial).some((key) => form[key] !== initial[key]),
)
const chips = computed(() => {
  const list = [
    {
      key: 'notes',
      icon: 'align-left',
      label: form.notes.trim() ? __('Details') : __('Add details'),
      set: Boolean(form.notes.trim()),
    },
    {
      key: 'priority',
      icon: 'flag',
      label: __('Priority: {0}', [priorityLabel(form.priority).toLowerCase()]),
      set: form.priority !== 'Medium',
    },
  ]
  if (editing.value && props.row?.states?.length)
    list.push({
      key: 'state',
      icon: 'disc',
      label: stateLabel(form.state),
      set: !['open', 'done'].includes(form.state),
    })
  list.push(
    {
      key: 'reminder',
      icon: 'bell',
      label: form.remind_at ? reminderText(form.remind_at) : __('Remind me'),
      set: Boolean(form.remind_at),
    },
    {
      key: 'repeat',
      icon: 'repeat',
      label: form.repeat ? repeatLabel(form.repeat) : __('Repeat'),
      set: Boolean(form.repeat),
    },
  )
  if (
    !fixedReference.value &&
    !(editing.value && props.row?.doctype === 'CRM Task')
  )
    list.push({
      key: 'link',
      icon: 'link',
      label: form.reference_name
        ? form.reference_label || form.reference_name
        : __('Link to a record'),
      set: Boolean(form.reference_name),
    })
  return list
})

function fill(row) {
  Object.assign(form, {
    title: row.description || '',
    notes: row.notes_text || '',
    date: row.date || '',
    time: row.time || '',
    priority: row.priority || 'Medium',
    assigned_to: row.assigned_to || '',
    assigned_name: row.assigned_to_name || '',
    state: row.state || 'open',
    remind_at: String(row.reminder || '').slice(0, 19),
    repeat: row.repeat || '',
    reference_type: row.reference_type || '',
    reference_name: row.reference_name || '',
    reference_label: row.reference_label || '',
  })
  initial = { ...form }
}

// DateField speaks Frappe's «HH:MM:SS»; the form keeps «HH:MM».
const timeValue = computed({
  get: () => (form.time ? `${form.time.slice(0, 5)}:00` : ''),
  set: (value) => (form.time = value ? value.slice(0, 5) : ''),
})
watch(
  () => form.date,
  (date) => {
    if (date) return
    form.time = ''
    form.remind_at = ''
  },
)

// «Para»: coworkers by name (Frappe's enabled system users).
const peopleQuery = ref(''),
  people = ref([]),
  peopleProblem = ref('')
let peopleTimer,
  peopleGeneration = 0
// The quick row: me, whoever it is for now, then the people I hand pendientes to
// most (the server ranks them), up to QUICK in all. Read once per sheet.
const QUICK = 5
let quickRead = null
const quick = ref([])
async function readQuick() {
  try {
    return (await pendientesApi('people', { search: '' }))?.rows || []
  } catch {
    quickRead = null
    return []
  }
}
function loadQuick() {
  quickRead ||= readQuick()
  quickRead.then((rows) => {
    quick.value = rows
    if (!people.value.length && !peopleQuery.value) people.value = rows
  })
}
const quickPeople = computed(() => {
  const mine = quick.value.find((person) => person.me) || {
    user: me.value,
    name: boot.value?.full_name || me.value,
    me: true,
  }
  const list = [mine]
  const current = form.assigned_to && form.assigned_to !== mine.user
  if (current)
    list.push(
      quick.value.find((person) => person.user === form.assigned_to) || {
        user: form.assigned_to,
        name: form.assigned_name || form.assigned_to,
      },
    )
  for (const person of quick.value) {
    if (list.length >= QUICK) break
    if (!list.some((row) => row.user === person.user)) list.push(person)
  }
  return list
})
// «Carla D.»: the row stays two lines on a phone; the full name is the chip's title.
const shortName = (name) => {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
  return words.length > 1 ? `${words[0]} ${words[1][0]}.` : words[0]
}
const isFor = (person) =>
  person.me
    ? !form.assigned_to || form.assigned_to === me.value
    : form.assigned_to === person.user
const peopleShown = computed(() => {
  const mine = people.value.find((person) => person.me)
  const others = people.value.filter((person) => !person.me)
  return mine ? [mine, ...others] : others
})
async function loadPeople() {
  const current = ++peopleGeneration
  try {
    const response = await pendientesApi('people', {
      search: peopleQuery.value.trim(),
    })
    if (current !== peopleGeneration) return
    people.value = response?.rows || []
    peopleProblem.value = ''
  } catch (error) {
    if (current === peopleGeneration)
      peopleProblem.value = pendienteError(error).detail
  }
}
watch(peopleQuery, () => {
  clearTimeout(peopleTimer)
  peopleTimer = setTimeout(loadPeople, 200)
})
const chipsEl = ref(null),
  sheet = ref(null)
watch(open, async (key) => {
  if (key === 'person' && !people.value.length) loadPeople()
  if (key === 'link') searchLinks()
  // An opened detail grows the sheet to full height (Material) and starts
  // under its chips, not under a half-cut row.
  if (!key) return
  await nextTick()
  const body = chipsEl.value?.closest('[data-ui-sheet-body]')
  const overflows = () => body && body.scrollHeight > body.clientHeight + 4
  if (overflows() && sheet.value && !sheet.value.expanded) {
    sheet.value.expanded = true
    await nextTick()
  }
  if (overflows())
    chipsEl.value.scrollIntoView({ block: 'start', behavior: 'smooth' })
})
function pickPerson(person) {
  form.assigned_to = person.user
  form.assigned_name = person.name
  open.value = ''
}

// «Vincular a…»: any record the person can open, by kind.
const linkKinds = computed(() =>
  [
    'Contact',
    'Customer',
    'Supplier',
    'Item',
    'Sales Order',
    'Purchase Order',
    'Warranty Claim',
  ].map((doctype) => ({ doctype, label: kindLabel(doctype) || doctype })),
)
const linkDoctype = ref('Contact'),
  linkQuery = ref(''),
  linkOptions = ref([])
let linkTimer,
  linkGeneration = 0
async function searchLinks() {
  const current = ++linkGeneration
  try {
    const result = await call('frappe.desk.search.search_link', {
      doctype: linkDoctype.value,
      txt: linkQuery.value.trim(),
      page_length: 8,
    })
    if (current === linkGeneration)
      linkOptions.value = Array.isArray(result) ? result : []
  } catch {
    if (current === linkGeneration) linkOptions.value = []
  }
}
watch([linkDoctype, linkQuery], () => {
  clearTimeout(linkTimer)
  linkTimer = setTimeout(searchLinks, 200)
})
function setLink(option) {
  form.reference_type = option ? linkDoctype.value : ''
  form.reference_name = option ? option.value : ''
  form.reference_label = option ? option.label || option.value : ''
  open.value = ''
}

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) return
    problem.value = null
    if (editing.value) fill(props.row)
    else if (props.prefill)
      Object.assign(form, blank(), { date: props.today }, props.prefill)
    else if (!form.title && !dirty.value)
      Object.assign(form, blank(), { date: props.today })
    if (!editing.value)
      initial = props.prefill
        ? { ...blank(), date: props.today, ...props.prefill }
        : { ...blank(), date: props.today }
    open.value = props.focus || ''
    loadQuick()
    await nextTick()
    if (!props.focus)
      titleInput.value?.$el?.querySelector?.('textarea')?.focus()
  },
  { immediate: true },
)

function createArgs() {
  const reference = fixedReference.value
  return {
    description: form.title.trim(),
    notes: form.notes,
    date: form.date,
    time: form.date ? form.time : '',
    priority: form.priority,
    assigned_to:
      form.assigned_to && form.assigned_to !== me.value ? form.assigned_to : '',
    remind_at: form.date ? form.remind_at : '',
    repeat: form.repeat,
    reference_type: reference?.reference_type || form.reference_type || null,
    reference_name: reference?.reference_name || form.reference_name || null,
  }
}

function changes() {
  const values = {}
  const same = (key) => form[key] === initial[key]
  if (!same('title')) values.title = form.title.trim()
  if (!same('notes')) values.notes = form.notes
  if (!same('date')) values.date = form.date
  if (!same('time') || !same('date')) values.time = form.date ? form.time : ''
  if (!same('priority')) values.priority = form.priority
  if (!same('state')) values.state = form.state
  if (!same('assigned_to')) values.assigned_to = form.assigned_to
  if (!same('remind_at') || (!same('date') && !form.date))
    values.remind_at = form.date ? form.remind_at : ''
  if (!same('repeat')) values.repeat = form.repeat
  if (!same('reference_name') || !same('reference_type')) {
    values.reference_type = form.reference_type || null
    values.reference_name = form.reference_name || null
  }
  return values
}

async function save() {
  if (saving.value || !form.title.trim()) return
  saving.value = true
  problem.value = null
  try {
    if (editing.value) {
      const values = changes()
      if (!Object.keys(values).length) {
        emit('update:modelValue', false)
        return
      }
      receipt = stableRequest(receipt, { name: props.row.name, values })
      const response = await pendientesApi('update', {
        doctype: props.row.doctype,
        name: String(props.row.name),
        modified: props.row.modified,
        values,
        request_id: receipt.id,
      })
      receipt = null
      emit('saved', response.row)
    } else {
      const args = createArgs()
      receipt = stableRequest(receipt, args)
      const response = await pendientesApi('create', {
        ...args,
        request_id: receipt.id,
      })
      receipt = null
      Object.assign(form, blank())
      initial = blank()
      emit('created', response.row)
    }
    emit('update:modelValue', false)
  } catch (error) {
    problem.value = pendienteError(error)
  } finally {
    saving.value = false
  }
}
</script>
