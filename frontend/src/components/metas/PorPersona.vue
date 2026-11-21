<template>
  <!-- «Datos por persona» (doco.metas.acompanar): the facts the owner coaches
       with, for each person in the period, goal or no goal. The owner picks
       which facts the table shows; «—» is a fact nobody was judged on. -->
  <section class="mt-6" aria-labelledby="metas-por-persona" data-por-persona>
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <h2
        id="metas-por-persona"
        class="flex-1 text-sm font-semibold text-ink-gray-8"
      >
        {{ __('Facts by person') }}
      </h2>
      <Button
        v-if="state"
        variant="ghost"
        class="min-h-11 sm:min-h-8"
        :label="__('Choose facts')"
        data-por-persona-elegir
        @click="openChoice"
      />
    </div>
    <p class="mb-2 text-sm text-ink-gray-6">
      {{
        __(
          'To praise or correct with facts: what each person did in this period, whether or not there is a goal for it.',
        )
      }}
    </p>
    <p
      v-if="problem"
      role="alert"
      class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      {{ problem }}
    </p>
    <div v-else-if="!state" role="status" class="space-y-2">
      <div class="h-12 animate-pulse rounded-6 bg-surface-gray-2" />
      <div class="h-12 animate-pulse rounded-6 bg-surface-gray-2" />
    </div>
    <template v-else>
      <p
        v-if="!state.people.length"
        class="rounded-6 border border-outline-gray-2 p-4 text-sm text-ink-gray-7"
        data-por-persona-vacio
      >
        {{ __('Nobody has figures for these facts in this period.') }}
      </p>
      <div v-else-if="!isPhone" class="overflow-x-auto">
        <table class="w-full text-left text-sm" data-por-persona-tabla>
          <thead>
            <tr class="border-b border-outline-gray-2 text-ink-gray-6">
              <th class="py-2 pr-3 font-medium">{{ __('Person') }}</th>
              <th
                v-for="fact in state.facts"
                :key="fact.key"
                class="py-2 pr-3 font-medium"
                :title="fact.help"
              >
                {{ fact.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="person in state.people"
              :key="person.user"
              class="border-b border-outline-gray-1"
              :data-persona="person.user"
            >
              <td class="py-2 pr-3">
                <span class="block text-base text-ink-gray-9">{{
                  person.name
                }}</span>
                <span
                  v-if="person.designation"
                  class="block text-xs text-ink-gray-6"
                  >{{ person.designation }}</span
                >
              </td>
              <td
                v-for="fact in state.facts"
                :key="fact.key"
                class="py-2 pr-3 tabular-nums"
                :title="person.facts[fact.key]?.detail || ''"
              >
                {{ person.facts[fact.key]?.text || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul v-else class="space-y-2" data-por-persona-lista>
        <li
          v-for="person in state.people"
          :key="person.user"
          class="rounded-6 border border-outline-gray-2 p-3"
          :data-persona="person.user"
        >
          <p class="text-base font-medium text-ink-gray-9">{{ person.name }}</p>
          <dl class="mt-1 space-y-1 text-sm">
            <div
              v-for="fact in state.facts"
              :key="fact.key"
              class="flex items-baseline gap-2"
            >
              <dt class="min-w-0 flex-1 text-ink-gray-6">{{ fact.label }}</dt>
              <dd class="tabular-nums text-ink-gray-9">
                {{ person.facts[fact.key]?.text || '—' }}
              </dd>
            </div>
          </dl>
        </li>
      </ul>
    </template>

    <BottomSheet
      v-model:open="choosing"
      :title="__('Choose facts')"
      :subtitle="__('Up to 8. Your choice; each manager keeps their own.')"
      layer="metas-datos"
    >
      <div class="space-y-4 pb-2">
        <section v-for="group in groups" :key="group.label">
          <h3 class="mb-1 text-sm font-semibold text-ink-gray-7">
            {{ group.label }}
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="item in group.items"
              :key="item.key"
              type="button"
              :class="chipClass(picked.includes(item.key))"
              :aria-pressed="picked.includes(item.key)"
              :data-dato="item.key"
              @click="flip(item.key)"
            >
              {{ item.label }}
            </button>
          </div>
        </section>
        <div class="flex justify-end gap-2">
          <Button
            class="min-h-11"
            :label="__('Cancel')"
            @click="choosing = false"
          />
          <Button
            variant="solid"
            class="min-h-11"
            :label="__('Show these facts')"
            :disabled="!picked.length"
            :loading="saving"
            data-por-persona-guardar
            @click="saveChoice"
          />
        </div>
      </div>
    </BottomSheet>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { chipClass } from '@/components/ui/chipClass'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { equipoApi, problemOf } from '@/composables/useEquipo'
import { METAS } from '@/composables/useMetas'

const props = defineProps({
  period: { type: String, default: 'week' },
  start: { type: String, default: null },
})

const MAX = 8
const state = ref(null)
const problem = ref('')
const choosing = ref(false)
const picked = ref([])
const saving = ref(false)

const groups = computed(() => {
  const out = new Map()
  for (const item of state.value?.catalog || []) {
    if (!out.has(item.group))
      out.set(item.group, { label: item.group, items: [] })
    out.get(item.group).items.push(item)
  }
  return [...out.values()]
})

let asked = 0
async function load() {
  const ticket = ++asked
  problem.value = ''
  try {
    const answer = await equipoApi(`${METAS}.coaching`, {
      period: props.period,
      start: props.start,
    })
    if (ticket === asked) state.value = answer
  } catch (error) {
    if (ticket === asked)
      problem.value =
        problemOf(error).detail || __('These facts could not load.')
  }
}
watch(() => [props.period, props.start], load, { immediate: true })

function openChoice() {
  picked.value = [...(state.value?.chosen || [])]
  choosing.value = true
}

function flip(key) {
  if (picked.value.includes(key))
    picked.value = picked.value.filter((item) => item !== key)
  else if (picked.value.length < MAX) picked.value = [...picked.value, key]
}

async function saveChoice() {
  saving.value = true
  try {
    await equipoApi(`${METAS}.save_coaching`, { keys: picked.value })
    choosing.value = false
    await load()
  } catch (error) {
    toast.error(problemOf(error).detail || __('It was not saved. Try again.'))
  } finally {
    saving.value = false
  }
}
</script>
