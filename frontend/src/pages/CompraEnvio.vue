<template>
  <!-- One shipping rule (a buying Shipping Rule), asked as the worker thinks
       of it: how much it charges, where the charge goes, its name. Ranges are
       a ladder read as one table (from, up to, charges; the last one has no
       limit) with a try-out line under it. A selling rule, or ranges Desk
       entered in another shape, is read here and changed in the full form.
       In the desktop split (`pane`) it sits beside the list and closes to it. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="!pane"
      :back-label="backLabel"
      :title="title"
      :bell="!pane"
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
              data-testid="envio-estado"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              rule.account?.label || ''
            }}</span>
          </span>
        </div>
      </template>
      <template v-if="pane" #actions>
        <!-- In the split the close sits last, where a window's close sits. -->
        <button
          type="button"
          class="press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 [@media(hover:hover)]:hover:bg-surface-gray-2"
          :aria-label="__('Close shipping rule')"
          :title="__('Close shipping rule')"
          data-testid="envio-cerrar"
          @click="close"
        >
          <span class="lucide-x size-6" aria-hidden="true" />
        </button>
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto">
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
        :title="__('Loading shipping rule…')"
      />

      <div
        v-else-if="loaded"
        class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-4 sm:px-6"
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
            v-if="readOnly"
            role="status"
            class="rounded-6 bg-surface-gray-2 p-3 text-base text-ink-gray-8"
            data-testid="envio-solo-lectura"
          >
            {{ readOnlyReason }}
            <a
              v-if="rule?.name"
              class="ml-1 underline"
              :href="`/app/shipping-rule/${encodeURIComponent(rule.name)}`"
              >{{ __('Open the full form') }}</a
            >
          </div>
        </div>

        <!-- How much it charges -->
        <section class="flex flex-col gap-3" :aria-label="__('Charge')">
          <h2 class="text-base font-semibold text-ink-gray-9">
            {{ __('How much does it charge?') }}
          </h2>
          <div class="envio-angosto-sm">
            <Segmented
              v-model="form.based_on"
              :options="basisOptions"
              :label="__('How it charges')"
              :class="readOnly ? 'opacity-60' : ''"
              :inert="readOnly || undefined"
            />
          </div>
          <FormControl
            v-if="form.based_on === 'fixed'"
            v-model="form.amount"
            class="envio-fields envio-angosto-xs"
            type="number"
            :label="__('Charge per purchase')"
            :disabled="readOnly"
            min="0"
            step="any"
            data-testid="envio-monto"
          >
            <template #prefix>
              <span class="text-base text-ink-gray-5">{{ symbol }}</span>
            </template>
          </FormControl>
          <template v-else>
            <p class="text-sm text-ink-gray-6">
              {{
                form.based_on === 'net_weight'
                  ? __(
                      'It reads the net weight of the purchase’s items (their weight per unit).',
                    )
                  : __('It reads the purchase subtotal, before taxes.')
              }}
            </p>
            <!-- A shape Desk entered: read-only, as ERPNext stores it. -->
            <div v-if="rule?.desk_ranges" class="envio-tabla">
              <div
                class="envio-fila envio-fila-desk pb-1 text-sm text-ink-gray-6"
                aria-hidden="true"
              >
                <span>{{ __('Range', null, 'Envios') }}</span>
                <span class="text-right">{{
                  __('Charges', null, 'Envios')
                }}</span>
              </div>
              <ul class="flex flex-col gap-2">
                <li
                  v-for="(range, index) in deskRanges"
                  :key="index"
                  class="envio-fila envio-fila-desk"
                >
                  <span class="text-ink-gray-8">{{ range.label }}</span>
                  <span class="num text-right text-ink-gray-9">{{
                    range.charge
                  }}</span>
                </li>
              </ul>
            </div>
            <div v-else class="envio-tabla">
              <div
                class="envio-fila pb-1 text-sm text-ink-gray-6"
                aria-hidden="true"
              >
                <span class="envio-ancho">{{
                  __('From', null, 'Envios')
                }}</span>
                <span>{{ __('Up to', null, 'Envios') }}</span>
                <span>{{ __('Charges', null, 'Envios') }}</span>
                <span />
              </div>
              <ol
                class="envio-fields flex flex-col gap-2"
                data-testid="envio-rangos"
              >
                <li
                  v-for="(step, index) in form.steps"
                  :key="index"
                  class="envio-fila"
                  :data-envio-rango="index"
                >
                  <span class="envio-ancho num text-sm text-ink-gray-7">{{
                    stepFrom(index)
                  }}</span>
                  <FormControl
                    v-if="index < form.steps.length - 1"
                    v-model="step.to"
                    type="number"
                    :aria-label="__('Up to, range {0}', [index + 1])"
                    :disabled="readOnly"
                    min="0"
                    step="any"
                    :data-envio-hasta="index"
                  >
                    <template v-if="form.based_on !== 'net_weight'" #prefix>
                      <span class="text-base text-ink-gray-5">{{
                        symbol
                      }}</span>
                    </template>
                  </FormControl>
                  <span v-else class="text-sm leading-tight text-ink-gray-6">
                    <span class="envio-ancho">{{
                      __('No limit', null, 'Envios')
                    }}</span>
                    <span class="envio-angosto">{{ stepOpen(index) }}</span>
                  </span>
                  <FormControl
                    v-model="step.amount"
                    type="number"
                    :aria-label="__('Charges, range {0}', [index + 1])"
                    :placeholder="__('0 is no charge')"
                    :disabled="readOnly"
                    min="0"
                    step="any"
                    :data-envio-cobra="index"
                  >
                    <template #prefix>
                      <span class="text-base text-ink-gray-5">{{
                        symbol
                      }}</span>
                    </template>
                  </FormControl>
                  <button
                    v-if="!readOnly && index < form.steps.length - 1"
                    type="button"
                    class="envio-quitar press flex size-11 items-center justify-center rounded-full text-ink-gray-7 [@media(hover:hover)]:hover:bg-surface-gray-2"
                    :aria-label="__('Remove this range')"
                    :title="__('Remove this range')"
                    @click="form.steps = removeStep(form.steps, index)"
                  >
                    <span class="lucide-trash-2 size-5" aria-hidden="true" />
                  </button>
                  <span v-else aria-hidden="true" />
                </li>
              </ol>
              <button
                v-if="!readOnly && rule?.editable !== false"
                type="button"
                :class="['press mt-1', BTN.text]"
                data-testid="envio-agregar-rango"
                @click="form.steps = addStep(form.steps)"
              >
                <span class="lucide-plus size-4" aria-hidden="true" />
                {{ __('Add a range') }}
              </button>
            </div>
            <!-- Try it: what a purchase of this size pays, as ERPNext reads it. -->
            <div
              v-if="!rule?.desk_ranges"
              class="envio-fields flex flex-wrap items-end gap-x-4 gap-y-2 rounded-6 bg-surface-gray-1 p-3"
            >
              <FormControl
                v-model="probe"
                class="envio-angosto-xs min-w-0 flex-1"
                type="number"
                :label="
                  form.based_on === 'net_weight'
                    ? __('Try a purchase that weighs')
                    : __('Try a purchase of')
                "
                min="0"
                step="any"
                data-testid="envio-prueba"
              >
                <template v-if="form.based_on !== 'net_weight'" #prefix>
                  <span class="text-base text-ink-gray-5">{{ symbol }}</span>
                </template>
              </FormControl>
              <p
                class="min-h-7 flex-1 text-base text-ink-gray-9"
                role="status"
                data-testid="envio-prueba-cobra"
              >
                {{ probeText }}
              </p>
            </div>
          </template>
        </section>

        <!-- Where the charge goes -->
        <section
          class="flex flex-col gap-3"
          :aria-label="__('Account', null, 'Envios')"
        >
          <h2 class="text-base font-semibold text-ink-gray-9">
            {{ __('Which account does it go to?') }}
          </h2>
          <FormControl
            v-if="companies.length > 1"
            :model-value="form.company"
            class="envio-fields envio-angosto-sm"
            type="select"
            :label="__('Company', null, 'Compras')"
            :disabled="readOnly"
            :options="companies"
            @update:model-value="setCompany"
          />
          <div class="grid gap-3 sm:grid-cols-2">
            <ComprasPicker
              v-model="form.account"
              :display="form.account_label"
              :label="__('Account', null, 'Envios')"
              :placeholder="__('Search account, name or number')"
              :empty-text="__('No account of this company matches.')"
              :invalid="showMissing && !form.account"
              :disabled="readOnly || !form.company"
              :load="
                (q) =>
                  enviosApi('options', {
                    kind: 'account',
                    company: form.company,
                    search: q,
                  })
              "
              @pick="(o) => (form.account_label = o.label)"
            />
            <div>
              <ComprasPicker
                v-model="form.cost_center"
                :display="form.cost_center_label"
                :label="__('Cost center', null, 'Envios')"
                :placeholder="__('The company’s')"
                :empty-text="__('No cost center of this company matches.')"
                :disabled="readOnly || !form.company"
                :load="
                  (q) =>
                    enviosApi('options', {
                      kind: 'cost_center',
                      company: form.company,
                      search: q,
                    })
                "
                @pick="(o) => (form.cost_center_label = o.label)"
              />
              <button
                v-if="form.cost_center && !readOnly"
                type="button"
                class="press mt-1 min-h-11 text-sm text-ink-blue-link underline sm:min-h-0"
                @click="
                  Object.assign(form, {
                    cost_center: '',
                    cost_center_label: '',
                  })
                "
              >
                {{ __('Use the company’s') }}
              </button>
            </div>
          </div>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'The charge goes on the purchase as a line of its taxes and charges, on this account.',
              )
            }}
          </p>
        </section>

        <section
          class="envio-fields flex flex-col gap-3"
          :aria-label="__('Name')"
        >
          <FormControl
            v-model="form.label"
            class="envio-angosto-sm"
            type="text"
            :label="__('Name', null, 'Envios')"
            :placeholder="__('Parcel service, local freight…')"
            :disabled="readOnly"
            maxlength="140"
            data-testid="envio-nombre"
          />
          <FormControl
            :model-value="!form.disabled"
            type="checkbox"
            :label="__('Active', null, 'Envio')"
            :disabled="readOnly"
            @update:model-value="(on) => (form.disabled = !on)"
          />
          <p class="text-sm text-ink-gray-6">
            {{
              form.disabled
                ? __(
                    'Turned off: purchases cannot pick it; the ones that have it keep it.',
                  )
                : __(
                    'Draft purchases that have it take the change the next time they are saved.',
                  )
            }}
          </p>
          <p v-if="otherExtras.length" class="text-sm text-ink-gray-6">
            {{
              __('Also set in the full form: {0}.', [otherExtras.join(', ')])
            }}
          </p>
        </section>
      </div>
    </div>

    <!-- The save bar stays in sight at every width: on a phone it takes the
         nav's place, beside the list it closes the pane. -->
    <div
      v-if="loaded && !readOnly"
      class="flex flex-none flex-wrap items-center gap-2 border-t border-outline-gray-2 bg-surface-base px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-3"
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
        data-testid="envio-guardar"
        @click="save"
      >
        <span
          :class="[
            busy ? 'lucide-loader-circle animate-spin' : 'lucide-check',
            'size-5',
          ]"
          aria-hidden="true"
        />
        {{ __('Save shipping rule') }}
      </button>
      <button type="button" :class="['press', BTN.tonal]" @click="onBack">
        {{ __('Cancel', null, 'Compras') }}
      </button>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FormControl, toast } from 'frappe-ui'
