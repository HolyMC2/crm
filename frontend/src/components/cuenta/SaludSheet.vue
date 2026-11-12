<template>
  <!-- The detail of «Salud de tu sistema»: the status, the 30 days as bars
       with a legend that counts them, the speed, each failure with when it
       started (the site's clock) and how long it lasted, then how many red
       days had no notice (so «Sin fallas» never sits under a red bar),
       storage, the next planned maintenance and what to review, each with the
       button that opens its screen. Sections under rules; the buttons are the
       only actions. -->
  <BottomSheet
    :open="open"
    :title="__('Your system’s health', null, 'Cuenta')"
    :subtitle="__('Last {0} days', [view.windowDays], 'Cuenta')"
    @update:open="(value) => !value && $emit('close')"
  >
    <div
      class="divide-y divide-outline-gray-1 pb-2"
      data-testid="salud-detalle"
    >
      <section v-if="view.status" class="pb-4">
        <p
          class="flex items-center gap-2 text-lg font-semibold"
          :class="INK[view.status.tone]"
        >
          <span
            :class="ICON[view.status.tone]"
            class="size-5 flex-none"
            aria-hidden="true"
          />
          {{ view.status.text }}
        </p>
        <p v-if="view.status.sub" class="pt-1 text-base text-ink-gray-7">
          {{ view.status.sub }}
        </p>
      </section>

      <section class="py-4" :aria-label="__('Availability', null, 'Cuenta')">
        <p class="text-base font-medium text-ink-gray-9">
          {{ view.availability.text }}
        </p>
        <p v-if="view.availability.sub" class="text-sm text-ink-gray-6">
          {{ view.availability.sub }}
        </p>
        <SaludDias
          class="mt-3"
          large
          :days="view.days"
          :first="view.first"
          :summary="view.summary"
        />
        <ul
          class="mt-3 flex flex-wrap gap-x-4 gap-y-1"
          data-testid="salud-leyenda"
        >
          <li
            v-for="item in view.counts"
            :key="item.state"
            class="flex items-center gap-1.5 text-sm text-ink-gray-7"
          >
            <span
              class="inline-block w-2.5 flex-none rounded-sm"
              :class="SWATCH[item.state]"
              aria-hidden="true"
            />
            {{ item.word }}
            <span class="num text-ink-gray-9">{{ item.count }}</span>
          </li>
        </ul>
      </section>

      <section class="py-4" :aria-label="__('Speed', null, 'Cuenta')">
        <p class="text-base font-medium text-ink-gray-9">
          {{ view.speed.text }}
        </p>
        <p v-if="view.speed.sub" class="text-sm text-ink-gray-6">
          {{ view.speed.sub }}
        </p>
      </section>

      <section v-if="view.tracked" class="py-4" aria-labelledby="salud-fallas">
        <h3
          id="salud-fallas"
          class="pb-1 text-sm font-semibold text-ink-gray-7"
        >
          {{ __('Failures in the last {0} days', [view.windowDays], 'Cuenta') }}
        </h3>
        <ul
          v-if="view.failures.length"
          class="divide-y divide-outline-gray-1"
          data-testid="salud-fallas"
        >
          <li
            v-for="row in view.failures"
            :key="row.id"
            class="flex items-start gap-3 py-2.5"
          >
            <span
              :class="FAILURE_ICON[row.tone]"
              class="mt-0.5 size-5 flex-none"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="text-base text-ink-gray-9">{{ row.title }}</p>
              <p v-if="row.when" class="text-sm text-ink-gray-7">
                {{ row.when }}
              </p>
              <p
                v-if="row.lasted"
                class="text-sm"
                :class="row.open ? INK[row.tone] : 'text-ink-gray-6'"
              >
                {{ row.lasted }}
              </p>
            </div>
          </li>
        </ul>
        <p
          v-if="view.quietFailures"
          class="text-base text-ink-gray-7"
          :class="{ 'pt-2': view.failures.length }"
          data-testid="salud-fallas-sin-aviso"
        >
          {{ view.quietFailures }}
        </p>
        <p v-else-if="!view.failures.length" class="text-base text-ink-gray-7">
          {{ __('There were no failures.', null, 'Cuenta') }}
        </p>
      </section>

      <section
        v-if="view.storage"
        class="py-4"
        data-testid="salud-almacenamiento"
      >
        <div class="flex items-baseline gap-3">
          <span class="min-w-0 flex-1 text-base text-ink-gray-8">{{
            __('Storage', null, 'Cuenta')
          }}</span>
          <span
            class="num shrink-0 text-base"
            :class="view.storage.warn ? 'text-ink-amber-8' : 'text-ink-gray-9'"
            >{{ view.storage.text }}</span
          >
        </div>
        <span
          v-if="view.storage.pct != null"
          role="progressbar"
          :aria-label="__('Storage', null, 'Cuenta')"
          :aria-valuenow="view.storage.pct"
          aria-valuemin="0"
          aria-valuemax="100"
          class="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-gray-2"
        >
          <span
            class="h-full rounded-full"
            :class="
              view.storage.warn ? 'bg-surface-amber-5' : 'bg-surface-gray-7'
            "
            :style="{ width: view.storage.pct + '%' }"
          />
        </span>
      </section>

      <section
        v-if="view.maintenance"
        class="flex items-start gap-3 py-4"
        data-testid="salud-mantenimiento"
      >
        <span
          class="lucide-calendar-clock mt-0.5 size-5 flex-none text-ink-gray-6"
          aria-hidden="true"
        />
        <p class="min-w-0 flex-1 text-base text-ink-gray-8">
          {{ view.maintenance }}
        </p>
      </section>

      <section class="pt-4" aria-labelledby="salud-revisar">
        <h3
          id="salud-revisar"
          class="pb-1 text-sm font-semibold text-ink-gray-7"
        >
          {{ __('To review', null, 'Cuenta') }}
        </h3>
        <ul
          v-if="view.findings.length"
          class="divide-y divide-outline-gray-1"
          data-testid="salud-hallazgos"
        >
          <li
            v-for="row in view.findings"
            :key="row.key"
            class="flex items-start gap-3 py-3"
            :data-act="row.act"
          >
            <span
              :class="
                row.level === 'bad'
                  ? 'lucide-circle-alert text-ink-red-7'
                  : 'lucide-triangle-alert text-ink-amber-8'
              "
              class="mt-3 size-5 flex-none"
              aria-hidden="true"
            />
            <!-- On a narrow phone the button drops under its sentence, in the
                 sentence's column; the sentence keeps the button's height, so
                 the icon sits on its first line either way. -->
            <div
              class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2"
            >
              <p
                class="flex min-h-11 min-w-0 flex-1 basis-44 items-center text-base text-ink-gray-8"
              >
                {{ row.text }}
              </p>
              <Button
                v-if="actions.includes(row.act)"
                variant="subtle"
                class="min-h-11"
                :label="row.cta"
                :disabled="row.act === 'topup' && blocked"
                @click="$emit('act', row.act)"
              />
            </div>
          </li>
        </ul>
        <p v-else class="text-base text-ink-gray-7">
          {{ __('Nothing to review.', null, 'Cuenta') }}
        </p>
        <p
          v-if="blocked && view.findings.some((row) => row.act === 'topup')"
          class="pt-1 text-sm text-ink-gray-6"
          role="status"
        >
          {{ blockedReason }}
        </p>
      </section>
    </div>
  </BottomSheet>
</template>
<script setup>
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import SaludDias from './SaludDias.vue'

defineProps({
  open: { type: Boolean, default: false },
  /** salud.healthView. */
  view: { type: Object, required: true },
  /** The next steps the page can open. */
  actions: { type: Array, default: () => [] },
  /** Payments are on hold: «Recargar» waits, with the page's reason beside it. */
  blocked: { type: Boolean, default: false },
  blockedReason: { type: String, default: '' },
})
defineEmits(['close', 'act'])

const INK = {
  ok: 'text-ink-gray-9',
  warn: 'text-ink-amber-8',
  bad: 'text-ink-red-7',
}
const ICON = {
  ok: 'lucide-circle-check',
  warn: 'lucide-triangle-alert',
  bad: 'lucide-circle-alert',
}
// A failure open now reads like the status line above it; a fixed one is grey.
const FAILURE_ICON = {
  ok: 'lucide-circle-check text-ink-gray-6',
  warn: 'lucide-triangle-alert text-ink-amber-8',
  bad: 'lucide-circle-alert text-ink-red-7',
}
// The legend's swatches: the strip's own steps, so each word names its bar.
const SWATCH = {
  ok: 'h-3 bg-surface-green-6 dark:bg-surface-green-9',
  slow: 'h-3 bg-surface-amber-6 dark:bg-surface-amber-9',
  down: 'h-3 bg-surface-red-6 dark:bg-surface-red-8',
  none: 'h-1.5 border border-outline-gray-3',
}
</script>
