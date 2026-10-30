<template>
  <!-- «Agenda del bot»: what the person left for the assistant to do later
       (doco encargos_bot). Hoy (overdue too), próximos, esperando; each row
       is done in one tap, put off with a quick pick or a time, or cancelled
       with the bin and «Cancelar» where the bin was. -->
  <div
    class="space-y-4 py-2"
    :class="
      docked ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4' : ''
    "
    data-testid="assistant-agenda-view"
  >
    <p
      v-if="agenda.loaded && !groups.length && !agenda.error"
      class="pt-4 text-center text-sm text-ink-gray-6"
      data-testid="assistant-agenda-empty"
    >
      {{
        __(
          'Nothing on the agenda. Ask Muelle «remind me tomorrow at 9 to call Andrés» or «/encarga on Friday put together the posts for the week».',
        )
      }}
    </p>

    <section v-for="group in groups" :key="group.key" :data-group="group.key">
      <h3 class="mb-1 text-xs font-semibold text-ink-gray-6">
        {{ group.label }} ({{ group.rows.length }})
      </h3>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="row in group.rows"
          :key="row.encargo"
          class="py-2"
          :data-encargo="row.encargo"
        >
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <p class="break-words text-base font-medium text-ink-gray-9">
                {{ row.titulo }}
              </p>
              <p class="text-sm text-ink-gray-6">
                <span :class="{ 'text-ink-red-7': overdue(row) }">{{
                  row.cuando_es || row.cuando || __('Now')
                }}</span>
                <span v-if="row.repetir">
                  · {{ repeatLabel(row.repetir) }}</span
                >
              </p>
              <p
                v-if="target(row) || row.sobre"
                class="truncate text-sm text-ink-gray-7"
              >
                <RouterLink
                  v-if="target(row)?.to"
                  :to="target(row).to"
                  class="underline"
                  @click="$emit('navigate')"
                  >{{ target(row).label }}</RouterLink
                >
                <a
                  v-else-if="target(row)?.href"
                  :href="target(row).href"
                  target="_blank"
                  rel="noopener"
                  class="underline"
                  >{{ target(row).label }}</a
                >
                <span v-else>{{ row.sobre }}</span>
              </p>
              <p v-if="row.ultimo_error" class="mt-1 text-sm text-ink-red-7">
                {{ row.ultimo_error }}
              </p>
            </div>
            <div class="flex flex-none items-center">
              <button
                type="button"
                class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
                :aria-label="__('Done', null, 'Encargo')"
                :title="__('Done', null, 'Encargo')"
                :disabled="Boolean(agenda.busy[row.encargo])"
                data-testid="encargo-done"
                @click="doneEncargo(row)"
              >
                <span class="lucide-check size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
                :class="{ 'bg-surface-gray-2': agenda.picking === row.encargo }"
                :aria-label="__('Snooze')"
                :title="__('Snooze')"
                :aria-expanded="agenda.picking === row.encargo"
                :disabled="Boolean(agenda.busy[row.encargo])"
                data-testid="encargo-snooze"
                @click="togglePicks(row)"
              >
                <span class="lucide-alarm-clock size-5" aria-hidden="true" />
              </button>
              <button
                v-if="agenda.confirming === row.encargo"
                type="button"
                class="press min-h-11 rounded-full px-3 text-sm font-medium text-ink-red-7 hover:bg-surface-gray-2"
                :disabled="Boolean(agenda.busy[row.encargo])"
                data-testid="encargo-cancel-confirm"
                @click="cancelEncargo(row)"
              >
                {{ __('Cancel it') }}
              </button>
              <button
                v-else
                type="button"
                class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
                :aria-label="__('Cancel')"
                :title="__('Cancel')"
                :disabled="Boolean(agenda.busy[row.encargo])"
                data-testid="encargo-cancel"
                @click="cancelEncargo(row)"
              >
                <span class="lucide-trash-2 size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <ExpandTransition>
            <div
              v-if="agenda.picking === row.encargo"
              class="flex flex-wrap items-center gap-2 pt-2"
              data-testid="encargo-picks"
            >
              <button
                v-for="pick in picks"
                :key="pick.key"
                type="button"
                class="press min-h-11 rounded-full border border-outline-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2"
                :data-pick="pick.key"
                @click="snooze(row, pick.at)"
              >
                {{ pick.label }}
              </button>
              <label
                class="flex min-h-11 items-center gap-2 text-sm text-ink-gray-7"
              >
                <span class="sr-only">{{ __('Pick a time') }}</span>
                <input
                  type="datetime-local"
                  class="min-h-11 rounded-6 border border-outline-gray-2 bg-surface-white px-2 text-base text-ink-gray-9"
                  :min="minPick"
                  data-testid="encargo-pick-time"
                  @change="
                    $event.target.value &&
                      snooze(row, fromPicker($event.target.value))
                  "
                />
              </label>
            </div>
          </ExpandTransition>
        </li>
      </ul>
    </section>

    <p v-if="agenda.error" role="alert" class="text-sm text-ink-red-7">
      {{ agenda.error }}
    </p>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import {
  agenda,
  cancelEncargo,
  doneEncargo,
  fromPicker,
  groupEncargos,
  parseWhen,
  quickPicks,
  recordTarget,
  snooze,
  stamp,
  togglePicks,
} from './assistantAgenda'

defineProps({ docked: { type: Boolean, default: false } })
defineEmits(['navigate'])

const groups = computed(() => groupEncargos(agenda.items))
// the picks are worked out when they open, so «+1 h» is an hour from the tap
const picks = computed(() => (agenda.picking ? quickPicks() : []))
const minPick = computed(() =>
  agenda.picking ? stamp(new Date()).replace(' ', 'T') : '',
)

function overdue(row) {
  const when = parseWhen(row.cuando)
  return Boolean(when) && when < new Date() && row.estado !== 'Esperando'
}

function target(row) {
  return recordTarget(row)
}

function repeatLabel(value) {
  return (
    {
      Diario: __('every day'),
      Semanal: __('every week'),
      Mensual: __('every month'),
    }[value] || value
  )
}
</script>
