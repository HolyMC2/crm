<template>
  <!-- Tienda: the plans in the cycle this site pays (the current one marked;
       a change is a request Muelle confirms; a monthly plan asks support for
       the yearly cycle, which a plan request cannot carry) and the add-ons,
       each switch with its price and, when Boat cannot deliver it, why it
       stays off. Every change opens one confirm sheet that names the price
       and its cycle. Rows and rules. -->
  <div v-if="store" class="space-y-8">
    <section aria-labelledby="cuenta-planes">
      <h2
        id="cuenta-planes"
        class="title-face pb-1 text-xl font-semibold text-ink-gray-9"
      >
        {{ __('Plans', null, 'Cuenta') }}
      </h2>
      <p
        v-if="requested"
        role="status"
        class="mt-3 text-base text-ink-gray-8"
        data-testid="plan-solicitado"
      >
        {{
          __(
            'You asked for {0}. It applies when Muelle confirms it.',
            [requested],
            'Cuenta',
          )
        }}
      </p>
      <ul class="divide-y divide-outline-gray-1" data-testid="cuenta-planes">
        <li
          v-for="plan in plans"
          :key="plan.name"
          class="py-4"
          :data-current="plan.current ? 'true' : undefined"
        >
          <div class="flex items-start gap-3">
            <p class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span class="text-lg font-semibold text-ink-gray-9">{{
                plan.display
              }}</span>
              <span
                v-if="plan.current"
                class="inline-flex h-6 items-center rounded-full bg-[var(--muelle-accent)] px-2 text-xs font-medium text-[var(--muelle-accent-ink)]"
                >{{ __('Your plan', null, 'Cuenta') }}</span
              >
              <StatusChip
                v-else-if="plan.popular"
                :label="__('Most popular', null, 'Cuenta')"
                tone="neutral"
              />
            </p>
            <div class="shrink-0 text-right">
              <p class="num text-xl font-semibold text-ink-gray-9">
                {{ plan.price }}
              </p>
              <p class="text-xs text-ink-gray-6">{{ plan.per }}</p>
            </div>
          </div>
          <ul
            v-if="plan.features.length"
            class="mt-1 space-y-0.5 text-sm text-ink-gray-7"
          >
            <li
              v-for="feature in plan.features"
              :key="feature"
              class="flex gap-2"
            >
              <span
                class="lucide-check mt-0.5 size-4 flex-none text-ink-gray-5"
                aria-hidden="true"
              />
              <span class="min-w-0">{{ feature }}</span>
            </li>
          </ul>
          <p v-if="plan.note" class="mt-1 text-sm text-ink-gray-6">
            {{ plan.note }}
          </p>
          <!-- The yearly cycle for the plan this site pays monthly: Muelle
               switches it, so the step is a support request written for them. -->
          <div
            v-if="plan.yearly"
            class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"
          >
            <p class="min-w-0 flex-1 basis-48 text-sm text-ink-gray-7">
              {{ plan.yearly }}
            </p>
            <Button
              variant="subtle"
              class="min-h-11 max-sm:w-full"
              :label="__('Ask for the yearly cycle', null, 'Cuenta')"
              data-testid="plan-anual"
              @click="askYearly(plan)"
            />
          </div>
          <p
            v-if="plan.yearly && door.supportError.value"
            class="mt-2 text-sm text-ink-red-7"
            role="alert"
          >
            {{ door.supportError.value }}
          </p>
          <p
            v-if="plan.requested"
            class="mt-2 text-sm font-medium text-ink-gray-8"
          >
            {{ __('Change requested', null, 'Cuenta') }}
          </p>
          <Button
            v-else-if="!plan.current"
            variant="subtle"
            class="mt-3 min-h-11 max-sm:w-full"
            :label="__('Change to this plan', null, 'Cuenta')"
            :disabled="blocked || Boolean(store.requested_plan)"
            data-testid="plan-cambiar"
            @click="ask(planConfirm(plan))"
          />
        </li>
      </ul>
    </section>

    <section v-if="addons.length" aria-labelledby="cuenta-complementos">
      <h2
        id="cuenta-complementos"
        class="title-face pb-1 text-xl font-semibold text-ink-gray-9"
      >
        {{ __('Add-ons', null, 'Cuenta') }}
      </h2>
      <ul
        class="divide-y divide-outline-gray-1"
        data-testid="cuenta-complementos"
      >
        <li
          v-for="row in addons"
          :key="row.key"
          class="flex items-start gap-3 py-3"
        >
          <div class="min-w-0 flex-1">
            <p class="text-base font-medium text-ink-gray-9">{{ row.name }}</p>
            <p
              class="text-sm"
              :class="row.active ? 'text-ink-green-8' : 'text-ink-gray-8'"
            >
              {{ row.price }}
            </p>
            <p v-if="row.meter" class="text-sm text-ink-gray-6">
              {{ row.meter }}
            </p>
            <p
              v-if="row.reason"
              :id="`cuenta-complemento-${row.key}`"
              class="text-sm text-ink-gray-7"
            >
              {{ row.reason }}
            </p>
          </div>
          <AjustesSwitch
            :model-value="row.active"
            :label="row.switchLabel"
            :disabled="blocked || !row.available"
            :aria-describedby="
              row.reason ? `cuenta-complemento-${row.key}` : undefined
            "
            :data-testid="`complemento-${row.key}`"
            @update:model-value="ask(addonConfirm(row.addon, { isTrial }))"
          />
        </li>
      </ul>
    </section>

    <p
      v-if="blocked && !door.loading.value"
      class="text-sm text-ink-gray-6"
      role="status"
    >
      {{ door.paymentActionReason.value }}
    </p>

    <ConfirmarSheet
      v-if="sheetMounted"
      :open="Boolean(pending) && !door.loading.value && !door.paymentHold.value"
      :confirm="pending"
      :busy="running"
      :disabled="blocked"
      :reason="blocked && !running ? door.paymentActionReason.value : ''"
      :error="error"
      @close="close"
      @confirm="run"
    />
  </div>
  <EmptyState
    v-else
    state="empty"
    :title="__('The store is not available right now.', null, 'Cuenta')"
    :message="
      __(
        'Check the status in a moment; your plan and add-ons stay as they are.',
        null,
        'Cuenta',
      )
    "
    :action="__('Check status', null, 'Cuenta')"
    @action="door.load()"
  />
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { EmptyState, StatusChip } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { planView } from './cuenta'
import {
  addonConfirm,
  addonRows,
  planConfirm,
  planRows,
  requestedName,
} from './tienda'

