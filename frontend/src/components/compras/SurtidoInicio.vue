<template>
  <!-- Surtido's start: the supplier lists and the orders made from them. A row
       continues it; «⋯» duplicates it to start another order, or deletes it
       while it is a draft. New lists come from the drop above. -->
  <div class="flex max-w-3xl flex-col gap-5" data-testid="surtido-inicio">
    <section v-if="lists.length" aria-labelledby="inicio-listas">
      <h2 id="inicio-listas" class="pb-1 text-sm font-medium text-ink-gray-6">
        {{ __('Supplier lists', null, 'Surtido') }}
      </h2>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="row in lists"
          :key="row.name"
          class="flex min-w-0 items-center gap-1"
          :data-inicio-lista="row.name"
        >
          <button
            type="button"
            class="press flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-6 py-2 text-left [@media(hover:hover)]:hover:bg-surface-gray-1"
            data-testid="inicio-abrir"
            @click="emit('open-list', row.name)"
          >
            <span class="min-w-0 flex-1">
              <span
                class="block truncate text-base font-medium text-ink-gray-9"
                >{{ row.title }}</span
              >
              <span class="num block truncate text-sm text-ink-gray-6">{{
                row.line
              }}</span>
            </span>
            <StatusChip
              v-if="row.order"
              class="flex-none"
              :label="row.order.label"
              :tone="CHIP_TONE[row.order.theme] || 'neutral'"
            />
          </button>
          <button
            v-if="owner"
            type="button"
            class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 [@media(hover:hover)]:hover:bg-surface-gray-2"
            :aria-label="__('More for {0}', [row.title], 'Surtido')"
            :title="__('More for {0}', [row.title], 'Surtido')"
            data-testid="inicio-mas"
            @click="openActions('list', row)"
          >
            <span class="lucide-ellipsis-vertical size-5" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

    <section v-if="orders.length" aria-labelledby="inicio-pedidos">
      <h2 id="inicio-pedidos" class="pb-1 text-sm font-medium text-ink-gray-6">
        {{ __('Orders to suppliers', null, 'Surtido') }}
      </h2>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="row in orders"
          :key="row.name"
          class="flex min-w-0 items-center gap-1"
          :data-inicio-pedido="row.name"
        >
          <button
            type="button"
            class="press flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-6 py-2 text-left [@media(hover:hover)]:hover:bg-surface-gray-1"
            data-testid="inicio-abrir"
            @click="emit('open-order', row.name)"
          >
            <span class="min-w-0 flex-1">
              <span
                class="block truncate text-base font-medium text-ink-gray-9"
                >{{ row.title }}</span
              >
              <span class="num block truncate text-sm text-ink-gray-6">{{
                row.line
              }}</span>
            </span>
            <StatusChip
              class="flex-none"
              :label="row.status.label"
              :tone="CHIP_TONE[row.status.theme] || 'neutral'"
            />
          </button>
          <button
            v-if="owner"
            type="button"
            class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 [@media(hover:hover)]:hover:bg-surface-gray-2"
            :aria-label="__('More for {0}', [row.title], 'Surtido')"
            :title="__('More for {0}', [row.title], 'Surtido')"
            data-testid="inicio-mas"
            @click="openActions('order', row)"
          >
            <span class="lucide-ellipsis-vertical size-5" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

    <!-- One row's actions: continue, duplicate, delete; what cannot be done says why. -->
    <BottomSheet
      v-if="actionsMounted"
      v-model:open="actionsOpen"
      :title="actions.row?.title || ''"
      :subtitle="actions.row?.line || ''"
      flush
    >
      <ul class="pb-2" data-testid="inicio-acciones">
        <li v-for="item in actionItems" :key="item.key">
          <RouterLink
            v-if="item.to"
            :to="item.to"
            class="press flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-ink-gray-9 [@media(hover:hover)]:hover:bg-surface-gray-1"
            :data-inicio-accion="item.key"
          >
            <span
              class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2"
              aria-hidden="true"
            >
              <span :class="[item.icon, 'size-5']" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-base">{{ item.label }}</span>
              <span class="block text-sm text-ink-gray-6">{{ item.hint }}</span>
            </span>
          </RouterLink>
          <button
            v-else
            type="button"
            class="press flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-60 [@media(hover:hover)]:enabled:hover:bg-surface-gray-1"
            :class="item.danger ? 'text-ink-red-7' : 'text-ink-gray-9'"
            :disabled="Boolean(item.reason) || busy === item.busy"
            :data-inicio-accion="item.key"
            @click="item.run()"
          >
            <span
              class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2"
              aria-hidden="true"
            >
              <span
                :class="[
                  busy && busy === item.busy
                    ? 'lucide-loader-circle animate-spin'
                    : item.icon,
                  'size-5',
                ]"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-base">{{ item.label }}</span>
              <span
                v-if="item.reason || item.hint"
                class="block text-sm text-ink-gray-6"
                >{{ item.reason || item.hint }}</span
              >
            </span>
          </button>
        </li>
      </ul>
    </BottomSheet>

    <ConfirmSheet
      v-model:open="confirmOpen"
      :copy="confirmCopy"
      :busy="Boolean(busy)"
      :error="error"
      @confirm="confirmDelete"
    />
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { BottomSheet, StatusChip } from '@/components/ui'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'

