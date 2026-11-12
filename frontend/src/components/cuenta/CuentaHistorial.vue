<template>
  <!-- «Historial» (capability «history»): every plan, add-on, app and seat
       change, cancel and resume, newest first. Boat's title, when in the
       site's clock, and a quiet line with its state and what it costs. Rows
       and rules; «Cargar más» while Boat has more. -->
  <section aria-labelledby="cuenta-historial" data-testid="cuenta-historial">
    <h2
      id="cuenta-historial"
      class="title-face pb-1 text-xl font-semibold text-ink-gray-9"
    >
      {{ __('History', null, 'Cuenta') }}
    </h2>
    <p class="pb-2 text-sm text-ink-gray-6">
      {{
        __(
          'What was bought or changed in your account, newest first.',
          null,
          'Cuenta',
        )
      }}
    </p>
    <ul
      v-if="rows.length"
      class="divide-y divide-outline-gray-1"
      data-testid="historial-filas"
    >
      <li v-for="row in rows" :key="row.key" class="py-3">
        <p class="text-base font-medium text-ink-gray-9 [text-wrap:pretty]">
          {{ row.title }}
        </p>
        <p v-if="row.when" class="text-sm text-ink-gray-6">{{ row.when }}</p>
        <!-- A change that did not go through says so in red; its price stays quiet. -->
        <p
          v-for="(line, index) in row.details"
          :key="line"
          class="text-sm [text-wrap:pretty]"
          :class="row.failed && !index ? 'text-ink-red-7' : 'text-ink-gray-7'"
          :data-failed="row.failed && !index ? '' : undefined"
        >
          {{ line }}
        </p>
      </li>
    </ul>
    <p
      v-else-if="history.loaded && !history.error"
      class="py-3 text-base text-ink-gray-7"
    >
      {{ __('No changes yet.', null, 'Cuenta') }}
    </p>
    <p
      v-else-if="history.busy"
      class="py-3 text-base text-ink-gray-6"
      role="status"
    >
      {{ __('Loading your history…', null, 'Cuenta') }}
    </p>
    <div v-if="history.error" role="alert" class="space-y-2 py-2">
      <p class="text-sm text-ink-red-7">{{ history.error }}</p>
      <Button
        class="min-h-11"
        :label="__('Try again', null, 'Cuenta')"
        :loading="history.busy"
        @click="history.load({ reset: !history.loaded })"
      />
    </div>
    <Button
      v-if="history.loaded && !history.done && !history.error"
      variant="ghost"
      class="mt-2 min-h-11 w-full"
      :loading="history.busy"
      :label="__('Load more', null, 'Cuenta')"
      data-testid="historial-mas"
      @click="history.load()"
    />
  </section>
</template>
<script setup>
import { computed, reactive, watch } from 'vue'
import { Button } from 'frappe-ui'
import { historyRows } from './facturaDetalle'
import { createHistory } from './historial'

const props = defineProps({
  /** The page's payment door (pagos.js createPagos): a new plan read reloads the list. */
  door: { type: Object, required: true },
})

// reactive() unwraps the pager's refs for the template.
const history = reactive(createHistory())
const rows = computed(() => historyRows(history.events))
// The first page with the tab, and again after «Revisar estado» or a pull.
watch(
  () => props.door.boot.value,
  (boot) => {
    if (boot) history.load({ reset: true })
  },
  { immediate: true },
)
</script>
