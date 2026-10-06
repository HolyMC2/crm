<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-4 pb-10 pt-4 sm:px-6">
      <nav class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ backLabel }}
        </button>
      </nav>
      <section v-if="guard" role="alert" class="max-w-xl space-y-4 py-6">
        <h1 class="text-xl font-semibold">{{ guard.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ guard.detail }}</p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry', null, 'Compras')" @click="load" />
          <Button :label="__('Back to Compras')" @click="goBack" />
        </div>
      </section>
      <div v-else-if="!data.document" role="status" class="py-10 text-sm">
        {{ __('Loading request…') }}
      </div>
      <template v-else>
        <header class="mb-4">
          <p class="text-sm text-ink-gray-6">
            {{ doc.name }} · {{ statusLabel({ ...doc, kind: 'solicitud' }) }}
          </p>
          <h1 class="text-2xl font-semibold text-ink-gray-9">
            {{ doc.title || __('Purchase request', null, 'Compras') }}
          </h1>
          <p class="mt-1 text-sm text-ink-gray-6">
            {{
              [
                doc.company,
                doc.schedule_date && __('needed by {0}', [doc.schedule_date]),
              ]
                .filter(Boolean)
                .join(' · ')
            }}
          </p>
          <p class="mt-2 text-base text-ink-gray-8">
            {{
              __('{0}% ordered · {1}% received', [
                qty(doc.per_ordered),
                qty(doc.per_received),
              ])
            }}
          </p>
        </header>

        <div
          v-if="problem"
          role="alert"
          class="mb-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button
            v-if="problem.kind === 'offline'"
            class="ml-2"
            :label="__('Check result')"
            @click="prepare"
          />
        </div>

        <section
          v-if="action"
          class="mb-5 rounded-xl border border-outline-gray-2 p-4"
          :aria-label="__('Next step', null, 'Compras')"
        >
          <template v-if="action.allowed">
            <div class="flex flex-wrap items-end gap-2">
              <div class="min-w-[16rem] flex-1">
                <ComprasPicker
                  v-model="supplier"
                  :display="supplierLabel"
                  :label="__('Supplier for this purchase')"
                  :placeholder="__('Search supplier')"
                  :empty-text="__('No supplier you can use matches.')"
                  :load="(q) => comprasApi('suppliers', { search: q })"
                  @pick="(o) => (supplierLabel = o.label)"
                />
              </div>
              <Button
                variant="solid"
                class="min-h-11"
                :label="action.label"
                :loading="busy"
                :disabled="!supplier"
                @click="prepare"
              />
            </div>
            <p class="mt-2 text-xs text-ink-gray-5">
              {{
                __(
                  'If a draft purchase for this supplier already exists, you continue it instead of creating another.',
                )
              }}
            </p>
          </template>
          <template v-else>
            <p class="text-base font-medium">{{ action.reason }}</p>
            <!-- Drafts and transfer/manufacture requests continue on their own form. -->
            <Button
              v-if="action.resolve?.kind === 'desk'"
              variant="solid"
              class="mt-3 min-h-11"
              :label="action.resolve.label"
              :link="action.resolve.href"
            />
            <Button
              v-else-if="action.resolve"
              variant="solid"
              class="mt-3 min-h-11"
              :label="action.resolve.label"
              @click="handoffOpen = true"
            />
          </template>
        </section>

        <section class="mb-6" :aria-label="__('Items', null, 'Compras')">
          <h2 class="mb-2 text-base font-semibold">
            {{ __('Items ({0})', [data.rows_scope?.total || 0]) }}
          </h2>
          <ul
            class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
          >
            <li v-for="row in data.rows" :key="row.name" class="flex gap-3 p-3">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">
                  {{ row.item_name || row.item_code }}
                </p>
                <p class="truncate text-xs text-ink-gray-5">
                  {{
                    [row.item_code, row.warehouse].filter(Boolean).join(' · ')
                  }}
                </p>
                <p class="mt-1 text-sm text-ink-gray-8">
                  {{
                    __('Ordered {0} · received {1} of {2} {3}', [
                      qty(row.ordered_qty),
                      qty(row.received_qty),
                      qty(row.stock_qty),
                      row.stock_uom,
                    ])
                  }}
                </p>
              </div>
              <p class="shrink-0 text-sm font-medium tabular-nums">
                {{ qty(row.qty) }} {{ row.uom }}
              </p>
            </li>
          </ul>
        </section>

        <section :aria-label="__('Purchases', null, 'Compras')">
          <h2 class="mb-2 text-base font-semibold">
            {{ __('Purchases', null, 'Compras') }}
          </h2>
          <p v-if="!data.orders.length" class="text-sm text-ink-gray-6">
            {{ __('No purchase has been prepared from this request yet.') }}
          </p>
          <ul
            v-else
            class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
          >
            <li v-for="row in data.orders" :key="row.name">
              <RouterLink
                :to="{ name: 'CompraOrden', params: { name: row.name } }"
                class="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-surface-gray-1"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{{
                    row.party || row.name
                  }}</span>
                  <span class="block truncate text-sm text-ink-gray-6"
                    >{{ row.name }} · {{ statusLabel(row) }}
                    <template v-if="Number(row.docstatus) === 1">
                      · {{ progressLabel(row) }}</template
                    ></span
                  >
                </span>
                <FeatherIcon name="chevron-right" class="h-4 w-4" />
              </RouterLink>
            </li>
          </ul>
        </section>
      </template>
    </div>
    <HandoffDialog
      v-if="data.document"
      v-model="handoffOpen"
      doctype="Material Request"
      :name="doc.name"
      action="prepare"
      :title="__('Ask someone to prepare the purchase')"
      :reason="action?.reason || ''"
      @sent="load"
    />
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FeatherIcon, toast } from 'frappe-ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import HandoffDialog from '@/components/compras/HandoffDialog.vue'
import {
  comprasApi,
  comprasBoot,
  loadComprasBoot,
  problemOf,
  progressLabel,
  qty,
  requestId,
  safeReturn,
  statusLabel,
} from '@/composables/useCompras'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const data = ref({})
const guard = ref(null)
const problem = ref(null)
const busy = ref(false)
const supplier = ref('')
const supplierLabel = ref('')
const handoffOpen = ref(false)
let prepareId = null

