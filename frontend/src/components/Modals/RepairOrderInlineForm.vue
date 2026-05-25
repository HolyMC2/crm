<template>
  <!--
    RepairOrderInlineForm
    ─────────────────
    Self-contained form for creating a single Repair Order inline within
    another dialog (e.g. DealModal). Mirrors the Intake (mostrador) SPA flow
    so the field set is identical whether the technician opens the front-desk
    SPA or creates the order from the FCRM Deal modal.

    v-model shape (RepairOrderFields):
      device_model        – Item name (filtered by Doco Settings item group)
      repair_to_be_done  – Repair Type name
      general_status     – 'Good' | 'Bad' | 'Really Bad' | ''
      client             – Contact name
      imei               – Serial No name (can be created on the fly)
      has_sim_tray       – boolean
      is_wet             – boolean
      turns_on           – boolean
      broken_screen      – boolean
      has_phone_case     – boolean
      unlock_method      – 'none' | 'pin' | 'pattern'
      phone_pin          – string (only when unlock_method = 'pin')
      phone_pattern      – string (only when unlock_method = 'pattern')
      quote_amount       – number
      advance_amount     – number
  -->
  <div>
    <!-- Row 1: Device Model / Repair Type / Condition -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <Link
          doctype="Device Model"
          v-model="form.device_model"
          :label="__('Device Model')"
          :placeholder="__('Select model')"
        />
      </div>
      <div>
        <Link
          doctype="Repair Type"
          v-model="form.repair_to_be_done"
          :label="__('Repair Type')"
          :placeholder="__('Select repair')"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs text-ink-gray-5">
          {{ __('Condition') }}
        </label>
        <FormControl
          type="select"
          v-model="form.general_status"
          :options="conditionOptions"
        />
      </div>
    </div>

    <!-- Row 1b: Falla reportada (free-text, required when RO is being created) -->
    <div class="mt-3">
      <FormControl
        type="textarea"
        v-model="form.falla_reportada"
        :rows="2"
        :placeholder="__('e.g. No prende, pantalla parpadea, no carga…')"
      >
        <template #label>
          <span class="text-xs text-ink-gray-5">
            {{ __('Falla reportada') }}
            <span class="text-ink-red-4">*</span>
          </span>
        </template>
      </FormControl>
    </div>

    <!-- Row 2: Client / Technician / IMEI -->
    <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <Link
          doctype="Contact"
          v-model="form.client"
          :label="__('Client')"
          :placeholder="__('Select contact')"
        />
      </div>
      <div>
        <Link
          doctype="User"
          v-model="form.technician"
          :label="__('Technician')"
          :placeholder="__('Assign technician')"
        />
      </div>
      <div>
        <!-- Serial No must be pre-created via the Repair Order classic UI. -->
        <Link
          doctype="Serial No"
          v-model="form.imei"
          :label="__('IMEI / Serial No.')"
          :placeholder="__('Search existing serial no.')"
        />
      </div>
      <div class="sm:col-span-3 flex flex-wrap items-end gap-x-6 gap-y-2 pb-1">
        <FormControl
          v-for="check in checkFields"
          :key="check.key"
          type="checkbox"
          v-model="form[check.key]"
          :label="__(check.label)"
        />
      </div>
    </div>

    <!-- Row 3: Unlock method (none / PIN / pattern) -->
    <div class="mt-4 rounded-md border bg-surface-gray-1 p-3 dark:bg-surface-gray-2">
      <div class="mb-1.5 text-xs font-semibold text-ink-gray-7">
        {{ __('Unlock') }}
      </div>
      <div class="flex flex-wrap items-center gap-4 text-sm text-ink-gray-7">
        <label class="flex items-center gap-1.5">
          <input v-model="form.unlock_method" type="radio" value="none" />
          {{ __('None') }}
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="form.unlock_method" type="radio" value="pin" />
          {{ __('PIN') }}
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="form.unlock_method" type="radio" value="pattern" />
          {{ __('Pattern') }}
        </label>
        <FormControl
          v-if="form.unlock_method === 'pin'"
          type="text"
          v-model="form.phone_pin"
          :placeholder="__('e.g. 1234')"
          inputmode="numeric"
          autocomplete="off"
          class="!w-32"
        />
        <PatternPad
          v-if="form.unlock_method === 'pattern'"
          v-model="form.phone_pattern"
        />
      </div>
    </div>

    <!-- Row 4: Cotización + anticipo + saldo preview -->
    <div class="mt-3 rounded-md border bg-surface-gray-1 p-3 dark:bg-surface-gray-2">
      <div class="mb-1.5 text-xs font-semibold text-ink-gray-7">
        {{ __('Quote & advance') }}
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormControl
          type="number"
          v-model="form.quote_amount"
          :label="__('Quote')"
          min="0"
          step="0.01"
          placeholder="0.00"
        />
        <FormControl
          type="number"
          v-model="form.advance_amount"
          :label="__('Advance')"
          min="0"
          step="0.01"
          placeholder="0.00"
        />
        <div>
          <label class="mb-1 block text-xs text-ink-gray-5">
            {{ __('Balance due') }}
          </label>
          <div
            class="rounded-md border border-dashed bg-surface-white px-3 py-1.5 text-sm font-mono"
            :class="balance > 0 ? 'text-ink-amber-3' : 'text-ink-gray-5'"
          >
            {{ formattedBalance }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * Doco customization — RepairOrderInlineForm
 *
 * Extracted from DealModal.vue to minimise the diff surface in upstream CRM
 * files.  All Repair Order form concerns are isolated here; DealModal only
 * mounts this component and reads the final v-model value on submit.
 *
 * Upstream rebase impact: zero (this file is new, never conflicts).
 */
import Link from '@/components/Controls/Link.vue'
import PatternPad from '@/components/PatternPad.vue'
import { FormControl } from 'frappe-ui'
import { computed } from 'vue'

// defineModel() gives us a two-way binding to the parent's newRepairOrder ref.
const form = defineModel({ required: true })

// ── Static option lists ──────────────────────────────────────────────────────────────
const conditionOptions = [
  { label: __('—'), value: '' },
  { label: __('Good'), value: 'Good' },
  { label: __('Bad'), value: 'Bad' },
  { label: __('Really Bad'), value: 'Really Bad' },
]

const checkFields = [
  { key: 'has_sim_tray',   label: __('Has SIM Tray') },
  { key: 'is_wet',         label: __('Is Wet') },
  { key: 'turns_on',       label: __('Turns On') },
  { key: 'broken_screen',  label: __('Broken Screen') },
  { key: 'has_phone_case', label: __('Has Phone Case') },
]

const balance = computed(() => {
  const q = Number(form.value.quote_amount) || 0
  const a = Number(form.value.advance_amount) || 0
  return Math.max(q - a, 0)
})

const formattedBalance = computed(() => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: window.frappe?.boot?.sysdefaults?.currency || 'MXN',
    }).format(balance.value)
  } catch {
    return balance.value.toFixed(2)
  }
})
</script>
