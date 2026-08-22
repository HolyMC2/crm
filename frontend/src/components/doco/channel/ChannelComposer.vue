<!--
  Channel composer — tiers 0/1 of CRM_CHANNEL_LADDER_SPEC.

  This surface CANNOT send. It renders a template, hands the operator a link, and
  writes down that it did. WhatsApp opens with the text already typed; a human
  taps send. That is the review-gated-auto-sends policy enforced by physics
  instead of by a flag — there is no send endpoint behind this component.

  Two things the browser genuinely cannot know, and so does not claim:
  · whose WhatsApp Web session is logged in — at tier 1 the server tells us which
    number the shop configured, and that hint is the only promise we make;
  · whether the message was actually sent — hence «Registrar» writes an INTENT and
    the outcome chips are how the human closes the loop afterwards, including on
    the intents logged before this dialog was opened.

  An approved (Meta) template keeps its unfilled holes VISIBLE as {{1}}. Blanking
  them is how «¡Buenas noticias, !» reaches a customer; a hole the operator can
  see is a hole the operator fills.
-->
<template>
  <Dialog v-model="show" :options="{ title: __('Enviar mensaje'), size: 'xl' }">
    <template #body-content>
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="option in channelChoices"
            :key="option.value"
            class="press rounded-full px-2.5 py-1 text-[12px] font-semibold"
            :class="
              channel === option.value
                ? 'bg-surface-green-2 text-ink-green-8'
                : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'
            "
            @click="channel = option.value"
          >
            {{ option.label }}
          </button>
          <span class="ml-auto text-[11px] text-ink-gray-5">
            {{ __('Para') }}:
            <span class="font-medium text-ink-gray-8">{{
              props.contactName || props.phone || '—'
            }}</span>
          </span>
        </div>

        <p
          v-if="config?.sender_hint"
          class="rounded-md bg-surface-blue-1 px-2.5 py-2 text-[12px] text-ink-blue-3"
        >
          {{
            __('Saldrá desde el WhatsApp de la tienda ({0}) si esa sesión es la abierta en este navegador.', [
              config.sender_hint,
            ])
          }}
        </p>
        <p
          v-else-if="config && !config.can_auto_send"
          class="rounded-md bg-surface-gray-2 px-2.5 py-2 text-[12px] text-ink-gray-6"
        >
          {{ __('Se abrirá TU WhatsApp con el mensaje escrito. Nada se envía solo: tú tocas enviar.') }}
        </p>
        <p
          v-else-if="config?.can_auto_send"
          class="rounded-md bg-surface-gray-2 px-2.5 py-2 text-[12px] text-ink-gray-6"
        >
          {{ __('Esta tienda tiene API oficial. Aquí se arma el enlace; el envío automático vive en la Bandeja.') }}
        </p>

        <div v-if="prefillSupported">
          <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5">
            {{ __('Plantilla') }}
          </label>
          <select
            v-model="template"
            class="w-full rounded-md border border-outline-gray-2 bg-surface-white px-2 py-1.5 text-[13px] text-ink-gray-8"
            @change="loadTemplate"
          >
            <option value="">{{ __('Mensaje libre (sin plantilla)') }}</option>
            <option v-for="row in templates" :key="row.name" :value="row.name">
              {{ row.template_name }}{{ row.scope === 'approved' ? ' ·  Meta' : '' }}
            </option>
          </select>

          <!-- One input per hole the record could not fill. `sample` is Meta's own
               example for that position, which is exactly what a placeholder is for. -->
          <div v-if="openHoles.length" class="mt-2 space-y-1.5 rounded-xl border border-outline-amber-2 bg-surface-amber-1 p-2.5">
            <div class="text-[11px] font-semibold uppercase tracking-wide text-ink-amber-9">
              {{ __('Completa los huecos de la plantilla') }}
            </div>
            <div
              v-for="hole in openHoles"
              :key="hole.index"
              class="flex items-center gap-2"
            >
              <span class="w-14 shrink-0 font-mono text-[12px] text-ink-amber-9">{{ holeToken(hole.index) }}</span>
              <input
                v-model="manual[String(hole.index)]"
                type="text"
                class="w-full rounded-md border border-outline-gray-2 bg-surface-white px-2 py-1 text-[13px] text-ink-gray-8"
                :placeholder="hole.sample || __('Escribe el valor')"
                @change="loadTemplate"
              />
            </div>
            <p class="text-[11px] text-ink-amber-9">
              {{ __('Un hueco sin llenar se queda visible en el mensaje — no se borra solo.') }}
            </p>
          </div>

          <textarea
            v-model="text"
            rows="6"
            class="mt-2 w-full rounded-md border border-outline-gray-2 bg-surface-white px-2.5 py-2 text-[13px] leading-relaxed text-ink-gray-8"
            :placeholder="__('Escribe el mensaje…')"
          />
          <div class="mt-1 flex items-center justify-between text-[11px] text-ink-gray-4">
            <span>{{ text.length }} / {{ MAX_PREFILL }}</span>
            <span v-if="text.length > MAX_PREFILL" class="font-semibold text-ink-red-6">{{
              __('Se recortará')
            }}</span>
          </div>
        </div>
        <p v-else class="rounded-md bg-surface-gray-2 px-2.5 py-2 text-[12px] text-ink-gray-6">
          {{ __('Este canal no acepta texto prellenado; se abrirá la conversación en blanco.') }}
        </p>

        <p v-if="error" class="text-[12px] font-medium text-ink-red-6">{{ error }}</p>
        <p v-if="blockedUrl" class="text-[12px] text-ink-gray-6">
          {{ __('El navegador bloqueó la ventana.') }}
          <a :href="blockedUrl" target="_blank" rel="noopener" class="font-semibold text-ink-blue-3 underline">{{
            __('Abrir la conversación')
          }}</a>
        </p>

        <!-- The loop-closer: every intent on this record, annotatable whenever the
             answer actually arrives. -->
        <div v-if="intents.length" class="rounded-xl border border-outline-gray-2 p-3">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5">
            {{ __('¿Qué pasó?') }}
          </div>
          <div v-for="row in intents" :key="row.name" class="mt-2 border-t border-outline-gray-1 pt-2 first:mt-1 first:border-0 first:pt-0">
            <div class="flex items-baseline justify-between gap-2">
              <span class="truncate text-[12px] text-ink-gray-7">{{ row.preview || __('(sin texto)') }}</span>
              <span class="shrink-0 text-[11px] text-ink-gray-4">{{ shortDate(row.communication_date) }}</span>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <button
                v-for="option in OUTCOMES"
                :key="option.value"
                class="press rounded-full px-2.5 py-1 text-[12px] font-semibold"
                :class="
                  row.outcome === option.value
                    ? 'bg-surface-green-2 text-ink-green-8'
                    : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'
                "
                @click="markOutcome(row, option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button :label="__('Cerrar')" @click="show = false" />
        <Button
          variant="solid"
          :loading="busy"
          :label="intents.length ? __('Abrir de nuevo') : __('Abrir y registrar')"
          @click="openAndLog"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog, call, toast } from 'frappe-ui'

