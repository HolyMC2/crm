<template>
  <!-- Tienda: the plans in the cycle this site pays (the current one marked;
       a change is a request Muelle confirms; a monthly plan asks support for
       the yearly cycle, which a plan request cannot carry) and the add-ons,
       each switch with its price and, when Boat cannot deliver it, why it
       stays off. Every change opens one confirm sheet that names the price
       and its cycle. Where Boat offers them (bootstrap capabilities): users
       and cajas and the free apps on top, and a plan or cycle change that
       reads Boat's quote and applies at once. Rows and rules. -->
  <div class="space-y-8">
    <!-- What Boat lets the owner change alone (capabilities «seats», «apps»):
         the quick jobs first, then the plans and add-ons. -->
    <UsuariosCajas
      v-if="caps.seats"
      :door="door"
      @act="(key) => $emit('act', key)"
    />
    <Aplicaciones
      v-if="caps.apps"
      :door="door"
      @act="(key) => $emit('act', key)"
    />
    <section v-if="store" aria-labelledby="cuenta-planes">
      <!-- «Ver planes» scrolls here: clear of the phone's bar. -->
      <h2
        id="cuenta-planes"
        class="title-face scroll-mt-16 pb-1 text-xl font-semibold text-ink-gray-9"
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
          <!-- A change Boat scheduled for the period's end, under the plan it
               leaves, with the way to keep this one. -->
          <div
            v-if="plan.current && scheduled"
            role="status"
            class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"
            data-testid="plan-programado"
          >
            <div class="min-w-0 flex-1 basis-48">
              <p class="text-base text-ink-gray-8">{{ scheduled.text }}</p>
              <p v-if="scheduled.waits" class="text-sm text-ink-gray-6">
                {{ scheduled.waits }}
              </p>
            </div>
            <Button
              variant="subtle"
              class="min-h-11 max-sm:w-full"
              :label="__('Cancel the scheduled change', null, 'Cuenta')"
              :disabled="blocked"
              data-testid="plan-programado-cancelar"
              @click="askChange(plan, cycle, { undo: true })"
            />
          </div>
          <!-- The yearly cycle for the plan this site pays monthly: Boat
               switches it when it offers plan changes; else Muelle does, so
               the step is a support request written for them. -->
          <div
            v-if="plan.yearly && !(caps.planChange && scheduled?.cycle)"
            class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"
          >
            <!-- Boat quotes the yearly price in the sheet; no figure of ours. -->
            <p class="min-w-0 flex-1 basis-48 text-sm text-ink-gray-7">
              {{
                caps.planChange
                  ? __(
                      'Pay once a year instead of every month; you see the amount before you confirm.',
                      null,
                      'Cuenta',
                    )
                  : plan.yearly
              }}
            </p>
            <Button
              v-if="caps.planChange"
              variant="subtle"
              class="min-h-11 max-sm:w-full"
              :label="__('Pay yearly', null, 'Cuenta')"
              :disabled="blocked"
              data-testid="plan-anual"
              @click="askChange(plan, 'Anual')"
            />
            <Button
              v-else
              variant="subtle"
              class="min-h-11 max-sm:w-full"
              :label="__('Ask for the yearly cycle', null, 'Cuenta')"
              data-testid="plan-anual"
              @click="askYearly(plan)"
            />
          </div>
          <p
            v-if="plan.yearly && !caps.planChange && door.supportError.value"
            class="mt-2 text-sm text-ink-red-7"
            role="alert"
          >
            {{ door.supportError.value }}
          </p>
          <Button
            v-if="
              caps.planChange && plan.current && annual && !scheduled?.cycle
            "
            variant="subtle"
            class="mt-3 min-h-11 max-sm:w-full"
            :label="__('Pay monthly', null, 'Cuenta')"
            :disabled="blocked"
            data-testid="plan-mensual"
            @click="askChange(plan, 'Mensual')"
          />
          <p
            v-if="plan.requested"
            class="mt-2 text-sm font-medium text-ink-gray-8"
          >
            {{ __('Change requested', null, 'Cuenta') }}
          </p>
          <p
            v-else-if="caps.planChange && scheduled?.plan === plan.name"
            class="mt-2 text-sm font-medium text-ink-gray-8"
            data-testid="plan-programado-destino"
          >
            {{
              scheduled.on
                ? __('Scheduled for {0}', [scheduled.on], 'Cuenta')
                : __('Change scheduled', null, 'Cuenta')
            }}
          </p>
          <!-- With Boat's plan change, Boat's quote and an instant change;
               without it, a request Muelle confirms. -->
          <Button
            v-else-if="!plan.current && caps.planChange"
            variant="subtle"
            class="mt-3 min-h-11 max-sm:w-full"
            :label="__('Change to this plan', null, 'Cuenta')"
            :disabled="blocked"
            data-testid="plan-cambiar"
            @click="askChange(plan, cycle)"
          />
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

    <section
      v-if="store && addons.length"
      aria-labelledby="cuenta-complementos"
    >
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
      v-if="store && blocked && !door.loading.value"
      class="text-sm text-ink-gray-6"
      role="status"
    >
      {{ door.paymentActionReason.value }}
    </p>
    <!-- Support asked from a block above (Boat's «pide ayuda» step) without a
         support window on this site; the yearly row says it in place. -->
    <p
      v-if="door.supportError.value && !yearlyAsks"
      class="text-sm text-ink-red-7"
      role="alert"
    >
      {{ door.supportError.value }}
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
    <CambioPlanSheet
      v-if="changeMounted"
      :door="door"
      :open="
        Boolean(changing) && !door.loading.value && !door.paymentHold.value
      "
      :target="changing"
      @close="changing = null"
      @act="actFromSheet"
      @request="requestInstead"
      @done="changed"
    />
    <EmptyState
      v-if="!store"
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
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { EmptyState, StatusChip } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { seam } from './api'
import { capable } from './autoservicio'
import { planDoneText, scheduledPlanView } from './cambioPlan'
import { planView } from './cuenta'
import {
  addonConfirm,
  addonRows,
  planConfirm,
  planRows,
  requestedName,
} from './tienda'

// The confirm sheets mount on their first open; the self-service blocks only
// where Boat offers them.
const ConfirmarSheet = defineAsyncComponent(
  () => import('./ConfirmarSheet.vue'),
)
const CambioPlanSheet = defineAsyncComponent(
  () => import('./CambioPlanSheet.vue'),
)
const UsuariosCajas = defineAsyncComponent(() => import('./UsuariosCajas.vue'))
const Aplicaciones = defineAsyncComponent(() => import('./Aplicaciones.vue'))

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
})
const emit = defineEmits(['act'])

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
// What Boat has on for this site (bootstrap.capabilities); none on an older Boat.
const caps = computed(() => {
  const data = props.door.boot.value
  return {
    seats: capable(data, 'seats'),
    apps: capable(data, 'apps'),
    // Boat's plan change refuses a trial (activation comes first): a trial
    // keeps the request it always had.
    planChange: capable(data, 'plan_change') && !isTrial.value,
  }
})
const cycle = computed(() => (annual.value ? 'Anual' : 'Mensual'))
// The yearly row of a site without Boat's plan change shows support's error itself.
const yearlyAsks = computed(
  () => !caps.value.planChange && plans.value.some((plan) => plan.yearly),
)

