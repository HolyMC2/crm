<template>
  <!-- The owner's buying settings: the weeks a suggestion reads, the days
       between orders and of delivery, when a piece is «Sobra», the weekly buy
       review, and which backroom refills each display. -->
  <BottomSheet
    v-model:open="open"
    :title="__('Buying settings', null, 'Niveles')"
    :dismissible="!busy"
  >
    <EmptyState
      v-if="failed"
      role="alert"
      state="error"
      :title="__('Could not read the settings', null, 'Niveles')"
      :message="failed"
      :action="__('Retry', null, 'Compras')"
      @action="load"
    />
    <EmptyState
      v-else-if="!ready"
      role="status"
      state="loading"
      :title="__('Reading the settings…', null, 'Niveles')"
    />
    <form v-else class="space-y-5 pb-4" @submit.prevent="save">
      <fieldset class="grid grid-cols-2 gap-3">
        <legend
          class="col-span-2 mb-1.5 text-base font-semibold text-ink-gray-9"
        >
          {{ __('Suggested levels', null, 'Niveles') }}
        </legend>
        <FormControl
          v-model="form.suggest_weeks"
          type="number"
          min="1"
          :label="__('Weeks of sales', null, 'Niveles')"
        />
        <FormControl
          v-model="form.order_cycle_days"
          type="number"
          min="1"
          :label="__('Days between orders', null, 'Niveles')"
        />
        <FormControl
          v-model="form.default_lead_days"
          type="number"
          min="0"
          :label="__('Delivery days', null, 'Niveles')"
          :description="
            __('When a supplier has none of its own.', null, 'Niveles')
          "
        />
        <FormControl
          v-model="form.lost_days"
          type="number"
          min="1"
          :label="__('Days of lost sales', null, 'Niveles')"
        />
        <FormControl
          v-model="form.surplus_days"
          type="number"
          min="1"
          class="col-span-2 sm:col-span-1"
          :label="__('Surplus after days unsold', null, 'Niveles')"
        />
      </fieldset>

      <fieldset class="space-y-3">
        <legend class="mb-1.5 text-base font-semibold text-ink-gray-9">
          {{ __('Weekly buy review', null, 'Niveles') }}
        </legend>
        <label class="flex min-h-11 items-center gap-3 text-base">
          <input
            v-model="form.review_enabled"
            type="checkbox"
            class="size-5 accent-[var(--muelle-accent)]"
          />
          {{ __('Leave me the week’s buy list in Avisos', null, 'Niveles') }}
        </label>
        <template v-if="form.review_enabled">
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-label="__('Day of the review', null, 'Niveles')"
          >
            <button
              v-for="day in weekdays"
              :key="day"
              type="button"
              :class="chipClass(form.review_weekday === day)"
              :aria-pressed="form.review_weekday === day"
              @click="form.review_weekday = day"
            >
              {{ day }}
            </button>
          </div>
          <FormControl
            v-model="form.review_hour"
            type="number"
            min="0"
            max="23"
            class="w-40"
            :label="__('Hour (0 to 23)', null, 'Niveles')"
          />
          <p class="text-xs text-ink-gray-5">
            {{
              __(
                'It sends nothing: it leaves the list for you to look at.',
                null,
                'Niveles',
              )
            }}
          </p>
        </template>
      </fieldset>

      <fieldset class="space-y-3">
        <legend class="mb-1 text-base font-semibold text-ink-gray-9">
          {{ __('Displays', null, 'Niveles') }}
        </legend>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'The display store and the backroom that refills it, for «Refill the display».',
              null,
              'Niveles',
            )
          }}
        </p>
        <div
          v-for="(row, i) in exhibitions"
          :key="row.key"
          class="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
        >
          <ComprasPicker
            v-model="row.display"
            :display="row.display"
            :label="__('Display', null, 'Niveles')"
            :placeholder="__('Search store', null, 'Niveles')"
            :load="findStores"
          />
          <ComprasPicker
            v-model="row.backroom"
            :display="row.backroom"
            :label="__('Refilled from', null, 'Niveles')"
            :placeholder="__('Search store', null, 'Niveles')"
            :load="findStores"
          />
          <button
            type="button"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-6 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
            :aria-label="__('Remove display', null, 'Niveles')"
            :title="__('Remove display', null, 'Niveles')"
            @click="exhibitions.splice(i, 1)"
          >
            <span class="lucide-trash-2 size-5" aria-hidden="true" />
          </button>
        </div>
        <Button
          :label="__('Add a display', null, 'Niveles')"
          :icon-left="LucidePlus"
          class="min-h-11 sm:min-h-8"
          @click="addExhibition"
        />
      </fieldset>

      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>
      <div class="flex justify-end">
        <Button
          type="submit"
          variant="solid"
          :label="__('Save settings', null, 'Niveles')"
          class="min-h-11 sm:min-h-8"
          :loading="busy"
        />
      </div>
    </form>
  </BottomSheet>
</template>
<script setup>
import { reactive, ref, watch } from 'vue'
import { Button, FormControl, toast } from 'frappe-ui'
import { BottomSheet, EmptyState, chipClass } from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { comprasApi, problemOf } from '@/composables/useCompras'
import { settingsPayload } from '@/utils/comprasLoop'
import LucidePlus from '~icons/lucide/plus'

const emit = defineEmits(['saved'])
const open = defineModel('open', { type: Boolean, default: false })

const API = 'doco.workspaces.niveles.'
const ready = ref(false)
const failed = ref('')
const problem = ref('')
const busy = ref(false)
const weekdays = ref([])
const exhibitions = ref([])
const form = reactive({
  suggest_weeks: 8,
  order_cycle_days: 14,
  default_lead_days: 7,
  lost_days: 90,
  surplus_days: 60,
  review_enabled: true,
  review_weekday: '',
  review_hour: 9,
})

let rowKey = 0
function addExhibition(row = {}) {
  exhibitions.value.push({
    key: ++rowKey,
    display: row.display || '',
    backroom: row.backroom || '',
  })
}

function findStores(search) {
  return comprasApi(API + 'warehouses', { search })
}

function fill(out) {
  for (const field of Object.keys(form)) {
    if (out[field] === undefined) continue
    form[field] = field === 'review_enabled' ? !!out[field] : out[field]
  }
  weekdays.value = out.weekdays || []
  exhibitions.value = []
  for (const row of out.exhibitions || []) addExhibition(row)
}

async function load() {
  ready.value = false
  failed.value = ''
  try {
    fill(await comprasApi(API + 'settings'))
    ready.value = true
  } catch (error) {
    failed.value = problemOf(error).detail
  }
}

async function save() {
  busy.value = true
  problem.value = ''
  try {
    const payload = settingsPayload(form, exhibitions.value)
    const out = await comprasApi(API + 'settings_save', payload)
    fill(out)
    toast.success(__('Settings saved', null, 'Niveles'))
    emit('saved', out)
    open.value = false
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = false
  }
}

watch(open, (value) => {
  if (value) load()
})
</script>
