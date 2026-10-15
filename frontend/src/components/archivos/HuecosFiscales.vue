<template>
  <section
    class="flex min-h-0 flex-col"
    :aria-labelledby="heading ? ids.title : undefined"
    :aria-label="heading ? undefined : __('Fiscal gaps')"
  >
    <div class="shrink-0 space-y-3" :class="heading ? 'p-4' : 'px-4 pb-4'">
      <div v-if="heading">
        <h2 :id="ids.title" class="text-xl font-semibold text-ink-gray-9">
          {{ __('Fiscal gaps') }}
        </h2>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'What is missing between your purchases, your CFDI and the SAT, with the step that fixes it.',
            )
          }}
        </p>
      </div>
      <div
        v-if="kinds.length"
        role="tablist"
        :aria-label="__('Kind of gap')"
        class="flex gap-2 overflow-x-auto pb-1"
      >
        <button
          v-for="k in kinds"
          :key="k.key"
          type="button"
          role="tab"
          :aria-selected="k.key === activeKind ? 'true' : 'false'"
          class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm sm:min-h-8"
          :class="
            k.key === activeKind
              ? 'border-outline-gray-4 bg-surface-gray-3 font-medium text-ink-gray-9'
              : 'border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-1'
          "
          @click="selectKind(k.key)"
        >
          {{ k.label }}
          <span
            class="rounded-full bg-surface-gray-2 px-1.5 text-xs tabular-nums text-ink-gray-8"
            >{{ countLabel(k) }}</span
          >
        </button>
      </div>
      <p v-if="activeHint" class="text-sm text-ink-gray-7">{{ activeHint }}</p>
      <p
        v-if="data && data.sat_enabled === false"
        role="note"
        class="flex items-start gap-2 rounded bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
      >
        <FeatherIcon
          name="info"
          class="mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        />{{
          data.sat_reason ||
          __(
            'The checks against the SAT are not available for this company, so cancelled CFDI and the 69-B list do not show here.',
          )
        }}
      </p>
      <p v-if="note" role="status" class="text-sm text-ink-gray-7">
        {{ note }}
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div
        v-if="loading && !rows.length"
        class="space-y-2 px-4"
        aria-hidden="true"
      >
        <div
          v-for="n in 5"
          :key="n"
          class="h-16 animate-pulse rounded bg-surface-gray-2"
        />
      </div>
      <div v-else-if="loadProblem" class="px-4">
        <ArchivoGuard :state="loadProblem" @action="onLoadGuard" />
      </div>
      <div v-else-if="!company" class="px-6 py-10 text-center">
        <p class="text-sm text-ink-gray-6">
          {{ __('Choose a company to see its fiscal gaps.') }}
        </p>
      </div>
      <div v-else-if="data && !rows.length" class="px-6 py-10 text-center">
        <FeatherIcon
          name="check-circle"
          class="mx-auto h-10 w-10 text-ink-gray-4"
          aria-hidden="true"
        />
        <p class="mt-3 text-base font-medium text-ink-gray-8">
          {{ emptyText }}
        </p>
      </div>
      <ul
        v-else-if="rows.length"
        class="divide-y divide-outline-gray-1"
        :aria-label="activeLabel"
      >
        <li v-for="row in rows" :key="row.key" class="space-y-2 px-4 py-3">
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-base font-medium text-ink-gray-9">
                {{ row.title || row.name }}
              </p>
              <p
                v-if="row.subtitle || row.date"
                class="truncate text-sm text-ink-gray-6"
              >
                {{
                  [row.subtitle, row.date && fiscalDate(row.date)]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </p>
            </div>
            <p
              v-if="row.amount != null && row.amount !== ''"
              class="shrink-0 text-base tabular-nums text-ink-gray-9"
            >
              {{ money(row.amount, row.currency) }}
            </p>
          </div>
          <p v-if="row.reason" class="text-sm text-ink-gray-7">
            {{ row.reason }}
          </p>
          <div v-if="row.actions?.length" class="flex flex-wrap gap-2">
            <Button
              v-for="(action, index) in row.actions"
              :key="index"
              class="min-h-11 sm:min-h-0"
              :variant="index === 0 ? 'solid' : 'subtle'"
              :label="action.label"
              :loading="busy === row.key + ':' + index"
              @click="run(row, action, index)"
            />
          </div>
          <ArchivoGuard
            v-if="rowProblem.key === row.key"
            :state="rowProblem.state"
            @action="(action) => onRowGuard(row, action)"
          />
        </li>
      </ul>
      <div v-if="hasMore && rows.length" class="p-4">
        <Button
          class="min-h-11 w-full sm:min-h-0"
          :label="__('Load more')"
          :loading="loading"
          @click="load({ more: true })"
        />
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, useId, watch } from 'vue'
import { Button, FeatherIcon } from 'frappe-ui'
import ArchivoGuard from './ArchivoGuard.vue'
import { archivosApi, problem, safeReturn } from '@/composables/useArchivos'
import { fiscalDate, money } from './fiscalFormat'

// «Huecos fiscales»: purchases without their CFDI, CFDI without a purchase,
// cancellations, 69-B issuers and PDFs without their XML, each with the step
// that closes the gap and a way back here.
const GAPS = 'doco.docoutils.documents.fiscal_gaps.gaps'

const props = defineProps({
  company: { type: String, default: '' },
  kind: { type: String, default: '' },
  days: { type: Number, default: 7 },
  returnTo: { type: String, default: '' },
  // Off when the host page already titles the queue (Archivos' list header).
  heading: { type: Boolean, default: true },
})
const emit = defineEmits(['kind-change', 'open-document'])

const ids = { title: `huecos${useId()}` }
const data = ref(null),
  rows = ref([]),
  page = ref(1),
  hasMore = ref(false),
  loading = ref(false),
  loadProblem = ref(null),
  note = ref(''),
  busy = ref(''),
  rowProblem = ref({ key: '', state: null }),
  current = ref(props.kind)

const kinds = computed(() => data.value?.kinds || [])
const activeKind = computed(
  () => current.value || data.value?.kind || kinds.value[0]?.key || '',
)
const activeEntry = computed(() =>
  kinds.value.find((k) => k.key === activeKind.value),
)
const activeHint = computed(() => activeEntry.value?.hint || '')
const activeLabel = computed(
  () => activeEntry.value?.label || __('Fiscal gaps'),
)
const emptyText = computed(() => {
  const texts = {
    sin_cfdi: __('No purchases without a CFDI. All in order.'),
    sin_compra: __('No CFDI waiting for its purchase. All in order.'),
    cancelados: __('No CFDI cancelled at the SAT. All in order.'),
    efos: __('No issuer on the SAT 69-B list. All in order.'),
    pdf_sin_xml: __('Every PDF with a fiscal folio has its XML. All in order.'),
  }
  return texts[activeKind.value] || __('Nothing pending here. All in order.')
})

function countLabel(k) {
  return k.more ? `${k.count}+` : String(k.count ?? 0)
}

let seq = 0
async function load({ more = false } = {}) {
  if (!props.company) {
    data.value = null
    rows.value = []
    return
  }
  const mine = ++seq
  loading.value = true
  loadProblem.value = null
  const nextPage = more ? page.value + 1 : 1
  try {
    const result =
      (await archivosApi(GAPS, {
        company: props.company,
        kind: current.value || '',
        page: nextPage,
        days: props.days,
      })) || {}
    if (mine !== seq) return
    data.value = result
    rows.value = more
      ? [...rows.value, ...(result.rows || [])]
      : result.rows || []
    page.value = nextPage
    hasMore.value = Boolean(result.has_more)
  } catch (error) {
    if (mine === seq) loadProblem.value = problem(error)
  } finally {
    if (mine === seq) loading.value = false
  }
}

function selectKind(key) {
  if (key === activeKind.value && rows.value.length) return
  current.value = key
  note.value = ''
  rowProblem.value = { key: '', state: null }
  emit('kind-change', key)
  load()
}

watch(
  () => props.kind,
  (value) => {
    if ((value || '') === (current.value || '')) return
    current.value = value
    load()
  },
)
watch(
  () => [props.company, props.days],
  () => load(),
  { immediate: true },
)

// The step opens with a way back to this queue when the target has none.
function withReturn(target) {
  const back = safeReturn(props.returnTo)
  if (!back) return target
  const [base, hash = ''] = target.split('#')
  const [path, query = ''] = base.split('?')
  const params = new URLSearchParams(query)
  if (params.has('return_to')) return target
  params.set('return_to', back)
  params.set('return_label', __('Fiscal gaps'))
  return `${path}?${params.toString()}${hash ? '#' + hash : ''}`
}

async function run(row, action, index) {
  note.value = ''
  rowProblem.value = { key: '', state: null }
  if (action.kind === 'route') {
    const target = safeReturn(action.target || '')
    if (target) window.location.assign(withReturn(target))
    return
  }
  if (action.kind === 'open_document') {
    if (action.target) emit('open-document', action.target)
    return
  }
  if (action.kind === 'call' && action.target) {
    busy.value = `${row.key}:${index}`
    try {
      const result = await archivosApi(action.target, action.args || {})
      note.value =
        (typeof result === 'string' ? result : result?.message) ||
        __('Done. The list is up to date.')
      await load()
    } catch (error) {
      rowProblem.value = { key: row.key, state: problem(error) }
    } finally {
      busy.value = ''
    }
  }
}
function onRowGuard(row, action) {
  if (action.kind === 'retry') {
    rowProblem.value = { key: '', state: null }
    load()
  }
}
function onLoadGuard(action) {
  if (action.kind === 'retry') load()
}
</script>
