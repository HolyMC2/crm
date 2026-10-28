<template>
  <!-- «Abierto»: what the chat left open, whatever conversation it came from.
       Captures reopen their review (chat ones too); a waiting proposal is
       applied or declined here, re-planned as the worker now (doco
       herramientas.api), and its receipt stays on top. -->
  <div
    class="space-y-4 py-2"
    :class="
      docked ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4' : ''
    "
    data-testid="assistant-open-view"
  >
    <ul
      v-if="receipts.length"
      class="space-y-2"
      aria-live="polite"
      data-testid="assistant-receipts"
    >
      <li
        v-for="receipt in receipts"
        :key="receipt.name"
        class="rounded-7 bg-surface-gray-1 p-3"
      >
        <p class="text-xs font-medium text-ink-gray-6">
          {{ receipt.summary }}
        </p>
        <AssistantProse :text="receipt.text" @navigate="$emit('navigate')" />
      </li>
    </ul>

    <p
      v-if="!sessions.work.count && !sessions.error"
      class="pt-4 text-center text-sm text-ink-gray-6"
      data-testid="assistant-open-empty"
    >
      {{
        __(
          'Nothing open. Captures you did not finish and changes waiting for your yes show up here, even after a new conversation.',
        )
      }}
    </p>

    <section v-if="sessions.work.captures.length">
      <h3 class="mb-1 text-xs font-semibold text-ink-gray-6">
        {{ __('Captures to finish ({0})', [sessions.work.captures.length]) }}
      </h3>
      <ul class="divide-y divide-outline-gray-1">
        <li v-for="row in sessions.work.captures" :key="row.name">
          <RouterLink
            :to="reviewRoute(row)"
            class="flex min-h-11 items-center gap-3 py-2 text-sm hover:bg-surface-gray-2"
            :data-captura="row.name"
            @click="$emit('navigate')"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-ink-gray-9">
                {{ row.supplier || row.file_name || row.name }}
              </span>
              <span class="block truncate text-ink-gray-6">
                {{ captureLine(row) }}
              </span>
            </span>
            <span
              v-if="row.total"
              class="shrink-0 tabular-nums text-ink-gray-8"
              >{{ money(row.total, row.currency) }}</span
            >
            <Badge
              class="shrink-0"
              :theme="pendingCaptureStatus(row).theme"
              :label="pendingCaptureStatus(row).label"
            />
          </RouterLink>
        </li>
      </ul>
    </section>

    <section v-if="sessions.work.proposals.length">
      <h3 class="mb-1 text-xs font-semibold text-ink-gray-6">
        {{ __('Waiting for your yes ({0})', [sessions.work.proposals.length]) }}
      </h3>
      <ul class="space-y-2">
        <li
          v-for="row in sessions.work.proposals"
          :key="row.name"
          class="rounded-7 border border-outline-gray-2 p-3"
          :data-accion="row.name"
        >
          <p class="whitespace-pre-line break-words text-base text-ink-gray-9">
            {{ row.summary }}
          </p>
          <p class="mt-1 text-xs text-ink-gray-6">
            {{ relativeTime(row.created) }}
          </p>
          <div class="mt-2 flex flex-wrap items-center justify-end gap-2">
            <span
              v-if="state(row) === 'confirm'"
              class="mr-auto text-sm text-ink-gray-7"
              >{{ __('Apply it now?') }}</span
            >
            <button
              v-if="state(row) === 'confirm'"
              type="button"
              class="min-h-11 rounded-full px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2"
              @click="keepProposal(row.name)"
            >
              {{ __('Not yet') }}
            </button>
            <button
              v-else
              type="button"
              class="min-h-11 rounded-full px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
              :disabled="Boolean(state(row))"
              data-testid="accion-reject"
              @click="rejectProposal(row.name)"
            >
              {{
                state(row) === 'rejecting' ? __('Declining…') : __('Decline')
              }}
            </button>
            <button
              type="button"
              class="min-h-11 rounded-full bg-surface-gray-10 px-5 text-sm font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50"
              :disabled="
                state(row) === 'applying' || state(row) === 'rejecting'
              "
              data-testid="accion-apply"
              @click="applyProposal(row.name)"
            >
              {{
                state(row) === 'applying'
                  ? __('Applying…')
                  : state(row) === 'confirm'
                    ? __('Yes, apply')
                    : __('Apply')
              }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <p v-if="sessions.error" role="alert" class="text-sm text-ink-red-7">
      {{ sessions.error }}
    </p>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from 'frappe-ui'
import { capturaRoute, pendingCaptureStatus } from '@/composables/useCaptura'
import { money } from '@/composables/useCompras'
import { relativeTime } from '@/utils/display'
import AssistantProse from './AssistantProse.vue'
import {
  applyProposal,
  keepProposal,
  rejectProposal,
  sessions,
} from './assistantSessions'

defineProps({ docked: { type: Boolean, default: false } })
defineEmits(['navigate'])

const route = useRoute()

const receipts = computed(() =>
  Object.entries(sessions.receipts).map(([name, r]) => ({ name, ...r })),
)

function state(row) {
  return sessions.proposals[row.name] || ''
}

// The review comes back to the screen the sheet is over.
function reviewRoute(row) {
  return capturaRoute(row.name, {
    doctype: row.doctype,
    returnTo: '/crm' + route.fullPath,
  })
}

function captureLine(row) {
  return [
    row.doc_label,
    row.invoice_no,
    row.source === 'chat' ? __('from the chat') : '',
    relativeTime(row.received_at),
  ]
    .filter(Boolean)
    .join(' · ')
}
</script>
