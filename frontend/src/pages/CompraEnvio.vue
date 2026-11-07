<template>
  <!-- One shipping rule (a buying Shipping Rule), asked as the worker thinks
       of it: how much it charges, where the charge goes, its name. Ranges are
       a ladder (up to this amount, this much; the last one has no limit). A
       selling rule, or ranges Desk entered in another shape, is read here and
       changed in the full form. -->
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
              data-testid="envio-estado"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              rule.account?.label || ''
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
        :title="__('Loading shipping rule…')"
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
        <section class="flex flex-col gap-2" :aria-label="__('Charge')">
          <h2 class="text-base font-semibold text-ink-gray-9">
            {{ __('How much does it charge?') }}
          </h2>
          <Segmented
            v-model="form.based_on"
            :options="basisOptions"
            :label="__('How it charges')"
            :class="readOnly ? 'opacity-60' : ''"
            :inert="readOnly || undefined"
          />
          <FormControl
            v-if="form.based_on === 'fixed'"
            v-model="form.amount"
            type="number"
            :label="__('Charge per purchase')"
            :disabled="readOnly"
            min="0"
            step="any"
            data-testid="envio-monto"
          />
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
            <ul
              v-if="rule?.desk_ranges"
              class="space-y-1 text-base text-ink-gray-8"
            >
              <li v-for="(line, index) in deskRanges" :key="index">
                {{ line }}
              </li>
            </ul>
            <ol
              v-else
              class="envio-fields flex flex-col gap-3"
              data-testid="envio-rangos"
            >
              <li
                v-for="(step, index) in form.steps"
                :key="index"
                class="flex flex-col gap-1.5"
              >
                <span class="text-sm text-ink-gray-6">{{
                  stepCaption(index)
                }}</span>
                <div class="flex items-end gap-2">
                  <FormControl
                    v-if="index < form.steps.length - 1"
                    v-model="step.to"
                    class="min-w-0 flex-1"
                    type="number"
                    :label="__('Up to', null, 'Envios')"
                    :disabled="readOnly"
                    min="0"
                    step="any"
                    :data-envio-hasta="index"
                  />
                  <FormControl
                    v-model="step.amount"
                    class="min-w-0 flex-1"
                    type="number"
                    :label="__('Charges', null, 'Envios')"
                    :placeholder="__('0 is no charge')"
                    :disabled="readOnly"
                    min="0"
                    step="any"
                    :data-envio-cobra="index"
                  />
                  <button
                    v-if="!readOnly && index < form.steps.length - 1"
                    type="button"
                    class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 [@media(hover:hover)]:hover:bg-surface-gray-2"
                    :aria-label="__('Remove this range')"
                    :title="__('Remove this range')"
                    @click="form.steps = removeStep(form.steps, index)"
                  >
                    <span class="lucide-trash-2 size-5" aria-hidden="true" />
                  </button>
                  <span
                    v-else-if="!readOnly"
                    class="size-11 flex-none"
                    aria-hidden="true"
                  />
                </div>
              </li>
            </ol>
            <button
              v-if="!readOnly && rule?.editable !== false"
              type="button"
              :class="['press self-start', BTN.text]"
              data-testid="envio-agregar-rango"
              @click="form.steps = addStep(form.steps)"
            >
              <span class="lucide-plus size-4" aria-hidden="true" />
              {{ __('Add a range') }}
            </button>
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
            class="envio-fields"
            type="select"
            :label="__('Company', null, 'Compras')"
            :disabled="readOnly"
            :options="companies"
            @update:model-value="setCompany"
          />
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
                Object.assign(form, { cost_center: '', cost_center_label: '' })
              "
            >
              {{ __('Use the company’s') }}
            </button>
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
  enviosApi,
  removeStep,
  ruleForm,
  ruleMissing,
  rulePayload,
  stateChip,
} from '@/composables/useEnvios'

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
const triedSave = ref(false)
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
const measure = (value) =>
  form.based_on === 'net_weight'
    ? qty(value)
    : money(Number(value) || 0, currency.value)
// Above each range, where it starts: «Desde $1,000.00», «Más de $3,000.00».
function stepCaption(index) {
  const last = index === form.steps.length - 1
  if (!index) return last ? __('Any purchase') : __('From {0}', [measure(0)], 'Envios')
  const from = form.steps[index - 1].to
  if (from === '' || from === null) return __('After the range above')
  return last
    ? __('More than {0}', [measure(from)])
    : __('From {0}', [measure(from)], 'Envios')
}
// A Desk-made shape, line by line as ERPNext reads it.
const deskRanges = computed(() =>
  (rule.value?.ranges || []).map((row) =>
    row.to
      ? __('From {0} to {1}: {2}', [
          measure(row.from),
          measure(row.to),
          money(row.amount, currency.value),
        ])
      : __('From {0}, no limit: {1}', [
          measure(row.from),
          money(row.amount, currency.value),
        ]),
  ),
)

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
  goBack(saved)
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
</style>