import { AppBar, EmptyState, Segmented, StatusChip } from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { BTN } from '@/documentos/tools'
import {
  money,
  outcomeUnknown,
  problemOf,
  qty,
  requestId,
  returnWithDone,
  safeReturn,
} from '@/composables/useCompras'
import {
  addStep,
  blankRule,
  chargeFor,
  currencySymbol,
  enviosApi,
  rangeRows,
  removeStep,
  ruleForm,
  ruleMissing,
  rulePayload,
  ruleRoute,
  stateChip,
} from '@/composables/useEnvios'

const props = defineProps({
  name: { type: String, default: 'nuevo' },
  // Right pane of the desktop split (CompraReglas): saving stays here.
  pane: { type: Boolean, default: false },
})
// A save the list beside it should show.
const emit = defineEmits(['saved'])
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
const triedSave = ref(false)
// The try-out amount (or weight) under the ranges.
const probe = ref('')
let pending = null
// The rule this page saved, so the way back can say so.
let saved = ''

const currency = computed(
  () =>
    companies.value.find((c) => c.value === form.company)?.currency ||
    rule.value?.currency ||
    'MXN',
)
const readOnly = computed(
  () => !canWrite.value || (rule.value && !rule.value.editable),
)
const readOnlyReason = computed(() => {
  if (!rule.value || rule.value.editable)
    return __('Only the purchasing manager changes shipping rules.')
  return rule.value.selling
    ? __('This shipping rule is for sales; change it in the full form.')
    : __(
        'Its ranges were entered in the full form in a shape this page does not draw; change them there.',
      )
})
// What Desk keeps that this page does not edit (countries, project).
const otherExtras = computed(() => rule.value?.extras || [])
const title = computed(() =>
  isNew.value
    ? __('New shipping rule', null, 'Envios')
    : rule.value?.label || __('Shipping rule'),
)
const returnTo = computed(() => safeReturn(route.query.return_to))
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        String(route.query.return_label || __('Shipping rules')).slice(0, 40),
      ])
    : __('Shipping rules'),
)
const showMissing = computed(() => triedSave.value)
const missing = computed(() => ruleMissing(form))

