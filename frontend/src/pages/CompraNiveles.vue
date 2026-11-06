<template>
  <!-- Niveles de surtido: how many pieces of each model the owner keeps,
       counted over every variant and style, with the mix of dark and bright
       colours. The buy plan in Surtido asks for what a level lacks. Beside the
       levels: the suggested ones, the floor («Sobra», «Mover», «Reponer
       exhibición», «Contar») and the asks without stock (`?ver=`). -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="__('Compras', null, 'Compras')"
      :title="__('Stock levels', null, 'Niveles')"
      :bell="phone"
      @back="onBack"
    >
      <template #actions>
        <button
          v-if="ready && data.can_edit"
          type="button"
          class="press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
          :aria-label="__('Buying settings', null, 'Niveles')"
          :title="__('Buying settings', null, 'Niveles')"
          data-testid="niveles-settings"
          @click="openSettings"
        >
          <span class="lucide-settings size-6" aria-hidden="true" />
        </button>
        <button
          v-if="ready && assistantOn"
          type="button"
          class="press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
          :aria-label="__('Ask Muelle', null, 'Surtido')"
          :title="__('Ask Muelle', null, 'Surtido')"
          data-testid="niveles-ask"
          @click="askMuelle"
        >
          <span class="lucide-sparkles size-6" aria-hidden="true" />
        </button>
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-12">
      <EmptyState
        v-if="guard"
        role="alert"
        state="error"
        :title="guard.title"
        :message="guard.detail"
        :action="__('Retry', null, 'Compras')"
        @action="start"
      />
      <EmptyState
        v-else-if="!ready"
        role="status"
        state="loading"
        :title="__('Loading stock levels…', null, 'Niveles')"
      />

      <div v-else class="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
        <Segmented
          :model-value="section"
          :options="sections"
          :label="__('Section', null, 'Niveles')"
          fit="content"
          class="mb-3"
          data-testid="niveles-sections"
          @update:model-value="setSection"
        />
        <p v-if="section === 'niveles'" class="mb-3 text-base text-ink-gray-7">
          {{
            __(
              'How many pieces you keep of each model, over every style and colour. A buy plan in Surtido asks for what a level lacks.',
              null,
              'Niveles',
            )
          }}
        </p>

        <div
          v-if="problem"
          role="alert"
          class="mb-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </div>

        <div
          v-if="sectionFilters.length > 1"
          class="mb-3 flex flex-wrap gap-1.5"
          role="group"
          :aria-label="__('Show', null, 'Niveles')"
        >
          <button
            v-for="f in sectionFilters"
            :key="f.value"
            type="button"
            :class="chipClass(filter === f.value)"
            :aria-pressed="filter === f.value"
            @click="filter = f.value"
          >
            {{ f.label }}
            <span v-if="section === 'niveles'" class="num tabular-nums">{{
              f.count
            }}</span>
          </button>
        </div>

        <NivelesSugerencias
          v-if="section === 'sugerencias'"
          :group="group"
          @saved="load"
        />
        <NivelesPiso
          v-else-if="section === 'piso'"
          ref="piso"
          :group="group"
          @settings="openSettings"
        />
        <NivelesPerdidas v-else-if="section === 'perdidas'" :group="group" />
        <template v-else>
          <EmptyState
            v-if="!data.rows.length"
            :title="__('No stock levels yet', null, 'Niveles')"
            :message="
              data.can_edit
                ? __(
                    'Say how many pieces you want of a model, for example 10 cases of iPhone 12, half dark and half bright.',
                    null,
                    'Niveles',
                  )
                : __('The owner sets the stock levels.', null, 'Niveles')
            "
            :action="data.can_edit ? __('New level', null, 'Niveles') : ''"
            @action="openLevel()"
          />
          <p
            v-else-if="!shown.length"
            class="rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
          >
            {{ __('No level is short.', null, 'Niveles') }}
          </p>

          <ul
            v-if="shown.length"
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
            :aria-label="__('Stock levels', null, 'Niveles')"
            data-testid="niveles-list"
          >
            <li v-for="row in shown" :key="row.level + row.model">
              <button
                type="button"
                class="press flex min-h-14 w-full flex-col gap-1.5 px-3 py-2.5 text-left [@media(hover:hover)]:hover:bg-surface-gray-1 disabled:cursor-default"
                :disabled="!data.can_edit"
                :aria-label="rowLabel(row)"
                @click="openLevel(row)"
              >
                <span class="flex w-full items-baseline gap-2">
                  <span class="min-w-0 flex-1 truncate text-base font-medium">{{
                    row.model
                  }}</span>
                  <span class="num flex-none text-base tabular-nums">{{
                    __('{0} of {1}', [row.have, row.target], 'Niveles')
                  }}</span>
                </span>
                <span
                  class="flex h-2 w-full overflow-hidden rounded-full bg-surface-gray-2"
                  aria-hidden="true"
                >
                  <span
                    v-for="(seg, i) in toneSegments(row)"
                    :key="seg.tone + i"
                    class="h-full"
                    :class="seg.untoned ? UNTONED : SEGMENT[i % SEGMENT.length]"
                    :style="{ width: seg.pct + '%' }"
                  />
                </span>
                <span
                  class="flex w-full flex-wrap gap-x-2 text-xs text-ink-gray-6"
                >
                  <span class="truncate">{{ scopeText(row) }}</span>
                  <span v-if="row.incoming">{{
                    __('{0} coming', [row.incoming], 'Niveles')
                  }}</span>
                  <span v-if="row.need" class="font-medium text-ink-gray-8">{{
                    buyText(row)
                      ? __(
                          '{0} short: {1}',
                          [row.need, buyText(row)],
                          'Niveles',
                        )
                      : __('{0} short', [row.need], 'Niveles')
                  }}</span>
                  <span v-else>{{ restText(row) }}</span>
                </span>
              </button>
            </li>
          </ul>

          <section
            v-if="erpShown.length"
            class="mt-6"
            :aria-label="__('From your items', null, 'Niveles')"
            data-testid="niveles-erp"
          >
            <h2 class="title-face text-lg font-semibold text-ink-gray-9">
              {{ __('From your items', null, 'Niveles') }}
            </h2>
            <p class="mb-2 text-sm text-ink-gray-6">
              {{
                __(
                  'These models have no level yet, but their items carry reorder levels. Added up per model:',
                  null,
                  'Niveles',
                )
              }}
            </p>
            <ul
              class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
            >
              <li
                v-for="row in erpShown.slice(0, ERP_ROWS)"
                :key="row.item_group + row.model"
                class="flex min-h-14 items-center gap-3 px-3 py-2"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-base font-medium">{{
                    row.model
                  }}</span>
                  <span class="block text-xs text-ink-gray-6">{{
                    __(
                      '{0} · order below {1}, fill up to {2} · {3} items',
                      [row.item_group, row.min_qty, row.target_qty, row.items],
                      'Niveles',
                    )
                  }}</span>
                </span>
                <!-- the word in the slot: a label prop would replace the aria-label -->
                <Button
                  v-if="data.can_edit"
                  :aria-label="__('Use for {0}', [row.model], 'Niveles')"
                  class="min-h-11 flex-none sm:min-h-8"
                  @click="openLevel(adoptedLevel(row))"
                >
                  {{ __('Use', null, 'Niveles') }}
                </Button>
              </li>
            </ul>
            <p
              v-if="erpShown.length > ERP_ROWS"
              class="mt-2 text-xs text-ink-gray-5"
            >
              {{ __('And {0} more.', [erpShown.length - ERP_ROWS], 'Niveles') }}
            </p>
          </section>

          <p v-if="data.sold_cut" class="mt-2 text-xs text-ink-gray-5">
            {{
              __(
                'Sales hit the reading limit: a level for every sold model may miss some models.',
                null,
                'Niveles',
              )
            }}
          </p>

          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              v-if="data.can_edit && data.colours.length"
              :label="__('Colour tones', null, 'Niveles')"
              :icon-left="LucidePalette"
              class="min-h-11 sm:min-h-8"
              @click="openTones"
            />
            <Button
              :label="__('Restock from a list', null, 'Surtido')"
              :icon-left="LucideLayers"
              class="min-h-11 sm:min-h-8"
              @click="router.push({ name: 'CompraSurtido' })"
            />
            <Button
              v-if="data.can_edit && !phone"
              variant="solid"
              :label="__('New level', null, 'Niveles')"
              :icon-left="LucidePlus"
              class="min-h-11 sm:min-h-8"
              @click="openLevel()"
            />
          </div>
        </template>
      </div>
    </div>

    <Fab
      v-if="ready && phone && data.can_edit && section === 'niveles'"
      :label="__('New level', null, 'Niveles')"
      data-testid="niveles-new"
      @click="openLevel()"
    />

    <BottomSheet
      v-if="sheetMounted"
      v-model:open="sheetOpen"
      :title="
        form.name
          ? __('Change level', null, 'Niveles')
          : __('New level', null, 'Niveles')
      "
      :dismissible="!busy"
    >
      <form class="space-y-4 pb-4" @submit.prevent="saveLevel">
        <ComprasPicker
          v-model="form.item_group"
          :display="form.item_group"
          :label="__('Product type', null, 'Niveles')"
          :placeholder="__('Search group', null, 'Niveles')"
          :load="(q) => call('level_groups', { search: q })"
        />
        <div>
          <FormControl
            v-model="form.model"
            type="text"
            :label="__('Model', null, 'Niveles')"
            :placeholder="__('Every model sold', null, 'Niveles')"
            autocomplete="off"
            @update:model-value="suggestModels"
          />
          <p class="mt-1 text-xs text-ink-gray-5">
            {{
              __(
                'Every style and colour of the model counts. Empty: one level for each model of the type that sold.',
                null,
                'Niveles',
              )
            }}
          </p>
          <div v-if="models.length" class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="m in models"
              :key="m.value"
              type="button"
              :class="chipClass(form.model === m.value)"
              @click="form.model = m.value"
            >
              {{ m.label }}
              <span class="font-normal">{{ m.hint }}</span>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <FormControl
            v-model="form.target_qty"
            type="number"
            min="1"
            :label="__('Fill up to', null, 'Niveles')"
          />
          <FormControl
            v-model="form.min_qty"
            type="number"
            min="0"
            :label="__('Order when fewer than', null, 'Niveles')"
            :placeholder="String(form.target_qty || '')"
          />
        </div>
        <fieldset>
          <legend class="mb-1.5 text-xs text-ink-gray-5">
            {{ __('Colour mix', null, 'Niveles') }}
          </legend>
          <Segmented
            :model-value="preset"
            :options="presetOptions"
            :label="__('Colour mix', null, 'Niveles')"
            fit="content"
            @update:model-value="pickPreset"
          />
          <div v-if="form.mix.length" class="mt-3 space-y-2">
            <label
              v-for="row in form.mix"
              :key="row.tone"
              class="flex items-center gap-3 text-sm"
            >
              <span class="min-w-0 flex-1">{{ row.tone }}</span>
              <input
                v-model.number="row.share"
                type="number"
                min="0"
                max="100"
                class="h-11 w-20 rounded-4 border border-outline-gray-2 px-2 text-right tabular-nums sm:h-9"
                :aria-label="__('Percent of {0}', [row.tone], 'Niveles')"
              />
              <span class="w-4 text-ink-gray-6">%</span>
            </label>
            <p
              v-if="mixTotal !== null"
              role="alert"
              class="text-sm text-ink-red-7"
            >
              {{
                __(
                  'The mix adds up to {0} %; make it 100 %.',
                  [mixTotal],
                  'Niveles',
                )
              }}
            </p>
          </div>
        </fieldset>
        <p v-if="sheetProblem" role="alert" class="text-sm text-ink-red-7">
          {{ sheetProblem }}
        </p>
        <div class="flex items-center justify-between gap-2 pt-2">
          <span>
            <Button
              v-if="form.name"
              :label="
                confirmDelete
                  ? __('Delete', null, 'Niveles')
                  : __('Delete level', null, 'Niveles')
              "
              :icon-left="confirmDelete ? undefined : LucideTrash2"
              :theme="confirmDelete ? 'red' : 'gray'"
              class="min-h-11 sm:min-h-8"
              :loading="busy === 'delete'"
              @click="removeLevel"
            />
          </span>
          <Button
            type="submit"
            variant="solid"
            :label="__('Save level', null, 'Niveles')"
            class="min-h-11 sm:min-h-8"
            :disabled="!canSave"
            :loading="busy === 'save'"
          />
        </div>
        <p v-if="!canSave && !busy" class="text-right text-xs text-ink-gray-5">
          {{ saveHint }}
        </p>
      </form>
    </BottomSheet>

    <BottomSheet
      v-if="tonesMounted"
      v-model:open="tonesOpen"
      :title="__('Colour tones', null, 'Niveles')"
      :subtitle="
        __(
          'Which tone each colour of the shop counts for in a mix.',
          null,
          'Niveles',
        )
      "
      :dismissible="!busy"
      flush
    >
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="c in toneRows"
          :key="c.colour"
          class="flex items-center gap-3 px-4 py-2"
        >
          <span class="min-w-0 flex-1 truncate text-base">{{ c.colour }}</span>
          <Segmented
            v-model="c.tone"
            :options="toneOptions"
            :label="__('Tone of {0}', [c.colour], 'Niveles')"
            fit="content"
          />
        </li>
      </ul>
      <div class="flex justify-end px-4 py-3">
        <Button
          variant="solid"
          :label="__('Save tones', null, 'Niveles')"
          class="min-h-11 sm:min-h-8"
          :loading="busy === 'tones'"
          @click="saveTones"
        />
      </div>
    </BottomSheet>

    <NivelesAjustes
      v-if="settingsMounted"
      v-model:open="settingsOpen"
      @saved="onSettingsSaved"
    />
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FormControl, toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Fab,
  Segmented,
  chipClass,
} from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import {
  assistantOn,
  loadAssistant,
} from '@/components/assistant/assistantDoor'
import { comprasApi, problemOf } from '@/composables/useCompras'
import {
  adoptedLevel,
  buyText,
  levelPayload,
  levelState,
  mixPresets,
  mixProblem,
  presetOf,
  toneSegments,
  visibleErp,
  visibleLevels,
} from '@/utils/niveles'
import LucideLayers from '~icons/lucide/layers'
import LucidePalette from '~icons/lucide/palette'
import LucidePlus from '~icons/lucide/plus'
import LucideTrash2 from '~icons/lucide/trash-2'

