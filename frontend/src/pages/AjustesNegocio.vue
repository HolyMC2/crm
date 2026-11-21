<template>
  <!-- «Ajustes del negocio» (crm.business_settings): what each app lists for
       the owner, by area, in plain words; then every other switch of the
       shop's settings, searchable. A tap saves; a refusal puts it back. -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" data-ajustes-negocio>
    <AppBar
      v-if="isPhone"
      v-model:search="query"
      v-model:search-open="searchOpen"
      :title="__('Business settings')"
      searchable
      :search-label="__('Search a setting')"
    />
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 lg:px-6">
        <header v-if="!isPhone" class="mb-4 space-y-3">
          <h1 class="text-2xl font-semibold text-ink-gray-9">
            {{ __('Business settings') }}
          </h1>
          <input
            v-model="query"
            type="search"
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-4"
            :placeholder="__('Search a setting')"
            :aria-label="__('Search a setting')"
            data-negocio-buscar
          />
        </header>
        <p
          v-if="problem"
          role="alert"
          class="mb-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
          data-negocio-problema
        >
          {{ problem }}
          <Button
            v-if="!state"
            class="ml-2 min-h-11"
            :label="__('Retry')"
            @click="load"
          />
        </p>
        <div v-if="!state && !problem" role="status" class="space-y-3">
          <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
          <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
          <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
        </div>
        <template v-else-if="state">
          <section
            v-for="area in shownAreas"
            :key="area.key"
            class="mb-6"
            :aria-labelledby="`negocio-${area.key}`"
            :data-negocio-area="area.key"
          >
            <h2
              :id="`negocio-${area.key}`"
              class="mb-1 text-sm font-semibold text-ink-gray-7"
            >
              {{ area.label }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="row in area.rows"
                :key="row.key"
                :data-negocio="row.key"
              >
                <component
                  :is="row.to ? 'RouterLink' : 'a'"
                  v-if="row.kind === 'screen'"
                  v-bind="row.to ? { to: row.to } : { href: row.href }"
                  class="flex min-h-14 items-center gap-3 py-2"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block text-base text-ink-gray-9">{{
                      row.label
                    }}</span>
                    <span
                      v-if="row.help"
                      class="block text-sm text-ink-gray-6"
                      >{{ row.help }}</span
                    >
                  </span>
                  <span
                    class="lucide-chevron-right size-4 shrink-0 text-ink-gray-5"
                    aria-hidden="true"
                  />
                </component>
                <div v-else class="flex min-h-14 items-center gap-3 py-2">
                  <label
                    :for="`negocio-${row.key}`"
                    class="flex min-w-0 flex-1 flex-col"
                  >
                    <span class="text-base text-ink-gray-9">{{
                      row.label
                    }}</span>
                    <span class="text-sm text-ink-gray-6">{{
                      sentence(row)
                    }}</span>
                  </label>
                  <AjustesSwitch
                    :id="`negocio-${row.key}`"
                    :model-value="row.value"
                    :label="row.label"
                    :disabled="!row.can_change || busy.has(row.key)"
                    @update:model-value="(value) => toggle(row, value)"
                  />
                </div>
              </li>
            </ul>
          </section>

          <section
            v-if="advancedShown.length || !query"
            aria-labelledby="negocio-todos"
            data-negocio-todos
          >
            <button
              id="negocio-todos"
              type="button"
              class="press flex min-h-12 w-full items-center gap-2 text-left text-sm font-semibold text-ink-gray-7"
              :aria-expanded="advancedOpen"
              @click="showAll = !showAll"
            >
              <span class="flex-1">{{
                __('Every other switch ({0})', [advancedShown.length])
              }}</span>
              <span
                class="lucide-chevron-down size-4 transition-transform motion-reduce:transition-none"
                :class="advancedOpen ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </button>
            <p v-if="advancedOpen" class="mb-2 text-sm text-ink-gray-6">
              {{
                __(
                  'Each app’s own settings, with their own words. Change one when you know what it does.',
                )
              }}
            </p>
            <template v-if="advancedOpen">
              <div
                v-for="group in advancedGroups"
                :key="group.doctype"
                class="mb-4"
                :data-negocio-grupo="group.doctype"
              >
                <h3 class="text-sm font-medium text-ink-gray-7">
                  {{ group.label }}
                </h3>
                <ul class="divide-y divide-outline-gray-1">
                  <li
                    v-for="row in group.rows"
                    :key="row.key"
                    class="flex min-h-14 items-center gap-3 py-2"
                    :data-negocio="row.key"
                  >
                    <label
                      :for="`negocio-${row.key}`"
                      class="flex min-w-0 flex-1 flex-col"
                    >
                      <span class="text-base text-ink-gray-9">{{
                        row.label
                      }}</span>
                      <span
                        v-if="row.help"
                        class="line-clamp-3 text-sm text-ink-gray-6"
                        >{{ row.help }}</span
                      >
                    </label>
                    <AjustesSwitch
                      :id="`negocio-${row.key}`"
                      :model-value="row.value"
                      :label="row.label"
                      :disabled="!row.can_change || busy.has(row.key)"
                      @update:model-value="(value) => toggle(row, value)"
                    />
                  </li>
                </ul>
              </div>
            </template>
          </section>
          <p
            v-if="query && !shownAreas.length && !advancedShown.length"
            class="py-6 text-center text-base text-ink-gray-6"
            data-negocio-vacio
          >
            {{ __('No setting matches «{0}».', [query]) }}
          </p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Button, call, toast } from 'frappe-ui'
