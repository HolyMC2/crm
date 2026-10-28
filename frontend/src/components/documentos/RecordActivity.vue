<template>
  <!-- Actividad y comentarios of any record (Shell SPEC §6 DD5/DD7): who is on
       it, its tags and shares as chips that also change them, a comment box,
       «Enviar por correo», and one timeline of events, comments and emails
       with a filter. Works on any readable doctype through crm.api.documentos;
       pages mount it lazily. -->
  <section
    class="flex flex-col gap-3"
    aria-labelledby="doc-record-activity"
    data-testid="record-activity"
  >
    <h2
      id="doc-record-activity"
      class="px-4 text-base font-semibold text-ink-gray-9"
    >
      Actividad y comentarios
    </h2>

    <!-- Who, tags, shares: each chip shows the state and opens its sheet. -->
    <div
      class="-my-1 flex gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none]"
      data-testid="record-activity-chips"
    >
      <button
        type="button"
        :class="chipClass(assigned.length > 0)"
        data-testid="record-activity-assign"
        @click="openSheet('assign')"
      >
        <span class="lucide-user-plus size-4" aria-hidden="true" />
        {{ assignedLabel }}
      </button>
      <button
        v-for="tag in tags"
        :key="tag"
        type="button"
        :class="chipClass(true)"
        :aria-label="`Etiqueta ${tag}: cambiar etiquetas`"
        @click="openSheet('tag')"
      >
        <span class="lucide-tag size-4" aria-hidden="true" />
        {{ tag }}
      </button>
      <button
        type="button"
        :class="chipClass(false)"
        data-testid="record-activity-tag"
        @click="openSheet('tag')"
      >
        <span
          :class="tags.length ? 'lucide-plus' : 'lucide-tag'"
          class="size-4"
          aria-hidden="true"
        />
        {{ tags.length ? 'Etiqueta' : 'Etiquetar' }}
      </button>
      <button
        type="button"
        :class="chipClass(sharedPeople.length > 0)"
        data-testid="record-activity-share"
        @click="openSheet('share')"
      >
        <span class="lucide-users size-4" aria-hidden="true" />
        {{ sharedLabel }}
      </button>
    </div>

    <!-- The comment box: always open, one tap to write (Enter adds a line,
         Ctrl/⌘+Enter sends). -->
    <form class="flex items-end gap-2 px-4" @submit.prevent="send">
      <label class="sr-only" for="doc-record-comment">Comentario</label>
      <textarea
        id="doc-record-comment"
        ref="field"
        v-model="text"
        rows="1"
        maxlength="4000"
        enterkeyhint="enter"
        class="max-h-40 min-h-11 flex-1 resize-none rounded-[22px] border border-outline-gray-2 bg-surface-base px-4 py-2.5 text-base leading-snug text-ink-gray-9 placeholder:text-ink-gray-5"
        placeholder="Escribe un comentario para tu equipo…"
        data-testid="record-activity-text"
        @input="grow"
        @keydown.enter.ctrl.prevent="send"
        @keydown.enter.meta.prevent="send"
      />
      <button
        type="submit"
        class="press flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-10 text-ink-base disabled:opacity-40"
        :disabled="busy || !text.trim()"
        :aria-label="busy ? 'Enviando comentario' : 'Comentar'"
        data-testid="record-activity-send"
      >
        <span class="lucide-send size-5" aria-hidden="true" />
      </button>
    </form>
    <p v-if="error" role="alert" class="px-4 text-base text-ink-red-7">
      {{ error }}
    </p>
    <div v-if="canEmail" class="-mt-1 px-4">
      <button
        type="button"
        :class="BTN.text"
        class="-ml-4"
        data-testid="record-activity-email"
        @click="openSheet('correo')"
      >
        <span class="lucide-mail size-5" aria-hidden="true" />
        Enviar por correo
      </button>
    </div>

    <div class="px-4">
      <ChipGroup
        v-model="filter"
        :options="filterOptions"
        clear-value="all"
        testid="record-activity-filter"
      />
    </div>
    <p v-if="loading && !current" class="px-4 text-base text-ink-gray-6">
      Cargando la actividad…
    </p>
    <p
      v-else-if="loadError && !current"
      role="alert"
      class="px-4 text-base text-ink-gray-6"
    >
      {{ loadError }}
      <button
        type="button"
        class="min-h-11 text-base-medium text-ink-gray-8 underline"
        @click="load"
      >
        Reintentar
      </button>
    </p>
    <Actividad
      v-else
      :activity="current"
      :noun="noun"
      :currency="currency"
      :heading="false"
      :files="files"
      :can-attach="canAttach"
      :filter="filter"
      :emails="emails"
      @attach="emit('attach')"
    />

    <AssignSheet
      v-if="sheet === 'assign'"
      :open="true"
      :doctype="doctype"
      :name="name"
      :subtitle="title"
      :assigned="assigned"
      @update:open="closeSheet"
      @done="setActivity"
    />
    <TagSheet
      v-if="sheet === 'tag'"
      :open="true"
      :doctype="doctype"
      :name="name"
      :subtitle="title"
      :tags="tags"
      :can="!!can.tag"
      @update:open="closeSheet"
      @done="setActivity"
    />
    <ShareSheet
      v-if="sheet === 'share'"
      :open="true"
      :doctype="doctype"
      :name="name"
      :title="title"
      :shared="shared"
      :can="!!can.share"
      @update:open="closeSheet"
      @done="setActivity"
    />
    <CorreoSheet
      v-if="correoMounted"
      v-model:open="correoOpen"
      :doctype="doctype"
      :name="name"
      :title="title"
      :curate="curate"
      @sent="loadEmails"
    />
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import ChipGroup from '@/components/ui/ChipGroup.vue'
import { chipClass } from '@/components/ui/chipClass'
import Actividad from '@/components/documentos/Actividad.vue'
import { docApi, errorText } from '@/documentos/api'
import { BTN } from '@/documentos/tools'
import { FILTERS, emailEvents, filterCounts } from '@/documentos/actividad'
import { hilo, senderName } from '@/components/correo/correo'