const NivelesSugerencias = defineAsyncComponent(
  () => import('@/components/compras/niveles/NivelesSugerencias.vue'),
)
const NivelesPiso = defineAsyncComponent(
  () => import('@/components/compras/niveles/NivelesPiso.vue'),
)
const NivelesPerdidas = defineAsyncComponent(
  () => import('@/components/compras/niveles/NivelesPerdidas.vue'),
)
const NivelesAjustes = defineAsyncComponent(
  () => import('@/components/compras/niveles/NivelesAjustes.vue'),
)

const API = 'doco.workspaces.sourcing.'
const call = (method, args = {}) => comprasApi(API + method, args)
// the tones in the bar: the first (dark) solid, the second lighter, the rest between
const SEGMENT = ['bg-surface-gray-9', 'bg-surface-gray-4', 'bg-surface-gray-7']
// pieces of no colour fill the level too
const UNTONED = 'bg-surface-gray-5'
const ERP_ROWS = 20

const router = useRouter()
const route = useRoute()
const phone = isMobile
const ready = ref(false)
const guard = ref(null)
const problem = ref(null)
const busy = ref('')
const data = ref({
  rows: [],
  erp: [],
  tones: [],
  colours: [],
  groups: [],
  can_edit: false,
})
const filter = ref('todos')

