<template>
  <!-- Models the list no longer carries: after a receipt against this list's
       order, the supplier's products the list stopped printing wait here. The
       owner archives them (the default: they leave sales and purchases, the
       history stays), deletes the ones with no record (two taps), or keeps
       them. A model with pieces in stock cannot go yet. -->
  <BottomSheet
    :open="open"
    :title="__('Models the list no longer carries', null, 'Lista')"
    :subtitle="
      rows.length
        ? __('{0} of this supplier, waiting', [rows.length], 'Lista')
        : ''
    "
    layer="lista-retiro"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-3 pb-2">
      <p v-if="!rows.length" class="text-sm text-ink-gray-6">
        {{
          __(
            'Nothing waits. After the next receipt against this order, the models the list dropped show here.',
            null,
            'Lista',
          )
        }}
      </p>
      <template v-else>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'The last receipt found these models of the supplier that the list no longer prints. Archive hides them from sales and purchases and keeps their history; delete is for models with no record.',
              null,
              'Lista',
            )
          }}
        </p>
        <div class="flex items-center justify-between text-xs">
          <button
            type="button"
            class="press min-h-9 rounded-full px-3 text-ink-gray-7 hover:bg-surface-gray-2"
            @click="toggleAll"
          >
            {{
              allChosen
                ? __('Choose none', null, 'Lista')
                : __('Choose all that can go', null, 'Lista')
            }}
          </button>
          <span class="num tabular-nums text-ink-gray-6">{{
            __('{0} chosen', [choice.items.length], 'Lista')
          }}</span>
        </div>
        <ul
          class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          :aria-label="__('Models the list no longer carries', null, 'Lista')"
        >
          <li
            v-for="r in rows"
            :key="r.item"
            class="flex items-start gap-3 p-3"
            :class="r.can_archive ? '' : 'opacity-80'"
          >
            <input
              :id="'retiro-' + r.item"
              v-model="picked[r.item]"
              type="checkbox"
              class="mt-1 size-4 flex-none rounded-4 border-outline-gray-3"
              :disabled="!owner"
            />
            <label :for="'retiro-' + r.item" class="min-w-0 flex-1">
              <span
                class="block truncate text-sm font-medium text-ink-gray-9"
                >{{ r.item_name }}</span
              >
              <span class="block truncate text-xs text-ink-gray-6">{{
                meta(r)
              }}</span>
              <span
                v-if="!r.can_archive"
                class="block text-xs text-ink-amber-9"
                >{{
                  __(
                    '{0} pieces in stock; sell or move them first.',
                    [qty(r.stock)],
                    'Lista',
                  )
                }}</span
              >
              <span
                v-else-if="!r.can_delete"
                class="block text-xs text-ink-gray-5"
                >{{
                  __('Has purchases or sales on record', null, 'Lista')
                }}</span
              >
            </label>
            <span
              v-if="r.item_group"
              class="hidden flex-none text-xs text-ink-gray-5 sm:block"
              >{{ r.item_group }}</span
            >
          </li>
        </ul>
        <p v-if="!owner" class="text-sm text-ink-gray-6">
          {{ __('Only the owner archives or deletes models.', null, 'Lista') }}
        </p>
        <template v-else>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              :class="['press', BTN.filled, 'min-h-11 px-4 text-sm']"
              :disabled="!choice.canArchive || busy"
              @click="emit('act', choice.items, 'archive')"
            >
              <span class="lucide-archive size-4" aria-hidden="true" />
              {{ __('Archive chosen', null, 'Lista') }}
            </button>
            <button
              type="button"
              :class="['press', BTN.tonal, 'min-h-11 px-4 text-sm']"
              :disabled="!choice.items.length || busy"
              @click="emit('act', choice.items, 'keep')"
            >
              <span class="lucide-check size-4" aria-hidden="true" />
              {{ __('Keep chosen', null, 'Lista') }}
            </button>
            <button
              type="button"
              :class="[
                'press',
                confirming ? BTN.danger : BTN.text,
                'min-h-11 px-4 text-sm',
              ]"
              :disabled="!choice.canDelete || busy"
              @click="tapDelete"
            >
              <span class="lucide-trash-2 size-4" aria-hidden="true" />
              {{
                confirming
                  ? __('Delete for good', null, 'Lista')
                  : __('Delete chosen', null, 'Lista')
              }}
            </button>
            <button
              type="button"
              class="press ml-auto flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
              :aria-label="__('Look again', null, 'Lista')"
              :title="__('Look again', null, 'Lista')"
              :disabled="busy"
              @click="emit('refresh')"
            >
              <span
                :class="[
                  'lucide-refresh-cw size-4',
                  busy ? 'animate-spin' : '',
                ]"
                aria-hidden="true"
              />
            </button>
          </div>
          <p v-if="hint" class="text-xs text-ink-gray-6">{{ hint }}</p>
          <p v-if="problem" class="text-sm text-ink-red-7">{{ problem }}</p>
        </template>
      </template>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { BottomSheet } from '@/components/ui'
import { qty } from '@/composables/useCompras'
import { BTN } from '@/documentos/tools'
import { formatDate } from '@/utils/display'
import { retireChoice, retireDefaults } from '@/utils/listaPrecios'

const props = defineProps({
  open: { type: Boolean, default: false },
  rows: { type: Array, default: () => [] },
  owner: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  problem: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'act', 'refresh'])

const picked = ref(retireDefaults(props.rows))
watch(
  () => props.rows,
  (rows) => {
    picked.value = retireDefaults(rows)
    confirming.value = false
  },
)
const choice = computed(() => retireChoice(props.rows, picked.value))
const allChosen = computed(
  () =>
    choice.value.items.length > 0 &&
    props.rows.filter((r) => r.can_archive).every((r) => picked.value[r.item]),
)
function toggleAll() {
  picked.value = allChosen.value ? {} : retireDefaults(props.rows)
}

function meta(r) {
  const when = r.last_date ? formatDate(r.last_date, { relative: false }) : ''
  return [
    r.part_no,
    when && r.last_list
      ? __('last on the list of {0}', [when], 'Lista')
      : r.last_list,
  ]
    .filter(Boolean)
    .join(' · ')
}

const hint = computed(() => {
  const c = choice.value
  const [blocked] = c.blocked
  const [recorded] = c.recorded
  if (!c.items.length) return __('Choose the models to act on.', null, 'Lista')
  if (blocked)
    return __(
      '{0} still has pieces in stock; take it off the choice or move them first.',
      [blocked],
      'Lista',
    )
  if (recorded)
    return __(
      '{0} has purchases or sales on record; archive it instead of deleting.',
      [recorded],
      'Lista',
    )
  return ''
})

// Delete is two taps: the second, within a few seconds, deletes for good.
const confirming = ref(false)
let timer = null
function tapDelete() {
  if (confirming.value) {
    confirming.value = false
    clearTimeout(timer)
    emit('act', choice.value.items, 'delete')
    return
  }
  confirming.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (confirming.value = false), 4000)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>