const AssignSheet = defineAsyncComponent(
  () => import('@/components/documentos/AssignSheet.vue'),
)
const TagSheet = defineAsyncComponent(
  () => import('@/components/documentos/TagSheet.vue'),
)
const ShareSheet = defineAsyncComponent(
  () => import('@/components/documentos/ShareSheet.vue'),
)
const CorreoSheet = defineAsyncComponent(
  () => import('@/components/correo/CorreoSheet.vue'),
)

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  // The record's Actividad when the page already has it (the record bundle);
  // without it the block asks crm.api.documentos.timeline itself.
  activity: { type: Object, default: null },
  // «la factura», «el producto»: the record in a sentence.
  noun: { type: String, default: 'el documento' },
  currency: { type: String, default: 'MXN' },
  // The record's title for the sheets («Cliente prueba», «Pedido 0012»).
  title: { type: String, default: '' },
  // Show «Archivos» (off where the page lists files itself).
  files: { type: Boolean, default: true },
  canAttach: { type: Boolean, default: false },
  // The profile's print-format curation for «Enviar por correo».
  curate: { type: Object, default: null },
})
const emit = defineEmits(['changed', 'attach'])

const own = ref(props.activity)
const loading = ref(false)
const loadError = ref('')
const correos = ref([])
const canSendEmail = ref(false)
const filter = ref('all')
const text = ref('')
const busy = ref(false)
const error = ref('')
const field = ref(null)
const sheet = ref('')
const correoOpen = ref(false)
const correoMounted = ref(false)

const current = computed(() => own.value)
const assigned = computed(() => current.value?.assigned || [])
const tags = computed(() => current.value?.tags || [])
const shared = computed(() => current.value?.shared || [])
const sharedPeople = computed(() => shared.value.filter((s) => !s.everyone))
const can = computed(() => current.value?.can || {})
const canEmail = computed(() => canSendEmail.value || !!can.value.email)
const emails = computed(() => emailEvents(correos.value, senderName))
const counts = computed(() =>
  filterCounts([...(current.value?.events || []), ...emails.value]),
)
const filterOptions = computed(() =>
  FILTERS.filter(
    (f) => f.value !== 'email' || counts.value.email || canEmail.value,
  ).map((f) => ({ ...f, count: counts.value[f.value] })),
)

const assignedLabel = computed(() => {
  const names = assigned.value.map((a) => a.name)
  if (!names.length) return 'Asignar'
  return names.length > 2
    ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
    : names.join(', ')
})
const sharedLabel = computed(() => {
  if (shared.value.some((s) => s.everyone)) return 'Compartido con todos'
  const n = sharedPeople.value.length
  if (!n) return 'Compartir'
  return n === 1
    ? `Compartido con ${sharedPeople.value[0].name}`
    : `Compartido con ${n}`
})

watch(
  () => props.activity,
  (value) => {
    if (value) own.value = value
  },
)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    setActivity(
      await docApi('timeline', { doctype: props.doctype, name: props.name }),
    )
  } catch (e) {
    loadError.value = errorText(e)
  } finally {
    loading.value = false
  }
}

async function loadEmails() {
  try {
    const out = await hilo(props.doctype, props.name)
    correos.value = out?.correos || []
    canSendEmail.value = Boolean(out?.puede_enviar)
  } catch {
    // No mail for this worker here: the block shows the rest.
    correos.value = []
  }
}

watch(
  () => [props.doctype, props.name],
  () => {
    filter.value = 'all'
    if (!props.activity) {
      own.value = null
      load()
    }
    loadEmails()
  },
  { immediate: true },
)

function setActivity(value) {
  if (!value) return
  own.value = value
  emit('changed', value)
}

function grow() {
  const el = field.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

async function send() {
  if (!text.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    setActivity(
      await docApi('comment', {
        doctype: props.doctype,
        name: props.name,
        text: text.value,
      }),
    )
    text.value = ''
    filter.value = filter.value === 'comment' ? 'comment' : 'all'
    nextTick(grow)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = false
  }
}

function openSheet(key) {
  if (key === 'correo') {
    correoMounted.value = true
    correoOpen.value = true
    return
  }
  sheet.value = key
}
function closeSheet(open) {
  if (!open) sheet.value = ''
}

/** For the page's «⋯» tools: open one of this block's sheets or the comment box. */
function open(key) {
  if (key === 'comment') {
    field.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    field.value?.focus({ preventScroll: true })
    return
  }
  openSheet(key)
}
defineExpose({ open, reload: load })
</script>