import { AppBar } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { errorText } from '@/utils/errorText'

const API = 'crm.api.business_settings.'
const state = ref(null)
const problem = ref('')
const query = ref('')
const searchOpen = ref(false)
const showAll = ref(false)
const busy = reactive(new Set())

const words = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const matches = (row) => {
  const needle = words(query.value.trim())
  if (!needle) return true
  return words(
    [row.label, row.help, row.on, row.off, row.doctype_label].join(' '),
  ).includes(needle)
}

const shownAreas = computed(() =>
  (state.value?.areas || [])
    .map((area) => ({
      ...area,
      rows: (state.value?.curated || []).filter(
        (row) => row.area === area.key && matches(row),
      ),
    }))
    .filter((area) => area.rows.length),
)
const advancedShown = computed(() =>
  (state.value?.advanced || []).filter(matches),
)
const advancedOpen = computed(
  () => showAll.value || Boolean(query.value.trim()),
)
const advancedGroups = computed(() => {
  const groups = new Map()
  for (const row of advancedShown.value) {
    if (!groups.has(row.doctype))
      groups.set(row.doctype, {
        doctype: row.doctype,
        label: row.doctype_label,
        rows: [],
      })
    groups.get(row.doctype).rows.push(row)
  }
  return [...groups.values()]
})

function sentence(row) {
  if (row.value && row.on) return row.on
  if (!row.value && row.off) return row.off
  return row.help || ''
}

async function load() {
  problem.value = ''
  try {
    state.value = await call(API + 'page')
  } catch (error) {
    problem.value = errorText(
      error,
      __('The settings could not open. Try again.'),
    )
  }
}
onMounted(load)

// The tap shows at once; the server's answer replaces it, a refusal puts it back.
async function toggle(row, value) {
  if (busy.has(row.key)) return
  const before = row.value
  row.value = value
  busy.add(row.key)
  try {
    const answer = await call(API + 'set_switch', {
      key: row.key,
      value: value ? 1 : 0,
    })
    row.value = Boolean(answer?.value)
    toast.success(
      row.value
        ? __('Turned on: {0}', [row.label])
        : __('Turned off: {0}', [row.label]),
    )
  } catch (error) {
    row.value = before
    toast.error(errorText(error, __('It did not change. Try again.')))
  } finally {
    busy.delete(row.key)
  }
}
</script>
