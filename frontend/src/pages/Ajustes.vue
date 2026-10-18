<template>
  <!-- «Todos los ajustes» (Shell SPEC DD13): every field of a hard record in
       plain-Spanish sections, searchable, with what each one does, its value
       in words, what it depends on, and edits saved as one change set. -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" data-ajustes>
    <AppBar
      v-if="isPhone"
      v-model:search="query"
      v-model:search-open="searchOpen"
      :back="backTarget"
      :back-label="__('Volver a la ficha')"
      :title="__('Todos los ajustes')"
      searchable
      :search-label="__('Buscar un ajuste')"
      :bell="false"
      data-testid="ajustes-appbar"
    />
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 lg:px-6">
        <nav v-if="!isPhone" class="mb-2">
          <RouterLink
            v-if="backTarget && backTarget !== true"
            :to="backTarget"
            class="inline-flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          >
            <span class="lucide-arrow-left size-4" aria-hidden="true" />
            {{ __('Volver a la ficha') }}
          </RouterLink>
        </nav>

        <section
          v-if="loadError"
          role="alert"
          class="mx-auto max-w-xl space-y-3 py-6"
        >
          <h1 class="text-xl font-semibold">
            {{ __('No pude abrir los ajustes') }}
          </h1>
          <p class="text-base text-ink-gray-7">{{ loadError }}</p>
          <Button class="min-h-11" :label="__('Reintentar')" @click="load" />
        </section>

        <div
          v-else-if="!guide"
          role="status"
          class="py-10 text-base text-ink-gray-6"
        >
          {{ __('Abriendo los ajustes…') }}
        </div>

        <template v-else>
          <header class="mb-3">
            <p class="text-sm text-ink-gray-6">{{ guide.kind }}</p>
            <h1
              class="break-words text-2xl font-semibold leading-tight text-ink-gray-9"
            >
              {{ guide.title }}
            </h1>
            <p class="mt-1 text-sm text-ink-gray-6" data-ajustes-summary>
              {{ summary }}
            </p>
          </header>

          <div v-if="!isPhone" class="mb-3 max-w-xl">
            <input
              v-model="query"
              type="search"
              class="h-11 w-full rounded-full border-0 bg-surface-gray-2 px-4 text-base"
              :placeholder="__('Buscar un ajuste: serie, SAT, caja…')"
              :aria-label="__('Buscar un ajuste')"
              data-ajustes-search
            />
          </div>

          <FilterChips
            v-model="chips"
            multiple
            :chips="chipList"
            :label="__('Mostrar')"
            class="-mx-4 mb-3 lg:mx-0 lg:[&>div]:px-0"
          />

          <div
            v-if="receipt"
            role="status"
            class="mb-4 rounded-xl bg-surface-green-1 p-4 text-ink-green-8"
            data-ajustes-receipt
          >
            <p class="text-base font-semibold">
              {{ receipt.undone ? __('Deshecho') : __('Guardado') }}
            </p>
            <ul class="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              <li v-for="line in receipt.lines" :key="line" class="break-words">
                {{ line }}
              </li>
            </ul>
            <div class="mt-2 flex flex-wrap gap-2">
              <Button
                v-if="receipt.undo"
                class="min-h-11"
                :label="__('Deshacer')"
                :loading="busy"
                @click="undo"
              />
              <Button
                class="min-h-11"
                variant="ghost"
                :label="__('Cerrar')"
                @click="receipt = null"
              />
            </div>
          </div>

          <p
            v-if="!guide.can_write"
            class="mb-4 flex items-start gap-2 rounded-xl bg-surface-gray-2 p-3 text-sm text-ink-gray-7"
          >
            <span
              class="lucide-lock mt-0.5 size-4 flex-none"
              aria-hidden="true"
            />
            {{
              __(
                'Puedes ver estos ajustes, pero no cambiarlos. Pide el cambio a quien administra el catálogo.',
              )
            }}
          </p>

          <EmptyState
            v-if="!visible.length"
            state="empty"
            :title="__('Ningún ajuste coincide')"
            :message="
              query
                ? __('Prueba con otra palabra, como «serie», «SAT» o «caja».')
                : __('No hay ajustes activados en esta vista.')
            "
          />

          <!-- Desktop: sections on the left, the chosen one on the right. -->
          <div
            v-else-if="wide"
            class="grid grid-cols-[16rem_minmax(0,1fr)] gap-6"
          >
            <nav
              class="sticky top-0 self-start"
              :aria-label="__('Secciones')"
              data-ajustes-nav
            >
              <ul class="grid gap-0.5">
                <li v-for="section in visible" :key="section.key">
                  <button
                    type="button"
                    class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-base"
                    :class="
                      section.key === shownKey
                        ? 'bg-surface-gray-3 font-semibold text-ink-gray-9'
                        : 'text-ink-gray-7 hover:bg-surface-gray-2'
                    "
                    :aria-current="
                      section.key === shownKey ? 'true' : undefined
                    "
                    @click="selected = section.key"
                  >
                    <span class="min-w-0 flex-1 break-words">{{
                      section.title
                    }}</span>
                    <span class="text-sm tabular-nums text-ink-gray-5">{{
                      activeCount(section)
                    }}</span>
                  </button>
                </li>
              </ul>
            </nav>
            <div class="min-w-0">
              <section
                v-for="section in desktopSections"
                :key="section.key"
                class="mb-6"
                :data-section="section.key"
              >
                <h2 class="text-lg font-semibold text-ink-gray-9">
                  {{ section.title }}
                </h2>
                <p v-if="section.intro" class="text-sm text-ink-gray-6">
                  {{ section.intro }}
                </p>
                <div class="mt-2 divide-y divide-outline-gray-1">
                  <AjustesField
                    v-for="field in section.fields"
                    :key="field.fieldname"
                    :field="field"
                    :value="currentValue(field, pending)"
                    :pending="pending.has(field.fieldname)"
                    :rows-count="rowsCount(field)"
                    @edit="edit"
                    @toggle="toggle"
                  />
                </div>
              </section>
            </div>
          </div>

          <!-- Phone: sections fold, as a settings app; a search or a chip opens
               the ones that match. -->
          <div v-else class="grid gap-2">
            <section
              v-for="section in visible"
              :key="section.key"
              class="rounded-xl border border-outline-gray-1"
              :data-section="section.key"
            >
              <h2>
                <button
                  type="button"
                  class="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
                  :aria-expanded="String(isOpen(section))"
                  @click="toggleSection(section)"
                >
                  <span class="min-w-0 flex-1">
                    <span
                      class="block break-words text-base font-semibold text-ink-gray-9"
                      >{{ section.title }}</span
                    >
                    <span
                      class="block break-words text-sm font-normal text-ink-gray-6"
                      >{{ sectionLine(section) }}</span
                    >
                  </span>
                  <span
                    class="size-5 flex-none text-ink-gray-5"
                    :class="
                      isOpen(section)
                        ? 'lucide-chevron-up'
                        : 'lucide-chevron-down'
                    "
                    aria-hidden="true"
                  />
                </button>
              </h2>
              <div
                v-if="isOpen(section)"
                class="divide-y divide-outline-gray-1 border-t border-outline-gray-1 px-4"
              >
                <AjustesField
                  v-for="field in section.fields"
                  :key="field.fieldname"
                  :field="field"
                  :value="currentValue(field, pending)"
                  :pending="pending.has(field.fieldname)"
                  :rows-count="rowsCount(field)"
                  @edit="edit"
                  @toggle="toggle"
                />
              </div>
            </section>
          </div>
        </template>
      </div>
    </div>

    <!-- The change set, until it is saved or dropped. -->
    <div
      v-if="pending.count()"
      class="flex-none border-t border-outline-gray-2 bg-surface-base px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      data-ajustes-savebar
    >
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
        <p
          v-if="saveError"
          role="alert"
          class="w-full break-words text-sm text-ink-red-7"
        >
          {{ saveError }}
        </p>
        <p class="min-w-0 flex-1 text-base text-ink-gray-8">
          {{
            pending.count() === 1
              ? __('1 cambio sin guardar')
              : __('{0} cambios sin guardar', [pending.count()])
          }}
        </p>
        <Button
          variant="ghost"
          class="min-h-11"
          :label="stale ? __('Volver a cargar') : __('Descartar')"
          @click="stale ? reload() : discard()"
        />
        <Button
          v-if="!stale"
          variant="solid"
          class="min-h-11"
          :label="__('Guardar')"
          :loading="busy"
          data-ajustes-save
          @click="save"
        />
      </div>
    </div>

    <BottomSheet
      v-model:open="editorOpen"
      :title="editing?.label || ''"
      :subtitle="editing?.help || ''"
    >
      <template v-if="editing">
        <p
          v-if="editing.when"
          class="mb-3 flex items-start gap-1 text-sm text-ink-gray-6"
        >
          <span
            class="lucide-git-branch mt-0.5 size-4 flex-none"
            aria-hidden="true"
          />
          {{ editing.when }}
        </p>
        <AjustesTable
          v-if="isTable(editing)"
          :field="editing"
          :rows="pending.tableRows(editing.fieldname, editing.table?.rows)"
          @add="(values) => pending.addRow(editing.fieldname, values)"
          @set="(row, values) => pending.setRow(editing.fieldname, row, values)"
          @remove="(row) => pending.removeRow(editing.fieldname, row)"
        />
        <AjustesControl
          v-else
          :id="`ajustes-${editing.fieldname}`"
          :field="editing"
          :model-value="draft"
          @update:model-value="draft = $event"
        />
      </template>
      <template v-if="editing && !isTable(editing)" #actions>
        <Button
          variant="solid"
          class="min-h-11"
          :label="__('Listo')"
          @click="finishEdit"
        />
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Button } from 'frappe-ui'
import { useWindowSize } from '@vueuse/core'
import AppBar from '@/components/ui/AppBar.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import AjustesControl from '@/components/ajustes/AjustesControl.vue'
import AjustesField from '@/components/ajustes/AjustesField.vue'
import AjustesTable from '@/components/ajustes/AjustesTable.vue'
import { useAssistantContext } from '@/components/assistant/useAssistant'
import { isMobile as isPhone } from '@/composables/breakpoint'
import {
  createPending,
  currentValue,
  doctypeFromSlug,
  filterSections,
  loadGuide,
  saveChanges,
  undoChanges,
} from '@/components/ajustes/ajustes'

