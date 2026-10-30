<template>
  <!-- A purchase request (Shell look, record-header): the bar names what is
       asked for with its state and number, the bolt with its steps and «⋯»
       with every tool. The hero says how much is ordered and received, when
       it is needed and the one next step: choose the supplier and prepare
       the purchase. Then the lines and the purchases made from it; Actividad
       sits beside them on a desk. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="backLabel"
      :title="title"
      :bell="phone"
      @back="onBack"
    >
      <template v-if="doc.name" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ title }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              :label="chip.label"
              :tone="chip.tone"
              data-testid="solicitud-status"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              __('Purchase request {0}', [doc.name])
            }}</span>
          </span>
        </div>
      </template>
      <template #actions>
        <RecordIsland
          v-if="doc.name"
          :reach="kit.record.value?.header?.reach || {}"
          :who="title"
          :mail="kit.record.value?.actions?.email || null"
          :groups="boltGroups"
          :phone="phone"
          :subtitle="kit.scopeTitle.value"
          @mail="mail"
          @pick="onBolt"
          @tools="kit.openTools()"
        />
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <EmptyState
        v-if="guard"
        role="alert"
        state="error"
        :title="guard.title"
        :message="guard.detail"
        :action="__('Retry', null, 'Compras')"
        @action="load"
      />
      <EmptyState
        v-else-if="!data.document"
        role="status"
        state="loading"
        :title="__('Loading request…')"
      />

      <div
        v-else
        class="mx-auto grid w-full max-w-6xl gap-x-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <div class="px-4 empty:hidden">
            <ApprovalAsk
              doctype="Material Request"
              :name="props.name"
              @declined="goBack(true)"
            />
          </div>

          <!-- The hero: how far the request got, when it is needed, and the
               one next step. -->
          <section
            class="flex flex-col gap-2 px-4"
            :aria-label="__('Next step', null, 'Compras')"
            data-testid="solicitud-hero"
          >
            <p
              class="num text-3xl font-semibold tabular-nums leading-tight text-ink-gray-9"
            >
              {{ __('{0}% ordered', [qty(doc.per_ordered)]) }}
            </p>
            <StageSteps
              v-if="kit.stages.value"
              :stages="kit.stages.value"
              class="py-2"
            />
            <p class="flex flex-wrap gap-x-3 text-base text-ink-gray-7">
              <span>{{
                __('{0}% received', [qty(doc.per_received)], 'Compras')
              }}</span>
              <span
                v-if="doc.schedule_date"
                :class="late ? 'font-medium text-ink-red-7' : ''"
                >{{ __('needed by {0}', [formatDay(doc.schedule_date)]) }}</span
              >
            </p>
            <div
              v-if="problem"
              role="alert"
              class="space-y-2 rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
            >
              <p>
                <strong>{{ problem.title }}.</strong> {{ problem.detail }}
              </p>
              <button
                v-if="problem.kind === 'offline'"
                type="button"
                :class="['press', BTN.tonal]"
                @click="prepare"
              >
                {{ __('Check result') }}
              </button>
            </div>
            <template v-if="action?.allowed">
              <div data-solicitud-proveedor class="max-w-xl pt-2">
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
              <p class="text-sm text-ink-gray-6">
                {{
                  __(
                    'If a draft purchase for this supplier already exists, you continue it instead of creating another.',
                  )
                }}
              </p>
            </template>
            <p v-else-if="action" class="break-words text-base text-ink-gray-8">
              {{ action.reason }}
            </p>
            <div
              v-if="nextSteps.length"
              class="flex flex-wrap gap-2 pt-2"
              data-testid="solicitud-next"
            >
              <template v-for="(step, i) in nextSteps" :key="step.key">
                <!-- Native elements: `:is="'button'"` would resolve to the
                     globally registered frappe-ui Button. -->
                <a
                  v-if="step.href"
                  :href="step.href"
                  :class="['press', i === 0 ? BTN.filled : BTN.tonal]"
                  :data-step="step.key"
                >
                  <span :class="[step.icon, 'size-5']" aria-hidden="true" />
                  {{ step.label }}
                </a>
                <button
                  v-else
                  type="button"
                  :class="['press', i === 0 ? BTN.filled : BTN.tonal]"
                  :disabled="step.disabled || (busy && step.busy)"
                  :data-step="step.key"
                  @click="step.run()"
                >
                  <span
                    :class="[
                      busy && step.busy
                        ? 'lucide-loader-circle animate-spin'
                        : step.icon,
                      'size-5',
                    ]"
                    aria-hidden="true"
                  />
                  {{ step.label }}
                </button>
              </template>
            </div>
          </section>

          <!-- What is asked for: ordered and received per line. -->
          <section class="px-4" aria-labelledby="solicitud-items">
            <h2
              id="solicitud-items"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Items ({0})', [data.rows_scope?.total || 0]) }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="row in data.rows"
                :key="row.name"
                class="flex min-w-0 gap-3 py-3"
              >
                <div class="min-w-0 flex-1">
                  <p class="break-words text-base text-ink-gray-9">
                    {{ row.item_name || row.item_code }}
                  </p>
                  <p class="break-words text-sm text-ink-gray-6">
                    {{
                      [row.item_code, row.warehouse].filter(Boolean).join(' · ')
                    }}
                  </p>
                  <p
                    class="pt-0.5 text-sm"
                    :class="
                      Number(row.received_qty) >= Number(row.stock_qty)
                        ? 'text-ink-green-8'
                        : 'text-ink-gray-8'
                    "
                  >
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
                <p class="num shrink-0 text-base tabular-nums text-ink-gray-9">
                  {{ qty(row.qty) }} {{ row.uom }}
                </p>
              </li>
            </ul>
          </section>
        </div>

        <aside class="flex min-w-0 flex-col gap-5 pt-5 lg:pt-4">
          <!-- The purchases prepared from it, each to its own record. -->
          <section class="px-4" aria-labelledby="solicitud-compras">
            <h2
              id="solicitud-compras"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Purchases', null, 'Compras') }}
            </h2>
            <p
              v-if="!data.orders.length"
              class="flex min-h-11 items-center gap-2 text-base text-ink-gray-6"
            >
              {{ __('No purchase has been prepared from this request yet.') }}
            </p>
            <ul v-else class="divide-y divide-outline-gray-1">
              <li v-for="row in data.orders" :key="row.name">
                <RouterLink
                  :to="{ name: 'CompraOrden', params: { name: row.name } }"
                  class="press flex min-h-14 w-full items-center gap-3 rounded-6 py-2 [@media(hover:hover)]:hover:bg-surface-gray-1"
                >
                  <span
                    class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                    aria-hidden="true"
                  >
                    <span class="lucide-shopping-cart size-5" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="break-words text-base text-ink-gray-9">{{
                      row.party || row.name
                    }}</span>
                    <span class="break-words text-sm text-ink-gray-6"
                      >{{ statusLabel(row)
                      }}<template v-if="Number(row.docstatus) === 1">
                        · {{ progressLabel(row) }}</template
                      ></span
                    >
                  </span>
                  <span
                    class="lucide-chevron-right size-4 flex-none text-ink-gray-5"
                    aria-hidden="true"
                  />
                </RouterLink>
              </li>
            </ul>
          </section>
          <!-- Shell SPEC §6 DD2: the engine's «Creado desde», Conexiones,
               Actividad and the sheets behind «⋯». -->
          <RecordKit v-if="doc.name" :kit="kit" :title="title" />
        </aside>
      </div>
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
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import { isMobile } from '@/composables/breakpoint'
import { recordActionsFor } from '@/documentos/acciones'
import { BTN } from '@/documentos/tools'
import { formatDay } from '@/utils/contactos'
import { dayDiff, parseServerDate } from '@/utils/display'
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
  returnWithDone,
  safeReturn,
  statusLabel,
} from '@/composables/useCompras'
import ApprovalAsk from '@/components/pendientes/ApprovalAsk.vue'
import StageSteps from '@/components/documentos/StageSteps.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import { requestTitle } from '@/components/documentos/compras/words'
import { useRecordPower } from '@/composables/useRecordPower'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const phone = isMobile
const data = ref({})
const guard = ref(null)
const problem = ref(null)
const busy = ref(false)
const supplier = ref('')
const supplierLabel = ref('')
const handoffOpen = ref(false)
let prepareId = null

