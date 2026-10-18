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
import { formatDateTime, statusEntry } from '@/utils/display'

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
}

const props = defineProps({
  activity: { type: Object, default: null },
  // «la factura», «la cotización»: the record in a sentence.
  noun: { type: String, default: 'el documento' },
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
      const parts = []
      if (event.fields?.length)
        parts.push(
          list(event.fields.map((f) => f.toLowerCase())) +
            (event.more ? ` y ${event.more} más` : ''),
        )
      if (event.rows) parts.push('los artículos')
      return `${who} cambió ${list(parts)}`
    }
    case 'comment':
      return `${who} comentó`
    default:
      // ERPNext notes a status change with the bare English status («To Receive
      // and Bill»): say it in the list's words when it is one.
      return event.text
        ? `${who}: ${statusEntry(event.text)?.[0] || event.text}`
        : who
  }
}

function when(at) {
  return formatDateTime(at)
}
</script>