const MAX_PREFILL = 1000
const OUTCOMES = [
  { value: 'respondio', label: __('Respondió') },
  { value: 'sin_respuesta', label: __('Sin respuesta') },
  { value: 'compro', label: __('Compró') },
]

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
  phone: { type: String, default: '' },
  contactName: { type: String, default: '' },
  // A rule-staged CRM Task already knows which template it wants; preselect it
  // so the task's one click really is one click.
  presetTemplate: { type: String, default: '' },
})
const show = defineModel({ type: Boolean, default: false })

const channel = ref('whatsapp')
const template = ref('')
const text = ref('')
// the last untouched server render, so a hole edit can tell «still ours» from
// «the operator has written something here»
const pristine = ref('')
const manual = ref({})
const holes = ref([])
const templates = ref([])
const config = ref(null)
const intents = ref([])
const busy = ref(false)
const error = ref('')
const blockedUrl = ref('')

const channelChoices = [
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'sms', label: '✉ SMS' },
  { value: 'call', label: '📞 Llamar' },
]
const prefillSupported = computed(() => ['whatsapp', 'sms'].includes(channel.value))
const openHoles = computed(() => holes.value.filter((h) => h.source !== 'field'))

// Built in JS, not written in the template: a literal double-brace inside an
// interpolation closes it early and the whole component fails to compile.
function holeToken(index) {
  return `${'{'.repeat(2)}${index}${'}'.repeat(2)}`
}

function shortDate(value) {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T'))
  return isNaN(d) ? '' : d.toLocaleDateString()
}