const doc = computed(() => data.value.document || {})
// The engine's shared record parts (Shell SPEC §6 DD2/DD5): loaded after paint.
const kit = useRecordKit('Material Request', {
  name: () => props.name,
  title: () => requestTitle(doc.value.title),
  modified: () => doc.value.modified,
  changed: () => load(),
})
const action = computed(() => (data.value.actions || [])[0])
const returnTo = computed(() => safeReturn(route.query.return_to))
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        String(route.query.return_label || 'Compras').slice(0, 40),
      ])
    : __('Compras', null, 'Compras'),
)

// ── the bar: what is asked for, how far it got, its number ───────────────
const title = computed(
  () =>
    requestTitle(doc.value.title) || __('Purchase request', null, 'Compras'),
)
const chip = computed(() => {
  const d = doc.value
  if (Number(d.docstatus) === 0)
    return { label: __('Draft', null, 'Compras'), tone: 'warning' }
  if (Number(d.docstatus) === 2)
    return { label: __('Cancelled', null, 'Compras'), tone: 'neutral' }
  if (Number(d.per_ordered) >= 100)
    return { label: __('Ordered', null, 'Compras'), tone: 'success' }
  if (Number(d.per_ordered) > 0)
    return {
      label: __('{0}% ordered', [qty(d.per_ordered)]),
      tone: 'info',
    }
  return { label: __('To order'), tone: late.value ? 'danger' : 'warning' }
})
// Needed already and nothing ordered for it yet: the date goes red.
const late = computed(() => {
  const d = doc.value
  if (Number(d.docstatus) !== 1 || Number(d.per_ordered) >= 100) return false
  const date = parseServerDate(d.schedule_date)
  return !!date && dayDiff(date) < 0
})
function onBack(event) {
  event?.preventDefault?.()
  goBack()
}