const shown = computed(() => visibleLevels(data.value.rows, filter.value))
const erpShown = computed(() => visibleErp(data.value.erp, filter.value))
const filters = computed(() => [
  {
    value: 'todos',
    label: __('All', null, 'Niveles'),
    count: data.value.rows.length,
  },
  {
    value: 'faltan',
    label: __('Short', null, 'Niveles'),
    count: data.value.rows.filter((r) => r.need > 0).length,
  },
  ...(data.value.groups.length > 1
    ? data.value.groups.map((g) => ({
        value: g,
        label: g,
        count: data.value.rows.filter((r) => r.item_group === g).length,
      }))
    : []),
])

// ---- the sections ---------------------------------------------------------
const SECTIONS = ['niveles', 'sugerencias', 'piso', 'perdidas']
const section = computed(() =>
  SECTIONS.includes(route.query.ver) ? route.query.ver : 'niveles',
)
const sections = computed(() => [
  { value: 'niveles', label: __('Levels', null, 'Niveles') },
  { value: 'sugerencias', label: __('Suggested', null, 'Niveles') },
  { value: 'piso', label: __('Floor', null, 'Niveles') },
  { value: 'perdidas', label: __('Lost sales', null, 'Niveles') },
])
// the other sections read one product type or all; «Short» is the levels' own
const group = computed(() =>
  data.value.groups.includes(filter.value) ? filter.value : '',
)
const sectionFilters = computed(() =>
  section.value === 'niveles'
    ? filters.value
    : filters.value.filter((f) => f.value !== 'faltan'),
)

