<template>
  <!-- Enviar por correo (Shell D12): who, template, subject, message and the
       PDF, then a review step that shows exactly what goes and to whom. -->
  <BottomSheet
    :open="open"
    :title="sheetTitle"
    :subtitle="sheetSubtitle"
    :flush="step === 'plantillas' || step === 'formatos'"
    :dismissible="!sending"
    @update:open="emit('update:open', $event)"
  >
    <template v-if="step === 'plantillas' || step === 'formatos'" #header>
      <button
        type="button"
        :class="BTN.text"
        class="-ml-4"
        data-testid="correo-volver"
        @click="step = 'redactar'"
      >
        <span class="lucide-arrow-left size-5" aria-hidden="true" />
        Volver al correo
      </button>
    </template>

    <!-- Finds the sheet's scroller: each step opens at its top. -->
    <span ref="anchor" hidden />
    <p v-if="loading" class="py-3 text-base text-ink-gray-6">
      Preparando el correo…
    </p>
    <p v-else-if="loadError" role="alert" class="py-3 text-base text-ink-red-7">
      {{ loadError }}
    </p>

    <!-- 1 · Redactar -->
    <div
      v-else-if="step === 'redactar'"
      class="space-y-4"
      data-testid="correo-redactar"
    >
      <p
        v-if="!data.puede_enviar"
        role="alert"
        class="rounded-lg bg-surface-amber-2 px-3 py-2 text-base text-ink-amber-9"
      >
        {{ data.motivo }}
      </p>

      <section aria-labelledby="correo-para">
        <h3 id="correo-para" class="pb-1 text-sm text-ink-gray-6">Para</h3>
        <!-- min-w-0 max-w-full: a long address truncates inside the padding. -->
        <ul class="flex flex-wrap gap-2">
          <li v-for="email in para" :key="email" class="min-w-0 max-w-full">
            <button
              type="button"
              class="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full bg-surface-gray-2 pl-3 pr-2 text-base text-ink-gray-9 hover:bg-surface-gray-3"
              :aria-label="`Quitar a ${recipientName(email, data.para)}`"
              @click="remove(email)"
            >
              <span class="truncate">{{
                recipientName(email, data.para)
              }}</span>
              <span class="lucide-x size-4 flex-none" aria-hidden="true" />
            </button>
          </li>
          <li
            v-for="s in pending"
            :key="`s-${s.email}`"
            class="min-w-0 max-w-full"
          >
            <button
              type="button"
              class="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full border border-outline-gray-2 px-3 text-base text-ink-gray-8 hover:bg-surface-gray-1"
              :aria-label="`Agregar a ${s.nombre} (${s.email})`"
              @click="para.push(s.email)"
            >
              <span class="lucide-plus size-4 flex-none" aria-hidden="true" />
              <span class="truncate">{{ s.nombre }}</span>
            </button>
          </li>
        </ul>
        <label class="sr-only" for="correo-otro">Agregar otro correo</label>
        <input
          id="correo-otro"
          v-model="typed"
          type="email"
          inputmode="email"
          autocomplete="email"
          enterkeyhint="done"
          class="mt-2 h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          :placeholder="
            para.length
              ? 'Agregar otro correo'
              : 'Escribe el correo del cliente'
          "
          data-testid="correo-para-input"
          @keydown.enter.prevent="addTyped"
          @keydown="onComma"
          @blur="addTyped"
        />
        <p v-if="typedError" role="alert" class="pt-1 text-sm text-ink-red-7">
          {{ typedError }}
        </p>
        <p
          v-else-if="!para.length && !data.para?.length"
          class="pt-1 text-sm text-ink-gray-6"
        >
          Este documento no tiene un correo de contacto; escríbelo aquí.
        </p>
      </section>

      <button
        type="button"
        class="flex min-h-14 w-full items-center gap-3 rounded-lg border border-outline-gray-2 px-3 py-2 text-left hover:bg-surface-gray-1"
        data-testid="correo-plantilla"
        @click="step = 'plantillas'"
      >
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-sm text-ink-gray-6">Plantilla</span>
          <span class="truncate text-base text-ink-gray-9">{{
            plantilla ? plantillaLabel : 'Ninguna: mensaje de siempre'
          }}</span>
        </span>
        <span
          class="lucide-chevron-right size-5 flex-none text-ink-gray-6"
          aria-hidden="true"
        />
      </button>
      <p v-if="aviso" class="text-sm text-ink-amber-9">{{ aviso }}</p>

      <div>
        <label for="correo-asunto" class="pb-1 text-sm text-ink-gray-6"
          >Asunto</label
        >
        <input
          id="correo-asunto"
          v-model="asunto"
          type="text"
          maxlength="240"
          class="h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          data-testid="correo-asunto"
        />
      </div>
      <div>
        <label for="correo-cuerpo" class="pb-1 text-sm text-ink-gray-6"
          >Mensaje</label
        >
        <textarea
          id="correo-cuerpo"
          ref="body"
          v-model="cuerpo"
          rows="5"
          maxlength="20000"
          class="w-full resize-none rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-base text-ink-gray-9"
          data-testid="correo-cuerpo"
          @input="grow"
        />
      </div>

      <div
        v-if="canPdf"
        class="flex min-h-14 items-center gap-3 rounded-lg border border-outline-gray-2 py-1 pl-3"
      >
        <span class="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span class="text-base text-ink-gray-9">Adjuntar PDF</span>
          <button
            v-if="pdf"
            type="button"
            class="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full bg-surface-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-3"
            data-testid="correo-formato"
            @click="step = 'formatos'"
          >
            <span
              class="lucide-file-text size-4 flex-none"
              aria-hidden="true"
            />
            <span class="truncate">{{ formatoLabel }}</span>
            <span
              class="lucide-chevron-down size-4 flex-none"
              aria-hidden="true"
            />
          </button>
        </span>
        <AjustesSwitch v-model="pdf" label="Adjuntar PDF" />
      </div>

      <p v-if="data.remitente" class="text-sm text-ink-gray-6">
        Se envía desde {{ data.remitente.nombre
        }}<template
          v-if="
            data.remitente.correo &&
            data.remitente.correo !== data.remitente.nombre
          "
        >
          ({{ data.remitente.correo }})</template
        >.
        <template v-if="data.en_pausa">
          En este sitio los correos están en pausa: se guarda en el documento
          pero no sale.</template
        >
      </p>
    </div>

    <!-- 1a · Plantillas, each filled with this record -->
    <div v-else-if="step === 'plantillas'" data-testid="correo-plantillas">
      <p v-if="filling" class="px-5 py-3 text-base text-ink-gray-6">
        Llenando la plantilla con este documento…
      </p>
      <ul v-else class="pb-2">
        <li>
          <ListRow
            icon="lucide-pencil"
            title="Sin plantilla"
            subtitle="El mensaje de siempre, para que lo ajustes"
            :selected="!plantilla"
            @click="pickTemplate(null)"
          />
        </li>
        <li v-for="p in templates.propias" :key="p.name">
          <ListRow
            icon="lucide-file-text"
            :title="p.label"
            :subtitle="p.vista"
            :subtitle-lines="2"
            :selected="p.name === plantilla"
            @click="pickTemplate(p)"
          />
        </li>
      </ul>
      <template v-if="!filling && templates.otras.length">
        <h3 class="px-5 pt-2 text-base font-semibold text-ink-gray-9">
          Hechas para otros documentos
        </h3>
        <p class="px-5 pb-1 text-sm text-ink-gray-6">
          Piden datos que este documento no tiene; pueden quedar huecos.
        </p>
        <ul class="pb-2">
          <li v-for="p in templates.otras" :key="p.name">
            <ListRow
              icon="lucide-file-text"
              :title="p.label"
              :subtitle="p.vista"
              :subtitle-lines="2"
              :selected="p.name === plantilla"
              @click="pickTemplate(p)"
            />
          </li>
        </ul>
      </template>
      <p v-if="data.plantillas_aviso" class="px-5 pb-3 text-sm text-ink-gray-6">
        {{ data.plantillas_aviso }}
      </p>
      <p
        v-if="!filling && !data.plantillas?.length"
        class="px-5 py-3 text-base text-ink-gray-6"
      >
        Aún no hay plantillas de correo. El dueño puede crearlas en el
        escritorio.
      </p>
    </div>

    <!-- 1b · Formato del PDF -->
    <ul
      v-else-if="step === 'formatos'"
      class="pb-2"
      data-testid="correo-formatos"
    >
      <li v-for="f in formats" :key="f.name">
        <ListRow
          icon="lucide-file-text"
          :title="f.label === 'Standard' ? 'Estándar' : f.label"
          :subtitle="f.hint || (f.default ? 'El de siempre' : '')"
          :selected="f.name === formato"
          @click="pickFormat(f.name)"
        />
      </li>
    </ul>

    <!-- 2 · Revisar: exactly what goes -->
    <dl
      v-else-if="step === 'revisar'"
      class="space-y-3"
      data-testid="correo-revisar"
    >
      <div>
        <dt class="text-sm text-ink-gray-6">Para</dt>
        <dd class="break-words text-base text-ink-gray-9">
          <span v-for="email in review.para" :key="email" class="block"
            >{{ recipientName(email, data.para)
            }}<template v-if="recipientName(email, data.para) !== email">
              · {{ email }}</template
            ></span
          >
        </dd>
      </div>
      <div>
        <dt class="text-sm text-ink-gray-6">Asunto</dt>
        <dd class="break-words text-base-medium text-ink-gray-9">
          {{ review.asunto }}
        </dd>
      </div>
      <div>
        <dt class="text-sm text-ink-gray-6">Mensaje</dt>
        <dd
          class="whitespace-pre-line break-words rounded-lg bg-surface-gray-1 px-3 py-2 text-base text-ink-gray-9"
        >
          {{ review.cuerpo }}
        </dd>
      </div>
      <div>
        <dt class="text-sm text-ink-gray-6">Adjunto</dt>
        <dd class="flex items-center gap-2 text-base text-ink-gray-9">
          <template v-if="review.adjunto">
            <span
              class="lucide-paperclip size-4 flex-none text-ink-gray-6"
              aria-hidden="true"
            />
            <span class="min-w-0 break-words"
              >{{ review.adjunto }}
              <span class="text-ink-gray-6">· {{ formatoLabel }}</span></span
            >
          </template>
          <template v-else>Sin PDF</template>
        </dd>
      </div>
      <p v-if="data.en_pausa" class="text-sm text-ink-gray-6">
        Correos en pausa en este sitio: queda registrado pero no sale.
      </p>
    </dl>

    <p v-if="error" role="alert" class="pt-3 text-base text-ink-red-7">
      {{ error }}
    </p>

    <template v-if="step === 'redactar' || step === 'revisar'" #actions>
      <template v-if="step === 'redactar'">
        <p
          v-if="!loading && !review.ok && data.puede_enviar !== undefined"
          class="text-center text-sm text-ink-gray-6"
        >
          {{ review.reason }}
        </p>
        <button
          type="button"
          :class="BTN.filled"
          :disabled="loading || !review.ok"
          data-testid="correo-revisar-btn"
          @click="toReview"
        >
          Revisar y enviar
        </button>
      </template>
      <template v-else>
        <button
          type="button"
          :class="BTN.text"
          :disabled="sending"
          @click="step = 'redactar'"
        >
          Cambiar
        </button>
        <button
          type="button"
          :class="BTN.filled"
          :disabled="sending"
          data-testid="correo-enviar"
          @click="send"
        >
          {{ sending ? 'Enviando…' : 'Enviar' }}
        </button>
      </template>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet, ListRow } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { BTN, curateFormats } from '@/documentos/tools'
