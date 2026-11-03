<template>
  <section
    ref="root"
    class="flex min-h-0 min-w-0 flex-col border-r border-outline-gray-1"
    aria-label="Conversaciones de clientes"
  >
    <div class="border-b border-outline-gray-1 p-3">
      <nav
        class="mb-3 flex flex-wrap gap-1 text-xs"
        aria-label="Vista de conversaciones"
      >
        <button
          v-for="item in VIEWS"
          :key="item.id"
          type="button"
          class="rounded-4 border border-outline-gray-2 px-2 py-1"
          :class="view === item.id ? 'bg-surface-gray-3 font-medium' : ''"
          :aria-pressed="view === item.id"
          :disabled="disabled"
          @click="$emit('view', item.id, label)"
        >
          {{ item.label }}
        </button>
      </nav>
      <div
        v-if="availability"
        class="mb-3 flex items-center justify-between gap-2 text-xs"
      >
        <p class="min-w-0">
          <span class="block font-medium">Recibir conversaciones nuevas</span>
          <span class="block text-ink-gray-5">{{
            availability.receives_new
              ? `Te llegan por turno. Tienes ${availability.open} abiertas.`
              : 'No te llegan nuevas; las tuyas siguen aquí.'
          }}</span>
        </p>
        <AjustesSwitch
          :model-value="availability.receives_new"
          label="Recibir conversaciones nuevas"
          :disabled="disabled || availabilityBusy"
          @update:model-value="$emit('availability', $event)"
        />
      </div>
      <Segmented
        v-if="view !== 'account'"
        class="mb-3"
        :model-value="sort"
        :options="SORTS"
        label="Orden de la lista"
        @update:model-value="!disabled && $emit('sort', $event)"
      />
      <label
        v-if="view !== 'account' && labels.length"
        class="mb-3 block text-xs font-medium"
        >Etiqueta
        <select
          :value="label"
          :disabled="disabled"
          class="mt-2 block w-full min-w-0 rounded-4 border border-outline-gray-2 bg-surface-base p-2 text-sm text-ink-gray-8"
          @change="$emit('view', view, $event.target.value)"
        >
          <option value="">Todas las etiquetas</option>
          <option v-for="item in labels" :key="item.name" :value="item.name">
            {{ item.name }}
          </option>
        </select>
      </label>
      <button
        v-if="canManage"
        type="button"
        class="mb-3 text-xs underline"
        :disabled="disabled"
        @click="$emit('performance')"
      >
        Desempeño del equipo
      </button>
      <label v-if="view === 'account'" class="block text-xs font-medium"
        >Cuenta del canal
        <select
          :value="accountKey(account)"
          :disabled="disabled"
          class="mt-2 block w-full min-w-0 rounded-4 border border-outline-gray-2 bg-surface-base p-2 text-sm text-ink-gray-8"
          @change="selectAccount"
        >
          <option value="" disabled>Seleccionar cuenta</option>
          <option
            v-for="item in accounts"
            :key="accountKey(item)"
            :value="accountKey(item)"
          >
            {{ item.provider }} · {{ item.label
            }}{{ labelOnly(item) ? '' : ' · ' + item.account_id
            }}{{ item.active ? '' : ' (inactiva)' }}
          </option>
        </select>
      </label>
      <p
        v-if="account && view === 'account'"
        class="mt-2 text-xs text-ink-gray-5 [overflow-wrap:anywhere]"
      >
        {{ account.provider }} ·
        {{ labelOnly(account) ? account.label : account.account_id }}
      </p>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="!threads.length && !loading" class="p-4 text-sm text-ink-gray-5">
        {{
          (sort === 'waiting' && view !== 'account' && EMPTY.waiting) ||
          EMPTY[view] ||
          EMPTY.account
        }}
      </p>
      <button
        v-for="thread in threads"
        :key="thread.name || thread.peer_id"
        type="button"
        data-key-row
        :data-row-current="
          (selected === thread.name && thread.name) || undefined
        "
        :disabled="disabled"
        class="block w-full min-w-0 border-b border-outline-gray-1 p-3 text-left hover:bg-surface-gray-2 [overflow-wrap:anywhere]"
        :class="
          selected === thread.name && thread.name ? 'bg-surface-gray-2' : ''
        "
        @click="$emit('select', thread)"
      >
        <span class="block text-sm font-medium">{{
          thread.display_name || thread.peer_id
        }}</span>
        <span class="mt-1 block text-xs text-ink-gray-5">{{
          thread.materialized
            ? thread.human_owner || 'Sin responsable'
            : 'Abrir historial de esta cuenta y destinatario'
        }}</span>
        <span
          v-if="view !== 'account'"
          class="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-gray-5"
          >{{ thread.provider }}
          <span
            v-if="thread.waiting_since"
            class="num"
            :class="waitTone(thread.waiting_since)"
            >Espera {{ waited(thread.waiting_since) }}</span
          ></span
        >
        <span v-if="thread.preview" class="mt-2 line-clamp-2 text-sm">{{
          thread.preview
        }}</span>
        <span
          v-if="thread.labels?.length || thread.snoozed_until"
          class="mt-2 flex flex-wrap gap-1"
        >
          <span
            v-if="thread.snoozed_until"
            class="rounded-4 bg-surface-gray-3 px-1.5 py-0.5 text-xs"
            >Pospuesta hasta {{ when(thread.snoozed_until) }}</span
          >
          <span
            v-for="item in thread.labels"
            :key="item"
            class="rounded-4 border px-1.5 py-0.5 text-xs"
            :class="labelClass(item)"
            >{{ item }}</span
          >
        </span>
      </button>
      <button
        v-if="more"
        type="button"
        class="w-full p-3 text-sm underline"
        :disabled="loading || disabled"
        @click="$emit('more')"
      >
        Cargar más conversaciones
      </button>
      <p v-if="loading" class="p-3 text-sm" role="status">Cargando…</p>
    </div>
  </section>
