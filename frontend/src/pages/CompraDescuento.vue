<template>
  <!-- One supplier discount (a buying Pricing Rule), asked as the worker
       thinks of it: how much off, for whom, on what, from how much, when.
       The rest of Desk's options fold under «Más condiciones»; a rule built
       with options this page does not edit (free items, conditions, coupons)
       is read here and changed in the full form. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="backLabel"
      :title="title"
      :loading="loading && loaded"
      @back="onBack"
    >
      <template v-if="loaded && rule" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ title }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              :label="stateChip(rule.state).label"
              :tone="stateChip(rule.state).tone"
              data-testid="descuento-estado"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              whoText(rule.who)
            }}</span>
          </span>
        </div>
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <EmptyState
        v-if="guard"
        role="alert"
        state="error"
        :title="guard.title"
        :message="guard.detail"
        :action="guard.retry ? __('Retry', null, 'Compras') : ''"
        @action="load"
      />
      <EmptyState
        v-else-if="loading && !loaded"
        role="status"
        state="loading"
        :title="__('Loading discount…')"
      />

      <div
        v-else-if="loaded"
        class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-4"
      >
        <div class="flex flex-col gap-3 empty:hidden">
          <div
            v-if="problem"
            role="alert"
            class="space-y-2 rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
          >
            <p>
              <strong>{{ problem.title }}.</strong> {{ problem.detail }}
            </p>
            <button
              v-if="problem.kind === 'conflict'"
              type="button"
              :class="['press', BTN.tonal]"
              @click="load"
            >
              {{ __('See the current version') }}
            </button>
            <button
              v-else-if="problem.kind === 'offline'"
              type="button"
              :class="['press', BTN.tonal]"
              @click="save"
            >
              {{ __('Check result') }}
            </button>
          </div>
          <div
            v-if="overlaps.length"
            role="status"
            class="space-y-1 rounded-6 bg-surface-amber-1 p-3 text-base text-ink-amber-9"
            data-testid="descuento-empalmes"
          >
            <p>
              {{
                __(
                  'Another discount covers the same at the same priority. A purchase that meets both cannot be saved until one of them has a higher priority (in «More conditions»).',
                )
              }}
            </p>
            <p class="flex flex-wrap gap-x-3">
              <template
                v-for="other in overlaps"
                :key="other.name || other.title"
              >
                <RouterLink
                  v-if="other.name"
                  class="min-h-11 py-2 underline sm:min-h-0 sm:py-0"
                  :to="ruleRoute(other.name, { return_to: returnHere })"
                  >{{ other.title }}</RouterLink
                >
                <span v-else>{{ other.title }}</span>
              </template>
            </p>
          </div>
          <div
            v-if="readOnly"
            role="status"
            class="rounded-6 bg-surface-gray-2 p-3 text-base text-ink-gray-8"
          >
            {{ readOnlyReason }}
            <a
              v-if="rule?.name"
              class="ml-1 underline"
              :href="`/app/pricing-rule/${encodeURIComponent(rule.name)}`"
              >{{ __('Open the full form') }}</a
            >
          </div>
        </div>

        <!-- How much off -->
        <section class="flex flex-col gap-2" :aria-label="__('Discount')">
          <h2 class="text-base font-semibold text-ink-gray-9">
            {{ __('How much off?') }}
          </h2>
          <p
            v-if="form.discount_kind === 'product'"
            class="text-base text-ink-gray-8"
          >
            {{ __('It gives free items instead of a discount.') }}
          </p>
          <Segmented
            v-else
            v-model="form.discount_kind"
            :options="kindOptions"
            :label="__('Kind of discount')"
            :class="readOnly ? 'opacity-60' : ''"
            :inert="readOnly || undefined"
          />
          <FormControl
            v-if="form.discount_kind !== 'product'"
            v-model="form.discount_value"
            type="number"
            :label="valueLabel"
            :disabled="readOnly"
            min="0"
            :max="form.discount_kind === 'percent' ? 100 : undefined"
            step="any"
            data-testid="descuento-valor"
          />
          <FormControl
            v-if="
              form.what_kind === 'order' &&
              !['price', 'product'].includes(form.discount_kind)
            "
            v-model="form.apply_discount_on"
            type="select"
            :label="__('Discount on', null, 'Compras')"
            :disabled="readOnly"
            :options="onOptions"
          />
        </section>

        <!-- For whom -->
        <section
          class="flex flex-col gap-2"
          :aria-label="__('Supplier', null, 'Compras')"
        >
          <h2 class="text-base font-semibold text-ink-gray-9">
            {{ __('For which suppliers?') }}
          </h2>
          <Segmented
            :model-value="form.who_kind"
            :options="whoOptions"
            :label="__('For which suppliers?')"
            :class="readOnly ? 'opacity-60' : ''"
            :inert="readOnly || undefined"
            @update:model-value="setWho"
          />
          <ComprasPicker
            v-if="form.who_kind !== 'all'"
            v-model="form.who_name"
            :display="form.who_label"
            :label="
              form.who_kind === 'group'
                ? __('Supplier group')
                : __('Supplier', null, 'Compras')
            "
            :placeholder="
              form.who_kind === 'group'
                ? __('Search supplier group')
                : __('Search supplier')
            "
            :empty-text="__('Nothing you can use matches.')"
            :invalid="showMissing && !form.who_name"
            :disabled="readOnly"
            :load="
              (q) =>
                descuentosApi('options', {
                  kind:
                    form.who_kind === 'group' ? 'supplier_group' : 'supplier',
                  search: q,
                })
            "
            @pick="(o) => (form.who_label = o.label)"
          />
        </section>

        <!-- On what -->
        <section
          class="flex flex-col gap-2"
          :aria-label="__('Items', null, 'Compras')"
        >
          <h2 class="text-base font-semibold text-ink-gray-9">
            {{ __('On what?') }}
          </h2>
          <!-- Four kinds wrap as chips; a second tap keeps the kind. -->
          <ChipGroup
            :model-value="form.what_kind"
            :options="whatOptions"
            :clear-value="form.what_kind"
            :class="readOnly ? 'opacity-60' : ''"
            :inert="readOnly || undefined"
            testid="descuento-en"
            @update:model-value="setWhat"
          />
          <template v-if="form.what_kind !== 'order'">
            <ul v-if="form.targets.length" class="flex flex-wrap gap-2">
              <li
                v-for="(target, index) in form.targets"
                :key="target.name || index"
                class="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full bg-surface-gray-2 pl-4 pr-1 text-base text-ink-gray-9"
              >
                <span class="min-w-0 break-words">{{ target.label }}</span>
                <button
                  v-if="!readOnly"
                  type="button"
                  class="press flex size-9 flex-none items-center justify-center rounded-full text-ink-gray-7 [@media(hover:hover)]:hover:bg-surface-gray-3"
                  :aria-label="__('Remove {0}', [target.label], 'Surtido')"
                  :title="__('Remove {0}', [target.label], 'Surtido')"
                  @click="form.targets.splice(index, 1)"
                >
                  <span class="lucide-x size-4" aria-hidden="true" />
                </button>
              </li>
            </ul>
            <ComprasPicker
              v-if="!readOnly"
              model-value=""
              :label="targetLabel"
              :placeholder="targetPlaceholder"
              :empty-text="__('Nothing you can use matches.')"
              :invalid="showMissing && !form.targets.length"
              clear-on-pick
              :load="
                (q) => descuentosApi('options', { kind: targetKind, search: q })
              "
              @pick="addTarget"
            />
          </template>
          <p v-else class="text-sm text-ink-gray-6">
            {{
              __(
                'It takes the discount off the purchase total, like the extra discount in «More details».',
              )
            }}
          </p>
        </section>

        <!-- From how much, and when -->
        <section class="flex flex-col gap-2" :aria-label="__('Conditions')">
          <h2 class="text-base font-semibold text-ink-gray-9">
            {{ __('From how much, and when?') }}
          </h2>
          <div class="descuento-fields grid grid-cols-2 gap-3">
            <FormControl
              v-model="form.min_qty"
              type="number"
              :label="__('From (pieces)')"
              :placeholder="__('Any', null, 'Descuentos')"
              :disabled="readOnly"
              min="0"
              step="any"
            />
            <FormControl
              v-model="form.min_amt"
              type="number"
              :label="__('From (amount)')"
              :placeholder="__('Any', null, 'Descuentos')"
              :disabled="readOnly"
              min="0"
              step="any"
            />
          </div>
          <!-- es-MX dates (DateField), never the browser's mm/dd/yyyy. -->
          <div
            class="flex flex-wrap gap-3"
            :class="readOnly ? 'opacity-60' : ''"
            :inert="readOnly || undefined"
          >
            <div class="min-w-0 flex-1 basis-64 space-y-1.5">
              <span class="block text-xs text-ink-gray-5">{{
                __('Starts', null, 'Descuentos')
              }}</span>
              <DateField
                v-model="form.valid_from"
                mode="date"
                :label="__('Starts', null, 'Descuentos')"
              />
              <p v-if="!form.valid_from" class="text-sm text-ink-gray-6">
                {{ __('Without a date it applies from now.') }}
              </p>
            </div>
            <div class="min-w-0 flex-1 basis-64 space-y-1.5">
              <span class="block text-xs text-ink-gray-5">{{
                __('Ends', null, 'Descuentos')
              }}</span>
              <DateField
                v-model="form.valid_upto"
                mode="date"
                :label="__('Ends', null, 'Descuentos')"
              />
              <p v-if="!form.valid_upto" class="text-sm text-ink-gray-6">
                {{ __('Without a date it never ends.') }}
              </p>
            </div>
          </div>
        </section>

        <!-- The rest of Desk's options -->
        <section class="rounded-6 border border-outline-gray-2">
          <button
            type="button"
            class="press flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
            :aria-expanded="moreOpen"
            :aria-controls="moreId"
            @click="moreOpen = !moreOpen"
          >
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-base font-semibold text-ink-gray-9">{{
                __('More conditions')
              }}</span>
              <span class="break-words text-sm text-ink-gray-6">{{
                moreSummary
              }}</span>
            </span>
            <span
              :class="[
                moreOpen ? 'lucide-chevron-up' : 'lucide-chevron-down',
                'size-5 flex-none text-ink-gray-6',
              ]"
              aria-hidden="true"
            />
          </button>
          <ExpandTransition>
            <div
              v-if="moreOpen"
              :id="moreId"
              class="descuento-fields grid grid-cols-2 gap-3 border-t border-outline-gray-1 p-3"
            >
              <FormControl
                v-model="form.max_qty"
                type="number"
                :label="__('Up to (pieces)')"
                :placeholder="__('No limit', null, 'Descuentos')"
                :disabled="readOnly"
                min="0"
                step="any"
              />
              <FormControl
                v-model="form.max_amt"
                type="number"
                :label="__('Up to (amount)')"
                :placeholder="__('No limit', null, 'Descuentos')"
                :disabled="readOnly"
                min="0"
                step="any"
              />
              <FormControl
                v-model="form.company"
                class="col-span-2 sm:col-span-1"
                type="select"
                :label="__('Company', null, 'Compras')"
                :disabled="readOnly"
                :options="companyOptions"
              />
              <ComprasPicker
                v-if="form.what_kind !== 'order'"
                v-model="form.warehouse"
                class="col-span-2 sm:col-span-1"
                :display="form.warehouse"
                :label="__('Only for the warehouse')"
                :placeholder="__('Any warehouse')"
                :empty-text="__('No warehouse of this company you can use.')"
                :disabled="readOnly"
                :load="
                  (q) =>
                    descuentosApi('options', {
                      kind: 'warehouse',
                      search: q,
                      company: form.company,
                    })
                "
              />
              <div class="col-span-2">
                <FormControl
                  v-model="form.priority"
                  type="number"
                  :label="__('Priority (1 to 20)')"
                  :placeholder="__('None', null, 'Descuentos')"
                  :disabled="readOnly"
                  min="0"
                  max="20"
                  step="1"
                />
                <p class="mt-1 text-sm text-ink-gray-6">
                  {{
                    __(
                      'When two discounts cover the same purchase line, the higher priority wins.',
                    )
                  }}
                </p>
              </div>
            </div>
          </ExpandTransition>
        </section>

        <section class="flex flex-col gap-3" :aria-label="__('Name')">
          <FormControl
            v-model="form.title"
            type="text"
            :label="__('Name', null, 'Descuentos')"
            :placeholder="suggestedTitle(form, currency)"
            :disabled="readOnly"
            maxlength="140"
          />
          <FormControl
            :model-value="!form.disabled"
            type="checkbox"
            :label="__('Active', null, 'Descuento')"
            :disabled="readOnly"
            @update:model-value="(on) => (form.disabled = !on)"
          />
          <p class="text-sm text-ink-gray-6">
            {{
              form.disabled
                ? __('Turned off: purchases do not get this discount.')
                : __('Draft purchases get it the next time they are saved.')
            }}
          </p>
          <p v-if="rule?.extras?.length" class="text-sm text-ink-gray-6">
            {{
              __('Also set in the full form: {0}.', [rule.extras.join(', ')])
            }}
          </p>
        </section>

        <div
          v-if="!readOnly"
          class="fixed inset-x-0 bottom-0 z-20 flex flex-wrap gap-2 border-t border-outline-gray-2 bg-surface-base p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:border-0 sm:p-0 sm:pb-6"
        >
          <!-- Beside the button, so a phone sees why nothing was saved. -->
          <p
            v-if="showMissing && missing.length"
            role="status"
            class="basis-full text-base text-ink-amber-9"
          >
            {{ __('Missing: {0}.', [missing.join(', ')]) }}
          </p>
          <button
            type="button"
            :class="['press flex-1 sm:flex-none', BTN.filled]"
            :disabled="busy"
            data-testid="descuento-guardar"
            @click="save"
          >
            <span
              :class="[
                busy ? 'lucide-loader-circle animate-spin' : 'lucide-check',
                'size-5',
              ]"
              aria-hidden="true"
            />
            {{ __('Save discount') }}
          </button>
          <button type="button" :class="['press', BTN.tonal]" @click="onBack">
            {{ __('Cancel', null, 'Compras') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FormControl, toast } from 'frappe-ui'
import {
  AppBar,
  ChipGroup,
  DateField,
  EmptyState,
  ExpandTransition,
  Segmented,
  StatusChip,
} from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { BTN } from '@/documentos/tools'
import {
  outcomeUnknown,
  problemOf,
  qty,
  money,
  requestId,
  returnWithDone,
  safeReturn,
} from '@/composables/useCompras'
import {
  blankRule,
  descuentosApi,
  ruleForm,
  ruleMissing,
  rulePayload,
  ruleRoute,
  stateChip,
  suggestedTitle,
  whoText,
} from '@/composables/useDescuentos'

const props = defineProps({ name: { type: String, default: 'nuevo' } })
const route = useRoute()
const router = useRouter()
const isNew = computed(() => !props.name || props.name === 'nuevo')
const rule = ref(null)
const form = reactive(blankRule())
const companies = ref([])
const canWrite = ref(false)
const loading = ref(false)
const loaded = ref(false)
const busy = ref(false)
const guard = ref(null)
const problem = ref(null)
const overlaps = ref([])
const triedSave = ref(false)
const moreOpen = ref(false)
const moreId = useId()
let pending = null
// The discount this page saved, so the way back can say so.
let saved = ''

const currency = computed(() => rule.value?.currency || 'MXN')
const readOnly = computed(
  () => !canWrite.value || (rule.value && !rule.value.editable),
)
const readOnlyReason = computed(() =>
  rule.value && !rule.value.editable
    ? __('This discount uses options this page does not change ({0}).', [
        rule.value.extras.join(', '),
      ])
    : __('Only the purchasing manager changes supplier discounts.'),
)
const title = computed(() =>
  isNew.value
    ? __('New discount', null, 'Descuentos')
    : rule.value?.title || __('Supplier discount'),
)
const returnTo = computed(() => safeReturn(route.query.return_to))
const returnHere = computed(() => `/crm${route.fullPath}`)
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        String(route.query.return_label || __('Supplier discounts')).slice(
          0,
          40,
        ),
      ])
    : __('Supplier discounts'),
)
const showMissing = computed(() => triedSave.value)
const missing = computed(() => ruleMissing(form))

