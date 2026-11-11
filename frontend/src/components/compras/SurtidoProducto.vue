<template>
  <!-- One product of a supplier's list, with everything the shop knows of it:
       the supplier's name and ours, the numbers to decide (sold, stock, paid,
       selling, margin, another supplier), its price over time, and the cart. -->
  <BottomSheet
    :open="open"
    :title="row?.name || ''"
    :subtitle="row?.code ? __('Supplier code {0}', [row.code], 'Surtido') : ''"
    :fullscreen="full"
    @update:open="(v) => emit('update:open', v)"
    @update:fullscreen="(v) => (full = v)"
  >
    <div v-if="row" class="space-y-5" data-testid="surtido-producto">
      <div class="flex gap-4">
        <button
          v-if="row.photo"
          type="button"
          class="press size-24 flex-none overflow-hidden rounded-7 bg-surface-gray-1"
          :aria-label="__('Photo of {0}', [row.name], 'Surtido')"
          @click="emit('photo', row)"
        >
          <img
            :src="row.thumb || row.photo"
            alt=""
            class="size-full object-contain"
          />
        </button>
        <div class="min-w-0 flex-1">
          <p class="num text-2xl font-semibold text-ink-gray-9">
            {{ money(row.price) }}
          </p>
          <p v-if="row.min_qty > 1" class="text-sm text-ink-gray-6">
            {{ __('from {0} pcs', [row.min_qty], 'Surtido') }}
          </p>
          <ul v-if="row.printed?.length" class="mt-2 flex flex-wrap gap-1">
            <li
              v-for="b in row.printed"
              :key="b"
              class="rounded-full bg-surface-gray-2 px-2 text-xs leading-6 text-ink-gray-7"
            >
              {{ b }}
            </li>
          </ul>
          <p class="mt-2 text-sm text-ink-gray-6">
            {{ row.category }}
            <button
              v-if="row.page"
              type="button"
              class="press ml-1 underline decoration-dotted underline-offset-2"
              @click="emit('page', row.page)"
            >
              {{ __('p. {0}', [row.page], 'Surtido') }}
            </button>
          </p>
        </div>
      </div>

      <!-- the numbers to decide -->
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div v-for="f in facts" :key="f.label">
          <dt class="text-xs text-ink-gray-5">{{ f.label }}</dt>
          <dd
            class="num text-base font-semibold"
            :class="f.tone || 'text-ink-gray-9'"
          >
            {{ f.value }}
          </dd>
          <dd v-if="f.note" class="text-xs text-ink-gray-5">{{ f.note }}</dd>
        </div>
      </dl>

      <!-- the supplier's name and ours -->
      <section class="border-t border-outline-gray-2 pt-4">
        <h3 class="text-sm font-medium text-ink-gray-8">
          {{ __('Your product', null, 'Surtido') }}
        </h3>
        <div v-if="row.item" class="mt-2 flex items-center gap-3">
          <span
            class="lucide-link size-4 flex-none text-ink-gray-5"
            aria-hidden="true"
          />
          <p class="min-w-0 flex-1 text-sm">
            <span class="block font-medium text-ink-gray-9">{{
              row.item_name || row.item
            }}</span>
            <span class="block text-ink-gray-6">{{
              __(
                'The supplier calls it «{0}»',
                [row.code || row.name],
                'Surtido',
              )
            }}</span>
          </p>
          <Button
            v-if="owner"
            :label="__('Unlink', null, 'Surtido')"
            :loading="busy === 'link'"
            @click="link(null)"
          />
        </div>
        <template v-else>
          <div
            v-if="row.suggest"
            class="mt-2 flex items-center gap-3 rounded-6 bg-surface-gray-1 p-3"
          >
            <p class="min-w-0 flex-1 text-sm">
              {{ __('Is it your {0}?', [row.suggest.item_name], 'Surtido') }}
            </p>
            <button
              v-if="owner"
              type="button"
              :class="['press flex-none', BTN.filled]"
              :disabled="busy === 'link'"
              @click="link(row.suggest.item)"
            >
              {{ __('Yes, this one', null, 'Surtido') }}
            </button>
          </div>
          <p v-else class="mt-1 text-sm text-ink-gray-6">
            {{
              __(
                'Not linked to a product of yours yet. Linked, its next list links itself and the order updates your product.',
                null,
                'Surtido',
              )
            }}
          </p>
          <div v-if="owner" class="mt-3">
            <ComprasPicker
              :model-value="''"
              :label="__('Link to a product of mine', null, 'Surtido')"
              :placeholder="__('Search my products', null, 'Surtido')"
              :load="findItems"
              clear-on-pick
              @pick="(o) => link(o.value)"
            />
          </div>
        </template>
        <p v-if="saved" class="mt-2 text-sm text-ink-green-8" role="status">
          {{ __('Saved: the supplier calls it «{0}»', [saved], 'Surtido') }}
        </p>
      </section>

      <!-- its price over time -->
      <section class="border-t border-outline-gray-2 pt-4">
        <h3 class="text-sm font-medium text-ink-gray-8">
          {{ __('Price over time', null, 'Surtido') }}
        </h3>
        <p v-if="historyBusy" class="mt-2 text-sm text-ink-gray-6">
          {{ __('Reading the history…', null, 'Surtido') }}
        </p>
        <p v-else-if="!points.length" class="mt-2 text-sm text-ink-gray-6">
          {{ __('No earlier price of this product.', null, 'Surtido') }}
        </p>
        <ul v-else class="mt-2 divide-y divide-outline-gray-1">
          <li
            v-for="(p, i) in points"
            :key="i"
            class="flex items-baseline gap-3 py-2 text-sm"
          >
            <span class="num w-24 flex-none text-ink-gray-6">{{
              formatDay(p.date)
            }}</span>
            <span class="min-w-0 flex-1 truncate text-ink-gray-7">{{
              pointLabel(p)
            }}</span>
            <span class="num font-medium text-ink-gray-9">{{
              money(p.price ?? p.rate)
            }}</span>
          </li>
        </ul>
      </section>
    </div>
    <template #actions>
      <Button
        :label="__('Similar', null, 'Surtido')"
        @click="emit('similar', row)"
      />
      <div
        v-if="qty"
        class="flex items-center rounded-full ring-1 ring-outline-gray-3"
        role="group"
        :aria-label="__('Pieces of {0}', [row?.name], 'Surtido')"
      >
        <button
          type="button"
          class="press flex size-11 items-center justify-center rounded-full hover:bg-surface-gray-2"
          :aria-label="__('One less of {0}', [row?.name], 'Surtido')"
          @click="emit('pieces', row.line, qty - 1)"
        >
          <span
            :class="[qty > 1 ? 'lucide-minus' : 'lucide-trash-2', 'size-4']"
            aria-hidden="true"
          />
        </button>
        <span class="num w-8 text-center font-semibold">{{ qty }}</span>
        <button
          type="button"
          class="press flex size-11 items-center justify-center rounded-full hover:bg-surface-gray-2"
          :aria-label="__('One more of {0}', [row?.name], 'Surtido')"
          @click="emit('pieces', row.line, qty + 1)"
        >
          <span class="lucide-plus size-4" aria-hidden="true" />
        </button>
      </div>
      <button
        v-else
        type="button"
        :class="['press', BTN.filled]"
        @click="emit('pieces', row.line, 1)"
      >
        <span class="lucide-plus size-5" aria-hidden="true" />
        {{ __('Add to the order', null, 'Surtido') }}
      </button>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { BTN } from '@/documentos/tools'
