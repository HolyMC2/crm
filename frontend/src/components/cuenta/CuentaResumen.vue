<template>
  <!-- Resumen: where the plan stands, a Muelle outage, what would interrupt
       selling and its next step, «Salud de tu sistema», then the meters and
       the site's own health, and at the foot a copy of the data, the reports
       to support and the cancel. Rows and rules. -->
  <div class="space-y-6">
    <section
      aria-labelledby="cuenta-plan"
      class="border-b border-outline-gray-1 pb-4"
    >
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2
            id="cuenta-plan"
            class="title-face break-words text-2xl font-semibold text-ink-gray-9 [text-wrap:balance]"
            data-testid="cuenta-plan"
          >
            {{ plan.title }}
          </h2>
          <!-- A recorded cancel bills no next period: no next charge to name. -->
          <p v-if="plan.next && !cancelled" class="text-sm text-ink-gray-6">
            {{ plan.next }}
          </p>
        </div>
        <StatusChip :label="plan.status.label" :tone="plan.status.tone" />
      </div>
      <!-- «Todo en orden» never sits over an outage that is on now. -->
      <p
        v-if="judgement.tone !== 'ok' || !outage"
        class="mt-3 flex items-center gap-2 text-base font-medium"
        :class="VERDICT_INK[judgement.tone]"
        data-testid="cuenta-verdict"
      >
        <span
          :class="[VERDICT_ICON[judgement.tone], 'size-5 flex-none']"
          aria-hidden="true"
        />
        {{ judgement.text }}
      </p>
    </section>

    <!-- A Muelle outage on this site, while it lasts and a day after. -->
    <Incidentes :door="door" @open="(open) => (outage = open)" />

    <!-- A recorded cancel is what the owner reads first after the plan. -->
    <Suscripcion
      v-if="subscription && subscription.state !== 'active'"
      :door="door"
      @act="act"
    />

    <!-- The trial's days and the way out of it, under the thumb. -->
    <section
      v-if="plan.isTrial"
      class="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-outline-gray-1 pb-4"
      data-testid="cuenta-prueba"
    >
      <span
        class="lucide-clock size-5 flex-none"
        :class="soon ? 'text-ink-amber-8' : 'text-ink-gray-6'"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1 basis-48">
        <p class="text-base font-semibold text-ink-gray-9">
          {{ trialLine }}
        </p>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'Activate your plan to keep selling without a stop.',
              null,
              'Cuenta',
            )
          }}
        </p>
      </div>
      <Button
        variant="solid"
        class="min-h-11 max-sm:w-full"
        :label="__('Activate', null, 'Cuenta')"
        :disabled="door.paymentActionsBlocked()"
        data-testid="cuenta-activar"
        @click="$emit('act', 'activate')"
      />
      <p
        v-if="door.paymentActionsBlocked() && !door.loading.value"
        class="w-full text-sm text-ink-gray-6"
        role="status"
      >
        {{ door.paymentActionReason.value }}
      </p>
    </section>

    <section
      v-if="notices.length"
      class="border-b border-outline-gray-1"
      :aria-label="__('Account notices', null, 'Cuenta')"
    >
      <ul class="divide-y divide-outline-gray-1" data-testid="cuenta-avisos">
        <li
          v-for="notice in notices"
          :key="notice.text"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
        >
          <span
            :class="
              notice.level === 'bad'
                ? 'lucide-circle-alert text-ink-red-7'
                : 'lucide-triangle-alert text-ink-amber-8'
            "
            class="size-5 flex-none"
            aria-hidden="true"
          />
          <p class="min-w-0 flex-1 basis-48 text-base text-ink-gray-8">
            {{ notice.text }}
          </p>
          <!-- «Ver facturas» and «Ver planes» only change the tab, whose own
               buttons carry the payment guard; the sheets wait for it here. -->
          <Button
            v-if="notice.cta && actions.includes(notice.act)"
            variant="subtle"
            class="min-h-11"
            :label="notice.cta"
            :disabled="
              PAYING_ACTS.includes(notice.act) && door.paymentActionsBlocked()
            "
            @click="$emit('act', notice.act)"
          />
        </li>
      </ul>
      <p v-if="door.supportError.value" class="text-sm text-ink-red-7">
        {{ door.supportError.value }}
      </p>
    </section>

    <section
      v-if="wallet"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-outline-gray-1 pb-4"
      data-testid="cuenta-monedero"
    >
      <span
        class="lucide-wallet size-5 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <!-- The label keeps its width: on a narrow phone «Recargar» drops to
           its own line instead of squeezing «Saldo del monedero». -->
      <span class="min-w-0 flex-1 basis-40 text-base text-ink-gray-8">{{
        __('Wallet balance', null, 'Cuenta')
      }}</span>
      <span class="num text-xl font-semibold text-ink-gray-9">{{
        wallet.text
      }}</span>
      <!-- A wallet notice above already carries «Recargar»: one button. -->
      <Button
        v-if="actions.includes('topup') && !topupNotice"
        variant="subtle"
        class="min-h-11"
        :label="__('Top up', null, 'Cuenta')"
        :disabled="door.paymentActionsBlocked()"
        @click="$emit('act', 'topup')"
      />
    </section>

    <!-- «Salud de tu sistema» where Boat offers it (capability «health»). -->
    <SaludSistema :door="door" :actions="actions" @act="act" />

    <div class="grid gap-6 lg:grid-cols-2 lg:gap-10">
      <section aria-labelledby="cuenta-uso">
        <h2 id="cuenta-uso" class="pb-1 text-sm font-semibold text-ink-gray-7">
          {{ __('Usage this month', null, 'Cuenta') }}
        </h2>
        <ul class="divide-y divide-outline-gray-1" data-testid="cuenta-uso">
          <li v-for="item in usage" :key="item.key" class="py-2.5">
            <div class="flex items-baseline gap-3">
              <span class="min-w-0 flex-1 text-base text-ink-gray-8">{{
                item.label
              }}</span>
              <span
                class="num shrink-0 text-base"
                :class="item.warn ? 'text-ink-amber-8' : 'text-ink-gray-9'"
                >{{ item.value }}</span
              >
            </div>
            <span
              v-if="item.pct != null"
              role="progressbar"
              :aria-label="item.label"
              :aria-valuenow="item.pct"
              aria-valuemin="0"
              aria-valuemax="100"
              class="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-gray-2"
            >
              <span
                class="h-full rounded-full"
                :class="item.warn ? 'bg-surface-amber-5' : 'bg-surface-gray-7'"
                :style="{ width: item.pct + '%' }"
              />
            </span>
            <p v-if="item.sub" class="mt-0.5 text-sm text-ink-gray-6">
              {{ item.sub }}
            </p>
            <!-- Boat sells storage blocks (capability «storage_blocks»): the
                 meter's own way to more space, two taps with «Confirmar». -->
            <Button
              v-if="item.key === 'storage' && storageCta"
              variant="subtle"
              class="mt-2 min-h-11 max-sm:w-full"
              :label="__('Get more space', null, 'Cuenta')"
              data-testid="cuenta-uso-espacio"
              @click="$emit('act', 'storage')"
            />
          </li>
        </ul>
      </section>

      <section v-if="health.length" aria-labelledby="cuenta-sitio">
        <h2
          id="cuenta-sitio"
          class="pb-1 text-sm font-semibold text-ink-gray-7"
        >
          {{ __('Site status', null, 'Cuenta') }}
        </h2>
        <dl class="divide-y divide-outline-gray-1" data-testid="cuenta-sitio">
          <div
            v-for="item in health"
            :key="item.key"
            class="flex items-center gap-3 py-2.5"
          >
            <span
              :class="
                item.warn
                  ? 'lucide-triangle-alert text-ink-amber-8'
                  : 'lucide-shield-check text-ink-gray-6'
              "
              class="size-5 flex-none"
              aria-hidden="true"
            />
            <dt class="min-w-0 flex-1 text-base text-ink-gray-8">
              {{ item.label }}
            </dt>
            <dd
              class="num shrink-0 text-base"
              :class="item.warn ? 'text-ink-amber-8' : 'text-ink-gray-9'"
            >
              {{ item.value }}
            </dd>
          </div>
        </dl>
      </section>
    </div>

    <!-- A copy of the business data, a zip the owner downloads here. -->
    <ExportarDatos
      ref="exportBlock"
      class="border-t border-outline-gray-1 pt-4"
    />

    <!-- doco's «Mis reportes» (the Ayuda dialog), where the shell has it. -->
    <section
      v-if="reportsOn"
      aria-labelledby="cuenta-reportes"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-outline-gray-1 pt-4"
      data-testid="cuenta-reportes"
    >
      <span
        class="lucide-bug size-5 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1 basis-48">
        <h2
          id="cuenta-reportes"
          class="text-base font-semibold text-ink-gray-9"
        >
          {{ __('Your reports to support', null, 'Cuenta') }}
        </h2>
        <p class="text-sm text-ink-gray-6">
          {{ __('Their state and support’s answer.', null, 'Cuenta') }}
        </p>
      </div>
      <Button
        class="min-h-11 max-sm:w-full"
        :label="__('See my reports', null, 'Cuenta')"
        @click="openReports"
      />
    </section>

    <!-- Cancelling is one quiet button at the foot (capability «cancel»):
         Mi cuenta opens on Resumen, so the button is two taps from the
         account menu. -->
    <Suscripcion
      v-if="subscription && subscription.state === 'active'"
      class="border-t border-outline-gray-1 pt-4"
      :door="door"
      @act="act"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { Button } from 'frappe-ui'
