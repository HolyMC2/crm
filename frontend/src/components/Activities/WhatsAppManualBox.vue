<!--
  Manual WhatsApp composer (whatsappMode === 'manual'): the shop has no connected
  account, or chose to send from its own phone. A template or quick reply fills
  the text with the record's data (crm.api.whatsapp_channel.prepare_manual_message);
  «Abrir WhatsApp» is a real link to wa.me, so WhatsApp or WhatsApp Web opens on
  this device and the worker presses send. Nothing is sent from here: the click is
  logged on the record as opened, delivery not confirmed.
-->
<template>
  <div
    class="mx-3 mb-3 mt-1 rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-3 dark:bg-surface-gray-2 sm:mx-10"
  >
    <p class="mb-2 text-xs text-ink-gray-6">
      <template v-if="shopNumber">
        {{ __('Envía desde el WhatsApp del negocio: {0}', [shopNumber]) }}
      </template>
      <template v-else>
        {{
          __(
            'Se abrirá WhatsApp en este dispositivo con el mensaje escrito. Tú presionas enviar.',
          )
        }}
      </template>
    </p>

    <div
      v-if="templates.length || quickReplies.length"
      class="mb-2 flex flex-wrap gap-1.5"
      data-testid="wa-manual-chips"
    >
      <button
        v-for="t in templates"
        :key="'t-' + t.name"
        type="button"
        class="rounded-full px-2.5 py-1 text-xs font-medium"
        :class="
          selectedTemplate === t.name
            ? 'bg-surface-green-2 text-ink-green-8'
            : 'bg-surface-gray-3 text-ink-gray-7 hover:bg-surface-gray-4'
        "
        :disabled="preparing"
        @click="useTemplate(t.name)"
      >
        📄 {{ t.name }}
      </button>
      <button
        v-for="(q, i) in quickReplies"
        :key="'q-' + i"
        type="button"
        class="rounded-full bg-surface-gray-3 px-2.5 py-1 text-xs font-medium text-ink-gray-7 hover:bg-surface-gray-4"
        @click="useQuickReply(q)"
      >
        ⚡ {{ q.label }}
      </button>
    </div>

    <textarea
      v-model="text"
      rows="4"
      class="w-full resize-y rounded-md border border-outline-gray-2 bg-surface-base px-2.5 py-2 text-base text-ink-gray-8 focus:border-outline-gray-4 focus:outline-none focus:ring-0"
      :placeholder="__('Escribe el mensaje o elige una plantilla')"
    />
    <p v-if="missing.length" class="mt-1 text-xs text-ink-amber-3">
      {{
        __('Faltan datos del registro: {0}. Revisa el texto antes de abrir.', [
          missing.join(', '),
        ])
      }}
    </p>

    <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
      <span class="text-xs text-ink-gray-5">
        <template v-if="phone">{{ __('Para') }}: +{{ phone }}</template>
        <template v-else-if="loaded">
          {{ __('Este registro no tiene un número de WhatsApp válido.') }}
        </template>
      </span>
      <a
        v-if="url"
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1.5 rounded bg-surface-gray-7 px-3 py-1.5 text-sm font-medium text-ink-white hover:bg-surface-gray-6"
        data-testid="wa-manual-open"
        @click="logOpen"
      >
        {{ __('Abrir WhatsApp') }}
      </a>
    </div>
    <p v-if="lastLogged" class="mt-1 text-xs text-ink-gray-5">
      {{ __('Registrado en el historial: abierto, envío no confirmado.') }}
    </p>
  </div>
</template>

<script setup>
import { call, toast } from 'frappe-ui'
import { computed, onMounted, ref } from 'vue'

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
})
const emit = defineEmits(['logged'])

const phone = ref('')
const shopNumber = ref('')
const loaded = ref(false)
const templates = ref([])
const quickReplies = ref([])
const text = ref('')
const selectedTemplate = ref('')
const missing = ref([])
const preparing = ref(false)
const lastLogged = ref(false)

const record = () => ({
  reference_doctype: props.doctype,
  reference_name: props.docname,
})

// Built in the browser so the link is ready before the click: an await between
// the click and window.open gets popup-blocked, a plain <a> does not.
const url = computed(() => {
  if (!phone.value) return ''
  const base = `https://wa.me/${phone.value}`
  return text.value ? `${base}?text=${encodeURIComponent(text.value)}` : base
})

onMounted(async () => {
  const [channel, tpls, replies] = await Promise.all([
    call('crm.api.whatsapp_channel.get_record_channel', record()).catch(
      () => null,
    ),
    call('crm.api.whatsapp_channel.list_manual_templates', {
      reference_doctype: props.doctype,
    }).catch(() => []),
    call('crm.api.whatsapp.get_quick_replies').catch(() => []),
  ])
  phone.value = channel?.phone || ''
  shopNumber.value = channel?.shop_number || ''
  templates.value = tpls || []
  quickReplies.value = replies || []
  loaded.value = true
})

async function useTemplate(name) {
  preparing.value = true
  try {
    const out = await call('crm.api.whatsapp_channel.prepare_manual_message', {
      ...record(),
      template: name,
    })
    text.value = out?.text || ''
    missing.value = out?.missing || []
    selectedTemplate.value = name
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo preparar la plantilla.'))
  } finally {
    preparing.value = false
  }
}

function useQuickReply(reply) {
  text.value = reply.text
  selectedTemplate.value = ''
  missing.value = []
}

// Not awaited: the link opens WhatsApp on its own; the log follows.
function logOpen() {
  call('crm.api.whatsapp_channel.log_manual_open', {
    ...record(),
    text: text.value,
    template: selectedTemplate.value,
  })
    .then(() => {
      lastLogged.value = true
      emit('logged')
    })
    .catch(() => toast.error(__('No se pudo registrar la apertura.')))
}
</script>
