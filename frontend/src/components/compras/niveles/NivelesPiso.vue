<template>
  <!-- The floor: what sits over its level and stopped selling («Sobra»), the
       stores short of their share and the ones over it («Mover»), the displays
       to refill from their backroom («Reponer exhibición») and the models whose
       numbers look wrong («Contar»). A move or a refill is a pick task in
       Escáner whose end is a draft transfer the owner validates; a count goes
       through the conteo engine. -->
  <section :aria-label="__('The floor', null, 'Niveles')">
    <EmptyState
      v-if="failed"
      role="alert"
      state="error"
      :title="__('Could not read the floor', null, 'Niveles')"
      :message="failed"
      :action="__('Retry', null, 'Compras')"
      @action="load"
    />
    <EmptyState
      v-else-if="loading"
      role="status"
      state="loading"
      :title="__('Reading stores and displays…', null, 'Niveles')"
    />
    <template v-else>
      <p
        v-if="!data.scanner"
        class="mb-4 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
      >
        {{
          __(
            'This site has no Escáner: moves and counts are done by hand with a stock transfer in Inventario.',
            null,
            'Niveles',
          )
        }}
      </p>

      <!-- Mover -->
      <h2 class="title-face text-lg font-semibold text-ink-gray-9">
        {{ __('Move between stores', null, 'Niveles') }}
      </h2>
      <p v-if="!data.transfers.length" class="mb-4 text-sm text-ink-gray-6">
        {{
          __(
            'No store is short of its share while another has too many.',
            null,
            'Niveles',
          )
        }}
      </p>
      <ul
        v-else
        class="mb-6 mt-2 divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
        data-testid="niveles-mover"
      >
        <li
          v-for="move in data.transfers"
          :key="move.model + move.source + move.target"
          class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium">{{
              __(
                '{0} {1} from {2} to {3}',
                [move.qty, move.model, move.source, move.target],
                'Niveles',
              )
            }}</span>
            <span class="block text-xs text-ink-gray-6">{{
              linesText(move.lines)
            }}</span>
          </span>
          <Button
            v-if="data.owner && data.scanner"
            :label="__('Create transfer', null, 'Niveles')"
            class="min-h-11 flex-none sm:min-h-8"
            :loading="busy === key(move)"
            @click="createMove(move, move.source, move.target)"
          />
        </li>
      </ul>

      <!-- Reponer exhibición -->
      <h2 class="title-face text-lg font-semibold text-ink-gray-9">
        {{ __('Refill the display', null, 'Niveles') }}
      </h2>
      <p v-if="!data.exhibitions.length" class="mb-4 text-sm text-ink-gray-6">
        {{
          __(
            'Say which store is a display and which backroom fills it in Settings.',
            null,
            'Niveles',
          )
        }}
        <button
          v-if="data.owner"
          type="button"
          class="press font-medium text-ink-gray-9 underline"
          @click="emit('settings')"
        >
          {{ __('Open settings', null, 'Niveles') }}
        </button>
      </p>
      <p v-else-if="!data.display.length" class="mb-4 text-sm text-ink-gray-6">
        {{ __('Every display is at its level.', null, 'Niveles') }}
      </p>
      <ul
        v-else
        class="mb-6 mt-2 divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
        data-testid="niveles-reponer"
      >
        <li
          v-for="wall in data.display"
          :key="wall.display + wall.model"
          class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium">{{
              __(
                '{0}: {1} missing in {2}',
                [wall.model, wall.need, wall.display],
                'Niveles',
              )
            }}</span>
            <span v-if="wall.qty" class="block text-xs text-ink-gray-6">{{
              __(
                'Bring {0} from {1}: {2}',
                [wall.qty, wall.backroom, linesText(wall.lines)],
                'Niveles',
              )
            }}</span>
            <span
              v-if="wall.short > 0"
              class="block text-xs text-ink-amber-8"
              >{{
                __(
                  '{0} are not in the backroom either: they go on the buy plan.',
                  [wall.short],
                  'Niveles',
                )
              }}</span
            >
          </span>
          <Button
            v-if="data.owner && data.scanner && wall.qty"
            :label="__('Create refill', null, 'Niveles')"
            class="min-h-11 flex-none sm:min-h-8"
            :loading="busy === key(wall)"
            @click="createMove(wall, wall.backroom, wall.display)"
          />
        </li>
      </ul>

      <!-- Sobra -->
      <h2 class="title-face text-lg font-semibold text-ink-gray-9">
        {{ __('Over its level', null, 'Niveles') }}
      </h2>
      <p class="mb-2 text-sm text-ink-gray-6">
        {{
          __(
            'Over its level and unsold for {0} days: move it to a store that is short, bundle it, or mark it down.',
            [data.surplus_days],
            'Niveles',
          )
        }}
      </p>
      <p v-if="!data.surplus.length" class="mb-4 text-sm text-ink-gray-6">
        {{ __('Nothing sits over its level.', null, 'Niveles') }}
      </p>
      <ul
        v-else
        class="mb-6 divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
        data-testid="niveles-sobra"
      >
        <li
          v-for="row in data.surplus"
          :key="row.model + row.warehouse"
          class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium">{{
              __(
                '{0}: {1} over ({2} of {3})',
                [row.model, row.extra, row.have, row.target],
                'Niveles',
              )
            }}</span>
            <span class="block text-xs text-ink-gray-6">{{
              [
                row.item_group,
                row.warehouse,
                row.last_sold
                  ? __('last sold {0}', [formatDate(row.last_sold)], 'Niveles')
                  : __('never sold', null, 'Niveles'),
              ]
                .filter(Boolean)
                .join(' · ')
            }}</span>
          </span>
          <Button
            v-if="row.items?.length"
            :label="__('Mark down', null, 'Niveles')"
            class="min-h-11 flex-none sm:min-h-8"
            @click="router.push({ name: 'Precios', query: pricesQuery(row) })"
          />
        </li>
      </ul>

      <!-- Contar -->
      <h2 class="title-face text-lg font-semibold text-ink-gray-9">
        {{ __('Count', null, 'Niveles') }}
      </h2>
      <p v-if="!data.counts.length" class="text-sm text-ink-gray-6">
        {{ __('No number looks wrong.', null, 'Niveles') }}
      </p>
      <ul
        v-else
        class="mt-2 divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
        data-testid="niveles-contar"
      >
        <li
          v-for="row in data.counts"
          :key="row.model + row.warehouse"
          class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium">{{
              __('{0} in {1}', [row.model, row.warehouse], 'Niveles')
            }}</span>
            <span class="block text-xs text-ink-gray-6">{{ row.reason }}</span>
          </span>
          <Button
            v-if="data.owner && data.scanner"
            :label="__('Count it', null, 'Niveles')"
            class="min-h-11 flex-none sm:min-h-8"
            @click="openCount(row)"
          />
        </li>
      </ul>
    </template>

    <BottomSheet
      v-if="countMounted"
      v-model:open="countOpen"
      :title="__('Count {0}', [counting?.model || ''], 'Niveles')"
      :subtitle="counting?.warehouse || ''"
      :dismissible="!busy"
    >
      <div class="space-y-3 pb-4">
        <p class="text-sm text-ink-gray-7">
          {{
            __(
              'Every style and colour of the model in this store, as one count in Escáner. It goes to the count approvals.',
              null,
              'Niveles',
            )
          }}
        </p>
        <p v-if="!workers.length" class="text-sm text-ink-amber-8">
          {{
            __(
              'Nobody counts in this store yet. Give someone the store in Escáner › Conteo.',
              null,
              'Niveles',
            )
          }}
        </p>
        <div v-else class="flex flex-wrap gap-1.5" role="group">
          <button
            v-for="w in workers"
            :key="w.user"
            type="button"
            :class="chipClass(assignee === w.user)"
            :aria-pressed="assignee === w.user"
            @click="assignee = w.user"
          >
            {{ w.full_name || displayName(w.user) }}
          </button>
        </div>
        <p v-if="countProblem" role="alert" class="text-sm text-ink-red-7">
          {{ countProblem }}
        </p>
        <div class="flex justify-end">
          <Button
            variant="solid"
            :label="__('Create count', null, 'Niveles')"
            class="min-h-11 sm:min-h-8"
            :disabled="!assignee"
            :loading="busy === 'count'"
            @click="createCount"
          />
        </div>
        <p
          v-if="!assignee && workers.length"
          class="text-right text-xs text-ink-gray-5"
        >
          {{ __('Choose who counts.', null, 'Niveles') }}
        </p>
      </div>
    </BottomSheet>
  </section>