const basisOptions = computed(() => [
  { value: 'fixed', label: __('Fixed', null, 'Envios') },
  { value: 'net_total', label: __('By amount', null, 'Envios') },
  { value: 'net_weight', label: __('By weight', null, 'Envios') },
])
const symbol = computed(() => currencySymbol(currency.value))
const measure = (value) =>
  form.based_on === 'net_weight'
    ? qty(value)
    : money(Number(value) || 0, currency.value)
// Where each range starts: where the one above ends («$1,000.00»).
function stepFrom(index) {
  if (!index) return measure(0)
  const from = form.steps[index - 1].to
  return from === '' || from === null ? '…' : measure(from)
}
// The open range at the end on a phone, where «From» has no column.
function stepOpen(index) {
  if (!index) return __('Any purchase')
  const from = form.steps[index - 1].to
  return from === '' || from === null
    ? __('No limit', null, 'Envios')
    : __('More than {0}', [measure(from)])
}
// A Desk-made shape, row by row as ERPNext reads it.
const deskRanges = computed(() =>
  rule.value ? rangeRows({ ...rule.value, steps: [] }, currency.value) : [],
)
const probeText = computed(() => {
  if (probe.value === '' || probe.value === null) return ''
  const amount = chargeFor(form.steps, probe.value)
  if (amount === null) return ''
  return amount > 0
    ? __('It pays {0} of shipping.', [money(amount, currency.value)])
    : __('It pays no shipping.')
})