import {
  addRecipients,
  attachmentName,
  borrador,
  enviar,
  errorText,
  newRequestId,
  recipientName,
  reviewOf,
  scrollSheetToTop,
  sentToast,
  splitTemplates,
} from './correo'

const props = defineProps({
  open: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  /** The record's title («Cliente prueba D5») for the subtitle. */
  title: { type: String, default: '' },
  /** The profile's print-format curation (same object PrintSheet takes). */
  curate: { type: Object, default: null },
  /** Reply mode: `{ en_respuesta_a, para: [], asunto, doctype?, name? }` from `mensaje().responder`. */
  reply: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'sent'])

const step = ref('redactar')
const loading = ref(false)
const loadError = ref('')
const filling = ref(false)
const sending = ref(false)
const error = ref('')
const aviso = ref('')
const data = ref({})
const para = ref([])
const typed = ref('')
const typedError = ref('')
const asunto = ref('')
const cuerpo = ref('')
const plantilla = ref(null)
const pdf = ref(true)
const formato = ref('')
const requestId = ref('')
const body = ref(null)
const anchor = ref(null)

const isReply = computed(() => Boolean(props.reply))
const recordMode = computed(() => props.doctype !== 'Communication')
const formats = computed(() =>
  curateFormats(data.value.formatos || [], props.curate),
)
const canPdf = computed(
  () => recordMode.value && formats.value.length > 0 && !isReply.value,
)
const templates = computed(() => splitTemplates(data.value.plantillas || []))
const plantillaLabel = computed(
  () =>
    (data.value.plantillas || []).find((p) => p.name === plantilla.value)
      ?.label || plantilla.value,
)
const formatoLabel = computed(() => {
  const f = formats.value.find((x) => x.name === formato.value)
  if (!f) return 'Estándar'
  return f.label === 'Standard' ? 'Estándar' : f.label
})
const pending = computed(() =>
  (data.value.para || []).filter((s) => !para.value.includes(s.email)),
)
const review = computed(() =>
  reviewOf({
    puede: Boolean(data.value.puede_enviar),
    motivo: data.value.motivo,
    para: para.value,
    asunto: asunto.value,
    cuerpo: cuerpo.value,
    pdf: canPdf.value && pdf.value,
    formato: formato.value,
    adjunto: attachmentName(data.value.name),
  }),
)
const sheetTitle = computed(
  () =>
    ({
      plantillas: 'Elegir plantilla',
      formatos: 'Formato del PDF',
      revisar: 'Revisa antes de enviar',
    })[step.value] || (isReply.value ? 'Responder' : 'Enviar por correo'),
)
const sheetSubtitle = computed(() => {
  if (step.value === 'revisar') return 'Así le llega al cliente.'
  const what = [data.value.etiqueta, props.title || data.value.titulo]
    .filter(Boolean)
    .join(' de ')
  return what
})

