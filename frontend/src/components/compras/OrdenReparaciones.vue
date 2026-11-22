<template>
  <!-- «Para reparaciones»: a confirmed purchase is the part a repair waits for.
       Pick the open repairs, check the card (the assistant's own
       ligar_compra_a_orden: the part on each repair as ordered, with its
       arrival), then link; the receipt of the purchase tells their people. -->
  <BottomSheet
    :open="open"
    :title="__('For repairs', null, 'EnLinea')"
    :subtitle="
      __(
        'Each repair shows the part as ordered; when it arrives, its people hear it.',
        null,
        'EnLinea',
      )
    "
    :dismissible="!busy"
    @close="close"
  >
    <div class="space-y-3 px-4 pb-2">
      <ComprasPicker
        v-if="!lines.length"
        :label="__('Repairs', null, 'EnLinea')"
        :placeholder="__('Search an open repair', null, 'EnLinea')"
        :load="(q) => enLineaApi('repairs', { search: q })"
        clear-on-pick
        @pick="add"
      />
      <div v-if="picked.length && !lines.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="(r, i) in picked"
          :key="r.value"
          type="button"
          :class="['press', chipClass(true)]"
          :aria-label="`${__('Remove', null, 'EnLinea')} ${r.label}`"
          @click="picked.splice(i, 1)"
        >
          {{ r.label }}
          <span class="lucide-x size-3.5" aria-hidden="true" />
        </button>
      </div>
      <ul v-if="lines.length" class="divide-y divide-outline-gray-1">
        <li v-for="line in lines" :key="line.n" class="py-2">
          <p
            :class="[
              'text-base',
              line.error ? 'text-ink-gray-5 line-through' : 'text-ink-gray-9',
            ]"
          >
            {{ line.label }}
          </p>
          <p v-if="line.error" class="text-sm text-ink-red-7">
            {{ line.error }}
          </p>
        </li>
      </ul>
      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>
    </div>
    <template #actions>
      <button
        type="button"
        :class="['press', BTN.text]"
        :disabled="busy"
        @click="close"
      >
        {{ __('Cancel', null, 'Compras') }}
      </button>
      <button
        v-if="!lines.length"
        type="button"
        :class="['press', BTN.filled]"
        :disabled="busy || !picked.length"
        data-orden-reparaciones-revisar
        @click="review"
      >
        {{ __('Review', null, 'EnLinea') }}
      </button>
      <button
        v-else
        type="button"
        :class="['press', BTN.filled]"
        :disabled="busy || !acceptableCount(lines)"
        data-orden-reparaciones-ligar
        @click="link"
      >
        {{ __('Link to the repairs', null, 'EnLinea') }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { ref } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { chipClass } from '@/components/ui/chipClass'
import { BTN } from '@/documentos/tools'
import { problemOf, requestId } from '@/composables/useCompras'
import {
  acceptableCount,
  applyCard,
  enLineaApi,
  previewCard,
} from '@/composables/useComprasEnLinea'

const props = defineProps({
  open: { type: Boolean, default: false },
  // The confirmed Purchase Order.
  order: { type: String, required: true },
})
const emit = defineEmits(['close', 'linked'])
const picked = ref([])
const lines = ref([])
const busy = ref(false)
const problem = ref('')
let rid = ''

const args = () => ({
  compra: props.order,
  ordenes: picked.value.map((r) => r.value),
})

function add(option) {
  if (option && !picked.value.some((r) => r.value === option.value))
    picked.value.push(option)
}
function close() {
  picked.value = []
  lines.value = []
  problem.value = ''
  emit('close')
}
async function review() {
  busy.value = true
  problem.value = ''
  try {
    lines.value =
      (await previewCard('ligar_compra_a_orden', args())).lines || []
    rid = requestId()
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = false
  }
}
async function link() {
  busy.value = true
  try {
    const result = await applyCard('ligar_compra_a_orden', args(), rid)
    toast.success(__('Linked to the repairs', null, 'EnLinea'))
    emit('linked', result)
    close()
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = false
  }
}
</script>