</template>
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { useListKeys } from '@/composables/pageKeys'
import { formatDateTime, parseServerDate } from '@/utils/display'

// Webchat and API inbox channels have opaque 64-character ids; their label is the name.
const labelOnly = (item) => ['Webchat', 'API'].includes(item?.provider)

const VIEWS = [
  { id: 'mine', label: 'Mías' },
  { id: 'unassigned', label: 'Sin asignar' },
  { id: 'all', label: 'Todas' },
  { id: 'snoozed', label: 'Pospuestas' },
  { id: 'account', label: 'Por cuenta' },
]
const SORTS = [
  { value: 'recent', label: 'Recientes' },
  { value: 'waiting', label: 'Esperan más' },
]
const EMPTY = {
  account: 'No hay conversaciones visibles en esta cuenta.',
  mine: 'No tienes conversaciones abiertas. Revisa «Sin asignar» para tomar una.',
  unassigned: 'No hay conversaciones esperando responsable.',
  all: 'No hay conversaciones abiertas que puedas ver.',
  snoozed: 'No hay conversaciones pospuestas.',
  waiting: 'Nadie espera respuesta en esta vista.',
}

const props = defineProps({
  accounts: { type: Array, default: () => [] },
  account: { type: Object, default: null },
  threads: { type: Array, default: () => [] },
  selected: { type: String, default: null },
  view: { type: String, default: 'account' },
  label: { type: String, default: '' },
  labels: { type: Array, default: () => [] },
  canManage: Boolean,
  loading: Boolean,
  disabled: Boolean,
  more: Boolean,
  sort: { type: String, default: 'recent' },
  /** { receives_new, open } while automatic assignment is on, else null. */
  availability: { type: Object, default: null },
  availabilityBusy: Boolean,
  /** The inbox's reply goal in minutes; 0 when none is set. */
  goalMinutes: { type: Number, default: 0 },
})
const emit = defineEmits([
  'account',
  'select',
  'more',
  'view',
  'performance',
  'sort',
  'availability',
])
const LABEL_COLORS = {
  gray: 'border-outline-gray-2',
  blue: 'border-blue-300 text-blue-700',
  green: 'border-green-300 text-green-700',
  amber: 'border-amber-300 text-amber-700',
  red: 'border-red-300 text-red-700',
  violet: 'border-violet-300 text-violet-700',
  pink: 'border-pink-300 text-pink-700',
  cyan: 'border-cyan-300 text-cyan-700',
}
const labelClass = (name) =>
  LABEL_COLORS[props.labels.find((l) => l.name === name)?.color] ||
  LABEL_COLORS.gray
const when = (value) => formatDateTime(value)
// The wait figures move with the clock, one tick a minute.
const now = ref(Date.now())
let clock
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 60000)))
onBeforeUnmount(() => clearInterval(clock))
const minutesSince = (value) =>
  Math.max(0, Math.floor((now.value - parseServerDate(value)) / 60000))
function waited(value) {
  const minutes = minutesSince(value)
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440)
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
  return `${Math.floor(minutes / 1440)} d`
}
// Red only on a wait past the goal; amber in its last quarter.
function waitTone(value) {
  const goal = props.goalMinutes
  if (!goal) return ''
  const minutes = minutesSince(value)
  if (minutes >= goal) return 'font-semibold text-ink-red-7'
  return minutes >= goal * 0.75 ? 'text-ink-amber-9' : ''
}
// Keyboard standard: j/k walk the threads, Enter opens one.
const root = ref(null)
useListKeys({ page: 'inbox-conversations', root, rows: true, open: true })
const accountKey = (a) => (a ? `${a.provider}:${a.account_id}` : '')
function selectAccount(event) {
  emit(
    'account',
    props.accounts.find((a) => accountKey(a) === event.target.value),
  )
}
</script>