const doc = computed(() => data.value.document || {})
const action = computed(() => (data.value.actions || [])[0])
const returnTo = computed(() => safeReturn(route.query.return_to))
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        String(route.query.return_label || 'Compras').slice(0, 40),
      ])
    : __('Compras', null, 'Compras'),
)

async function load() {
  guard.value = null
  try {
    data.value = await comprasApi('request', { name: props.name })
  } catch (error) {
    const p = problemOf(error)
    guard.value = {
      title:
        p.kind === 'permission'
          ? __('You cannot open this request')
          : __('Could not open this request'),
      detail: p.detail,
    }
  }
}

async function prepare() {
  // Same id while the worker retries this preparation after a lost answer.
  prepareId ||= requestId()
  busy.value = true
  problem.value = null
  try {
    const result = await comprasApi('prepare_from_request', {
      request_id: prepareId,
      material_request: props.name,
      supplier: supplier.value,
    })
    prepareId = null
    toast.success(
      result.reused
        ? __('Continuing the draft purchase {0}', [result.name])
        : __('Draft purchase {0} prepared', [result.name]),
    )
    router.push({
      name: 'CompraOrden',
      params: { name: result.name },
      query: { list: route.fullPath },
    })
  } catch (error) {
    const p = problemOf(error)
    if (p.kind !== 'offline') prepareId = null
    problem.value = p
  } finally {
    busy.value = false
  }
}

function goBack() {
  if (returnTo.value) return window.location.assign(returnTo.value)
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  if (list.startsWith('/compras')) return router.push(list)
  router.push({ name: 'Compras' })
}

watch(() => props.name, load)
onMounted(async () => {
  await loadComprasBoot()
  if (!comprasBoot.value?.enabled) {
    guard.value = {
      title: __('Compras is not available'),
      detail: comprasBoot.value?.reason || '',
    }
    return
  }
  load()
})
</script>