// The confirm sheet mounts on its first open.
const ConfirmarSheet = defineAsyncComponent(
  () => import('./ConfirmarSheet.vue'),
)

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
})

// The prices of the cycle this site pays (meters.billing.billing_cycle): a plan
// request carries the plan, never the cycle.
const site = computed(() => planView(props.door.boot.value))
const annual = computed(() => site.value.annual)
const store = computed(() => props.door.boot.value?.store || null)
const isTrial = computed(() => site.value.isTrial)
const plans = computed(() => planRows(store.value, { annual: annual.value }))
const addons = computed(() => addonRows(store.value))
const requested = computed(() => requestedName(store.value))
const blocked = computed(() => props.door.paymentActionsBlocked())

const sheetMounted = ref(false)
const pending = ref(null)
const running = ref(false)
const error = ref('')
// A payment or delivery hold drops a pending confirm (Mi plan's resolvePaymentState).
watch(
  () => props.door.paymentHold.value,
  (held) => {
    if (held && !running.value) pending.value = null
  },
)

function askYearly(plan) {
  props.door.contactSupport(
    __(
      'I want to switch my plan {0} to the yearly cycle.',
      [plan.display],
      'Cuenta',
    ),
  )
}
function ask(confirm) {
  if (props.door.paymentActionsBlocked()) return
  error.value = ''
  sheetMounted.value = true
  pending.value = confirm
}
function close() {
  if (running.value) return
  pending.value = null
  error.value = ''
}
async function run() {
  const confirm = pending.value
  if (!confirm || running.value) return
  running.value = true
  error.value = ''
  const out =
    confirm.kind === 'plan'
      ? await props.door.requestPlan(confirm.target)
      : await props.door.toggleAddon(confirm.addon, confirm.action)
  running.value = false
  if (!out.ok) {
    error.value = out.error || ''
    return
  }
  pending.value = null
  toast.success(out.note || doneText(confirm))
}
function doneText(confirm) {
  if (confirm.kind === 'plan') return __('Change requested', null, 'Cuenta')
  return confirm.action === 'cancel'
    ? __('Add-on turned off', null, 'Cuenta')
    : __('Add-on turned on', null, 'Cuenta')
}
</script>