function setSection(value) {
  if (value !== 'niveles' && filter.value === 'faltan') filter.value = 'todos'
  const query = { ...route.query, ver: value === 'niveles' ? undefined : value }
  router.replace({ query })
}

const piso = ref(null)
const settingsMounted = ref(false)
const settingsOpen = ref(false)
function openSettings() {
  settingsMounted.value = true
  settingsOpen.value = true
}
function onSettingsSaved() {
  piso.value?.load?.()
}

function scopeText(row) {
  return [
    row.item_group,
    row.every ? __('every model sold', null, 'Niveles') : '',
    row.warehouse,
    row.template,
  ]
    .filter(Boolean)
    .join(' · ')
}

// a level that buys nothing: full, or from when it buys
function restText(row) {
  return levelState(row) === 'full'
    ? __('Full', null, 'Niveles')
    : __('Orders below {0}', [row.min], 'Niveles')
}

function rowLabel(row) {
  const state = row.need
    ? __('{0} short', [row.need], 'Niveles')
    : restText(row)
  return `${row.model}: ${__('{0} of {1}', [row.have, row.target], 'Niveles')}, ${state}`
}

async function load() {
  const out = await call('levels')
  data.value = {
    rows: [],
    erp: [],
    tones: [],
    colours: [],
    groups: [],
    ...out,
  }
  return out
}

