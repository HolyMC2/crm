<template>
  <!-- «Primeros pasos», the whole list: what Hoy's card leaves out (done steps,
       hidden ones, the Hoy choice), so the owner never needs the Desk page. -->
  <BottomSheet
    :open="open"
    :title="__('First steps', null, 'Primeros pasos')"
    :subtitle="
      answer
        ? __('{0} of {1} done', [answer.hechos, answer.total], 'Primeros pasos')
        : ''
    "
    flush
    @update:open="(value) => !value && emit('close')"
  >
    <p
      v-if="loading && !answer"
      role="status"
      class="flex items-center gap-2 px-5 py-6 text-sm text-ink-gray-6"
    >
      <span
        class="lucide-loader-circle size-4 animate-spin"
        aria-hidden="true"
      />
      {{ __('Loading your steps…', null, 'Primeros pasos') }}
    </p>
    <div
      v-else-if="problem && !answer"
      role="alert"
      class="space-y-3 px-5 py-4"
    >
      <p class="text-sm text-ink-red-7">{{ problem }}</p>
      <Button
        class="min-h-11"
        :label="__('Retry', null, 'Primeros pasos')"
        @click="load"
      />
    </div>
    <div v-else-if="answer" class="pb-4" data-testid="primeros-todos">
      <template v-for="group in sections" :key="group.key">
        <p
          v-if="group.title"
          class="px-4 pb-1 pt-4 text-sm font-medium text-ink-gray-7"
        >
          {{ group.title }}
        </p>
        <ul
          :aria-label="group.title || __('First steps', null, 'Primeros pasos')"
        >
          <li v-for="step in group.steps" :key="step.key" :data-paso="step.key">
            <div class="flex items-center">
              <div class="min-w-0 flex-1">
                <ListRow
                  :title="step.titulo"
                  :subtitle="step.detalle || step.porque"
                  :subtitle-lines="2"
                  :icon="iconOf(step)"
                  :to="linkOf(step.accion).to"
                  :href="linkOf(step.accion).href || ''"
                  v-on="
                    linkOf(step.accion).hoja
                      ? { click: () => emit('hoja', linkOf(step.accion).hoja) }
                      : {}
                  "
                />
              </div>
              <Button
                variant="ghost"
                class="mr-2 min-h-11 shrink-0"
                :label="
                  step.oculto
                    ? __('Show', null, 'Primeros pasos')
                    : __('Hide', null, 'Primeros pasos')
                "
                :loading="busy === step.key"
                :data-testid="`paso-${step.oculto ? 'mostrar' : 'ocultar'}-${step.key}`"
                @click="toggle(step)"
              />
            </div>
            <!-- Other ways to the same step, while it is still open. -->
            <div
              v-if="step.otras.length && !step.oculto && !step.hecho"
              class="-mt-1 flex flex-wrap gap-x-3 pb-1 pl-16 pr-4"
            >
              <template v-for="other in step.otras" :key="other.url">
                <RouterLink
                  v-if="linkOf(other).to"
                  :to="linkOf(other).to"
                  class="flex min-h-11 items-center text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9 sm:min-h-8"
                  >{{ other.label }}</RouterLink
                >
                <button
                  v-else-if="linkOf(other).hoja"
                  type="button"
                  class="flex min-h-11 items-center text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9 sm:min-h-8"
                  @click="emit('hoja', linkOf(other).hoja)"
                >
                  {{ other.label }}
                </button>
                <a
                  v-else
                  :href="linkOf(other).href"
                  class="flex min-h-11 items-center text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9 sm:min-h-8"
                  >{{ other.label }}</a
                >
              </template>
            </div>
          </li>
        </ul>
      </template>
      <div class="mt-2 border-t border-outline-gray-1 px-4 pt-3">
        <p class="text-sm text-ink-gray-6">
          {{
            answer.en_hoy
              ? __(
                  'The card shows on Hoy until every step is done.',
                  null,
                  'Primeros pasos',
                )
              : __('The card does not show on Hoy.', null, 'Primeros pasos')
          }}
        </p>
        <Button
          variant="subtle"
          class="mt-2 min-h-11"
          :label="
            answer.en_hoy
              ? __('Hide from Hoy', null, 'Primeros pasos')
              : __('Show on Hoy', null, 'Primeros pasos')
          "
          :loading="busy === 'hoy'"
          data-testid="primeros-en-hoy"
          @click="toggleHoy"
        />
      </div>
      <p v-if="problem" role="alert" class="px-4 pt-2 text-sm text-ink-red-7">
        {{ problem }}
      </p>
    </div>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from 'frappe-ui'
import { BottomSheet, ListRow } from '@/components/ui'
import { sourceLink } from '@/composables/useHoy'
import { errorText } from '@/utils/errorText'
import {
  loadTodos,
  mostrarEnHoy,
  mostrarPaso,
  ocultarPaso,
  todosGroups,
} from './primerosPasos'

const props = defineProps({
  open: { type: Boolean, default: false },
})
// hoja: open another of Hoy's sheets; changed: Hoy's card changed (re-read Hoy).
const emit = defineEmits(['close', 'hoja', 'changed'])

const CTX = 'Primeros pasos'
const answer = ref(null)
const loading = ref(false)
const problem = ref('')
const busy = ref('')
let ticket = 0

const sections = computed(() => {
  const { open, done, hidden } = todosGroups(answer.value)
  return [
    { key: 'open', title: '', steps: open },
    { key: 'done', title: __('Done', null, CTX), steps: done },
    { key: 'hidden', title: __('Hidden', null, CTX), steps: hidden },
  ].filter((group) => group.steps.length)
})

// A step's link the way Hoy's rows follow it: a sheet here, a shell page with
// the way back to Hoy, or another app's page.
function linkOf(link) {
  return link?.url ? sourceLink(link.url) : {}
}
function iconOf(step) {
  if (step.hecho) return 'lucide-circle-check'
  if (step.bloqueado) return 'lucide-lock'
  return 'lucide-circle'
}

async function load() {
  const mine = ++ticket
  loading.value = true
  problem.value = ''
  try {
    const read = await loadTodos()
    if (mine === ticket) answer.value = read
  } catch (error) {
    if (mine === ticket)
      problem.value = errorText(
        error,
        __('Your steps did not load. Retry.', null, CTX),
      )
  } finally {
    if (mine === ticket) loading.value = false
  }
}

watch(
  () => props.open,
  (open) => open && load(),
  { immediate: true },
)

async function act(key, run) {
  if (busy.value) return
  busy.value = key
  problem.value = ''
  try {
    await run()
    emit('changed')
    await load()
  } catch (error) {
    problem.value = errorText(
      error,
      __('That did not go through. Try again.', null, CTX),
    )
  } finally {
    busy.value = ''
  }
}
function toggle(step) {
  return act(step.key, () =>
    step.oculto ? mostrarPaso(step.key) : ocultarPaso(step.key),
  )
}
function toggleHoy() {
  return act('hoy', () => mostrarEnHoy(!answer.value.en_hoy))
}
</script>
