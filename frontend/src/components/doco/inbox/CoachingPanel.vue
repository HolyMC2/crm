<!--
  Notas de coaching (spec 7.4). A manager privately annotates a conversation
  ("aquí ofrece el combo"). Visible ONLY to manager roles — never to the agent
  being coached, never in the customer timeline.

  Prop-driven (doctype, name), fetch-once-per-conversation-change, NO polling.
  Self-hides ENTIRELY for non-managers: the first list_notes call 403s → the whole
  section renders nothing (no empty shell, no error toast). The backend is the
  authority — it manager-gates, escapes on write, stamps the author, and returns a
  per-note `can_delete` flag so this panel never re-derives the authz rule.
-->
<template>
  <section v-if="show" class="flex-none border-b border-outline-gray-1 p-3.5">
    <div class="mb-2 flex items-center gap-1.5">
      <span class="text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">
        🎓 {{ __('Coaching') }}
      </span>
      <span class="rounded bg-surface-gray-2 px-1.5 py-px text-[9.5px] font-semibold text-ink-gray-5">
        {{ __('privado · gerentes') }}
      </span>
    </div>

    <!-- notes list (newest first) -->
    <ul v-if="notes.length" class="mb-2.5 flex flex-col gap-2">
      <li v-for="n in notes" :key="n.name" class="flex gap-2">
        <span
          class="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[10px] font-bold"
          :style="`background:${avatarColor(n.author_name)[0]};color:${avatarColor(n.author_name)[1]}`"
          aria-hidden="true"
        >{{ initials(n.author_name) }}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="min-w-0 truncate text-[11.5px] font-semibold text-ink-gray-8">{{ n.author_name }}</span>
            <span class="flex-none text-[10.5px] text-ink-gray-4">{{ timeAgo(n.creation) }}</span>
            <button
              v-if="n.can_delete"
              class="press ml-auto flex-none rounded px-1 text-[11px] text-ink-gray-4 hover:text-ink-red-7 disabled:opacity-50"
              :disabled="deleting === n.name"
              :title="__('Borrar nota')"
              :aria-label="__('Borrar nota')"
              @click="removeNote(n)"
            >✕</button>
          </div>
          <p class="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-[1.35] text-ink-gray-7">{{ n.note }}</p>
        </div>
      </li>
    </ul>
    <p v-else class="mb-2.5 text-[11.5px] text-ink-gray-4">
      {{ __('Sin notas de coaching todavía.') }}
    </p>

    <!-- add box -->
    <div class="flex flex-col gap-1.5">
      <textarea
        v-model="draft"
        rows="2"
        class="w-full resize-y rounded-lg border border-outline-gray-2 bg-surface-gray-2 px-2 py-1.5 text-[12px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:border-outline-gray-3 focus:bg-surface-base focus:outline-none focus:ring-0"
        :aria-label="__('Nota privada para el equipo')"
        :placeholder="__('Nota privada para el equipo…')"
        :maxlength="MAX_NOTE_LEN"
        @keydown.enter.meta.prevent="addNote"
        @keydown.enter.ctrl.prevent="addNote"
      />
      <div class="flex justify-end">
        <button
          class="press rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50"
          style="background: var(--brand)"
          :disabled="!canSubmitNote(draft) || saving"
          @click="addNote"
        >{{ saving ? __('Guardando…') : __('Agregar nota') }}</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { call, toast } from 'frappe-ui'
import { avatarColor, initials, timeAgo } from '@/composables/crmFormat'
import { canSubmitNote, MAX_NOTE_LEN } from '@/utils/coachingFormat'

const props = defineProps({
  // 'CRM Deal' | 'CRM Lead' — the conversation being annotated.
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
})

const notes = ref([])
const denied = ref(false) // true once a list call 403s → the section hides for good
const loaded = ref(false) // true once a list call SUCCEEDS → managers see the section
const draft = ref('')
const saving = ref(false)
const deleting = ref(null)

// Only Deals/Leads carry coaching notes. The section renders only after a
// successful list (manager) — never before, so a non-manager sees no flash.
const isRef = computed(() => (props.doctype === 'CRM Deal' || props.doctype === 'CRM Lead') && !!props.name)
const show = computed(() => isRef.value && loaded.value && !denied.value)

async function load() {
  if (!isRef.value) {
    loaded.value = false
    denied.value = false
    notes.value = []
    return
  }
  try {
    const out = await call('doco_marketing.api.coaching.list_notes', {
      doctype: props.doctype,
      name: props.name,
    })
    notes.value = out?.notes || []
    denied.value = false
    loaded.value = true
  } catch (e) {
    // 403 (non-manager, or a reference this manager may not read) → hide entirely.
    // Any other fetch error also stays silent: no empty shell, no toast.
    denied.value = true
    loaded.value = false
    notes.value = []
  }
}

async function addNote() {
  if (!canSubmitNote(draft.value) || saving.value) return
  saving.value = true
  try {
    const row = await call('doco_marketing.api.coaching.add_note', {
      doctype: props.doctype,
      name: props.name,
      note: draft.value.trim(),
    })
    notes.value = [row, ...notes.value] // newest first, matching the server order
    draft.value = ''
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo guardar la nota'))
  } finally {
    saving.value = false
  }
}

async function removeNote(n) {
  if (deleting.value) return
  deleting.value = n.name
  try {
    await call('doco_marketing.api.coaching.delete_note', { name: n.name })
    notes.value = notes.value.filter((x) => x.name !== n.name)
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo borrar la nota'))
  } finally {
    deleting.value = null
  }
}

// Fetch once per conversation change (prop-driven, no polling); reset the composer.
watch(
  () => [props.doctype, props.name],
  () => {
    draft.value = ''
    load()
  },
  { immediate: true },
)
</script>
