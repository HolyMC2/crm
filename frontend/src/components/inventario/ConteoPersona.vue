<template>
  <!-- One person of «Conteos del día»: their day on the row, and everything
       the owner decides for them opened in place (the counter record of
       scanner_kit: counts, size, stores, product groups, pause). -->
  <div class="bg-surface-gray-1" :data-persona="person.user">
    <div class="flex min-h-16 items-center gap-3 py-2.5 pl-4 pr-2">
      <span
        class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-3 text-sm font-semibold"
        :class="person.counts ? 'text-ink-gray-8' : 'text-ink-gray-6'"
        aria-hidden="true"
        >{{ initialsOf(person.name) }}</span
      >
      <div
        class="min-w-0 flex-1"
        :class="person.counts ? 'cursor-pointer' : ''"
        data-persona-linea
        @click="person.counts && $emit('toggle')"
      >
        <div class="flex items-baseline gap-2">
          <span
            class="min-w-0 flex-1 truncate text-md font-medium"
            :class="person.counts ? 'text-ink-gray-9' : 'text-ink-gray-6'"
            >{{ person.name }}</span
          >
          <span
            v-if="line.kind === 'progress' && !open"
            class="num flex-none text-md font-semibold text-ink-gray-9"
            data-persona-avance
            >{{ line.figure }}</span
          >
        </div>
        <!-- Open, the switch takes the name's line: the figure reads under
             the name and the bar spans the opened row. -->
        <div
          v-if="line.kind === 'progress' && !open"
          class="mt-1.5 flex h-2 gap-0.5"
          aria-hidden="true"
          data-persona-barra
        >
          <span
            v-for="(mark, index) in line.marks"
            :key="index"
            class="h-full min-w-0 flex-1 rounded-full"
            :class="MARK[mark]"
            :data-marca="mark"
          />
        </div>
        <p
          v-else-if="line.kind === 'progress'"
          class="num text-sm leading-snug text-ink-gray-6"
          data-persona-avance
        >
          {{ line.figure }}
        </p>
        <p
          v-else-if="line.text"
          class="text-sm leading-snug"
          :class="
            line.kind === 'blocked'
              ? 'line-clamp-2 text-ink-amber-8'
              : 'num truncate text-ink-gray-6'
          "
          data-persona-estado
        >
          {{ line.text }}
        </p>
        <p
          v-if="cajasLine"
          class="num truncate text-sm leading-snug text-ink-gray-6"
          data-persona-cajas
        >
          {{ cajasLine }}
        </p>
      </div>
      <AjustesSwitch
        v-if="open && person.counts"
        :model-value="true"
        :label="__('{0} counts', [person.name], CTX)"
        data-persona-cuenta
        @update:model-value="stopCounting"
      />
      <button
        v-if="person.counts"
        type="button"
        class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7"
        :aria-expanded="String(open)"
        :aria-label="
          open
            ? __('Close {0}', [person.name], CTX)
            : __('Open {0}', [person.name], CTX)
        "
        data-persona-abrir
        @click="$emit('toggle')"
      >
        <span
          class="size-5"
          :class="open ? 'lucide-chevron-up' : 'lucide-chevron-down'"
          aria-hidden="true"
        />
      </button>
      <button
        v-else
        type="button"
        class="press mr-2 flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-3 text-ink-gray-8"
        :aria-label="
          open
            ? __('Close {0}', [person.name], CTX)
            : __('Add {0} to the counts', [person.name], CTX)
        "
        :aria-expanded="asksWhere ? String(open) : undefined"
        data-persona-sumar
        @click="startCounting"
      >
        <span
          class="size-5"
          :class="open ? 'lucide-x' : 'lucide-plus'"
          aria-hidden="true"
        />
      </button>
    </div>
    <p
      v-if="reason('counts')"
      role="alert"
      class="px-4 pb-3 text-sm text-ink-red-7"
      data-persona-error
    >
      {{ reason('counts') }}
    </p>

    <ExpandTransition>
      <!-- Someone with every store: say where they count, and they count. -->
      <div v-if="open && !person.counts" class="px-4 pb-4" data-persona-donde>
        <ChipGroup
          :label="__('Where does {0} count?', [person.name], CTX)"
          :options="storeOptions"
          :model-value="''"
          @update:model-value="(store) => store && startCounting(store)"
        />
      </div>
      <div
        v-else-if="open"
        class="flex flex-col gap-4 px-4 pb-4"
        data-persona-ajustes
      >
        <div
          v-if="line.kind === 'progress'"
          class="flex h-2 gap-0.5"
          aria-hidden="true"
          data-persona-barra
        >
          <span
            v-for="(mark, index) in line.marks"
            :key="index"
            class="h-full min-w-0 flex-1 rounded-full"
            :class="MARK[mark]"
            :data-marca="mark"
          />
        </div>
        <div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-md font-medium text-ink-gray-9">{{
              byProducts ? __('Products', null, CTX) : __('Minutes', null, CTX)
            }}</span>
            <ConteoPaso
              :model-value="byProducts ? person.quota || 0 : person.minutes"
              :bounds="byProducts ? PRODUCTS : MINUTES"
              :label="
                byProducts
                  ? __('Products of {0}', [person.name], CTX)
                  : __('Minutes of {0}', [person.name], CTX)
              "
              data-persona-tamano
              @commit="setSize"
            />
          </div>
          <p
            v-if="reason('size')"
            role="alert"
            class="pt-1 text-sm text-ink-red-7"
          >
            {{ reason('size') }}
          </p>
        </div>

        <div v-if="stores.length > 1" data-persona-almacenes>
          <ChipGroup
            :label="__('Stores', null, CTX)"
            :options="storeOptions"
            :model-value="person.warehouses"
            multiple
            @update:model-value="setStores"
          />
          <!-- Sized in products, in two stores or more: how many from each. -->
          <ul v-if="byProducts && person.warehouses.length > 1" class="pt-1">
            <li
              v-for="store in person.warehouses"
              :key="store"
              class="flex items-center justify-between gap-3 py-1"
            >
              <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-7">{{
                storeLabel(store)
              }}</span>
              <ConteoPaso
                :model-value="person.quotas?.[store] || 0"
                :bounds="SHARE"
                :zero-label="__('Even share', null, CTX)"
                :label="
                  __(
                    'Products of {0} in {1}',
                    [person.name, storeLabel(store)],
                    CTX,
                  )
                "
                @commit="(n) => setShare(store, n)"
              />
            </li>
          </ul>
          <p
            v-if="reason('stores')"
            role="alert"
            class="pt-1 text-sm text-ink-red-7"
          >
            {{ reason('stores') }}
          </p>
        </div>

        <div data-persona-grupos>
          <ChipGroup
            :label="__('Only', null, CTX)"
            :options="onlyOptions"
            :model-value="onlyModel"
            multiple
            testid="solo"
            @update:model-value="setOnly"
          />
          <!-- Groups they never count: a struck chip, a tap brings it back. -->
          <p class="mb-1.5 mt-3 text-xs font-medium text-ink-gray-6">
            {{ __('Never', null, CTX) }}
          </p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="group in never"
              :key="group"
              type="button"
              :class="[chipClass(false), 'line-through']"
              :aria-label="__('Count {0} again', [group], CTX)"
              :data-nunca="group"
              @click="clearNever(group)"
            >
              {{ group }}
            </button>
            <button
              type="button"
              :class="chipClass(picking)"
              :aria-expanded="String(picking)"
              :aria-label="__('Leave a group out', null, CTX)"
              data-nunca-sumar
              @click="picking = !picking"
            >
              <span
                class="size-4"
                :class="picking ? 'lucide-x' : 'lucide-plus'"
                aria-hidden="true"
              />
            </button>
          </div>
          <ExpandTransition>
            <ChipGroup
              v-if="picking"
              class="pt-1.5"
              :options="neverOptions"
              :model-value="''"
              testid="nunca"
              @update:model-value="(group) => group && addNever(group)"
            />
          </ExpandTransition>
          <p
            v-if="reason('groups')"
            role="alert"
            class="pt-1 text-sm text-ink-red-7"
          >
            {{ reason('groups') }}
          </p>
        </div>

        <div data-persona-pausa>
          <button
            type="button"
            class="press flex min-h-12 w-full items-center gap-3 rounded-6 bg-surface-gray-3 px-4 text-left"
            :aria-expanded="String(pausing)"
            data-persona-pausa-abrir
            @click="pausing = !pausing"
          >
            <span
              class="lucide-calendar size-5 flex-none text-ink-gray-7"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 text-base text-ink-gray-7">{{
              __('Pause until', null, CTX)
            }}</span>
            <span class="num text-base font-semibold text-ink-gray-9">{{
              person.paused_until
                ? formatDate(person.paused_until, { relative: false })
                : __('No pause', null, CTX)
            }}</span>
          </button>
          <ExpandTransition>
            <DateField
              v-if="pausing"
              class="pt-2"
              :model-value="person.paused_until || ''"
              :label="__('Pause until', null, CTX)"
              @update:model-value="setPause"
            />
          </ExpandTransition>
          <p
            v-if="reason('pause')"
            role="alert"
            class="pt-1 text-sm text-ink-red-7"
          >
            {{ reason('pause') }}
          </p>
        </div>
      </div>
    </ExpandTransition>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import {
  ChipGroup,
  DateField,
  ExpandTransition,
  chipClass,
} from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { formatDate } from '@/utils/display'
import ConteoPaso from './ConteoPaso.vue'
import {
  CTX,
  MINUTES,
  PRODUCTS,
  cajasWords,
  groupChoices,
  initialsOf,
  personLine,
} from './conteos'

