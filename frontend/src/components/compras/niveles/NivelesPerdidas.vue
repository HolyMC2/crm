<template>
  <!-- «Ventas perdidas»: what customers asked for and the shop did not have,
       per model and tone, from the counter, the POS, the workshop and the
       WhatsApp seller. The bot's notes wait as drafts until a seller confirms
       them; only confirmed asks count for the levels and the plan. -->
  <section :aria-label="__('Lost sales', null, 'Niveles')">
    <EmptyState
      v-if="failed"
      role="alert"
      state="error"
      :title="__('Could not read the lost sales', null, 'Niveles')"
      :message="failed"
      :action="__('Retry', null, 'Compras')"
      @action="load"
    />
    <EmptyState
      v-else-if="loading"
      role="status"
      state="loading"
      :title="__('Reading lost sales…', null, 'Niveles')"
    />
    <template v-else>
      <div class="mb-3 flex items-center gap-2">
        <p class="min-w-0 flex-1 text-sm text-ink-gray-7">
          {{
            __(
              'Asked for without stock in the last {0} days.',
              [data.days],
              'Niveles',
            )
          }}
        </p>
        <Button
          :label="__('We did not have it', null, 'VentasPerdidas')"
          :icon-left="LucidePackageX"
          class="min-h-11 flex-none sm:min-h-8"
          @click="sheetOpen = true"
        />
      </div>

      <EmptyState
        v-if="!data.rows.length"
        :title="__('No lost sales', null, 'Niveles')"
        :message="
          __(
            'When a customer asks for something you do not have, record it here, in the POS or from the chat.',
            null,
            'Niveles',
          )
        "
      />

      <template v-else>
        <ul
          v-if="data.by_model.length"
          class="mb-4 divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          data-testid="perdidas-modelos"
        >
          <li
            v-for="m in data.by_model"
            :key="m.model"
            class="flex min-h-12 items-center gap-3 px-3 py-2"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base font-medium">{{
                m.model || __('No model', null, 'Niveles')
              }}</span>
              <span class="block text-xs text-ink-gray-6">{{
                [tonesText(m.tones), m.last ? formatDate(m.last) : '']
                  .filter(Boolean)
                  .join(' · ')
              }}</span>
            </span>
            <span class="num flex-none text-base tabular-nums">{{
              __('{0} asked', [m.qty], 'Niveles')
            }}</span>
          </li>
        </ul>

        <template v-if="split.drafts.length">
          <h3 class="mb-1 text-base font-semibold text-ink-gray-9">
            {{ __('Noted by the assistant', null, 'Niveles') }}
          </h3>
          <p class="mb-2 text-sm text-ink-gray-6">
            {{ __('They count once a seller confirms them.', null, 'Niveles') }}
          </p>
          <ul
            class="mb-4 divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
            data-testid="perdidas-borradores"
          >
            <li
              v-for="row in split.drafts"
              :key="row.name"
              class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
            >
              <span class="min-w-0 flex-1">
                <span class="block text-base font-medium">{{ row.title }}</span>
                <span class="block text-xs text-ink-gray-6">{{
                  rowMeta(row)
                }}</span>
              </span>
              <span class="flex flex-none gap-2">
                <Button
                  :label="__('Discard', null, 'Niveles')"
                  class="min-h-11 sm:min-h-8"
                  :loading="busy === row.name + ':discard'"
                  @click="decide(row, 'discard')"
                />
                <Button
                  variant="solid"
                  :label="__('Confirm', null, 'Niveles')"
                  class="min-h-11 sm:min-h-8"
                  :loading="busy === row.name + ':confirm'"
                  @click="decide(row, 'confirm')"
                />
              </span>
            </li>
          </ul>
        </template>

        <h3 class="mb-1 text-base font-semibold text-ink-gray-9">
          {{ __('Latest', null, 'Niveles') }}
        </h3>
        <ul
          class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
        >
          <li
            v-for="row in split.confirmed.slice(0, LATEST)"
            :key="row.name"
            class="flex min-h-12 items-center gap-3 px-3 py-2"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base">{{ row.title }}</span>
              <span class="block text-xs text-ink-gray-6">{{
                rowMeta(row)
              }}</span>
            </span>
            <span class="num flex-none tabular-nums">{{ row.qty }}</span>
          </li>
        </ul>
      </template>
    </template>

    <LostSaleSheet v-model:open="sheetOpen" @recorded="load" />
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { EmptyState } from '@/components/ui'
import { comprasApi, problemOf } from '@/composables/useCompras'
import { formatDate } from '@/utils/display'
import { splitDrafts, tonesText } from '@/utils/comprasLoop'
import LucidePackageX from '~icons/lucide/package-x'

const LostSaleSheet = defineAsyncComponent(
  () => import('@/components/compras/LostSaleSheet.vue'),
)

const props = defineProps({
  group: { type: String, default: '' },
})

const API = 'doco.workspaces.niveles.'
const LATEST = 30
const loading = ref(true)
const failed = ref('')
const busy = ref('')
const sheetOpen = ref(false)
const data = ref({ rows: [], by_model: [], days: 90 })
const split = computed(() => splitDrafts(data.value.rows))

function rowMeta(row) {
  return [row.channel, row.warehouse, formatDate(row.asked_on)]
    .filter(Boolean)
    .join(' · ')
}

async function load() {
  loading.value = true
  failed.value = ''
  try {
    const out = await comprasApi(API + 'lost', {
      item_group: props.group || null,
    })
    data.value = { rows: [], by_model: [], days: 90, ...out }
  } catch (error) {
    failed.value = problemOf(error).detail
  } finally {
    loading.value = false
  }
}

async function decide(row, action) {
  busy.value = `${row.name}:${action}`
  try {
    await comprasApi(`doco.workspaces.ventas_perdidas.${action}`, {
      name: row.name,
    })
    toast.success(
      action === 'confirm'
        ? __('Confirmed: it counts as demand', null, 'Niveles')
        : __('Discarded', null, 'Niveles'),
    )
    await load()
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    busy.value = ''
  }
}

watch(() => props.group, load)
onMounted(load)
</script>