// the rows speak frappe-ui themes (utils/surtido); the kit chip speaks tones
const CHIP_TONE = {
  gray: 'neutral',
  blue: 'info',
  green: 'success',
  amber: 'warning',
  red: 'danger',
}

defineProps({
  // [{ name, title, line, order: {label, theme} | null, blocks: {delete, duplicate} }]
  lists: { type: Array, default: () => [] },
  // [{ name, title, line, status: {label, theme}, blocks: {delete, duplicate} }]
  orders: { type: Array, default: () => [] },
  // Only the owner duplicates and deletes (the page hides «⋯» for anyone else).
  owner: { type: Boolean, default: false },
  // The page's busy key: `dup:<name>`, `del:<name>`.
  busy: { type: String, default: '' },
  // The last refusal, shown in the delete question.
  error: { type: String, default: '' },
})
const emit = defineEmits([
  'open-list',
  'open-order',
  'duplicate-list',
  'delete-list',
  'duplicate-order',
  'delete-order',
])

const actions = ref({ kind: '', row: null })
const actionsOpen = ref(false)
const actionsMounted = ref(false)
const confirmOpen = ref(false)

function openActions(kind, row) {
  actions.value = { kind, row }
  actionsMounted.value = true
  actionsOpen.value = true
}
const actionItems = computed(() => {
  const { kind, row } = actions.value
  if (!row) return []
  const list = kind === 'list'
  const blocks = row.blocks || {}
  return [
    {
      key: 'continuar',
      label: __('Continue', null, 'Surtido'),
      icon: 'lucide-arrow-right',
      run: () => {
        actionsOpen.value = false
        emit(list ? 'open-list' : 'open-order', row.name)
      },
    },
    // The list's own page: its lines by section, tiers, changes and stock.
    ...(list
      ? [
          {
            key: 'tabla',
            label: __('Open the list', null, 'Surtido'),
            icon: 'lucide-table',
            hint: __('Its products by section, with prices, tiers and stock.'),
            to: { name: 'CompraLista', params: { name: row.name } },
          },
        ]
      : []),
    {
      key: 'duplicar',
      label: __('Duplicate', null, 'Surtido'),
      icon: 'lucide-copy',
      busy: `dup:${row.name}`,
      hint: list
        ? __(
            'Another order from the same list: nothing is uploaded or read again.',
          )
        : __('A new draft with the same products and pieces.'),
      reason: blocks.duplicate || '',
      run: () => {
        actionsOpen.value = false
        emit(list ? 'duplicate-list' : 'duplicate-order', row.name)
      },
    },
    {
      key: 'eliminar',
      label: __('Delete', null, 'Surtido'),
      icon: 'lucide-trash-2',
      danger: true,
      busy: `del:${row.name}`,
      reason: blocks.delete || '',
      run: () => {
        actionsOpen.value = false
        confirmOpen.value = true
      },
    },
  ]
})
const confirmCopy = computed(() => {
  const { kind, row } = actions.value
  if (!row) return null
  return kind === 'list'
    ? {
        title: __('Delete the list {0}', [row.title]),
        message: __(
          'Its pages, the products read from them and its draft order are deleted. This cannot be undone.',
        ),
        confirm: __('Delete the list'),
        back: __('Back', null, 'Compras'),
        tone: 'danger',
      }
    : {
        title: __('Delete the order for {0}', [row.title]),
        message: __(
          'The draft and its products are deleted. The list stays. This cannot be undone.',
        ),
        confirm: __('Delete the order'),
        back: __('Back', null, 'Compras'),
        tone: 'danger',
      }
})
function confirmDelete() {
  const { kind, row } = actions.value
  if (!row) return
  emit(kind === 'list' ? 'delete-list' : 'delete-order', row.name, () => {
    confirmOpen.value = false
  })
}
</script>
