<template>
  <!-- The split's right pane before a discount is open: every discount the
       list on the left holds side by side, how much it takes off, on what,
       for whom, from how much and until when, so a buyer compares them
       without opening each. A discount's name opens it beside the list. -->
  <div
    class="resumen mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8"
    data-testid="descuentos-resumen"
  >
    <div class="flex items-center gap-3">
      <span
        class="flex size-12 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
        aria-hidden="true"
      >
        <span class="lucide-badge-percent size-6" />
      </span>
      <div class="min-w-0">
        <h2
          class="title-face truncate text-2xl font-semibold leading-tight text-ink-gray-9"
        >
          {{ summary.title }}
        </h2>
        <p class="text-base text-ink-gray-6">{{ countLine }}</p>
      </div>
    </div>

    <p
      v-if="summary.loaded && !summary.rows.length"
      class="text-base text-ink-gray-6"
    >
      {{
        __(
          'A supplier discount takes a % or an amount off what you buy from them; it applies on every purchase you save.',
        )
      }}
    </p>
    <table
      v-else-if="summary.rows.length"
      class="w-full border-collapse text-left text-base"
    >
      <thead>
        <tr class="whitespace-nowrap text-sm text-ink-gray-6">
          <th scope="col" class="pb-2 pr-4 font-medium">
            {{ __('Discount', null, 'Descuentos') }}
          </th>
          <th scope="col" class="pb-2 pr-4 text-right font-medium">
            {{ __('How much', null, 'Descuentos') }}
          </th>
          <th scope="col" class="resumen-ancho pb-2 pr-4 font-medium">
            {{ __('On what', null, 'Descuentos') }}
          </th>
          <th scope="col" class="resumen-ancho pb-2 pr-4 font-medium">
            {{ __('For', null, 'Descuentos') }}
          </th>
          <th scope="col" class="resumen-ancho pb-2 font-medium">
            {{ __('When it applies', null, 'Descuentos') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="rule in summary.rows"
          :key="rule.name"
          class="border-t border-outline-gray-1"
          :data-resumen-descuento="rule.name"
        >
          <th scope="row" class="py-2 pr-4 align-top font-medium">
            <RouterLink
              :to="summary.rowTo(rule.name)"
              class="text-ink-gray-9 underline-offset-2 hover:underline"
              >{{ rule.title }}</RouterLink
            >
            <span
              v-if="rule.state !== 'activo'"
              class="block text-sm font-normal text-ink-gray-6"
              >{{ stateChip(rule.state).label }}</span
            >
            <span
              class="resumen-angosto block text-sm font-normal text-ink-gray-6"
              >{{ ruleLine(rule) }}</span
            >
          </th>
          <td
            class="num whitespace-nowrap py-2 pr-4 text-right align-top text-ink-gray-9"
          >
            {{ discountFigure(rule.discount, rule.currency || 'MXN') }}
          </td>
          <td class="resumen-ancho py-2 pr-4 align-top text-ink-gray-8">
            {{ capital(whatText(rule.what)) }}
          </td>
          <td class="resumen-ancho py-2 pr-4 align-top text-ink-gray-8">
            {{ whoName(rule.who) }}
          </td>
          <td class="resumen-ancho py-2 align-top text-ink-gray-7">
            {{ capital(conditionsText(rule, rule.currency || 'MXN')) || '' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import {
  conditionsText,
  discountFigure,
  ruleLine,
  stateChip,
  whatText,
  whoName,
} from '@/composables/useDescuentos'

const props = defineProps({ summary: { type: Object, required: true } })

const capital = (text) =>
  text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : ''
const countLine = computed(() => {
  const n = props.summary.rows.length
  if (!props.summary.loaded) return __('Loading discounts…')
  return n === 1
    ? __('1 discount. Pick it to open it.')
    : __('{0} discounts. Pick one to open it.', [n])
})
</script>
<style scoped>
/* A narrow pane (1024 px) keeps the name and the figure; what, for whom
   and when go in one line under the name. */
.resumen {
  container-type: inline-size;
}
@container (max-width: 32rem) {
  .resumen-ancho {
    display: none;
  }
}
@container (min-width: 32rem) {
  .resumen-angosto {
    display: none;
  }
}
</style>
