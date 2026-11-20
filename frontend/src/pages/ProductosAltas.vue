<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <!-- «Altas por revisar»: pieces the team found that the shop has not
           created. Who creates products sees what waits; who registered sees
           theirs. A card earns its border with the piece's photo. -->
      <AppBar
        v-if="isPhone"
        back="/productos"
        :back-label="__('Products', null, CTX)"
        :title="__('New products', null, CTX)"
        :loading="loading"
      />
      <div class="mx-auto w-full max-w-3xl space-y-3 px-4 pb-28 pt-3 sm:px-6">
        <header v-if="!isPhone" class="flex flex-wrap items-center gap-3">
          <RouterLink
            to="/productos"
            class="press inline-flex min-h-11 items-center rounded-6 px-2 text-base text-ink-gray-7 hover:bg-surface-gray-2 sm:min-h-8"
            >{{ __('Products', null, CTX) }}</RouterLink
          >
          <h1 class="title-face flex-1 text-2xl font-semibold text-ink-gray-9">
            {{ __('New products', null, CTX) }}
          </h1>
          <RouterLink
            v-if="boot?.can_propose"
            :to="{ name: 'AltaNueva' }"
            class="press inline-flex min-h-8 items-center rounded-6 bg-[var(--muelle-accent)] px-3 text-base font-medium text-[var(--muelle-accent-ink)]"
            data-altas-nueva
            >{{ __('Register something new', null, CTX) }}</RouterLink
          >
        </header>

        <Segmented
          v-if="views.length > 1"
          :model-value="view"
          :options="views"
          :label="__('List', null, CTX)"
          data-altas-vistas
          @update:model-value="setView"
        />
        <p v-if="view === 'revisar'" class="text-base text-ink-gray-7">
          {{
            __(
              'What the team found that is not in the system. The assistant proposes the name; you decide.',
              null,
              CTX,
            )
          }}
        </p>

        <EmptyState
          v-if="loading && !rows.length"
          state="loading"
          :title="__('Loading…', null, CTX)"
        />
        <EmptyState
          v-else-if="problem && !rows.length"
          state="error"
          :title="__('The list did not load', null, CTX)"
          :message="problem"
          :action="__('Try again', null, CTX)"
          @action="load"
        />
        <EmptyState
          v-else-if="!rows.length"
          :title="emptyTitle"
          :message="emptyMessage"
        />

        <ul
          v-if="rows.length"
          class="grid grid-cols-2 gap-3 sm:grid-cols-3"
          :aria-label="__('New products', null, CTX)"
        >
          <li v-for="row in rows" :key="row.name">
            <RouterLink
              :to="{ name: 'Alta', params: { name: row.name } }"
              class="press flex h-full flex-col overflow-hidden rounded-6 ring-1 ring-outline-gray-2 hover:ring-outline-gray-3"
              :data-alta="row.name"
            >
              <div class="relative aspect-square bg-surface-gray-2">
                <img
                  v-if="row.fotos?.length"
                  :src="row.fotos[0]"
                  alt=""
                  loading="lazy"
                  class="size-full object-cover"
                />
                <span
                  v-else
                  class="lucide-package flex size-full items-center justify-center text-ink-gray-5"
                  aria-hidden="true"
                />
                <StatusChip
                  class="absolute left-2 top-2"
                  :tone="estadoTone(row.estado)"
                  :label="estadoLabel(row.estado, t)"
                />
              </div>
              <div class="flex flex-1 flex-col gap-0.5 p-2">
                <span
                  class="line-clamp-2 text-base font-medium text-ink-gray-9"
                  >{{ altaTitle(row, t) }}</span
                >
                <span class="line-clamp-2 text-sm text-ink-gray-6">{{
                  altaLine(row, t)
                }}</span>
                <span
                  v-if="row.parecido && row.estado === 'Por revisar'"
                  class="text-sm text-ink-amber-8"
                  >{{ __('Looks like it already exists', null, CTX) }}</span
                >
              </div>
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
    <Fab
      v-if="isPhone && boot?.can_propose"
      :label="__('Register something new', null, CTX)"
      icon="lucide-camera"
      :to="{ name: 'AltaNueva' }"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { AppBar, EmptyState, Fab, Segmented, StatusChip } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import {
  CTX,
  altaLine,
  altaTitle,
  altasApi,
  estadoLabel,
  estadoTone,
  problemOf,
} from '@/composables/useAltas'

const t = (...args) => __(...args)
const route = useRoute()
const router = useRouter()
const boot = ref(null)
const rows = ref([])
const loading = ref(false)
const problem = ref('')
const view = ref(String(route.query.vista || ''))

const views = computed(() => {
  const out = []
  if (boot.value?.can_decide)
    out.push({
      value: 'revisar',
      label: countLabel(__('To review', null, CTX), boot.value.por_revisar),
    })
  if (boot.value?.can_propose)
    out.push({
      value: 'mias',
      label: countLabel(__('Mine', null, CTX), boot.value.mias),
    })
  out.push({ value: 'hechas', label: __('Decided', null, CTX) })
  return out
})

function countLabel(label, count) {
  return count ? `${label} (${count})` : label
}

const emptyTitle = computed(
  () =>
    ({
      revisar: __('Nothing to review', null, CTX),
      mias: __('You have nothing waiting', null, CTX),
    })[view.value] || __('Nothing decided yet', null, CTX),
)
const emptyMessage = computed(() =>
  view.value === 'hechas'
    ? ''
    : __(
        'When someone finds a piece that is not in the system, they register it with «Register something new».',
        null,
        CTX,
      ),
)

function setView(value) {
  view.value = value
  router.replace({ query: { ...route.query, vista: value } })
  load()
}

async function load() {
  loading.value = true
  problem.value = ''
  try {
    const answer = await altasApi('lista', { vista: view.value })
    rows.value = answer?.rows || []
  } catch (error) {
    rows.value = []
    problem.value = problemOf(error).detail
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    boot.value = await altasApi('boot')
  } catch (error) {
    problem.value = problemOf(error).detail
    return
  }
  if (!views.value.some((option) => option.value === view.value))
    view.value = views.value[0].value
  load()
})
</script>