import { comprasApi, money } from '@/composables/useCompras'
import { productFacts } from '@/utils/surtidoShop'

const props = defineProps({
  open: Boolean,
  row: { type: Object, default: null },
  qty: { type: Number, default: 0 },
  owner: Boolean,
})
const emit = defineEmits([
  'update:open',
  'pieces',
  'photo',
  'page',
  'similar',
  'linked',
])

const full = ref(false)
const busy = ref('')
const saved = ref('')
const points = ref([])
const historyBusy = ref(false)
const facts = computed(() => (props.row ? productFacts(props.row) : []))

watch(
  () => [props.open, props.row?.line],
  async ([open, line]) => {
    saved.value = ''
    if (!open || !line) return
    historyBusy.value = true
    points.value = []
    try {
      const out = await comprasApi('doco.workspaces.lista_precios.history', {
        linea: line,
      })
      if (props.row?.line === line)
        points.value = [...(out?.points || [])].reverse().slice(0, 12)
    } catch {
      points.value = []
    } finally {
      historyBusy.value = false
    }
  },
  { immediate: true },
)

const findItems = async (q) =>
  (
    await comprasApi('doco.workspaces.lista_precios.search_items', {
      text: q,
      limit: 12,
    })
  ).map((r) => ({
    value: r.item,
    label: r.item_name,
    description: r.item_group,
  }))

async function link(item) {
  busy.value = 'link'
  try {
    const out = await comprasApi('doco.workspaces.sourcing.link_product', {
      linea: props.row.line,
      item,
    })
    saved.value = item ? out?.saved_name || '' : ''
    emit('linked', props.row.line, item, out?.line?.item_name || '')
  } finally {
    busy.value = ''
  }
}

const SOURCES = {
  lista: () => __('List', null, 'Surtido'),
  orden: () => __('Purchase order', null, 'Surtido'),
  recibo: () => __('Paid at receipt', null, 'Surtido'),
}
const pointLabel = (p) =>
  [
    SOURCES[p.source]?.() || p.source || '',
    p.supplier_name || '',
    p.title || '',
  ]
    .filter(Boolean)
    .join(', ')
const formatDay = (d) => {
  const day = d ? new Date(`${String(d).slice(0, 10)}T12:00:00`) : null
  return day && !Number.isNaN(day.getTime())
    ? day.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
      })
    : ''
}
</script>