const props = defineProps({
  doctype: { type: String, default: '' },
  slug: { type: String, default: '' },
  name: { type: String, required: true },
  back: { type: [Object, Boolean], default: true },
})

const doctype = computed(() => props.doctype || doctypeFromSlug(props.slug))
const backTarget = computed(() => props.back)
const { width } = useWindowSize()
const wide = computed(() => width.value >= 1024)

const guide = ref(null)
const loadError = ref('')
const query = ref('')
const searchOpen = ref(false)
const chips = ref([])
const selected = ref('')
const opened = ref(new Set())
const pending = reactive(createPending())
const busy = ref(false)
const saveError = ref('')
const stale = ref(false)
const receipt = ref(null)
const editing = ref(null)
const editorOpen = ref(false)
const draft = ref(null)

useAssistantContext(() => ({
  doctype: doctype.value,
  name: props.name,
  title: guide.value?.title || props.name,
}))

async function load() {
  loadError.value = ''
  try {
    guide.value = await loadGuide(doctype.value, props.name)
  } catch (error) {
    loadError.value =
      error?.messages?.[0] || __('Revisa tu conexión e inténtalo otra vez.')
  }
}
load()
watch(() => [doctype.value, props.name], load)

const onlySet = computed(() => chips.value.includes('set'))
const sectionChip = computed(() => chips.value.find((value) => value !== 'set'))
const chipList = computed(() => {
  const list = [
    {
      value: 'set',
      label: __('Solo lo activado'),
      icon: 'lucide-toggle-right',
    },
  ]
  if (!wide.value)
    for (const section of guide.value?.sections || [])
      list.push({ value: section.key, label: section.title })
  return list
})
// One section chip at a time; «Solo lo activado» combines with it.
watch(chips, (now, before) => {
  const added = now.find((value) => !(before || []).includes(value))
  if (added && added !== 'set')
    chips.value = now.filter((value) => value === 'set' || value === added)
})