const kindOptions = computed(() =>
  [
    { value: 'percent', label: __('% off') },
    { value: 'amount', label: __('$ off') },
    { value: 'price', label: __('Fixed price') },
  ].filter((o) => o.value !== 'price' || form.what_kind !== 'order'),
)
const whoOptions = computed(() => [
  { value: 'supplier', label: __('One supplier') },
  { value: 'group', label: __('A group') },
  { value: 'all', label: __('Every one', null, 'Descuentos') },
])
const whatOptions = computed(() => [
  { value: 'items', label: __('Items', null, 'Compras') },
  { value: 'groups', label: __('Item groups') },
  { value: 'brands', label: __('Brands') },
  { value: 'order', label: __('Whole purchase') },
])
const onOptions = computed(() => [
  { value: 'Grand Total', label: __('on the total with taxes') },
  { value: 'Net Total', label: __('on the subtotal before taxes') },
])
const companyOptions = computed(() => [
  { label: __('Every company'), value: '' },
  ...companies.value,
])
const valueLabel = computed(
  () =>
    ({
      percent: __('Discount percentage', null, 'Compras'),
      amount: __('Amount off each piece'),
      price: __('Price per piece'),
    })[form.discount_kind],
)
const targetKind = computed(
  () =>
    ({ items: 'item', groups: 'item_group', brands: 'brand' })[
      form.what_kind
    ] || 'item',
)
const targetLabel = computed(
  () =>
    ({
      items: __('Add item'),
      groups: __('Add item group'),
      brands: __('Add brand'),
    })[form.what_kind],
)
const targetPlaceholder = computed(
  () =>
    ({
      items: __('Search item, code or barcode'),
      groups: __('Search item group'),
      brands: __('Search brand'),
    })[form.what_kind],
)
const moreSummary = computed(() => {
  const parts = []
  if (Number(form.max_qty))
    parts.push(__('up to {0} pieces', [qty(form.max_qty)]))
  if (Number(form.max_amt))
    parts.push(__('up to {0}', [money(form.max_amt, currency.value)]))
  if (form.company)
    parts.push(
      companies.value.find((c) => c.value === form.company)?.label ||
        form.company,
    )
  if (form.warehouse) parts.push(form.warehouse)
  if (Number(form.priority))
    parts.push(__('priority {0}', [Number(form.priority)]))
  return parts.length
    ? parts.join(', ')
    : __('Limits, company, warehouse and priority')
})