watch(
  () => props.open,
  (open) => {
    if (open) load()
  },
  { immediate: true },
)

// One scroller for every step: «Revisa antes de enviar» kept Redactar's
// scroll and hid «Para» under the subtitle. Each step starts at the top.
watch(step, () => nextTick(() => scrollSheetToTop(anchor.value)))

async function load() {
  step.value = 'redactar'
  error.value = ''
  loadError.value = ''
  aviso.value = ''
  typed.value = ''
  typedError.value = ''
  requestId.value = ''
  loading.value = true
  try {
    if (recordMode.value) {
      data.value = (await borrador(props.doctype, props.name)) || {}
    } else {
      // A reply to an email that is not on a record: no PDF, no templates.
      data.value = {
        puede_enviar: true,
        etiqueta: 'Correo',
        name: props.name,
        para: [],
        plantillas: [],
        formatos: [],
      }
    }
    const d = data.value
    plantilla.value = d.plantilla || null
    if (isReply.value) {
      para.value = [...(props.reply.para || [])]
      asunto.value = props.reply.asunto || ''
      cuerpo.value = props.reply.cuerpo || ''
      pdf.value = false
    } else {
      para.value = d.para?.length ? [d.para[0].email] : []
      asunto.value = d.asunto || ''
      cuerpo.value = d.cuerpo || ''
      pdf.value = true
    }
    formato.value = (
      formats.value.find((f) => f.default) || formats.value[0]
    )?.name
    nextTick(grow)
  } catch (e) {
    loadError.value = errorText(e)
  } finally {
    loading.value = false
  }
}