function isSetNow(field) {
  if (pending.has(field.fieldname)) {
    if (isTable(field))
      return pending.tableRows(field.fieldname, field.table?.rows).length > 0
    const value = pending.values[field.fieldname]
    return !(value === null || value === '' || value === 0 || value === false)
  }
  return field.set
}

const visible = computed(() => {
  const sections = filterSections(
    guide.value?.sections,
    query.value,
    onlySet.value,
    isSetNow,
  )
  if (sectionChip.value && !wide.value)
    return sections.filter((section) => section.key === sectionChip.value)
  return sections
})
const filtering = computed(
  () =>
    Boolean(query.value.trim()) || onlySet.value || Boolean(sectionChip.value),
)
const shownKey = computed(() =>
  visible.value.some((section) => section.key === selected.value)
    ? selected.value
    : visible.value[0]?.key,
)
// A search on a desktop shows every match; otherwise the chosen section.
const desktopSections = computed(() =>
  query.value.trim()
    ? visible.value
    : visible.value.filter((section) => section.key === shownKey.value),
)

function isOpen(section) {
  return filtering.value || opened.value.has(section.key)
}
function toggleSection(section) {
  const next = new Set(opened.value)
  if (next.has(section.key)) next.delete(section.key)
  else next.add(section.key)
  opened.value = next
}

