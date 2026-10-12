<template>
  <article
    :id="`card-${cardKey}`"
    :data-testid="`resultados-card-${cardKey}`"
    :data-state="state"
    class="flex min-h-40 flex-col gap-2 rounded-xl border border-outline-gray-2 bg-surface-base p-4"
    :aria-busy="state === 'loading' ? 'true' : undefined"
  >
    <header class="flex items-center gap-2">
      <span
        :class="icon"
        class="size-4 shrink-0 text-ink-gray-6"
        aria-hidden="true"
      />
      <h2 class="min-w-0 flex-1 truncate text-sm font-medium text-ink-gray-7">
        {{ card?.label || cardTitle(cardKey) }}
      </h2>
      <span
        v-if="delta"
        data-testid="delta"
        class="rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
        :class="deltaClass"
        :title="compareText"
        >{{ delta.label }}</span
      >
    </header>

    <template v-if="state === 'loading'">
      <div class="h-8 w-32 animate-pulse rounded bg-surface-gray-2" />
      <div class="h-4 w-48 animate-pulse rounded bg-surface-gray-2" />
      <div class="h-4 w-40 animate-pulse rounded bg-surface-gray-2" />
    </template>

    <!-- Blocked or failed: the reason and a way forward, never a zero. -->
    <div
      v-else-if="state === 'blocked' || state === 'error'"
      role="status"
      data-testid="guard"
      class="flex flex-1 flex-col gap-2"
    >
      <p class="text-sm text-ink-gray-7">{{ card.blocked_reason }}</p>
      <div class="mt-auto flex flex-wrap gap-2">
        <Button
          v-if="state === 'error'"
          :label="__('Retry', null, CTX)"
          class="min-h-11"
          @click="$emit('retry', cardKey)"
        />
        <Button
          v-else
          :label="__('Copy access request')"
          class="min-h-11"
          @click="copy"
        />
      </div>
      <p v-if="copied" role="status" class="text-xs text-ink-gray-6">
        {{ copied }}
      </p>
    </div>

    <template v-else-if="state === 'ready'">
      <p class="text-2xl font-semibold tabular-nums text-ink-gray-9">
        {{ formatValue(card.value, card.format, currency) }}
        <span
          v-if="card.value_label"
          class="text-sm font-normal text-ink-gray-6"
          >{{ card.value_label }}</span
        >
      </p>
      <dl
        v-if="card.facts?.length"
        class="flex flex-wrap gap-x-4 gap-y-1 text-sm"
      >
        <div v-for="fact in card.facts" :key="fact.label" class="flex gap-1">
          <dt class="text-ink-gray-6">{{ fact.label }}</dt>
          <dd class="font-medium tabular-nums text-ink-gray-8">
            {{ formatValue(fact.value, fact.format, currency) }}
          </dd>
        </div>
      </dl>
      <p v-if="card.note" class="text-xs text-ink-gray-6">{{ card.note }}</p>
      <ul v-if="card.items?.length" class="space-y-0.5 text-sm">
        <li v-for="item in card.items" :key="item.label" class="flex gap-2">
          <component
            :is="item.href ? 'a' : 'span'"
            :href="item.href ? itemHref(item.href) : undefined"
            class="min-w-0 flex-1 truncate"
            :class="
              item.href ? 'text-ink-blue-link underline' : 'text-ink-gray-7'
            "
            >{{ item.label }}</component
          >
          <span
            class="tabular-nums"
            :class="item.value < 0 ? 'text-ink-red-7' : 'text-ink-gray-8'"
            >{{ formatValue(item.value, item.format, currency) }}</span
          >
        </li>
      </ul>
      <div class="mt-auto flex flex-col gap-1 pt-1">
        <a
          v-if="attentionHref"
          :href="attentionHref"
          data-testid="attention"
          class="flex min-h-11 items-center gap-2 rounded-lg bg-surface-amber-1 px-3 text-sm font-medium text-ink-amber-8 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          @click="follow($event, attentionHref)"
        >
          <span
            class="lucide-circle-alert size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">{{ card.attention.label }}</span>
          <span
            class="lucide-chevron-right size-4 shrink-0"
            aria-hidden="true"
          />
        </a>
        <a
          v-if="drillLink"
          :href="drillLink"
          data-testid="drill"
          class="inline-flex min-h-11 items-center text-sm font-medium text-ink-blue-link underline"
          @click="follow($event, drillLink)"
          >{{ card.drill.label || __('See documents') }}</a
        >
      </div>
    </template>

    <p v-else class="text-sm text-ink-gray-6" data-testid="empty">
      {{ card?.note || __('Nothing to show for this period yet.') }}
    </p>
  </article>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import {
  CTX,
  accessRequest,
  cardState,
  cardTitle,
  compareLabel,
  deltaChip,
  drillHref,
  formatValue,
  routerPath,
} from '@/composables/useResultados'

const ICONS = {
  ventas: 'lucide-receipt',
  margen: 'lucide-percent',
  efectivo: 'lucide-wallet',
  por_cobrar: 'lucide-hand-coins',
  reparaciones: 'lucide-wrench',
}

const props = defineProps({
  cardKey: { type: String, required: true },
  card: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  compara: { type: String, default: 'anterior' },
  currency: { type: String, default: '' },
  back: { type: String, default: '' },
})
defineEmits(['retry'])
const router = useRouter()
const copied = ref('')

const state = computed(() => cardState(props.card, { loading: props.loading }))
const icon = computed(() => ICONS[props.cardKey] || 'lucide-chart-column')
const delta = computed(() =>
  state.value === 'ready' ? deltaChip(props.card, props.compara) : null,
)
const compareText = computed(() => compareLabel(props.compara))
const deltaClass = computed(
  () =>
    ({
      up: 'bg-surface-green-2 text-ink-green-8',
      down: 'bg-surface-red-2 text-ink-red-8',
      flat: 'bg-surface-gray-2 text-ink-gray-7',
    })[delta.value?.tone] || '',
)
const attentionHref = computed(() =>
  drillHref(props.card?.attention?.drill, props.back),
)
const drillLink = computed(() => drillHref(props.card?.drill, props.back))

function itemHref(href) {
  return drillHref({ href }, props.back) || href
}
function follow(event, href) {
  const local = routerPath(href)
  if (!local || event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  router.push(local)
}
async function copy() {
  const text = accessRequest(props.card)
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}
</script>