function grow() {
  const el = body.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight + 2, 480)}px`
}

function remove(email) {
  para.value = para.value.filter((e) => e !== email)
}

function addTyped() {
  if (!typed.value.trim()) {
    typedError.value = ''
    return
  }
  const { para: next, invalid } = addRecipients(para.value, typed.value)
  para.value = next
  typed.value = invalid.join(', ')
  typedError.value = invalid.length
    ? `Revisa este correo: ${invalid.join(', ')}`
    : ''
}

function onComma(event) {
  if (event.key === ',' || event.key === ';' || event.key === ' ') {
    event.preventDefault()
    addTyped()
  }
}

async function pickTemplate(p) {
  aviso.value = ''
  if (!p) {
    plantilla.value = null
    if (data.value.asunto) asunto.value = data.value.asunto
    if (data.value.cuerpo) cuerpo.value = data.value.cuerpo
    step.value = 'redactar'
    nextTick(grow)
    return
  }
  filling.value = true
  try {
    const filled = await borrador(props.doctype, props.name, p.name)
    plantilla.value = filled?.aviso ? null : p.name
    aviso.value = filled?.aviso || ''
    if (!filled?.aviso) {
      asunto.value = filled.asunto
      cuerpo.value = filled.cuerpo
    }
    step.value = 'redactar'
    nextTick(grow)
  } catch (e) {
    aviso.value = errorText(e)
    step.value = 'redactar'
  } finally {
    filling.value = false
  }
}

function pickFormat(name) {
  formato.value = name
  step.value = 'redactar'
}

function toReview() {
  addTyped()
  if (!review.value.ok) return
  error.value = ''
  requestId.value = newRequestId()
  step.value = 'revisar'
}

async function send() {
  if (sending.value || !review.value.ok) return
  sending.value = true
  error.value = ''
  try {
    const result = await enviar({
      doctype: props.doctype,
      name: props.name,
      para: review.value.para,
      asunto: review.value.asunto,
      cuerpo: review.value.cuerpo,
      formato: review.value.adjunto ? formato.value : undefined,
      adjuntar_pdf: review.value.adjunto ? 1 : 0,
      plantilla: plantilla.value || undefined,
      request_id: requestId.value,
      en_respuesta_a: props.reply?.en_respuesta_a || undefined,
    })
    toast.success(sentToast(review.value.para, data.value.para || []))
    emit('sent', result)
    emit('update:open', false)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    sending.value = false
  }
}
</script>
