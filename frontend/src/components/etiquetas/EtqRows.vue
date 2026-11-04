<template>
  <!-- What will print, one row per product or piece: its copies at hand, and
       a tap opens the rest (the name the label prints, its pieces, the
       product). The row on the stage is marked, and a tap shows its label. -->
  <ul
    class="divide-y divide-outline-gray-1 overflow-hidden rounded-8 border border-outline-gray-2"
    data-etq-rows
  >
    <li
      v-for="(row, position) in rows"
      :key="rowKey(row)"
      :class="position === shown ? 'bg-surface-gray-1' : ''"
      data-etq-row
    >
      <div
        class="flex flex-wrap items-center justify-end gap-x-1 py-1.5 pl-3 pr-1"
      >
        <!-- Below ~360 px the copies move under the name. -->
        <div class="min-w-0 flex-1 basis-36 py-0.5">
          <button
            type="button"
            class="press block w-full text-left"
            :aria-expanded="open === rowKey(row) ? 'true' : 'false'"
            :aria-label="`${row.item_name}: ver su etiqueta y editarla`"
            @click="tap(row, position)"
          >
            <span class="line-clamp-2 text-base text-ink-gray-9">{{
              row.item_name
            }}</span>
            <span class="block truncate text-sm text-ink-gray-6">{{
              rowLine(row)
            }}</span>
          </button>
          <p class="text-sm">
            <span
              v-if="rowPrice(row)"
              class="num font-semibold text-ink-gray-9"
              >{{ rowPrice(row) }}</span
            >
            <RouterLink
              v-else
              :to="{ name: 'Producto', params: { item: row.item_code } }"
              class="text-ink-amber-9 underline underline-offset-2"
              data-etq-sin-precio
              >Sin precio · ponle uno</RouterLink
            >
          </p>
        </div>
        <div
          v-if="!row.serial_no"
          class="flex flex-none items-center rounded-full bg-surface-gray-2"
          role="group"
          :aria-label="`Copias de ${row.item_name}`"
        >
          <button
            type="button"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 disabled:opacity-40"
            :disabled="row.qty <= 1"
            :aria-label="`Una copia menos de ${row.item_name}`"
            @click="emit('qty', row, row.qty - 1)"
          >
            <span class="lucide-minus size-4" aria-hidden="true" />
          </button>
          <input
            :value="row.qty"
            type="number"
            inputmode="numeric"
            min="1"
            :max="MAX_COPIES"
            class="num w-11 border-0 bg-transparent p-0 text-center text-base font-semibold text-ink-gray-9 [appearance:textfield] focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
            :aria-label="`Copias de ${row.item_name}`"
            @change="emit('qty', row, $event.target.value)"
          />
          <button
            type="button"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 disabled:opacity-40"
            :disabled="row.qty >= MAX_COPIES"
            :aria-label="`Una copia más de ${row.item_name}`"
            @click="emit('qty', row, row.qty + 1)"
          >
            <span class="lucide-plus size-4" aria-hidden="true" />
          </button>
        </div>
        <span
          v-else
          class="num flex-none px-3 text-sm text-ink-gray-6"
          title="Una pieza con serie lleva una sola etiqueta"
          >1 pieza</span
        >
        <button
          type="button"
          class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
          :aria-label="`Quitar ${row.item_name}`"
          @click="emit('remove', row)"
        >
          <span class="lucide-x size-4" aria-hidden="true" />
        </button>
      </div>
      <ExpandTransition>
        <div
          v-if="open === rowKey(row)"
          class="space-y-3 px-3 pb-3"
          data-etq-row-editor
        >
          <label class="block">
            <span class="block pb-1 text-sm text-ink-gray-6"
              >Nombre en la etiqueta</span
            >
            <input
              :value="row.item_name"
              type="text"
              maxlength="140"
              class="h-11 w-full rounded-6 border-0 bg-surface-base px-3 text-base text-ink-gray-9 ring-1 ring-outline-gray-2 focus:ring-2 focus:ring-outline-gray-3"
              :aria-label="`Nombre en la etiqueta de ${row.item_code}`"
              @change="rename(row, $event.target.value)"
            />
            <span
              v-if="row.base_name && row.base_name !== row.item_name"
              class="flex flex-wrap items-center gap-x-2 pt-1 text-sm text-ink-gray-6"
            >
              Solo para esta impresión; el producto se sigue llamando «{{
                row.base_name
              }}».
              <button
                type="button"
                class="press min-h-11 font-medium text-ink-gray-8 underline underline-offset-2"
                @click="emit('rename', row, row.base_name)"
              >
                Volver al nombre
              </button>
            </span>
          </label>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="row.units && !row.serial_no && !row.batch_no"
              class="press min-h-11"
              :label="
                row.units === 'serie'
                  ? 'Elegir piezas por serie'
                  : 'Elegir lotes'
              "
              @click="emit('pieces', row)"
            />
            <RouterLink
              :to="{ name: 'Producto', params: { item: row.item_code } }"
              class="press inline-flex min-h-11 items-center rounded-6 bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-3"
              >Ver producto</RouterLink
            >
          </div>
        </div>
      </ExpandTransition>
    </li>
  </ul>
</template>
<script setup>
import { ref } from 'vue'
import { Button } from 'frappe-ui'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import {
  MAX_COPIES,
  rowKey,
  rowLine,
  rowPrice,
} from '@/composables/useEtiquetas'

defineProps({
  rows: { type: Array, default: () => [] },
  // The row whose label the stage shows (-1: none).
  shown: { type: Number, default: -1 },
})
const emit = defineEmits(['qty', 'remove', 'rename', 'pieces', 'show'])

const open = ref('')
function tap(row, position) {
  const key = rowKey(row)
  open.value = open.value === key ? '' : key
  emit('show', position)
}
function rename(row, value) {
  const name = String(value || '').trim()
  emit('rename', row, name || row.base_name || row.item_name)
}
</script>
