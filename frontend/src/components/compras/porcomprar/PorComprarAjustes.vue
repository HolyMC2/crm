<template>
  <!-- Everything the queue reads from the owner, in one sheet: the switch,
       how many weeks of sales, how often the shop orders, the default
       delivery days, where purchases arrive, which groups and stores. -->
  <BottomSheet
    :open="open"
    :aria-label="__('Muelle proposes what to buy', null, 'PorComprar')"
    @update:open="emit('update:open', $event)"
  >
    <div
      v-if="!form && !problem"
      role="status"
      class="flex min-h-40 items-center justify-center"
    >
      <span
        class="lucide-loader-circle size-6 animate-spin text-ink-gray-5"
        aria-hidden="true"
      />
    </div>
    <div v-if="form" class="space-y-1" data-pc-ajustes-hoja>
      <div class="flex min-h-14 items-center gap-3">
        <span class="min-w-0 flex-1 text-base font-semibold text-ink-gray-9">{{
          __('Muelle proposes what to buy', null, 'PorComprar')
        }}</span>
        <AjustesSwitch
          v-model="form.on"
          :label="__('Muelle proposes what to buy', null, 'PorComprar')"
          data-pc-ajustes-switch
        />
      </div>
      <p
        v-if="view?.reason"
        role="alert"
        class="rounded-6 bg-surface-amber-1 px-3 py-2 text-sm text-ink-amber-8"
        data-pc-ajustes-razon
      >
        {{ view.reason }}
      </p>
      <div class="flex min-h-14 flex-wrap items-center justify-between gap-2">
        <span class="text-base text-ink-gray-9">{{
          __('Sales of', null, 'PorComprar')
        }}</span>
        <div class="w-fit">
          <Segmented
            v-model="form.weeks"
            :options="weekOptions"
            :label="__('Sales of', null, 'PorComprar')"
            fit="content"
            data-pc-semanas
          />
        </div>
      </div>
      <div class="flex min-h-14 items-center justify-between gap-2">
        <span class="text-base text-ink-gray-9">{{
          __('Order every', null, 'PorComprar')
        }}</span>
        <DiasStepper
          v-model="form.cycle"
          :min="1"
          :label="__('Order every', null, 'PorComprar')"
          data-pc-ciclo
        />
      </div>
      <div class="flex min-h-14 items-center justify-between gap-2">
        <span class="text-base text-ink-gray-9">{{
          __('Delivery', null, 'PorComprar')
        }}</span>
        <DiasStepper
          v-model="form.lead"
          :label="__('Delivery', null, 'PorComprar')"
          data-pc-entrega-ajuste
        />
      </div>
      <label
        v-if="view?.asks_receive_at"
        class="flex min-h-14 items-center justify-between gap-2"
      >
        <span class="text-base text-ink-gray-9">{{
          __('Arrives at', null, 'PorComprar')
        }}</span>
        <select
          v-model="form.receive_at"
          class="h-11 min-w-0 max-w-[60%] rounded-full border-0 bg-surface-gray-3 pl-4 pr-9 text-sm font-medium text-ink-gray-9 focus:ring-2 focus:ring-[var(--muelle-accent)]"
          :class="missingReceive ? 'ring-2 ring-outline-red-3' : ''"
          :aria-invalid="missingReceive || undefined"
          data-pc-recibe
        >
          <option value="" disabled>
            {{ __('Choose', null, 'PorComprar') }}
          </option>
          <option
            v-for="o in view.options?.warehouses || []"
            :key="o.value"
            :value="o.value"
          >
            {{ o.label }}
          </option>
        </select>
      </label>
      <div class="pt-2">
        <ChipGroup
          :model-value="allOr(form.groups)"
          :options="
            withAll(view?.options?.groups, __('All', null, 'PorComprar'))
          "
          :label="__('Groups', null, 'PorComprar')"
          multiple
          testid="pc-grupo"
          @update:model-value="form.groups = picked(form.groups, $event)"
        />
      </div>
      <div class="pt-1">
        <ChipGroup
          :model-value="allOr(form.warehouses)"
          :options="
            withAll(view?.options?.warehouses, __('All', null, 'PorComprar'))
          "
          :label="__('Stock of', null, 'PorComprar')"
          multiple
          testid="pc-almacen"
          @update:model-value="
            form.warehouses = picked(form.warehouses, $event)
          "
        />
      </div>
    </div>
    <p
      v-if="problem"
      role="alert"
      class="mt-3 rounded-6 bg-surface-red-1 px-3 py-2 text-sm text-ink-red-7"
      data-pc-ajustes-problema
    >
      <strong>{{ problem.title }}.</strong> {{ problem.detail }}
    </p>
    <template #actions>
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="press inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2"
          data-pc-cancelar
          @click="emit('update:open', false)"
        >
          {{ __('Cancel', null, 'PorComprar') }}
        </button>
        <button
          type="button"
          class="press inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-gray-10 px-5 text-sm font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50"
          :disabled="!form || saving || missingReceive"
          data-pc-guardar
          @click="save"
        >
          <span
            v-if="saving"
            class="lucide-loader-circle size-4 animate-spin"
            aria-hidden="true"
          />
          {{ __('Save', null, 'PorComprar') }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet, ChipGroup, Segmented } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { problemOf } from '@/composables/useCompras'
import DiasStepper from './DiasStepper.vue'
import { pcApi } from './porComprar'

const props = defineProps({
  open: { type: Boolean, default: false },
  // opened by the off tile's switch on a shop with two or more stores: the
  // sheet starts switched on, «Recibe en» lit until it is chosen
  turnOn: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'saved'])

const view = ref(null)
const form = ref(null)
const problem = ref(null)
const saving = ref(false)

const weekOptions = computed(() =>
  (view.value?.options?.weeks || [4, 8, 12]).map((n) => ({
    value: n,
    label: __('{0} wk', [n], 'PorComprar'),
  })),
)
const missingReceive = computed(
  () =>
    Boolean(form.value?.on) &&
    Boolean(view.value?.asks_receive_at) &&
    !form.value?.receive_at,
)

// «Todos» leads each chip row: on while nothing is picked (every one counts).
const ALL = ''
function withAll(options = [], label) {
  return [{ value: ALL, label }, ...(options || [])]
}
function allOr(list) {
  return list?.length ? list : [ALL]
}
function picked(before, next) {
  if (next.includes(ALL) && before.length) return []
  return next.filter((value) => value !== ALL)
}

function formOf(data) {
  return {
    on: props.turnOn ? true : Boolean(data.on),
    weeks: Number(data.weeks) || 8,
    cycle: Number(data.cycle) || 14,
    lead: Number(data.lead) || 0,
    receive_at: data.receive_at || '',
    groups: [...(data.groups || [])],
    warehouses: [...(data.warehouses || [])],
  }
}

async function load() {
  problem.value = null
  form.value = null
  try {
    view.value = await pcApi('settings')
    form.value = formOf(view.value)
  } catch (error) {
    problem.value = problemOf(error)
  }
}

async function save() {
  if (!form.value || saving.value) return
  saving.value = true
  problem.value = null
  try {
    const f = form.value
    view.value = await pcApi('save_settings', {
      on: f.on ? 1 : 0,
      weeks: f.weeks,
      cycle: f.cycle,
      lead: f.lead,
      groups: f.groups,
      warehouses: f.warehouses,
      ...(view.value?.asks_receive_at ? { receive_at: f.receive_at } : {}),
    })
    emit('saved', view.value)
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    saving.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) load()
  },
  { immediate: true },
)

defineExpose({ save })
</script>