const props = defineProps({
  /** One entry of the page's `people`. */
  person: { type: Object, required: true },
  /** The counts are on: the row reads the person's day. */
  on: { type: Boolean, default: false },
  /** The shop's `settings`: its unit and the size everyone starts from. */
  settings: { type: Object, required: true },
  /** The page's product groups and stores. */
  groups: { type: Array, default: () => [] },
  warehouses: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
  /** The page's refusals; this person's are under `p:<user>:<what>`. */
  errors: { type: Object, default: () => ({}) },
  /** Cajas del día: their cajones today and their blind recounts, or null. */
  cajas: { type: Object, default: null },
})
// set(what, args, paint): `args` for set_person, `paint(person)` shows the tap at once.
const emit = defineEmits(['toggle', 'set'])

// One mark a product: matched, did not match, skipped, still to count.
const MARK = {
  ok: 'bg-surface-green-7',
  diff: 'bg-surface-amber-6',
  skipped: 'bg-surface-gray-6',
  todo: 'bg-surface-gray-3',
}
// A store's share of a person's products: 0 is the even share.
const SHARE = Object.freeze({ min: 0, max: PRODUCTS.max, step: PRODUCTS.step })

const picking = ref(false)
const pausing = ref(false)
watch(
  () => props.open,
  (open) => {
    if (!open) picking.value = pausing.value = false
  },
)