// A plan or cycle change Boat scheduled (a cheaper plan, a cycle switch): Boat
// has no read of it alone; its quote for today's plan and cycle names it, and
// that quote is also the way to cancel it.
const scheduled = ref(null)
let scheduleTurn = 0
async function readScheduled() {
  const mine = ++scheduleTurn
  const current = plans.value.find((plan) => plan.current)
  if (!caps.value.planChange || !current) {
    scheduled.value = null
    return
  }
  try {
    const out = await seam('plan_change_quote', {
      target_plan: current.name,
      cycle: cycle.value,
    })
    if (mine === scheduleTurn)
      scheduled.value = scheduledPlanView(out, plans.value)
  } catch {
    // Only the line goes; the plans and their buttons stay.
    if (mine === scheduleTurn) scheduled.value = null
  }
}
watch(
  () => props.door.boot.value,
  (boot) => boot && readScheduled(),
  { immediate: true },
)

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
// Boat's quote for a plan or cycle, then the change itself (plan_change).
const changeMounted = ref(false)
const changing = ref(null)
// `undo`: today's plan and cycle, which Boat answers by cancelling what it scheduled.
function askChange(plan, inCycle, { undo = false } = {}) {
  if (props.door.paymentActionsBlocked()) return
  changeMounted.value = true
  changing.value = {
    plan: plan.name,
    display: plan.display,
    cycle: inCycle,
    undo,
  }
}
async function changed(out) {
  changing.value = null
  toast.success(planDoneText(out))
  await props.door.load()
}
function actFromSheet(key) {
  changing.value = null
  emit('act', key)
}
// Boat sends this change to Muelle (request_plan): the request it always was.
// A request carries the plan, never the cycle: the cycle goes to support.
function requestInstead(target) {
  changing.value = null
  const plan = plans.value.find((row) => row.name === target?.plan)
  if (!plan) return
  if (!plan.current) ask(planConfirm(plan))
  else if (target.cycle === 'Anual') askYearly(plan)
  else
    props.door.contactSupport(
      __(
        'I want to switch my plan {0} to the monthly cycle.',
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
