<!--
  Cotización inline (ERP_INTEGRATION_SPEC P2.2/P2.3) — the minimal line editor
  for a deal quotation inside the 💰 Documentos panel. Deliberately small:
  qty + discount + remove on drafts; submit («Emitir»), «Cliente aceptó» → SO
  draft, and «Enviar por WhatsApp» (PDF document into the conversation).
  Complex editing stays in Desk.
-->
<template>
  <div class="rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-2">
    <div class="mb-1.5 flex items-center justify-between">
      <span class="text-[11px] font-bold text-ink-gray-8">
        {{ quotation }}
        <span v-if="detail && detail.docstatus === 0" class="ml-1 rounded bg-surface-gray-3 px-1 py-px text-[9.5px] font-semibold text-ink-gray-6">{{ __('Borrador') }}</span>
      </span>
      <button class="text-ink-gray-5 hover:text-ink-gray-9" :aria-label="__('Cerrar editor')" @click="$emit('close')">✕</button>
    </div>

    <div v-if="loading" class="py-2 text-[11.5px] text-ink-gray-5">{{ __('Cargando…') }}</div>
    <div v-else-if="error" class="py-2 text-[11.5px] text-ink-red-6">{{ error }}</div>

    <template v-else-if="detail">
      <div class="flex flex-col gap-1">
        <div
          v-for="l in detail.lines"
          :key="l.name"
          class="rounded-md bg-surface-base px-2 py-1.5 text-[11.5px] shadow-sm"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="min-w-0 truncate font-medium text-ink-gray-8" :title="l.item_code">{{ l.item_name || l.item_code }}</span>
            <span class="flex-none font-semibold tabular-nums text-ink-gray-9">{{ money(l.amount) }}</span>
          </div>
          <div v-if="editable" class="mt-1 flex items-center gap-2">
            <label class="flex items-center gap-1 text-[10px] text-ink-gray-5">
              {{ __('Cant.') }}
              <input
                type="number" min="1" max="999" step="1"
                class="w-14 rounded border border-outline-gray-2 bg-surface-base px-1 py-0.5 text-[11px]"
                :value="l.qty"
                :disabled="busy"
                @change="patchLine(l, { qty: $event.target.value })"
              />
            </label>
            <label class="flex items-center gap-1 text-[10px] text-ink-gray-5">
              {{ __('Desc.') }}
              <input
                type="number" min="0" max="100" step="1"
                class="w-14 rounded border border-outline-gray-2 bg-surface-base px-1 py-0.5 text-[11px]"
                :value="l.discount_percentage"
                :disabled="busy"
                @change="patchLine(l, { discount_percentage: $event.target.value })"
              />%
            </label>
            <span class="text-[10px] text-ink-gray-4">× {{ money(l.rate) }}</span>
            <button
              class="ml-auto text-[11px] text-ink-red-6 hover:text-ink-red-7"
              :disabled="busy"
              :title="__('Quitar línea')"
              @click="dropLine(l)"
            >✕</button>
          </div>
          <div v-else class="mt-0.5 text-[10px] text-ink-gray-5">
            {{ l.qty }} × {{ money(l.rate) }}<template v-if="l.discount_percentage"> · −{{ l.discount_percentage }}%</template>
          </div>
        </div>
      </div>

      <div class="mt-1.5 flex items-center justify-between text-[12px]">
        <span class="font-bold uppercase tracking-wide text-ink-gray-5 text-[10px]">{{ __('Total') }}</span>
        <span class="font-bold tabular-nums text-ink-gray-9">{{ money(detail.total) }}</span>
      </div>

      <div class="mt-2 flex flex-wrap gap-1.5">
        <button
          class="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
          style="background: var(--brand)"
          :disabled="busy || !detail.lines.length"
          :title="__('Enviar la cotización en PDF a la conversación de WhatsApp')"
          @click="sendWhatsapp"
        >📤 {{ __('Enviar por WhatsApp') }}</button>
        <button
          class="rounded-lg border border-outline-gray-2 bg-surface-base px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-gray-8 disabled:opacity-50"
          :disabled="busy || !detail.lines.length"
          :title="__('Crea la orden de venta (borrador) — facturación en Desk/POS')"
          @click="accept"
        >🤝 {{ __('Cliente aceptó') }}</button>
        <button
          v-if="editable"
          class="rounded-lg border border-outline-gray-2 bg-surface-base px-2.5 py-1.5 text-[11.5px] text-ink-gray-7 disabled:opacity-50"
          :disabled="busy || !detail.lines.length"
          :title="__('Emitir la cotización (ya no será editable aquí)')"
          @click="submit"
        >{{ __('Emitir') }}</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { formatMoney } from '@/composables/crmFormat'
import {
  getQuotationDetail,
  updateQuotationLine,
  removeQuotationLine,
  submitQuotation,
  acceptQuotation,
  sendQuotationWhatsapp,
  salesRollup,
} from '@/composables/salesDocs'

const props = defineProps({
  deal: { type: String, required: true },
  quotation: { type: String, required: true },
  // conversation phone (DealHeader row.mobile_no); backend falls back to the deal's
  to: { type: String, default: '' },
})
const emit = defineEmits(['close', 'changed'])

const detail = ref(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const editable = computed(() => detail.value?.docstatus === 0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    detail.value = await getQuotationDetail(props.deal, props.quotation)
  } catch (e) {
    error.value = e?.messages?.[0] || __('No se pudo cargar la cotización.')
  } finally {
    loading.value = false
  }
}
watch(() => props.quotation, load, { immediate: true })

function money(v) {
  return formatMoney(v, detail.value?.currency || salesRollup.value?.currency)
}

async function run(fn, okMsg) {
  busy.value = true
  try {
    const out = await fn()
    if (okMsg) toast.success(okMsg)
    emit('changed')
    return out
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo completar la acción.'))
  } finally {
    busy.value = false
  }
}

async function patchLine(l, patch) {
  const out = await run(() => updateQuotationLine(props.deal, props.quotation, l.name, patch))
  if (out) detail.value = out
}
async function dropLine(l) {
  const out = await run(() => removeQuotationLine(props.deal, props.quotation, l.name))
  if (out?.deleted) {
    toast.success(__('Cotización eliminada.'))
    emit('close')
  } else if (out) {
    detail.value = out
  }
}
async function submit() {
  const out = await run(() => submitQuotation(props.deal, props.quotation), __('Cotización emitida.'))
  if (out) detail.value = out
}
async function accept() {
  const out = await run(() => acceptQuotation(props.deal, props.quotation))
  if (out) {
    toast.success(
      out.already_existed
        ? __('Ya existía la orden {0}.', [out.sales_order])
        : __('Orden de venta {0} creada (borrador).', [out.sales_order]),
    )
    load()
  }
}
async function sendWhatsapp() {
  const out = await run(
    () => sendQuotationWhatsapp(props.deal, props.quotation, props.to || undefined),
    __('Cotización enviada a la conversación.'),
  )
  if (out) load()
}
</script>