const line = computed(() => personLine(props.person, { on: props.on }))
const cajasLine = computed(() => (props.on ? cajasWords(props.cajas) : ''))
const byProducts = computed(() => props.settings.unit === 'products')
const reason = (what) => props.errors[`p:${props.person.user}:${what}`] || ''

// Where someone can count: a store with counting on, or one they already have.
const stores = computed(() =>
  props.warehouses.filter(
    (store) => !store.off || props.person.warehouses.includes(store.name),
  ),
)
const storeOptions = computed(() =>
  stores.value.map((store) => ({ value: store.name, label: store.label })),
)
const storeLabel = (name) =>
  props.warehouses.find((store) => store.name === name)?.label || name

const only = computed(() => props.person.groups_only || [])
const never = computed(() => props.person.groups_excluded || [])
const choices = computed(() => groupChoices(props.groups, only.value))
// «Todo» ('') leads and is on while they count every group.
const onlyOptions = computed(() => [
  { value: '', label: __('Everything', null, CTX) },
  ...choices.value
    .filter((group) => !never.value.includes(group))
    .map((group) => ({ value: group, label: group })),
])
const onlyModel = computed(() => (only.value.length ? only.value : ['']))
const neverOptions = computed(() =>
  groupChoices(props.groups)
    .filter((group) => !never.value.includes(group))
    .map((group) => ({ value: group, label: group })),
)

function set(what, args, paint) {
  emit('set', what, args, paint)
}

// With every store and more than one to choose from, the row asks where.
const asksWhere = computed(
  () => props.person.everywhere && stores.value.length > 1,
)
function startCounting(store) {
  const where = typeof store === 'string' ? store : ''
  if (!where && asksWhere.value) {
    emit('toggle')
    return
  }
  set(
    'counts',
    { counts: 1, ...(where ? { warehouses: [where] } : {}) },
    (me) => {
      me.counts = true
      if (where) me.warehouses = [where]
    },
  )
}
function stopCounting() {
  set('counts', { counts: 0 }, (me) => {
    me.counts = false
  })
}
function setSize(value) {
  // The shop's own figure means «as the shop»: they follow it when it moves.
  if (byProducts.value) {
    const own = value === props.settings.products ? 0 : value
    set('size', { products: own }, (me) => {
      me.quota = value
      me.own_quota = !!own
    })
  } else {
    const own = value === props.settings.minutes ? 0 : value
    set('size', { minutes: own }, (me) => {
      me.minutes = value
      me.own_minutes = !!own
    })
  }
}
function setStores(names) {
  set('stores', { warehouses: names }, (me) => {
    me.warehouses = names
  })
}
function setShare(store, products) {
  set('stores', { quotas: { [store]: products } }, (me) => {
    me.quotas = { ...me.quotas, [store]: products }
  })
}
function setOnly(picked) {
  // «Todo» tapped, or the last group taken off: every group again.
  const all = picked.includes('') && only.value.length
  const next = all ? [] : picked.filter((group) => group !== '')
  set('groups', { groups: next }, (me) => {
    me.groups_only = next
  })
}
function clearNever(group) {
  const next = never.value.filter((name) => name !== group)
  set('groups', { excluded: next }, (me) => {
    me.groups_excluded = next
  })
}
function addNever(group) {
  picking.value = false
  const next = [...never.value, group]
  // A group left out cannot also be the only one counted.
  const kept = only.value.filter((name) => name !== group)
  const both = kept.length !== only.value.length
  set('groups', { excluded: next, ...(both ? { groups: kept } : {}) }, (me) => {
    me.groups_excluded = next
    if (both) me.groups_only = kept
  })
}
function setPause(date) {
  pausing.value = false
  const until = (date || '').slice(0, 10)
  set('pause', { paused_until: until }, (me) => {
    me.paused_until = until || null
  })
}
</script>
