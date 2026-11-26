<template>
  <!-- Equipo › Carga (S47, doco.metas.api.carga): what each person contributed in
       the day or week and what was on them, judged by the shop's rules (strong in
       one area makes up for another; at work with nothing anywhere is wrong). -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav v-if="!isPhone" class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="router.push('/equipo')"
        >
          <span class="lucide-arrow-left size-4" aria-hidden="true" />
          {{ __('Back to Equipo') }}
        </button>
      </nav>
      <h1 class="title-face mb-3 text-2xl font-semibold text-ink-gray-9">
        {{ __('Team workload', null, 'Equipo') }}
      </h1>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="w-full sm:w-64">
          <Segmented
            :label="__('Period', null, 'Equipo')"
            :options="periods"
            :model-value="period"
            @update:model-value="(value) => go(value, null)"
          />
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7"
            :aria-label="__('Previous', null, 'Equipo')"
            :title="__('Previous', null, 'Equipo')"
            @click="go(period, shift(-1))"
          >
            <span class="lucide-chevron-left size-4" aria-hidden="true" />
          </button>
          <span
            class="min-w-0 text-sm font-medium text-ink-gray-8"
            data-testid="carga-range"
            >{{ rangeLabel(answer) }}</span
          >
          <button
            type="button"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7"
            :aria-label="__('Next', null, 'Equipo')"
            :title="__('Next', null, 'Equipo')"
            @click="go(period, shift(1))"
          >
            <span class="lucide-chevron-right size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <EmptyState
        v-if="loading && !answer"
        state="loading"
        :title="__('Loading…')"
      />
      <EmptyState
        v-else-if="error && !answer"
        state="error"
        :title="__('Could not load the team', null, 'Equipo')"
        :message="error"
        :action="__('Retry')"
        @action="load"
      />
      <EmptyState
        v-else-if="answer && !answer.people.length"
        :title="__('Nobody to show yet', null, 'Equipo')"
      />

      <ListGroup v-else-if="answer" tag="ul" data-testid="carga-people">
        <li v-for="person in answer.people" :key="person.user">
          <button
            type="button"
            class="state-layer flex w-full items-start gap-3 px-4 py-3 text-left"
            :aria-expanded="open === person.user"
            :data-testid="`carga-${person.juicio}`"
            @click="open = open === person.user ? '' : person.user"
          >
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="truncate text-base font-medium text-ink-gray-9">{{
                  person.name
                }}</span>
                <StatusChip
                  :label="verdictLabel(person.juicio)"
                  :tone="verdictTone(person.juicio)"
                />
                <span
                  v-if="person.extra"
                  class="rounded-4 bg-surface-gray-3 px-2 py-0.5 text-xs text-ink-gray-8"
                  data-testid="carga-extra"
                  >{{ extraLabel(person.extra) }}</span
                >
              </span>
              <span class="mt-0.5 block text-sm text-ink-gray-7">{{
                person.motivo
              }}</span>
              <span class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="area in person.areas"
                  :key="area.key"
                  class="rounded-4 px-2 py-0.5 text-xs"
                  :class="levelClass(area.level)"
                  >{{ area.label }}
                  <span class="num">{{ shown(area.value) }}</span></span
                >
              </span>
            </span>
            <span
              class="lucide-chevron-down mt-1 size-4 flex-none text-ink-gray-5 transition-transform"
              :class="open === person.user && 'rotate-180'"
              aria-hidden="true"
            />
          </button>
          <ExpandTransition>
            <dl
              v-if="open === person.user"
              class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-4 pb-3 text-sm"
            >
              <template v-for="area in person.areas" :key="area.key">
                <dt class="text-ink-gray-7">{{ area.label }}</dt>
                <dd class="text-ink-gray-9">
                  {{ area.detail || shown(area.value) }}
                </dd>
              </template>
              <dt class="text-ink-gray-7">
                {{ __('Days at work', null, 'Equipo') }}
              </dt>
              <dd class="num text-ink-gray-9">{{ person.days }}</dd>
            </dl>
          </ExpandTransition>
        </li>
      </ListGroup>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import {
  EmptyState,
  ExpandTransition,
  ListGroup,
  Segmented,
  StatusChip,
} from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import {
  extraLabel,
  levelClass,
  rangeLabel,
  shiftDay,
  verdictLabel,
  verdictTone,
} from '@/components/equipo/carga'

const route = useRoute()
const router = useRouter()
const answer = ref(null)
const loading = ref(false)
const error = ref('')
const open = ref('')
const periods = [
  { value: 'day', label: __('Day', null, 'Equipo') },
  { value: 'week', label: __('Week', null, 'Equipo') },
]
const period = computed(() => (route.query.periodo === 'week' ? 'week' : 'day'))
const day = computed(() => (route.query.dia ? String(route.query.dia) : ''))

function shift(steps) {
  const base = answer.value?.start || day.value
  return base ? shiftDay(base, steps * (period.value === 'week' ? 7 : 1)) : null
}

function go(nextPeriod, nextDay) {
  router.replace({
    query: {
      ...route.query,
      periodo: nextPeriod === 'week' ? 'week' : undefined,
      dia: nextDay || day.value || undefined,
    },
  })
}

function shown(value) {
  return Number.isInteger(value) ? value : Math.round(value * 10) / 10
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    answer.value = await call('doco.metas.api.carga', {
      period: period.value,
      start: day.value || undefined,
    })
  } catch (failure) {
    error.value =
      failure?.messages?.[0] || __('Check your connection and try again.')
  } finally {
    loading.value = false
  }
}

watch(() => [period.value, day.value], load)
onMounted(load)
</script>