const totals = computed(() => {
  let count = 0
  let active = 0
  for (const section of guide.value?.sections || []) {
    count += section.fields.length
    active += section.fields.filter(isSetNow).length
  }
  return { count, active }
})
const summary = computed(() =>
  __('{0} ajustes · {1} activados o con valor', [
    totals.value.count,
    totals.value.active,
  ]),
)
function activeCount(section) {
  return `${section.fields.filter(isSetNow).length}/${section.fields.length}`
}
function sectionLine(section) {
  const on = section.fields.filter(isSetNow).length
  return [
    section.intro,
    __('{0} de {1} con valor', [on, section.fields.length]),
  ]
    .filter(Boolean)
    .join(' · ')
}

function isTable(field) {
  return ['Table', 'Table MultiSelect'].includes(field?.fieldtype)
}
function rowsCount(field) {
  if (!isTable(field)) return null
  return pending.tableRows(field.fieldname, field.table?.rows).length
}

function edit(field) {
  editing.value = field
  draft.value = currentValue(field, pending)
  editorOpen.value = true
}
function finishEdit() {
  if (editing.value)
    pending.setValue(editing.value, draft.value, editing.value.value)
  editorOpen.value = false
}
function toggle(field, value) {
  pending.setValue(field, value, field.value)
}
function discard() {
  pending.clear()
  saveError.value = ''
}
async function reload() {
  pending.clear()
  stale.value = false
  saveError.value = ''
  await load()
}

async function save() {
  if (!guide.value || busy.value) return
  busy.value = true
  saveError.value = ''
  try {
    const result = await saveChanges(
      doctype.value,
      props.name,
      pending.changes(),
      guide.value.modified,
    )
    if (!result?.ok) {
      saveError.value = result?.error || __('No se pudo guardar.')
      stale.value = Boolean(result?.stale)
      return
    }
    receipt.value = { lines: result.lines, undo: result.undo }
    pending.clear()
    await load()
  } catch (error) {
    saveError.value =
      error?.messages?.[0] || __('No se pudo guardar. Inténtalo otra vez.')
  } finally {
    busy.value = false
  }
}
async function undo() {
  if (!receipt.value?.undo || busy.value) return
  busy.value = true
  try {
    const result = await undoChanges(receipt.value.undo)
    if (!result?.ok) {
      receipt.value = {
        lines: [result?.error || __('No se pudo deshacer.')],
        undo: null,
      }
      return
    }
    receipt.value = { lines: result.lines, undo: null, undone: true }
    await load()
  } finally {
    busy.value = false
  }
}

onBeforeRouteLeave(() => {
  if (!pending.count()) return true
  return window.confirm(
    __('Tienes cambios sin guardar. ¿Salir sin guardarlos?'),
  )
})
</script>
