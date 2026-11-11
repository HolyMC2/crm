<template>
  <!-- Resumen: where the plan stands, what would interrupt selling and its next
       step, then the meters and the site's own health. Rows and rules. -->
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
          <p v-if="plan.next" class="text-sm text-ink-gray-6">
            {{ plan.next }}
          </p>
        </div>
        <StatusChip :label="plan.status.label" :tone="plan.status.tone" />
      </div>
      <p
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
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { StatusChip } from '@/components/ui'
import {
  accountAlerts,
  healthRows,
  planView,
  trialTitle,
  usageRows,
  verdict,
  walletView,
} from './cuenta'

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  /** The next steps the page can open: activate, pay, topup, support, plans. */
  actions: { type: Array, default: () => [] },
})
defineEmits(['act'])

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
const health = computed(() => healthRows(data.value))
</script>
