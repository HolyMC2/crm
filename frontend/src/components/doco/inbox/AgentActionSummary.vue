<!--
  What approving a customer-agent row also does, above its text: the hold the customer
  asked for (doco_marketing customer_holds: «Apartar» places it) or the payment link the
  approver mints (customer_payments). Nothing for a plain reply.
-->
<template>
  <div
    v-if="hold"
    class="mb-1.5 rounded-5 bg-surface-gray-2 px-2.5 py-2 text-ink-gray-8"
    data-testid="hold-summary"
  >
    <div class="flex items-baseline gap-2">
      <span
        class="lucide-shopping-bag size-3.5 flex-none self-center text-ink-gray-6"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
        {{ hold.what }}
      </span>
      <span v-if="hold.price" class="num flex-none text-[12px]">
        {{ hold.price }}
      </span>
    </div>
    <p class="mt-0.5 pl-5 text-[11.5px] text-ink-gray-7">{{ hold.who }}</p>
  </div>
  <p
    v-else-if="link"
    class="mb-1 flex items-center gap-1.5 text-xs text-ink-gray-7"
    data-testid="link-summary"
  >
    <span class="lucide-link size-3.5 flex-none" aria-hidden="true" />
    {{ link }}
  </p>
</template>

<script setup>
import { computed } from 'vue'
import { holdLines, isHold, linkLine } from '@/components/doco/inbox/agentDraft'

const props = defineProps({ row: { type: Object, required: true } })
const hold = computed(() =>
  isHold(props.row) ? holdLines(props.row.action) : null,
)
const link = computed(() => linkLine(props.row.action))
</script>
