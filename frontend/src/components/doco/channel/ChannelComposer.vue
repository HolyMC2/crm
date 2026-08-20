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
    the outcome chips are how the human closes the loop afterwards.
-->
<template>
  <Dialog
    v-model="show"
    :options="{ title: __('Enviar mensaje'), size: 'xl' }"
  >
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
          {{
            __('Se abrirá TU WhatsApp con el mensaje escrito. Nada se envía solo: tú tocas enviar.')
          }}
        </p>
        <p
          v-else-if="config?.can_auto_send"
          class="rounded-md bg-surface-gray-2 px-2.5 py-2 text-[12px] text-ink-gray-6"
        >
          {{
            __('Esta tienda tiene API oficial. Aquí se arma el enlace; el envío automático vive en la Bandeja.')
          }}
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

          <p
            v-if="missing.length"
            class="mt-1.5 rounded-md bg-surface-amber-1 px-2.5 py-1.5 text-[11.5px] text-ink-amber-9"
          >
            {{ __('Sin dato para') }}: {{ missing.join(', ') }}.
            {{ __('Complétalo a mano antes de enviar.') }}
          </p>

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

        <div v-if="logged" class="rounded-xl border border-outline-gray-2 p-3">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5">
            {{ __('¿Qué pasó?') }}
          </div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="option in OUTCOMES"
              :key="option.value"
              class="press rounded-full px-2.5 py-1 text-[12px] font-semibold"
              :class="
                outcome === option.value
                  ? 'bg-surface-green-2 text-ink-green-8'
                  : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'
              "
              @click="markOutcome(option.value)"
            >
              {{ option.label }}
            </button>
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
          :label="logged ? __('Abrir de nuevo') : __('Abrir y registrar')"
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
})
const show = defineModel({ type: Boolean, default: false })

const channel = ref('whatsapp')
const template = ref('')
const text = ref('')
const missing = ref([])
const templates = ref([])
const config = ref(null)
const busy = ref(false)
const error = ref('')
const logged = ref('')
const outcome = ref('')

const channelChoices = [
  { value: 'whatsapp', label: '💬 WhatsApp' },
  { value: 'sms', label: '✉ SMS' },
  { value: 'call', label: '📞 Llamar' },
]
const prefillSupported = computed(() =>
  ['whatsapp', 'sms'].includes(channel.value),
)

// Pointer, not user-agent: the question is «is there a touch input», and a UA
// string lies about tablets and desktop-mode phones. Fine pointer goes straight
// to web.whatsapp.com, which is what makes tier 1 one click instead of three.
function pointerKind() {
  return window.matchMedia?.('(pointer: fine)')?.matches ? 'fine' : 'coarse'
}

watch(show, async (open) => {
  if (!open) return
  error.value = ''
  logged.value = ''
  outcome.value = ''
  try {
    config.value = await call('doco_marketing.api.channel.get_channel_config')
    templates.value = await call(
      'doco_marketing.api.channel.list_channel_templates',
      { doctype: props.doctype },
    )
  } catch (e) {
    error.value = e?.messages?.[0] || __('No se pudo cargar la configuración.')
  }
})

async function loadTemplate() {
  missing.value = []
  if (!template.value) return
  try {
    const out = await call(
      'doco_marketing.api.channel.render_channel_template',
      { template: template.value, doctype: props.doctype, name: props.docname },
    )
    text.value = out.text || ''
    missing.value = out.missing || []
  } catch (e) {
    error.value = e?.messages?.[0] || __('No se pudo procesar la plantilla.')
  }
}

async function openAndLog() {
  error.value = ''
  if (!props.phone) {
    error.value = __('Este registro no tiene teléfono.')
    return
  }
  busy.value = true
  // The tab is opened BEFORE awaiting: a popup blocker kills a window.open that
  // is not in the click's own task, and the operator would just see nothing.
  const tab = window.open('', '_blank', 'noopener')
  try {
    const composed = await call(
      'doco_marketing.api.channel.compose_channel_message',
      {
        channel: channel.value,
        target: props.phone,
        text: prefillSupported.value ? text.value : '',
        pointer: pointerKind(),
        doctype: props.doctype,
        name: props.docname,
      },
    )
    if (tab) tab.location.href = composed.url
    else window.location.href = composed.url
    const out = await call('doco_marketing.api.channel.log_channel_intent', {
      doctype: props.doctype,
      name: props.docname,
      channel: channel.value,
      target: composed.target,
      text: prefillSupported.value ? text.value : '',
      template: template.value || null,
    })
    logged.value = out.communication
  } catch (e) {
    if (tab) tab.close()
    error.value = e?.messages?.[0] || __('No se pudo armar el enlace.')
  } finally {
    busy.value = false
  }
}

async function markOutcome(value) {
  if (!logged.value) return
  try {
    await call('doco_marketing.api.channel.set_channel_outcome', {
      communication: logged.value,
      outcome: value,
    })
    outcome.value = value
    toast.success(__('Registrado'))
  } catch (e) {
    error.value = e?.messages?.[0] || __('No se pudo registrar el resultado.')
  }
}
</script>