function setCompany(company) {
  if (company === form.company) return
  Object.assign(form, {
    company,
    account: '',
    account_label: '',
    cost_center: '',
    cost_center_label: '',
  })
}

async function load() {
  loading.value = true
  guard.value = null
  problem.value = null
  try {
    if (isNew.value) {
      const blank = await enviosApi('blank')
      companies.value = blank.companies || []
      canWrite.value = Boolean(blank.can_create)
      if (!blank.can_create) {
        guard.value = {
          title: __('You cannot create shipping rules'),
          detail: blank.reason,
        }
        return
      }
      Object.assign(form, blankRule({ company: blank.company }))
      rule.value = null
    } else {
      const result = await enviosApi('rule', { name: props.name })
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
          ? __('You cannot open this shipping rule')
          : __('Could not open this shipping rule'),
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
    const result = await enviosApi('save_rule', {
      request_id: pending,
      data: rulePayload(form),
    })
    pending = null
    saved = result.name
    const drafts = Number(result.drafts) || 0
    toast.success(
      drafts === 1
        ? __(
            'Shipping rule saved. A draft purchase has it; it takes the change when it is saved.',
          )
        : drafts
          ? __(
              'Shipping rule saved. {0} draft purchases have it; they take the change when they are saved.',
              [drafts],
            )
          : __('Shipping rule saved'),
    )
    if (props.pane && !returnTo.value) {
      emit('saved', result.name)
      if (isNew.value)
        return router.replace(ruleRoute(result.name, listQuery()))
      triedSave.value = false
      return load()
    }
    goBack(result.name)
  } catch (error) {
    if (!outcomeUnknown(error)) pending = null
    const p = problemOf(error)
    problem.value =
      p.kind === 'conflict'
        ? { ...p, title: __('Someone else changed this shipping rule') }
        : p
  } finally {
    busy.value = false
  }
}

function onBack(event) {
  event?.preventDefault?.()
  if (props.pane && !returnTo.value) return close()
  goBack(saved)
}
// The list's state and search, which the split keeps in the URL.
function listQuery() {
  const { estado, q } = route.query
  return {
    ...(estado !== undefined && { estado }),
    ...(q && { q }),
  }
}
// The pane closes to the list beside it, as it was.
function close() {
  router.push({ name: 'CompraEnvios', query: listQuery() })
}
// Back where the worker came from (a purchase hears which rule was saved).
function goBack(saved = '') {
  const target = returnTo.value
  if (target) {
    const to = saved ? returnWithDone(target, 'Shipping Rule', saved) : target
    if (to.startsWith('/crm/')) return router.push(to.slice(4))
    return window.location.assign(to)
  }
  router.push({ name: 'CompraEnvios' })
}

watch(
  () => props.name,
  () => {
    loaded.value = false
    saved = ''
    triedSave.value = false
    probe.value = ''
    load()
  },
)
onMounted(load)
</script>
<style scoped>
/* 44 px fields on a phone, like the pickers beside them. */
@media (max-width: 639px) {
  .envio-fields :deep(select),
  .envio-fields :deep(input:not([type='checkbox'])) {
    min-height: 44px;
    font-size: 1rem;
  }
}
/* The ranges as one table: from, up to, charges, remove. Scoped, not
   Tailwind arbitrary values: keeps the global sheet in budget. */
.envio-fila {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr) minmax(0, 1fr) 2.75rem;
  column-gap: 0.5rem;
  align-items: center;
}
.envio-fila-desk {
  grid-template-columns: minmax(0, 1fr) auto;
}
.envio-angosto {
  display: none;
}
/* A narrow phone drops «From»: the open range says where it starts. */
@media (max-width: 399px) {
  .envio-fila {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 2.75rem;
  }
  .envio-fila-desk {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .envio-ancho {
    display: none;
  }
  .envio-angosto {
    display: inline;
  }
}
@media (min-width: 640px) {
  /* A pointer's row stays as tall as its fields. */
  .envio-quitar {
    width: 2rem;
    height: 2rem;
  }
  .envio-angosto-xs {
    max-width: 14rem;
  }
  .envio-angosto-sm {
    max-width: 28rem;
  }
}
</style>
