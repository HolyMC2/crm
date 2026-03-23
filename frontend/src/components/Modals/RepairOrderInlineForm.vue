<template>
  <!--
    RepairOrderInlineForm
    ─────────────────
    Self-contained form for creating a single Repair Order inline within
    another dialog (e.g. DealModal).  All Repair-Order-specific state,
    resources, and UI live here so the parent only needs one line:

      <RepairOrderInlineForm v-model="newRepairOrder" />

    The parent retains the `newRepairOrder` ref so it can read the final
    values when submitting, but it has zero knowledge of the form internals.

    v-model shape (RepairOrderFields):
      phone_model        – Item name (filtered by Doco Settings item group)
      repair_to_be_done  – Repair Type name
      general_status     – 'Good' | 'Bad' | 'Really Bad' | ''
      client             – Contact name
      imei               – Serial No name (can be created on the fly)
      has_sim_tray       – boolean
      is_wet             – boolean
      turns_on           – boolean
      broken_screen      – boolean
  -->
  <div>
    <!-- Row 1: Phone Model / Repair Type / Condition -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <!--
          :key forces remount when the item-group setting loads so the Link
          component picks up the filter instead of showing all Items.
        -->
        <Link
          :key="settings.data?.phone_item_group || '__all__'"
          doctype="Item"
          v-model="form.phone_model"
          :filters="phoneItemFilters"
          :label="__('Phone Model')"
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

    <!-- Row 2: Client / IMEI / Condition checkboxes -->
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
        <!-- Serial No must be pre-created via the Repair Order classic UI. -->
        <Link
          doctype="Serial No"
          v-model="form.imei"
          :label="__('IMEI / Serial No.')"
          :placeholder="__('Search existing serial no.')"
        />
      </div>
      <div class="sm:col-span-2 flex flex-wrap items-end gap-x-6 gap-y-2 pb-1">
        <FormControl
          v-for="check in checkFields"
          :key="check.key"
          type="checkbox"
          v-model="form[check.key]"
          :label="__(check.label)"
        />
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
import { useDocoSettings } from '@/composables/docoSettings'
import { FormControl } from 'frappe-ui'
import { computed } from 'vue'

// ── v-model ───────────────────────────────────────────────────────────────────────────────
// defineModel() gives us a two-way binding to the parent's newRepairOrder ref.
// Mutating `form.value.xxx` (or `form.xxx` in template) propagates back to the
// parent automatically — no manual emit required.
const form = defineModel({ required: true })

// ── Phone item group filter ───────────────────────────────────────────────────────────
// Doco Settings holds the Item Group that scopes phone model selection.
// The shared singleton resource is already auto-fetching; we just read it.
const { settings } = useDocoSettings()

const phoneItemFilters = computed(() => {
  const group = settings.data?.phone_item_group
  return group ? [['item_group', '=', group]] : []
})

// ── Static option lists ──────────────────────────────────────────────────────────────
const conditionOptions = [
  { label: __('—'), value: '' },
  { label: __('Good'), value: 'Good' },
  { label: __('Bad'), value: 'Bad' },
  { label: __('Really Bad'), value: 'Really Bad' },
]

const checkFields = [
  { key: 'has_sim_tray', label: 'Has SIM Tray' },
  { key: 'is_wet',       label: 'Is Wet' },
  { key: 'turns_on',     label: 'Turns On' },
  { key: 'broken_screen', label: 'Broken Screen' },
]

// Serial No records must be created via the Repair Order classic UI in ERPNext
// (Repair Order → serial_numbers child table).  Creating them inline from the
// CRM frontend requires ignore_mandatory=True because ERPNext enforces item_code
// on Serial No — linking them here is read-only search only.
</script>