import { StatusChip } from '@/components/ui'
import ExportarDatos from './ExportarDatos.vue'
import Incidentes from './Incidentes.vue'
import SaludSistema from './SaludSistema.vue'
import { capable } from './autoservicio'
import { subscriptionView } from './suscripcion'
import {
  accountAlerts,
  healthRows,
  planView,
  trialTitle,
  usageRows,
  verdict,
  walletView,
} from './cuenta'

// «Tu suscripción» loads only where Boat offers the cancel.
const Suscripcion = defineAsyncComponent(() => import('./Suscripcion.vue'))

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  /** The next steps the page can open (Cuenta.vue ACTIONS). */
  actions: { type: Array, default: () => [] },
})
const emit = defineEmits(['act'])

const exportBlock = ref(null)
// A Muelle outage on now (Incidentes): the plan's «Todo en orden» steps aside.
const outage = ref(false)
// «Pedir mis datos» in «Tu suscripción» and the cancel sheet opens the block
// here; every other step is the page's.
function act(key) {
  if (key === 'export') exportBlock.value?.reveal()
  else emit('act', key)
}
// doco's support script (support_workflow.js) carries «Mis reportes».
const reportsOn = typeof window.docoSupport?.openReports === 'function'
const openReports = () => window.docoSupport.openReports()

