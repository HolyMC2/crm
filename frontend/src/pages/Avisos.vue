<template>
  <ModuleLayout
    :title="__('Avisos')"
    :entries="entries"
    :active-key="activeEntry(state)"
    @select="select"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">{{ __('Avisos is not available') }}</h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry')" @click="load()" />
        <Button :label="__('Back')" @click="router.back()" />
      </div>
    </section>
    <template v-else>
      <header
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-ink-gray-9">
            {{ heading }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
        <Button
          v-if="state.view === 'inbox' && data?.groups?.length"
          icon-left="check-circle"
          :label="__('Mark all as read')"
          class="min-h-11 sm:min-h-8"
          :disabled="actions.busy.value"
          @click="actions.readAll(state.category, 'inbox')"
        />
        <Button
          icon-left="sliders"
          :label="__('Preferences')"
          class="min-h-11 sm:min-h-8"
          @click="prefsOpen = true"
        />
      </header>
      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <FormControl
          class="w-full sm:hidden"
          type="select"
          :aria-label="__('List')"
          :model-value="activeEntry(state)"
          :options="entries.map((e) => ({ label: e.label, value: e.value }))"
          @update:model-value="select"
        />
        <FormControl
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs"
          type="search"
          :placeholder="__('Search avisos')"
          :aria-label="__('Search avisos')"
        />
      </div>
      <p
        v-if="actions.status.value"
        role="status"
        class="mx-4 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm sm:mx-6"
        :class="
          actions.status.value.error
            ? 'bg-surface-red-1 text-ink-red-4'
            : 'bg-surface-gray-2 text-ink-gray-8'
        "
      >
        <span class="flex-1">{{ actions.status.value.text }}</span>
        <Button
          v-if="actions.status.value.undo"
          variant="ghost"
          :label="__('Undo')"
          @click="actions.undo()"
        />
      </p>
      <p v-if="data?.capped" class="mx-4 mb-3 text-sm text-ink-gray-6 sm:mx-6">
        {{
          __(
            'Showing the most recent avisos. Mark these as read to see older ones.',
          )
        }}
      </p>
      <section
        v-if="state.view === 'muted' && data?.muted_kinds?.length"
        class="mx-4 mb-4 rounded-lg border border-outline-gray-2 sm:mx-6"
        :aria-label="__('Muted kinds')"
      >
        <h2 class="px-4 pt-3 text-base font-semibold">
          {{ __('Muted kinds') }}
        </h2>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="kind in data.muted_kinds"
            :key="kind.kind"
            class="flex min-h-14 items-center gap-3 px-4"
          >
            <FeatherIcon
              :name="categoryMeta(kind.category).icon"
              class="size-4 text-ink-gray-6"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate text-base">{{
              kind.label
            }}</span>
            <Button
              :label="__('Unmute')"
              class="min-h-11 sm:min-h-8"
              @click="actions.mute(kind, false)"
            />
          </li>
        </ul>
      </section>
      <div v-if="loading && !data" role="status" class="px-6 py-4 text-sm">
        {{ __('Loading avisos…') }}
      </div>
      <div v-else-if="loadError" role="alert" class="space-y-3 px-6 py-4">
        <p class="text-sm text-ink-gray-7">{{ loadError }}</p>
        <Button :label="__('Retry')" @click="load()" />
      </div>
      <template v-else-if="groups.length">
        <AvisosList
          :groups="groups"
          :label="heading"
          @open="actions.open"
          @read="actions.read"
          @mute="actions.mute"
        />
        <div v-if="data?.more" class="p-4 text-center">
          <Button
            :label="__('Load more')"
            :loading="loading"
            @click="load(groups.length)"
          />
        </div>
      </template>
      <div v-else class="mx-auto max-w-md space-y-2 p-8 text-center">
        <FeatherIcon
          name="check-circle"
          class="mx-auto size-10 text-ink-gray-4"
        />
        <p class="text-lg font-medium">{{ empty.title }}</p>
        <p class="text-sm text-ink-gray-6">{{ empty.text }}</p>
        <Button
          v-if="state.view === 'inbox'"
          variant="ghost"
          :label="__('See history')"
          @click="select('history')"
        />
      </div>
    </template>
    <AvisosPrefs v-model:open="prefsOpen" :prefs="data?.prefs" />
  </ModuleLayout>
</template>
<script setup>
import { computed, getCurrentInstance, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FeatherIcon } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import AvisosList from '@/components/avisos/AvisosList.vue'
import AvisosPrefs from '@/components/avisos/AvisosPrefs.vue'
import {
  activeEntry,
  avisosQuery,
  avisosState,
  avisosVersion,
  categoryMeta,
  entryState,
  errorText,
  listEntries,
  loadStream,
  startAvisosLive,
  useAvisosActions,
} from '@/composables/useAvisos'
import { errorKind } from '@/utils/contactos'

const route = useRoute()
const router = useRouter()
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
const state = computed(() => avisosState(route.query))
const search = ref(state.value.q)
const data = ref(null)
const groups = ref([])
const loading = ref(false)
const loadError = ref('')
const guard = ref('')
const prefsOpen = ref(false)

const actions = useAvisosActions(router, {
  returnTo: () => '/crm' + route.fullPath,
})

const entries = computed(() => listEntries(data.value?.counts))
const heading = computed(() => {
  const entry = entries.value.find((e) => e.value === activeEntry(state.value))
  return entry ? entry.label.split(' · ')[0] : __('Avisos')
})
const subtitle = computed(() => {
  if (!data.value) return ''
  if (state.value.view === 'history')
    return __('Avisos you read in the last 30 days.')
  if (state.value.view === 'muted')
    return __('Hidden from the bell. Unmute a kind to see it again.')
  return data.value.total
    ? __('{0} to review, grouped by record.', [data.value.total])
    : __('Nothing waiting for you.')
})
const empty = computed(() =>
  state.value.view === 'inbox'
    ? {
        title: __("You're all caught up"),
        text: __('New avisos for you will show up here.'),
      }
    : state.value.view === 'muted'
      ? {
          title: __('Nothing muted'),
          text: __('Use «Mute this kind» on a repeating alert to quiet it.'),
        }
      : {
          title: __('No history yet'),
          text: __('Avisos you mark as read stay here for 30 days.'),
        },
)

let sequence = 0
async function load(start = 0) {
  const mine = ++sequence
  loading.value = true
  loadError.value = ''
  try {
    const result = await loadStream(state.value, start)
    if (mine !== sequence) return
    guard.value = ''
    data.value = result
    groups.value = start ? [...groups.value, ...result.groups] : result.groups
  } catch (error) {
    if (mine !== sequence) return
    if (errorKind(error) === 'permission') guard.value = errorText(error)
    else loadError.value = errorText(error)
  } finally {
    if (mine === sequence) loading.value = false
  }
}

function select(value) {
  router.replace({ query: avisosQuery(entryState(value, search.value)) })
}

const pushSearch = useDebounceFn((q) => {
  router.replace({ query: avisosQuery({ ...state.value, q }) })
}, 300)
watch(search, (q) => pushSearch(q.trim()))

watch(
  () => [state.value.view, state.value.category, state.value.q],
  () => load(),
)
watch(avisosVersion, () => load())

onMounted(() => {
  startAvisosLive(socket)
  const query = { ...route.query }
  // Returning from a record (§8.3 done=) or the panel's «Preferences».
  if (query.done) actions.status.value = { text: __('Aviso handled.') }
  if (query.prefs) prefsOpen.value = true
  if (query.done || query.prefs) {
    delete query.done
    delete query.prefs
    router.replace({ query })
  }
  load()
})
</script>
