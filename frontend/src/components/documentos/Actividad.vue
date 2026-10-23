<template>
  <!-- Actividad (Shell SPEC §6 DD7): who did each step and when, newest first,
       with full names (never emails). Files sit under «Archivos». -->
  <section aria-labelledby="doc-actividad" class="px-4">
    <h2 id="doc-actividad" class="pb-1 text-base font-semibold text-ink-gray-9">
      Actividad
    </h2>
    <p v-if="assigned.length" class="pb-2 text-sm text-ink-gray-7">
      Asignado a {{ assigned.map((a) => a.name).join(', ') }}
    </p>
    <ol class="divide-y divide-outline-gray-1">
      <li
        v-for="(event, i) in visible"
        :key="`${event.at}-${i}`"
        class="flex gap-3 py-2.5"
        data-testid="documentos-event"
      >
        <span
          class="mt-0.5 flex size-8 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
          aria-hidden="true"
        >
          <span :class="[ICONS[event.kind] || 'lucide-circle-dot', 'size-4']" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="break-words text-base leading-snug text-ink-gray-9">{{
            sentence(event)
          }}</span>
          <!-- The attribution ledger: what this person actually changed, one short line
               per field and per item row («Monto: $2,000.00 → $2,500.00»). -->
          <ul
            v-if="diffLines(event).length"
            class="flex flex-col gap-0.5"
            data-testid="documentos-diff"
          >
            <li
              v-for="(line, j) in diffLines(event)"
              :key="j"
              class="break-words text-sm leading-snug text-ink-gray-8"
              data-testid="documentos-diff-line"
            >
              {{ line }}
            </li>
          </ul>
          <span
            v-if="event.kind === 'comment' && event.text"
            class="whitespace-pre-line break-words text-base text-ink-gray-8"
            >{{ event.text }}</span
          >
          <span class="text-sm text-ink-gray-6">{{ when(event.at) }}</span>
        </span>
      </li>
    </ol>
    <button
      v-if="events.length > LIMIT && !all"
      type="button"
      class="min-h-11 text-base font-medium text-ink-gray-8"
      @click="all = true"
    >
      Ver toda la actividad ({{ events.length }})
    </button>
  </section>
  <section
    v-if="attachments.length || canAttach"
    aria-labelledby="doc-archivos"
    class="px-4"
  >
    <div class="flex items-center justify-between gap-2 pb-1">
      <h2 id="doc-archivos" class="text-base font-semibold text-ink-gray-9">
        Archivos<template v-if="attachments.length">
          ({{ attachments.length }})</template
        >
      </h2>
      <button
        v-if="canAttach"
        type="button"
        class="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-2"
        data-testid="documentos-attach"
        @click="emit('attach')"
      >
        <span class="lucide-paperclip size-5" aria-hidden="true" />
        Adjuntar
      </button>
    </div>
    <p v-if="!attachments.length" class="pb-2 text-base text-ink-gray-6">
      Fotos, PDF o comprobantes de este documento.
    </p>
    <ul class="divide-y divide-outline-gray-1">
      <li v-for="file in attachments" :key="file.name">
        <a
          :href="file.file_url"
          target="_blank"
          rel="noopener"
          class="flex min-h-12 items-center gap-3 py-2 text-base text-ink-gray-9"
        >
          <span
            class="lucide-paperclip size-5 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 break-words">{{ file.file_name }}</span>
        </a>
      </li>
    </ul>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import {
  formatDateTime,
  formatMoney,
  formatQty,
  statusEntry,
} from '@/utils/display'

const LIMIT = 8
const ICONS = {
  create: 'lucide-file-plus',
  submit: 'lucide-circle-check',
  cancel: 'lucide-circle-x',
  edit: 'lucide-pencil',
  comment: 'lucide-message-square',
  assignment: 'lucide-user-plus',
  attachment: 'lucide-paperclip',
  share: 'lucide-users',
  workflow: 'lucide-git-branch',
  info: 'lucide-info',
  status: 'lucide-tag',
}

const props = defineProps({
  activity: { type: Object, default: null },
  // «la factura», «la cotización»: the record in a sentence.
  noun: { type: String, default: 'el documento' },
  // Money in the diff lines («$2,500.00») keeps the record's currency.
  currency: { type: String, default: 'MXN' },
  // Show «Adjuntar» (the record allows attaching).
  canAttach: { type: Boolean, default: false },
})
const emit = defineEmits(['attach'])
const all = ref(false)
const events = computed(() => props.activity?.events || [])
const assigned = computed(() => props.activity?.assigned || [])
const attachments = computed(() => props.activity?.attachments || [])
const visible = computed(() =>
  all.value ? events.value : events.value.slice(0, LIMIT),
)