// The next steps that open a payment sheet; the others only switch the tab.
const PAYING_ACTS = ['activate', 'topup']

// Colour only where the owner has something to do: «Todo en orden» is grey.
const VERDICT_INK = {
  ok: 'text-ink-gray-7',
  warn: 'text-ink-amber-8',
  bad: 'text-ink-red-7',
}
const VERDICT_ICON = {
  ok: 'lucide-circle-check',
  warn: 'lucide-triangle-alert',
  bad: 'lucide-circle-alert',
}

const data = computed(() => props.door.boot.value)
const plan = computed(() => planView(data.value))
const alerts = computed(() => accountAlerts(data.value))
const judgement = computed(() => verdict(alerts.value))
// The trial strip is the trial's own notice; the list keeps the rest.
const notices = computed(() =>
  alerts.value.filter((alert) => alert.act !== 'activate'),
)
const topupNotice = computed(
  () =>
    props.actions.includes('topup') &&
    notices.value.some((notice) => notice.act === 'topup'),
)
const soon = computed(
  () => plan.value.daysLeft != null && plan.value.daysLeft <= 3,
)
const trialLine = computed(() =>
  trialTitle(plan.value.daysLeft, plan.value.trialOver),
)
const wallet = computed(() => walletView(data.value))
const usage = computed(() => usageRows(data.value))
// Only where Boat can sell a block now and the plan has a ceiling to grow.
const storageCta = computed(
  () =>
    props.actions.includes('storage') &&
    capable(data.value, 'storage_blocks') &&
    data.value?.storage_blocks?.can_add === true &&
    Boolean(data.value?.meters?.storage?.allowance),
)
const health = computed(() => healthRows(data.value))
const subscription = computed(() => subscriptionView(data.value))
const cancelled = computed(
  () => Boolean(subscription.value) && subscription.value.state !== 'active',
)
</script>