async function start() {
  guard.value = null
  try {
    await load()
  } catch (error) {
    guard.value = {
      title: __('Could not open stock levels', null, 'Niveles'),
      detail: problemOf(error).detail,
    }
    return
  }
  ready.value = true
}

// ---- the level sheet -------------------------------------------------------
const sheetMounted = ref(false)
const sheetOpen = ref(false)
const sheetProblem = ref('')
const confirmDelete = ref(false)
const models = ref([])
const form = reactive({
  name: '',
  item_group: '',
  model: '',
  target_qty: 10,
  min_qty: '',
  mix: [],
})

const presets = computed(() => mixPresets(data.value.tones))
const presetOptions = computed(() => {
  const names = {
    none: __('No mix', null, 'Niveles'),
    half: __('Half and half', null, 'Niveles'),
    dark: __('More dark', null, 'Niveles'),
    bright: __('More bright', null, 'Niveles'),
  }
  return presets.value.map((p) => ({ value: p.value, label: names[p.value] }))
})
const preset = computed(() => presetOf(form.mix, data.value.tones))
const mixTotal = computed(() => mixProblem(form.mix))
const canSave = computed(
  () =>
    Boolean(form.item_group) &&
    Number(form.target_qty) >= 1 &&
    mixTotal.value === null &&
    (form.min_qty === '' || Number(form.min_qty) <= Number(form.target_qty)),
)
const saveHint = computed(() => {
  if (!form.item_group) return __('Choose the product type.', null, 'Niveles')
  if (!(Number(form.target_qty) >= 1))
    return __('Say how many pieces to fill up to.', null, 'Niveles')
  if (mixTotal.value !== null)
    return __('Make the mix add up to 100 %.', null, 'Niveles')
  return __('Order before the level, not above it.', null, 'Niveles')
})

