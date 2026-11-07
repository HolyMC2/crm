<template>
  <!-- «Descuentos del proveedor» on a purchase: the supplier's active
       discounts (ERPNext applies them on every save of a draft) and a new one
       for this supplier. Only for workers who read discounts. -->
  <section
    v-if="discounts.can_read"
    class="px-4"
    aria-labelledby="orden-descuentos"
    data-testid="orden-descuentos"
  >
    <h2
      id="orden-descuentos"
      class="pb-1 text-base font-semibold text-ink-gray-9"
    >
      {{ __('Supplier discounts') }}
    </h2>
    <ul v-if="rules.length" class="divide-y divide-outline-gray-1">
      <li v-for="rule in rules" :key="rule.name">
        <RouterLink
          class="press flex min-h-14 w-full items-center gap-3 rounded-6 py-2 [@media(hover:hover)]:hover:bg-surface-gray-1"
          :to="ruleRoute(rule.name, back)"
          :data-descuento="rule.name"
        >
          <span
            class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
            aria-hidden="true"
          >
            <span class="lucide-badge-percent size-5" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="break-words text-base text-ink-gray-9">{{
              rule.title
            }}</span>
            <span class="break-words text-sm text-ink-gray-6">{{
              ruleSummary(rule, currency)
            }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
    <p v-else class="break-words text-base text-ink-gray-7">
      {{ __('This supplier has no active discounts.') }}
    </p>
    <div class="flex flex-wrap gap-x-4 pt-1">
      <RouterLink
        v-if="discounts.can_create && supplier"
        class="inline-flex min-h-11 items-center gap-1.5 text-base text-ink-blue-link underline"
        :to="ruleRoute('nuevo', { ...back, supplier })"
        data-testid="orden-descuento-nuevo"
      >
        {{ __('New discount', null, 'Descuentos') }}
      </RouterLink>
      <RouterLink
        class="inline-flex min-h-11 items-center text-base text-ink-blue-link underline"
        :to="{ name: 'CompraDescuentos', query: supplier ? { supplier } : {} }"
        >{{ __('All discounts') }}</RouterLink
      >
    </div>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { ruleRoute, ruleSummary } from '@/composables/useDescuentos'

const props = defineProps({
  // purchasing.order → discounts: { can_read, can_create, rules }
  discounts: { type: Object, default: () => ({}) },
  supplier: { type: String, default: '' },
  currency: { type: String, default: 'MXN' },
  // The purchase to come back to from a discount.
  returnTo: { type: String, default: '' },
})
const rules = computed(() => props.discounts.rules || [])
const back = computed(() =>
  props.returnTo
    ? { return_to: props.returnTo, return_label: __('the purchase') }
    : {},
)
</script>
