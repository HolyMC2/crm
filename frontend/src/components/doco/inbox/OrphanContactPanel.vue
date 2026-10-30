<!--
  A «Sin asignar» chat whose number is already a Contact (captured with «+ Cliente»
  or linked to a contact with no open deal): the person's notes and follow-ups,
  right beside the conversation. Same records and rules as the Contacto page
  (doco.contactos): a note is a Comment on the Contact, a follow-up a native task.
-->
<template>
  <section class="mb-3 rounded-8 border border-outline-gray-2 p-2.5">
    <div class="mb-1.5 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="truncate text-[12.5px] font-semibold text-ink-gray-9">
          {{ contact.name }}
        </div>
        <div class="text-[10.5px] text-ink-gray-5">
          {{ __('Contacto sin trato · sigue aquí hasta archivarlo') }}
        </div>
      </div>
      <RouterLink
        :to="contactoRoute({ source: 'contact', name: contact.contact })"
        class="flex-none rounded-5 border border-outline-gray-2 px-2 py-1 text-[11px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
        >{{ __('Abrir contacto') }}</RouterLink
      >
    </div>

    <p v-if="error" class="mb-1.5 text-[11px] text-ink-red-7">
      {{ error }}
      <button class="ml-1 font-semibold underline" @click="load(true)">
        {{ __('Reintentar') }}
      </button>
    </p>

    <!-- seguimientos -->
    <div class="mt-1 flex items-center justify-between">
      <span
        class="text-[10px] font-bold uppercase tracking-[.08em] text-ink-gray-4"
        >{{ __('Seguimientos') }}</span
      >
      <button
        v-if="caps.followups?.create"
        class="text-[11px] font-semibold text-ink-blue-7 hover:underline"
        @click="editFollowup(null)"
      >
        + {{ __('Añadir') }}
      </button>
    </div>
    <div
      v-for="task in followups"
      :key="task.name"
      class="mt-1 rounded-5 bg-surface-gray-1 px-2 py-1.5"
    >
      <div class="flex items-start justify-between gap-2">
        <span class="min-w-0 text-[12px] text-ink-gray-8">{{
          plain(task.description)
        }}</span>
        <span
          class="flex-none text-[10px] font-semibold"
          :class="
            dueLabel(task) === 'Vencido' ? 'text-ink-red-7' : 'text-ink-gray-5'
          "
          >{{ dueLabel(task) }}</span
        >
      </div>
      <div class="mt-1 flex gap-2 text-[10.5px]">
        <button
          class="font-semibold text-ink-gray-6 hover:underline"
          @click="editFollowup(task)"
        >
          {{ __('Reprogramar') }}
        </button>
        <button
          class="font-semibold text-ink-green-7 hover:underline"
          :disabled="busy"
          @click="complete(task)"
        >
          {{ __('Hecho') }}
        </button>
      </div>
    </div>
    <p
      v-if="!loading && !followups.length"
      class="mt-1 text-[11px] text-ink-gray-4"
    >
      {{ __('Sin seguimientos pendientes.') }}
    </p>

    <!-- notas -->
    <div
      class="mt-2.5 text-[10px] font-bold uppercase tracking-[.08em] text-ink-gray-4"
    >
      {{ __('Notas') }}
    </div>
    <div v-if="caps.notes?.create" class="mt-1 flex items-end gap-1.5">
      <textarea
        v-model="noteText"
        rows="2"
        :placeholder="
          __('Ej. es técnico, no compra; pregunta precios de pantallas')
        "
        class="min-w-0 flex-1 resize-none rounded-5 border border-outline-gray-2 bg-surface-gray-2 px-2 py-1 text-[12px] text-ink-gray-8 focus:border-outline-gray-4 focus:bg-surface-base focus:outline-none"
      />
      <button
        class="flex-none rounded-5 px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
        style="background: var(--brand)"
        :disabled="busy || !noteText.trim()"
        @click="saveNote"
      >
        {{ __('Guardar') }}
      </button>
    </div>
    <div
      v-for="note in notes"
      :key="note.name"
      class="mt-1.5 border-l-2 border-outline-gray-2 pl-2"
    >
      <p class="whitespace-pre-line text-[12px] text-ink-gray-8">
        {{ plain(note.content || note.comment || note.text) }}
      </p>
      <small class="text-[10px] text-ink-gray-4"
        >{{ note.comment_by || note.owner }} ·
        {{ formatMoment(note.creation) }}</small
      >
    </div>
    <p
      v-if="!loading && !notes.length"
      class="mt-1 text-[11px] text-ink-gray-4"
    >
      {{ __('Aún no hay notas.') }}
    </p>

    <FollowupEditor
      v-if="followupOpen"
      v-model="followupOpen"
      :source="{ source: 'contact', name: contact.contact }"
      :followup="selectedFollowup"
      @saved="load(true)"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import FollowupEditor from '@/components/contactos/FollowupEditor.vue'
import {
  contactosApi,
  readRecord,
  useContactosDraft,
} from '@/composables/useContactos'
import { contactoRoute, dueLabel, formatMoment } from '@/utils/contactos'

const props = defineProps({
  // {contact, name, phone, email} from the orphan thread (unassignedThread.contact)
  contact: { type: Object, required: true },
})

const record = ref(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const noteText = ref('')
const followupOpen = ref(false)
const selectedFollowup = ref(null)

const caps = computed(() => record.value?.capabilities || {})
const notes = computed(() => record.value?.notes?.rows || [])
const followups = computed(() => record.value?.followups?.rows || [])

const { id } = useContactosDraft(() => `inbox-contact:${props.contact.contact}`)

function plain(value) {
  return String(value || '').replace(/<[^>]*>/g, '')
}

async function load(fresh = false) {
  const name = props.contact.contact
  if (!name) return
  loading.value = true
  try {
    const result = await readRecord({ source: 'contact', name }, { fresh })
    if (name !== props.contact.contact) return
    record.value = result
    error.value = ''
  } catch (e) {
    error.value =
      e?.messages?.[0] || __('No se pudieron cargar las notas del contacto.')
  } finally {
    loading.value = false
  }
}

async function saveNote() {
  busy.value = true
  try {
    const payload = {
      source: 'contact',
      name: props.contact.contact,
      content: noteText.value,
    }
    await contactosApi('add_note', { payload, request_id: id(payload) })
    noteText.value = ''
    await load(true)
  } catch (e) {
    error.value = e?.messages?.[0] || __('No se pudo guardar la nota.')
  } finally {
    busy.value = false
  }
}

function editFollowup(task) {
  selectedFollowup.value = task
  followupOpen.value = true
}

async function complete(task) {
  busy.value = true
  try {
    const payload = {
      name: task.name,
      modified: task.modified,
      status: 'Closed',
    }
    await contactosApi('update_followup', { payload, request_id: id(payload) })
    await load(true)
  } catch (e) {
    error.value = e?.messages?.[0] || __('No se pudo completar el seguimiento.')
  } finally {
    busy.value = false
  }
}

watch(
  () => props.contact.contact,
  () => {
    record.value = null
    noteText.value = ''
    load()
  },
  { immediate: true },
)
</script>
