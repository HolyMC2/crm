<!--
  «Pedir firma» on a deal quote: the quote as the customer's own page (/f/<link>),
  where they review it, sign and accept it, and pay it when the shop turned
  «Cobro en línea» on. Accepting creates the same Sales Order draft as
  «Cliente aceptó». Engine: doco.firma; the quote's rules: doco.docoutils.quote_firma.
-->
<template>
  <div class="mt-2 rounded-5 border border-outline-gray-2 bg-surface-base p-2">
    <div class="flex items-center justify-between">
      <span class="text-[11.5px] font-semibold text-ink-gray-8">{{
        __('Página para firmar')
      }}</span>
      <button
        class="text-ink-gray-5 hover:text-ink-gray-9"
        :aria-label="__('Cerrar')"
        :title="__('Cerrar')"
        @click="$emit('close')"
      >
        ✕
      </button>
    </div>

    <p v-if="loading && !sheet" class="py-1.5 text-[11px] text-ink-gray-5">
      {{ __('Cargando…') }}
    </p>
    <p v-else-if="error" class="py-1.5 text-[11px] text-ink-red-7">
      {{ error }}
      <button class="ml-1 font-semibold underline" @click="load">
        {{ __('Reintentar') }}
      </button>
    </p>

    <template v-else-if="sheet">
      <!-- switched off: say why and offer the fix -->
      <div v-if="sheet.off" class="mt-1 text-[11px] text-ink-gray-6">
        <p>{{ sheet.off.message }}</p>
        <button
          v-if="sheet.off.actions?.includes('enable')"
          class="press mt-1.5 rounded-6 px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
          style="background: var(--brand)"
          :disabled="busy"
          @click="enable"
        >
          {{ __('Encender aceptación en línea') }}
        </button>
      </div>

      <p
        v-else-if="sheet.problems?.length && !request"
        class="mt-1 text-[11px] text-ink-gray-6"
      >
        {{ sheet.problems[0].message }}
      </p>

      <template v-else>
        <p v-if="request" class="mt-1 text-[11px] text-ink-gray-7">
          {{ firmaLine(request) }}
        </p>
        <p
          v-if="paymentText"
          class="mt-0.5 text-[11px] font-semibold"
          :class="
            sheet.payment?.state === 'paid'
              ? 'text-ink-green-7'
              : 'text-ink-gray-7'
          "
        >
          {{ paymentText }}
        </p>
        <p v-if="!request" class="mt-1 text-[11px] text-ink-gray-6">
          {{
            sheet.payment_enabled
              ? __(
                  'El cliente revisa la cotización, la firma y la paga desde su teléfono. Al aceptar se crea la orden de venta.',
                )
              : __(
                  'El cliente revisa la cotización y la acepta con su firma desde su teléfono. Al aceptar se crea la orden de venta.',
                )
          }}
        </p>
        <p
          v-if="sheet.problems?.length && request"
          class="mt-1 text-[11px] text-ink-gray-5"
        >
          {{ sheet.problems[0].message }}
        </p>

        <div class="mt-1.5 flex flex-wrap gap-1.5">
          <button
            v-if="canSend"
            class="press rounded-6 px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
            style="background: var(--brand)"
            :disabled="busy"
            @click="sendToChat"
          >
            {{
              open
                ? __('Enviar el enlace al chat')
                : __('Crear enlace y enviarlo al chat')
            }}
          </button>
          <button
            v-if="canSend"
            class="press rounded-6 border border-outline-gray-2 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-gray-8 disabled:opacity-50"
            :disabled="busy"
            @click="copyLink"
          >
            {{ __('Copiar enlace') }}
          </button>
          <a
            v-if="sheet.share?.url"
            class="press rounded-6 border border-outline-gray-2 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-gray-8"
            :href="sheet.share.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ __('Ver la página') }}</a
          >
          <button
            v-if="open"
            class="press rounded-6 px-2.5 py-1.5 text-[11.5px] text-ink-red-7 disabled:opacity-50"
            :disabled="busy"
            @click="cancel"
          >
            {{ __('Cancelar enlace') }}
          </button>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { formatMoney } from '@/composables/crmFormat'
import {
  cancelQuoteFirma,
  enableQuoteFirma,
  getQuoteFirma,
  newRequestKey,
  reloadSalesSummary,
  requestQuoteFirma,
  sendQuoteFirmaText,
} from '@/composables/salesDocs'
import { firmaLine, paymentLine } from '@/utils/quoteFirma'

const props = defineProps({
  deal: { type: String, required: true },
  quotation: { type: String, required: true },
  // the conversation's phone (QuoteEditor `to`); the backend proves it is the deal's
  to: { type: String, default: '' },
})
const emit = defineEmits(['close', 'changed'])

const sheet = ref(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
// One key per «Crear enlace» intent: a lost response replays the same request.
let requestKey = newRequestKey()

const request = computed(() => sheet.value?.request || null)
const open = computed(() => request.value?.state === 'Pendiente')
const canSend = computed(
  () =>
    sheet.value?.can_ask &&
    !sheet.value?.off &&
    (open.value || !sheet.value?.problems?.length),
)
const paymentText = computed(() =>
  paymentLine(sheet.value?.payment, (n) =>
    formatMoney(n, sheet.value?.payment?.currency || sheet.value?.currency),
  ),
)

function message(e, fallback) {
  return e?.messages?.[0] || fallback
}

async function load() {
  loading.value = true
  try {
    sheet.value = await getQuoteFirma(props.deal, props.quotation)
    error.value = ''
  } catch (e) {
    error.value = message(e, __('No se pudo cargar la firma de la cotización.'))
  } finally {
    loading.value = false
  }
}
watch(() => props.quotation, load, { immediate: true })

// The open link, or a new one for the quote as it is now.
async function link() {
  if (open.value && sheet.value?.share) return sheet.value.share
  const out = await requestQuoteFirma(
    props.deal,
    props.quotation,
    requestKey,
    sheet.value?.stamp,
  )
  if (!out?.ok) {
    toast.error(out?.refusal?.message || __('No se pudo crear el enlace.'))
    await load()
    return null
  }
  requestKey = newRequestKey()
  emit('changed')
  return out.share
}

async function sendToChat() {
  busy.value = true
  try {
    const share = await link()
    if (!share) return
    await sendQuoteFirmaText(props.deal, share.text, props.to)
    toast.success(__('Enlace enviado al chat.'))
    reloadSalesSummary(props.deal)
    await load()
  } catch (e) {
    toast.error(message(e, __('No se pudo enviar el enlace.')))
    await load()
  } finally {
    busy.value = false
  }
}

async function copyLink() {
  busy.value = true
  try {
    const share = await link()
    if (!share) return
    await navigator.clipboard.writeText(share.text)
    toast.success(__('Enlace copiado.'))
    await load()
  } catch (e) {
    toast.error(message(e, __('No se pudo copiar el enlace.')))
  } finally {
    busy.value = false
  }
}

async function cancel() {
  busy.value = true
  try {
    sheet.value = await cancelQuoteFirma(
      props.deal,
      props.quotation,
      request.value.name,
    )
    toast.success(__('Enlace cancelado.'))
    emit('changed')
  } catch (e) {
    toast.error(message(e, __('No se pudo cancelar el enlace.')))
  } finally {
    busy.value = false
  }
}

async function enable() {
  busy.value = true
  try {
    sheet.value = await enableQuoteFirma(props.deal, props.quotation)
    toast.success(__('Aceptación en línea encendida.'))
  } catch (e) {
    toast.error(message(e, __('No se pudo encender.')))
  } finally {
    busy.value = false
  }
}
</script>