function list(words) {
  if (words.length < 2) return words[0] || ''
  return `${words.slice(0, -1).join(', ')} y ${words[words.length - 1]}`
}

function sentence(event) {
  const who = event.who || 'Alguien'
  switch (event.kind) {
    case 'create':
      return `${who} creó ${props.noun}`
    case 'submit':
      return `${who} confirmó ${props.noun}`
    case 'cancel':
      return `${who} canceló ${props.noun}`
    case 'edit': {
      // A newer server sends the diff itself (`changes`, `items`): the lines under the
      // sentence say WHAT changed, so the sentence only names the record.
      if (hasDiff(event)) return `${who} cambió ${props.noun}`
      const parts = []
      if (event.fields?.length)
        parts.push(
          list(event.fields.map((f) => f.toLowerCase())) +
            (event.more ? ` y ${event.more} más` : ''),
        )
      if (event.rows) parts.push(tableLabels(event) || 'los artículos')
      if (!parts.length) return `${who} cambió ${props.noun}`
      return `${who} cambió ${list(parts)}`
    }
    case 'comment':
      return `${who} comentó`
    case 'status':
      // ERPNext notes the new status as written in its writer's language («To
      // Bill» or «Por facturar»): say it as a change, in the list's words.
      return event.text
        ? `${who} cambió el estado a ${statusWord(event.text)}`
        : `${who} cambió el estado`
    default: {
      // An older server sends status notes as plain «info».
      const status = event.text && statusEntry(event.text.trim())?.[0]
      if (status) return `${who} cambió el estado a ${status}`
      return event.text ? `${who}: ${event.text}` : who
    }
  }
}

function statusWord(text) {
  return statusEntry(text.trim())?.[0] || text.trim()
}

// ── The diff of one edit (attribution ledger) ────────────────────────────────

function hasDiff(event) {
  return !!(event.changes?.length || event.items)
}

// «Artículos»: the tables whose rows moved, as the server labelled them.
function tableLabels(event) {
  const labels = (event.tables || [])
    .filter((table) => table.label)
    .map((table) => table.label.toLowerCase())
  return list(labels)
}

function shownValue(value, type) {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'money') return formatMoney(value, props.currency)
  if (type === 'number') return formatQty(value)
  if (type === 'percent') return `${formatQty(value)}%`
  return String(value)
}

function changeLine(change, { colon = true } = {}) {
  const from = shownValue(change.from, change.type)
  const to = shownValue(change.to, change.type)
  return colon
    ? `${change.label}: ${from} → ${to}`
    : `${change.label} ${from} → ${to}`
}

function itemLine(row) {
  const parts = [row.label || 'Artículo']
  if (row.qty !== null && row.qty !== undefined) parts.push(formatQty(row.qty))
  if (row.amount !== null && row.amount !== undefined)
    parts.push(formatMoney(row.amount, props.currency))
  return parts.join(' · ')
}

function diffLines(event) {
  if (event.kind !== 'edit') return []
  const lines = []
  // The rows first: «+2 Funda iPhone» is what a worker changed on a Gastos bill; the
  // totals that moved because of it follow.
  const items = event.items || {}
  for (const row of items.added || []) lines.push(`+ ${itemLine(row)}`)
  for (const row of items.removed || []) lines.push(`− ${itemLine(row)}`)
  for (const row of items.changed || []) {
    // «Funda iPhone: Cantidad 1 → 2»: the row names the item, the field keeps its word.
    const parts = (row.changes || []).map((change) =>
      changeLine(change, { colon: false }),
    )
    if (parts.length)
      lines.push(`${row.label || 'Artículo'}: ${parts.join('; ')}`)
  }
  // Item rows the payload did not detail (a long table): say how many moved.
  const detailed =
    (items.added?.length || 0) +
    (items.removed?.length || 0) +
    (items.changed?.length || 0)
  // Only when the server detailed some rows: an older payload has no item detail at all.
  const hidden = event.items ? Math.max(0, (event.rows || 0) - detailed) : 0
  if (hidden)
    lines.push(
      `y ${hidden} ${hidden === 1 ? 'cambio más' : 'cambios más'} en las filas`,
    )
  for (const change of event.changes || []) lines.push(changeLine(change))
  if (event.changes_more)
    lines.push(
      `y ${event.changes_more} ${event.changes_more === 1 ? 'campo más' : 'campos más'}`,
    )
  return lines
}

function when(at) {
  return formatDateTime(at)
}
</script>