function setWho(kind) {
  if (kind === form.who_kind) return
  form.who_kind = kind
  form.who_name = ''
  form.who_label = ''
}
function setWhat(kind) {
  if (kind === form.what_kind) return
  form.what_kind = kind
  form.targets = []
  if (kind === 'order' && form.discount_kind === 'price')
    form.discount_kind = 'percent'
}
function addTarget(option) {
  if (form.targets.some((t) => t.name === option.value)) return
  form.targets.push({ name: option.value, label: option.label })
}

async function load() {
  loading.value = true
  guard.value = null
  problem.value = null
  try {
    if (isNew.value) {
      const supplier =
        typeof route.query.supplier === 'string' ? route.query.supplier : ''
      const blank = await descuentosApi('blank', { supplier })
      companies.value = blank.companies || []
      canWrite.value = Boolean(blank.can_create)
      if (!blank.can_create) {
        guard.value = {
          title: __('You cannot create supplier discounts'),
          detail: blank.reason,
        }
        return
      }
      Object.assign(
        form,
        blankRule({ supplier: blank.supplier, company: blank.company }),
      )
      rule.value = null
    } else {
      const result = await descuentosApi('rule', { name: props.name })
      rule.value = result.rule
      companies.value = result.companies || []
      canWrite.value = Boolean(result.can_write)
      Object.assign(form, ruleForm(result.rule))
    }
    loaded.value = true
  } catch (error) {
    const p = problemOf(error)
    guard.value = {
      title:
        p.kind === 'permission'
          ? __('You cannot open this discount')
          : __('Could not open this discount'),
      detail: p.detail,
      retry: p.kind !== 'permission',
    }
  } finally {
    loading.value = false
  }
}