</template>
<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { BottomSheet, EmptyState, chipClass } from '@/components/ui'
import { comprasApi, problemOf } from '@/composables/useCompras'
import { displayName, formatDate } from '@/utils/display'
import { cajones, moveLines, pricesQuery } from '@/utils/comprasLoop'

const props = defineProps({
  group: { type: String, default: '' },
})
const emit = defineEmits(['settings'])

const API = 'doco.workspaces.niveles.'
const router = useRouter()
const loading = ref(true)
const failed = ref('')
const busy = ref('')
const data = ref({
  surplus: [],
  transfers: [],
  display: [],
  counts: [],
  exhibitions: [],
  scanner: false,
  owner: false,
  surplus_days: 60,
})

const key = (row) =>
  [row.model, row.source || row.backroom, row.target || row.display].join('|')

/** «2 Negro, 1 Rosa · cajones A-3, A-4». */
function linesText(lines = []) {
  const pieces = lines
    .map((l) => `${l.qty} ${l.colour || l.item_name || l.item}`)
    .join(', ')
  const where = cajones(lines)
  return where.length
    ? `${pieces} · ${__('bins {0}', [where.join(', ')], 'Niveles')}`
    : pieces
}

async function load() {
  loading.value = true
  failed.value = ''
  try {
    const out = await comprasApi(API + 'floor', {
      item_group: props.group || null,
    })
    data.value = { ...data.value, ...out }
  } catch (error) {
    failed.value = problemOf(error).detail
  } finally {
    loading.value = false
  }
}