function pickPreset(value) {
  const found = presets.value.find((p) => p.value === value)
  if (found) form.mix = found.mix.map((r) => ({ ...r }))
}

function openLevel(row = null) {
  if (!data.value.can_edit) return
  Object.assign(form, {
    name: row?.level || '',
    item_group: row?.item_group || data.value.groups[0] || '',
    model: row?.level_model || '',
    target_qty: row?.target || 10,
    min_qty: row && row.min !== row.target ? row.min : '',
    mix: (row?.mix || []).map((r) => ({ ...r })),
  })
  // a new level, or one adopted from the items' reorder levels, starts half and half
  if (!row?.mix) pickPreset('half')
  sheetProblem.value = ''
  confirmDelete.value = false
  models.value = []
  sheetMounted.value = true
  sheetOpen.value = true
  suggestModels(form.model)
}

let modelTimer = null
function suggestModels(text) {
  clearTimeout(modelTimer)
  if (!form.item_group) return
  modelTimer = setTimeout(async () => {
    try {
      models.value = (
        await call('level_models', {
          item_group: form.item_group,
          search: text || '',
        })
      ).slice(0, 8)
    } catch {
      models.value = []
    }
  }, 250)
}

async function saveLevel() {
  if (!canSave.value) return
  busy.value = 'save'
  sheetProblem.value = ''
  try {
    const out = await call('level_save', levelPayload(form))
    data.value = { ...data.value, ...out }
    sheetOpen.value = false
    toast.success(__('Level saved', null, 'Niveles'))
  } catch (error) {
    sheetProblem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}

async function removeLevel() {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }
  busy.value = 'delete'
  try {
    const out = await call('level_delete', { name: form.name })
    data.value = { ...data.value, ...out }
    sheetOpen.value = false
    toast.success(__('Level deleted', null, 'Niveles'))
  } catch (error) {
    sheetProblem.value = problemOf(error).detail
  } finally {
    busy.value = ''
    confirmDelete.value = false
  }
}

// ---- colour tones ----------------------------------------------------------
const tonesMounted = ref(false)
const tonesOpen = ref(false)
const toneRows = ref([])
const toneOptions = computed(() =>
  data.value.tones.slice(0, 4).map((t) => ({ value: t, label: t })),
)

function openTones() {
  toneRows.value = data.value.colours.map((c) => ({
    colour: c.colour,
    tone: c.tone,
  }))
  tonesMounted.value = true
  tonesOpen.value = true
}

async function saveTones() {
  busy.value = 'tones'
  try {
    const out = await call('tones_save', {
      rows: JSON.stringify(toneRows.value),
    })
    data.value = { ...data.value, ...out }
    tonesOpen.value = false
    toast.success(__('Tones saved', null, 'Niveles'))
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    busy.value = ''
  }
}

// ---- the way out -----------------------------------------------------------
let dropContext = null
async function askMuelle() {
  const m = await loadAssistant()
  dropContext?.()
  dropContext = m.useAssistantContext(() => ({
    title: __('Stock levels', null, 'Niveles'),
  }))
  m.openAssistant({ text: __('In my stock levels, ', null, 'Niveles') })
}

function onBack(event) {
  event?.preventDefault?.()
  router.push({ name: 'Compras' })
}

onMounted(start)
onBeforeUnmount(() => {
  dropContext?.()
  clearTimeout(modelTimer)
})
</script>
