<template>
  <!-- «Sugerencias»: each model's level from what sold and what customers asked
       for without stock, covering the supplier's delivery days and the days
       between orders, with the tone mix of its sales. The owner ticks the ones
       to keep and «Usar» saves them; nothing else changes. -->
  <section :aria-label="__('Suggested levels', null, 'Niveles')">
    <EmptyState
      v-if="failed"
      role="alert"
      state="error"
      :title="__('Could not read the suggestions', null, 'Niveles')"
      :message="failed"
      :action="__('Retry', null, 'Compras')"
      @action="load"
    />
    <EmptyState
      v-else-if="loading"
      role="status"
      state="loading"
      :title="__('Reading sales and asks…', null, 'Niveles')"
    />
    <template v-else>
      <p
        v-for="g in data.groups"
        :key="g.item_group"
        class="mb-2 text-sm text-ink-gray-7"
      >
        <strong class="font-medium text-ink-gray-9">{{ g.item_group }}</strong>
        ·
        {{
          __(
            '{0} weeks of sales, {1} days of delivery ({2}) and {3} days between orders',
            [g.weeks, g.lead?.days, leadSource(g), g.cycle],
            'Niveles',
          )
        }}
      </p>
      <EmptyState
        v-if="!data.rows.length"
        :title="__('Nothing to suggest yet', null, 'Niveles')"
        :message="
          __(
            'Nothing of these types sold or was asked for in these weeks.',
            null,
            'Niveles',
          )
        "
      />
      <ul
        v-else
        class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
        data-testid="niveles-sugerencias"
      >
        <li
          v-for="row in data.rows"
          :key="suggestionKey(row)"
          class="flex items-start gap-3 px-3 py-2.5"
        >
          <input
            v-if="data.owner && canPick(row)"
            v-model="picked"
            type="checkbox"
            :value="suggestionKey(row)"
            class="mt-1 size-5 flex-none accent-[var(--muelle-accent)]"
            :aria-label="__('Use the level of {0}', [row.model], 'Niveles')"
          />
          <span v-else class="size-5 flex-none" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="flex items-baseline gap-2">
              <span class="min-w-0 flex-1 truncate text-base font-medium">{{
                row.model
              }}</span>
              <span
                class="flex-none rounded-full px-2 py-0.5 text-xs font-medium"
                :class="CHANGE_CLASS[row.change] || CHANGE_CLASS.igual"
                >{{ changeLabel(row.change) }}</span
              >
            </span>
            <span class="block text-sm text-ink-gray-8">
              {{
                row.target_qty
                  ? __(
                      'Fill up to {0}, order below {1}',
                      [row.target_qty, row.min_qty],
                      'Niveles',
                    )
                  : __('No sales: no level', null, 'Niveles')
              }}<template v-if="mixText(row.mix)">
                · {{ mixText(row.mix) }}</template
              >
            </span>
            <span class="block text-xs text-ink-gray-6">
              {{
                __(
                  'Sold {0}, asked for without stock {1}: {2} a week',
                  [row.sold, row.lost, row.per_week],
                  'Niveles',
                )
              }}<template v-if="row.current">
                ·
                {{
                  __(
                    'now {0}, below {1}',
                    [row.current.target_qty, row.current.min_qty],
                    'Niveles',
                  )
                }}</template
              >
            </span>
          </span>
        </li>
      </ul>
      <div
        v-if="data.owner && choices.length"
        class="mt-3 flex flex-wrap items-center justify-end gap-2"
      >
        <Button
          :label="
            picked.length === choices.length
              ? __('Pick none', null, 'Niveles')
              : __('Pick all', null, 'Niveles')
          "
          class="min-h-11 sm:min-h-8"
          @click="toggleAll"
        />
        <Button
          variant="solid"
          :label="__('Use {0}', [picked.length], 'Niveles')"
          class="min-h-11 sm:min-h-8"
          :disabled="!picked.length"
          :loading="busy"
          data-testid="niveles-usar"
          @click="apply"
        />
      </div>
      <p
        v-if="data.owner && choices.length && !picked.length"
        class="mt-1 text-right text-xs text-ink-gray-5"
      >
        {{ __('Tick the levels to keep.', null, 'Niveles') }}
      </p>
      <p v-if="!data.owner" class="mt-3 text-sm text-ink-gray-6">
        {{ __('The owner uses the suggestions.', null, 'Niveles') }}
      </p>
    </template>
  </section>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { EmptyState } from '@/components/ui'
import { comprasApi, problemOf } from '@/composables/useCompras'
import {
  applyPayload,
  mixText,
  pickable,
  suggestionKey,
} from '@/utils/comprasLoop'

const props = defineProps({
  group: { type: String, default: '' },
})
const emit = defineEmits(['saved'])

const API = 'doco.workspaces.niveles.'
const CHANGE_CLASS = {
  nuevo: 'bg-surface-blue-2 text-ink-blue-8',
  subir: 'bg-surface-amber-2 text-ink-amber-8',
  bajar: 'bg-surface-gray-2 text-ink-gray-8',
  mezcla: 'bg-surface-blue-2 text-ink-blue-8',
  quitar: 'bg-surface-red-2 text-ink-red-8',
  igual: 'bg-surface-gray-2 text-ink-gray-6',
}

const loading = ref(true)
const failed = ref('')
const busy = ref(false)
const data = ref({ groups: [], rows: [], owner: false })
const picked = ref([])
const choices = computed(() => pickable(data.value.rows))

function canPick(row) {
  return choices.value.includes(row)
}

function changeLabel(change) {
  return (
    {
      nuevo: __('New', null, 'Niveles'),
      subir: __('Raise', null, 'Niveles'),
      bajar: __('Lower', null, 'Niveles'),
      mezcla: __('New mix', null, 'Niveles'),
      quitar: __('No sales', null, 'Niveles'),
    }[change] || __('Same', null, 'Niveles')
  )
}

function leadSource(g) {
  return (
    {
      proveedor: __('the supplier’s', null, 'Niveles'),
      medido: __('measured', null, 'Niveles'),
    }[g.lead?.source] || __('default', null, 'Niveles')
  )
}

async function load() {
  loading.value = true
  failed.value = ''
  try {
    const out = await comprasApi(API + 'suggestions', {
      item_group: props.group || null,
    })
    data.value = { groups: [], rows: [], owner: false, ...out }
    // what changes is ticked; the owner unticks what they keep as it is
    picked.value = choices.value.map(suggestionKey)
  } catch (error) {
    failed.value = problemOf(error).detail
  } finally {
    loading.value = false
  }
}

function toggleAll() {
  picked.value =
    picked.value.length === choices.value.length
      ? []
      : choices.value.map(suggestionKey)
}

async function apply() {
  if (!picked.value.length) return
  busy.value = true
  try {
    const out = await comprasApi(API + 'suggestions_apply', {
      rows: applyPayload(data.value.rows, new Set(picked.value)),
    })
    toast.success(__('{0} levels saved', [out.saved?.length || 0], 'Niveles'))
    emit('saved', out)
    await load()
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    busy.value = false
  }
}

watch(() => props.group, load)
onMounted(load)
</script>