// ── the hero's steps: prepare the purchase (filled), or its way out ──────
const canPrint = computed(() => !!kit.record.value?.actions?.print?.allowed)
const nextSteps = computed(() => {
  const out = []
  const a = action.value
  if (a?.allowed)
    out.push({
      key: 'prepare',
      label: a.label,
      icon: 'lucide-shopping-cart',
      busy: true,
      disabled: !supplier.value,
      run: prepare,
    })
  else if (a?.resolve?.kind === 'desk')
    // Drafts and transfer/manufacture requests continue on their own form.
    out.push({
      key: 'desk',
      label: a.resolve.label,
      icon: 'lucide-file-text',
      href: a.resolve.href,
    })
  else if (a?.resolve)
    out.push({
      key: 'ask',
      label: a.resolve.label,
      icon: 'lucide-send',
      run: () => (handoffOpen.value = true),
    })
  if (canPrint.value)
    out.push({
      key: 'print',
      label: __('Print', null, 'Compras'),
      icon: 'lucide-printer',
      run: () => kit.onTool('print'),
    })
  return out
})

// ── the bolt: the hero's steps; «⋯» keeps print, share, mail and the rest ─
const boltSteps = computed(() =>
  nextSteps.value.map((step) =>
    step.key === 'prepare' && !supplier.value
      ? // No supplier yet: the bolt takes the worker to the picker.
        { ...step, run: focusSupplier }
      : step.href
        ? { ...step, run: () => window.location.assign(step.href) }
        : step,
  ),
)
const boltGroups = computed(() =>
  recordActionsFor({ steps: boltSteps.value, tools: kit.tools.value }),
)
function onBolt({ key }) {
  if (key.startsWith('paso:')) boltSteps.value[Number(key.slice(5))]?.run()
  else kit.onTool(key)
}
function focusSupplier() {
  const box = document.querySelector('[data-solicitud-proveedor]')
  box?.scrollIntoView({ block: 'center' })
  box?.querySelector('button, input')?.focus()
}
function mail() {
  const action = kit.record.value?.actions?.email
  if (action?.allowed) kit.onTool('correo')
  else
    toast.error(action?.reason || __('This request cannot be sent by email.'))
}

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

// `done`: something was answered here (shell return protocol); a plain back has none.
function goBack(done = false) {
  if (returnTo.value) {
    const target = done
      ? returnWithDone(returnTo.value, 'Material Request', props.name)
      : returnTo.value
    // Pendientes lives in this SPA: no reload of the shell.
    return target.startsWith('/crm/pendientes')
      ? router.push(target.slice(4))
      : window.location.assign(target)
  }
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  if (list.startsWith('/compras')) return router.push(list)
  router.push({ name: 'Compras' })
}

// Esc back to the same row of the list; a purchase prepared from this request
// elsewhere (another tab, a colleague) shows here.
useRecordPower({
  back: () => goBack(),
  reload: load,
  idle: () => !busy.value && !handoffOpen.value && !problem.value,
  doctypes: ['Material Request', 'Purchase Order'],
})

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