async function createMove(row, source, target) {
  busy.value = key(row)
  try {
    await comprasApi(API + 'transfer_create', {
      source,
      target,
      lines: moveLines(row.lines),
    })
    toast.success(
      __(
        'The pick to {0} is in Escáner; when it is scanned the transfer waits for you as a draft.',
        [target],
        'Niveles',
      ),
    )
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    busy.value = ''
  }
}

// ---- «Contar» ----------------------------------------------------------------
const countMounted = ref(false)
const countOpen = ref(false)
const counting = ref(null)
const workers = ref([])
const assignee = ref('')
const countProblem = ref('')

async function openCount(row) {
  counting.value = row
  assignee.value = ''
  countProblem.value = ''
  workers.value = []
  countMounted.value = true
  countOpen.value = true
  try {
    workers.value = await comprasApi(API + 'count_workers', {
      warehouse: row.warehouse,
    })
    if (workers.value.length === 1) assignee.value = workers.value[0].user
  } catch (error) {
    countProblem.value = problemOf(error).detail
  }
}

async function createCount() {
  const row = counting.value
  if (!row || !assignee.value) return
  busy.value = 'count'
  countProblem.value = ''
  try {
    await comprasApi(API + 'count_create', {
      item_group: row.item_group,
      model: row.model,
      warehouse: row.warehouse,
      assignee: assignee.value,
      items: JSON.stringify(row.items || []),
    })
    countOpen.value = false
    toast.success(
      __('Count of {0} created in Escáner.', [row.model], 'Niveles'),
    )
  } catch (error) {
    countProblem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}

watch(() => props.group, load)
onMounted(load)
defineExpose({ load })
</script>
