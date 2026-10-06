<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-40" @keydown.esc="close">
      <div
        class="absolute inset-0 bg-black/10 sm:bg-transparent"
        aria-hidden="true"
        @click="close"
      />
      <section
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="__('Avisos')"
        tabindex="-1"
        class="absolute inset-0 flex flex-col bg-surface-base text-ink-gray-9 shadow-2xl outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[400px] sm:border-l sm:border-outline-gray-2"
      >
        <header class="flex items-center gap-1 px-4 pb-2 pt-3">
          <h2 class="flex-1 text-lg font-semibold">{{ __('Avisos') }}</h2>
          <Button
            v-if="data?.groups?.length"
            variant="ghost"
            icon="check-circle"
            class="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
            :tooltip="__('Mark all as read')"
            :aria-label="__('Mark all as read')"
            :disabled="actions.busy.value"
            @click="readAll"
          />
          <Button
            variant="ghost"
            icon="maximize-2"
            class="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
            :tooltip="__('See all avisos')"
            :aria-label="__('See all avisos')"
            @click="seeAll"
          />
          <Button
            variant="ghost"
            icon="x"
            class="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
            :aria-label="__('Close')"
            @click="close"
          />
        </header>
        <div
          class="flex gap-1 overflow-x-auto px-4 pb-2"
          role="tablist"
          :aria-label="__('Kind of aviso')"
        >
          <button
            v-for="chip in chips"
            :key="chip.value"
            role="tab"
            :aria-selected="category === chip.value"
            class="min-h-9 shrink-0 rounded-full px-3 text-sm"
            :class="
              category === chip.value
                ? 'bg-surface-gray-7 text-ink-white'
                : 'bg-surface-gray-2 text-ink-gray-7 hover:bg-surface-gray-3'
            "
            @click="category = chip.value"
          >
            {{ chip.label }}
          </button>
        </div>
        <p
          v-if="actions.status.value"
          role="status"
          class="mx-4 mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
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
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="loading && !data" role="status" class="p-4 text-sm">
            {{ __('Loading avisos…') }}
          </div>
          <div v-else-if="loadError" role="alert" class="space-y-3 p-4">
            <p class="text-sm text-ink-gray-7">{{ loadError }}</p>
            <Button :label="__('Retry')" @click="load" />
          </div>
          <template v-else>
            <AvisosList
              v-if="data?.groups?.length"
              compact
              :groups="data.groups"
              :label="__('Avisos')"
              @open="openGroup"
              @read="actions.read"
              @mute="actions.mute"
            />
            <div v-else class="space-y-2 p-6 text-center">
              <FeatherIcon
                name="check-circle"
                class="mx-auto size-8 text-ink-gray-4"
              />
              <p class="text-base font-medium">
                {{ __("You're all caught up") }}
              </p>
              <p class="text-sm text-ink-gray-6">
                {{ __('New avisos for you will show up here.') }}
              </p>
            </div>
            <p
              v-if="data?.more"
              class="px-4 py-3 text-center text-sm text-ink-gray-6"
            >
              <Button
                variant="ghost"
                :label="__('See all {0} avisos', [data.total])"
                @click="seeAll"
              />
            </p>
          </template>
          <slot />
        </div>
        <footer class="border-t border-outline-gray-1 px-4 py-2">
          <Button
            variant="ghost"
            icon-left="sliders"
            :label="__('Preferences')"
            @click="seeAll({ prefs: 1 })"
          />
        </footer>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FeatherIcon } from 'frappe-ui'
import AvisosList from '@/components/avisos/AvisosList.vue'
import {
  avisosVersion,
  categoryMeta,
  errorText,
  loadStream,
  useAvisosActions,
} from '@/composables/useAvisos'

const open = defineModel('open', { type: Boolean, default: false })
const router = useRouter()
const route = useRoute()
const panel = ref(null)
const category = ref('all')
const data = ref(null)
const loading = ref(false)
const loadError = ref('')

const actions = useAvisosActions(router, {
  returnTo: () => '/crm' + route.fullPath,
  onNavigate: () => close(),
})

const chips = computed(() => {
  const counts = data.value?.counts || {}
  const label = (text, count) => (count ? `${text} · ${count}` : text)
  return [
    { value: 'all', label: __('All') },
    ...['direct', 'messages', 'alerts'].map((cat) => ({
      value: cat,
      label: label(categoryMeta(cat).label, counts[cat]),
    })),
  ]
})

let sequence = 0
async function load() {
  const mine = ++sequence
  loading.value = true
  loadError.value = ''
  try {
    const result = await loadStream({
      view: 'inbox',
      category: category.value,
      q: '',
    })
    if (mine === sequence) data.value = result
  } catch (error) {
    if (mine === sequence) loadError.value = errorText(error)
  } finally {
    if (mine === sequence) loading.value = false
  }
}

function close() {
  open.value = false
}

async function openGroup(group) {
  await actions.open(group)
}

function readAll() {
  actions.readAll(category.value, 'inbox')
}

function seeAll(query = {}) {
  close()
  router.push({
    path: '/avisos',
    query: {
      ...(category.value !== 'all' ? { category: category.value } : {}),
      ...query,
    },
  })
}

watch(open, async (value) => {
  if (!value) return
  actions.status.value = null
  load()
  await nextTick()
  panel.value?.focus()
})
watch(category, () => open.value && load())
watch(avisosVersion, () => open.value && load())
watch(
  () => route.fullPath,
  () => close(),
)
</script>