async function save() {
  triedSave.value = true
  if (missing.value.length) return
  pending ||= requestId()
  busy.value = true
  problem.value = null
  try {
    const result = await descuentosApi('save_rule', {
      request_id: pending,
      data: rulePayload(form, currency.value),
    })
    pending = null
    saved = result.name
    overlaps.value = result.overlaps || []
    toast.success(__('Discount saved'))
    if (overlaps.value.length) {
      // Stay: the worker settles the overlap here (the new name reloads it).
      if (isNew.value)
        await router.replace({
          name: 'CompraDescuento',
          params: { name: result.name },
          query: route.query,
        })
      else await load()
      return
    }
    goBack(result.name)
  } catch (error) {
    if (!outcomeUnknown(error)) pending = null
    const p = problemOf(error)
    problem.value =
      p.kind === 'conflict'
        ? { ...p, title: __('Someone else changed this discount') }
        : p
  } finally {
    busy.value = false
  }
}

function onBack(event) {
  event?.preventDefault?.()
  goBack(saved)
}
// Back where the worker came from (a purchase hears which discount was saved).
function goBack(saved = '') {
  const target = returnTo.value
  if (target) {
    const to = saved ? returnWithDone(target, 'Pricing Rule', saved) : target
    if (to.startsWith('/crm/')) return router.push(to.slice(4))
    return window.location.assign(to)
  }
  router.push({ name: 'CompraDescuentos' })
}

watch(
  () => props.name,
  (name) => {
    // A new discount just saved under its name keeps its page and warning.
    if (name !== saved) {
      loaded.value = false
      overlaps.value = []
      saved = ''
    }
    triedSave.value = false
    load()
  },
)
onMounted(load)
</script>
<style scoped>
/* 44 px fields on a phone, like the pickers beside them. */
@media (max-width: 639px) {
  .descuento-fields :deep(select),
  .descuento-fields :deep(input:not([type='checkbox'])) {
    min-height: 44px;
    font-size: 1rem;
  }
}
</style>
