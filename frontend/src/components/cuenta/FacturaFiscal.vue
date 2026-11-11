<template>
  <!-- A stamped CFDI as one quiet action under its row, so the figures stay the
       scan line: one file downloads at once, two unfold their choice in place. -->
  <div>
    <button
      type="button"
      class="press -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink-gray-7 active:bg-surface-gray-2 disabled:opacity-50 [@media(hover:hover)]:hover:bg-surface-gray-2"
      :aria-expanded="kinds.length > 1 ? String(open) : undefined"
      :aria-label="kinds.length > 1 ? undefined : fileLabel(kinds[0])"
      :disabled="disabled"
      data-testid="factura-fiscal"
      @click="tap"
    >
      <span class="lucide-download size-4" aria-hidden="true" />
      {{
        kinds.length > 1
          ? __('Fiscal invoice', null, 'Cuenta')
          : __('Fiscal invoice ({0})', [kinds[0].toUpperCase()], 'Cuenta')
      }}
    </button>
    <ExpandTransition>
      <div
        v-if="open && kinds.length > 1"
        class="flex flex-wrap gap-2 pb-1"
        data-testid="factura-fiscal-formatos"
      >
        <Button
          v-for="kind in kinds"
          :key="kind"
          class="min-h-11"
          :label="kind.toUpperCase()"
          :aria-label="fileLabel(kind)"
          :loading="busy === kind"
          :disabled="disabled"
          @click="$emit('download', kind)"
        />
      </div>
    </ExpandTransition>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { Button } from 'frappe-ui'
import { ExpandTransition } from '@/components/ui'

const props = defineProps({
  /** The files Boat serves: ['pdf', 'xml'] or ['xml'] (facturacion.cfdiKinds). */
  kinds: { type: Array, required: true },
  /** What the CFDI is of, for the screen reader: «Octubre 2026», «la recarga». */
  what: { type: String, default: '' },
  /** The kind downloading now, '' when none. */
  busy: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['download'])
const open = ref(false)

function fileLabel(kind) {
  return __(
    'Download the CFDI {0} of {1}',
    [String(kind || '').toUpperCase(), props.what],
    'Cuenta',
  )
}
function tap() {
  if (props.kinds.length === 1) return emit('download', props.kinds[0])
  open.value = !open.value
}
</script>
