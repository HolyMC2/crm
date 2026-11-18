<template>
  <!-- «Adjuntar ticket o factura» (crm docs/DINERO_EN_ORDEN.md §3d): the file
       goes through the ONE capture engine with the movement it explains; its
       entry pays from that movement's account and is linked to it when it is
       confirmed (doco books/ligar_aviso). -->
  <BottomSheet
    :open="open"
    title="Adjuntar ticket o factura"
    :subtitle="subtitle"
    layer="por-explicar-adjuntar"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-4 pb-2" data-adjuntar>
      <div role="radiogroup" aria-label="¿Qué es?" class="flex flex-wrap gap-2">
        <button
          v-for="k in KINDS"
          :key="k.key"
          type="button"
          role="radio"
          class="press min-h-11 rounded-full px-4 text-sm"
          :class="
            form.kind === k.key
              ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
              : 'border border-outline-gray-2 text-ink-gray-8'
          "
          :aria-checked="form.kind === k.key"
          :data-adjuntar-tipo="k.key"
          @click="form.kind = k.key"
        >
          {{ k.label }}
        </button>
      </div>
      <p class="text-sm text-ink-gray-6">{{ hint }}</p>
      <label
        class="press flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-7 border border-dashed border-outline-gray-3 px-4 text-sm text-ink-gray-8"
      >
        <span class="lucide-camera size-5" aria-hidden="true" />
        {{ form.file ? form.file.name : 'Tomar foto o elegir archivo' }}
        <input
          class="sr-only"
          type="file"
          accept="image/*,application/pdf,.xml,text/xml"
          capture="environment"
          data-adjuntar-archivo
          @change="pick"
        />
      </label>
      <input
        v-model="form.note"
        maxlength="140"
        autocomplete="off"
        class="min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
        placeholder="Nota (opcional)"
        aria-label="Nota"
      />
      <p v-if="form.problem" role="alert" class="text-sm text-ink-red-7">
        {{ form.problem }}
      </p>
    </div>
    <template #actions>
      <div class="flex gap-2">
        <Button
          class="min-h-11 flex-1"
          label="Cancelar"
          @click="emit('update:open', false)"
        />
        <Button
          class="min-h-11 flex-1"
          variant="solid"
          label="Leer y registrar"
          :disabled="!form.file"
          :loading="form.busy"
          data-adjuntar-enviar
          @click="send()"
        />
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText, money } from '@/components/bancos/bancos'
import { blobBase64 } from '@/components/captura/scanApi'
import { porExplicarApi } from '@/components/dinero/porExplicar'

const KINDS = [
  { key: 'ticket', label: 'Ticket' },
  { key: 'factura', label: 'Factura' },
  { key: 'transferencia', label: 'Comprobante' },
]
const HINTS = {
  ticket: 'Se registra como gasto pagado desde esta cuenta, con el ticket.',
  factura:
    'Se registra la factura del proveedor (con su IVA) y su pago desde esta cuenta.',
  transferencia:
    'Se registra el pago al proveedor desde esta cuenta, con el comprobante.',
}

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The movement: {name, description, amount, date}. */
  row: { type: Object, default: null },
  company: { type: String, default: '' },
  currency: { type: String, default: 'MXN' },
})
const emit = defineEmits(['update:open'])
const router = useRouter()

const form = reactive({
  kind: 'ticket',
  file: null,
  note: '',
  busy: false,
  problem: '',
})
const subtitle = computed(() =>
  props.row
    ? `${props.row.description} · ${money(props.row.amount, props.currency)}`
    : '',
)
const hint = computed(() => HINTS[form.kind])

watch(
  () => props.open,
  (open) => {
    if (open)
      Object.assign(form, {
        kind: 'ticket',
        file: null,
        note: '',
        busy: false,
        problem: '',
      })
  },
  { immediate: true },
)

function pick(event) {
  const file = event.target.files?.[0] || null
  form.file = file
  // a CFDI's XML is a factura
  if (file && /\.xml$/i.test(file.name)) form.kind = 'factura'
}

async function send() {
  if (!form.file || form.busy || !props.row) return
  form.busy = true
  form.problem = ''
  try {
    const out = await porExplicarApi('adjuntar', {
      company: props.company,
      movimiento: props.row.name,
      tipo: form.kind,
      file_name: form.file.name,
      content_b64: await blobBase64(form.file),
      nota: form.note.trim(),
    })
    emit('update:open', false)
    const url = String(out.open_url || '')
    if (url.startsWith('/crm/')) await router.push(url.slice(4))
  } catch (e) {
    form.problem = errorText(e)
  } finally {
    form.busy = false
  }
}
</script>