watch(show, async (open) => {
  if (!open) return
  error.value = ''
  blockedUrl.value = ''
  manual.value = {}
  holes.value = []
  pristine.value = ''
  text.value = ''
  template.value = props.presetTemplate || ''
  try {
    config.value = await call('doco_marketing.api.channel.get_channel_config')
    templates.value = await call('doco_marketing.api.channel.list_channel_templates', {
      doctype: props.doctype,
    })
    await loadIntents()
    if (template.value) await loadTemplate()
  } catch (e) {
    error.value = e?.messages?.[0] || __('No se pudo cargar la configuración.')
  }
})

async function loadIntents() {
  try {
    intents.value = await call('doco_marketing.api.channel.list_channel_intents', {
      doctype: props.doctype,
      name: props.docname,
    })
  } catch (e) {
    intents.value = []
  }
}

async function loadTemplate() {
  if (!template.value) {
    holes.value = []
    pristine.value = ''
    return
  }
  try {
    const out = await call('doco_marketing.api.channel.render_channel_template', {
      template: template.value,
      doctype: props.doctype,
      name: props.docname,
      params: JSON.stringify(manual.value),
    })
    holes.value = out.holes || []
    // The server render is authoritative only while the operator has not written
    // their own words into the box. Once they have, filling a hole must not throw
    // that away — substitute into what is actually on screen instead.
    if (!text.value || text.value === pristine.value) {
      text.value = out.text || ''
    } else {
      holes.value
        .filter((hole) => hole.value)
        .forEach((hole) => {
          text.value = text.value.split(`{{${hole.index}}}`).join(hole.value)
        })
    }
    pristine.value = out.text || ''
  } catch (e) {
    error.value = e?.messages?.[0] || __('No se pudo procesar la plantilla.')
  }
}

async function openAndLog() {
  error.value = ''
  blockedUrl.value = ''
  if (!props.phone) {
    error.value = __('Este registro no tiene teléfono.')
    return
  }
  busy.value = true
  // Opened synchronously inside the click: a popup blocker kills a window.open
  // that is not in the click's own task. NOT with 'noopener' — that feature makes
  // window.open return null by spec, which silently sent the whole CRM tab to
  // WhatsApp and took the in-flight log call with it. We sever `opener` by hand
  // instead, which buys the same protection and keeps the handle.
  const tab = window.open('', '_blank')
  if (tab) {
    try {
      tab.opener = null
    } catch (e) {
      /* cross-origin hardening only; not worth failing the send over */
    }
  }
  let navigated = false
  try {
    const composed = await call('doco_marketing.api.channel.compose_channel_message', {
      channel: channel.value,
      target: props.phone,
      text: prefillSupported.value ? text.value : '',
      pointer: pointerKind(),
      doctype: props.doctype,
      name: props.docname,
    })
    if (tab) {
      tab.location.href = composed.url
      navigated = true
    }
    await call('doco_marketing.api.channel.log_channel_intent', {
      doctype: props.doctype,
      name: props.docname,
      channel: channel.value,
      target: composed.target,
      text: prefillSupported.value ? text.value : '',
      template: template.value || null,
    })
    await loadIntents()
    // Popup blocked: the intent is already on the record, so offer the link
    // rather than navigating this tab away from the CRM.
    if (!navigated) blockedUrl.value = composed.url
  } catch (e) {
    // Only a window we never navigated is ours to close — closing one that is
    // already showing WhatsApp would shut the conversation we just opened.
    if (tab && !navigated) tab.close()
    error.value = e?.messages?.[0] || __('No se pudo armar el enlace.')
  } finally {
    busy.value = false
  }
}

// Pointer, not user-agent: the question is «is there a touch input», and a UA
// string lies about tablets and desktop-mode phones. Fine pointer goes straight
// to web.whatsapp.com, which is what makes tier 1 one click instead of three.
function pointerKind() {
  return window.matchMedia?.('(pointer: fine)')?.matches ? 'fine' : 'coarse'
}

async function markOutcome(row, value) {
  try {
    await call('doco_marketing.api.channel.set_channel_outcome', {
      communication: row.name,
      outcome: value,
    })
    row.outcome = value
    toast.success(__('Registrado'))
  } catch (e) {
    error.value = e?.messages?.[0] || __('No se pudo registrar el resultado.')
  }
}
</script>
