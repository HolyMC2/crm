<template>
  <!-- The split's right pane before a rule is open: every rule the list on
       the left holds side by side, each range with what it charges and the
       account it goes to, so a buyer compares them without opening each.
       A rule's name opens it beside the list. -->
  <div
    class="resumen mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8"
    data-testid="envios-resumen"
  >
    <div class="flex items-center gap-3">
      <span
        class="flex size-12 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
        aria-hidden="true"
      >
        <span class="lucide-truck size-6" />
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
          'A shipping rule adds what the delivery costs to a purchase: a fixed amount, or by the purchase’s amount or weight.',
        )
      }}
    </p>
    <table
      v-else-if="summary.rows.length"
      class="w-full border-collapse text-left text-base"
    >
      <thead>
        <tr class="text-sm text-ink-gray-6">
          <th scope="col" class="pb-2 pr-4 font-medium">
            {{ __('Rule', null, 'Envios') }}
          </th>
          <th scope="col" class="pb-2 pr-4 font-medium">
            {{ __('Range', null, 'Envios') }}
          </th>
          <th scope="col" class="pb-2 pr-4 text-right font-medium">
            {{ __('Charges', null, 'Envios') }}
          </th>
          <th scope="col" class="resumen-ancho pb-2 font-medium">
            {{ __('Account', null, 'Envios') }}
          </th>
        </tr>
      </thead>
      <tbody
        v-for="rule in summary.rows"
        :key="rule.name"
        class="border-t border-outline-gray-1"
        :data-resumen-envio="rule.name"
      >
        <tr v-for="(range, index) in rangeRows(rule)" :key="index">
          <th
            v-if="!index"
            scope="rowgroup"
            :rowspan="rangeRows(rule).length"
            class="py-2 pr-4 align-top font-medium"
          >
            <RouterLink
              :to="summary.rowTo(rule.name)"
              class="text-ink-gray-9 underline-offset-2 hover:underline"
              >{{ rule.label }}</RouterLink
            >
            <span
              v-if="rule.state !== 'activo'"
              class="block text-sm font-normal text-ink-gray-6"
              >{{ stateChip(rule.state).label }}</span
            >
            <span
              v-if="rule.account?.label"
              class="resumen-angosto block text-sm font-normal text-ink-gray-6"
              >{{ rule.account.label }}</span
            >
          </th>
          <td class="py-2 pr-4 align-top text-ink-gray-8">
            {{ range.label }}
          </td>
          <td
            class="num whitespace-nowrap py-2 pr-4 text-right align-top text-ink-gray-9"
          >
            {{ range.charge }}
          </td>
          <td
            v-if="!index"
            :rowspan="rangeRows(rule).length"
            class="resumen-ancho py-2 align-top text-ink-gray-7"
          >
            {{ rule.account?.label || '' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { rangeRows, stateChip } from '@/composables/useEnvios'

const props = defineProps({ summary: { type: Object, required: true } })

const countLine = computed(() => {
  const n = props.summary.rows.length
  if (!props.summary.loaded) return __('Loading shipping rules…')
  return n === 1
    ? __('1 shipping rule. Pick it to open it.')
    : __('{0} shipping rules. Pick one to open it.', [n])
})
</script>
<style scoped>
/* A narrow pane (1024 px) names the account under the rule instead. */
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
