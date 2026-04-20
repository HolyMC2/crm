<template>
  <div class="mb-8">
    <!-- Section header -->
    <div class="mb-4 flex h-8 items-center justify-between">
      <span class="text-base font-semibold text-ink-gray-8">
        {{ __('Repair Orders') }}
      </span>
      <Button
        size="sm"
        variant="ghost"
        :label="__('Add')"
        @click="showAddDialog = true"
      />
    </div>

    <!-- Loading -->
    <div v-if="orders.loading" class="flex justify-center py-6">
      <LoadingIndicator class="h-5 w-5" />
    </div>

    <!-- Empty -->
    <div
      v-else-if="!orderList.length"
      class="rounded-lg border border-outline-gray-2 px-4 py-6 text-center text-sm text-ink-gray-5"
    >
      {{ __('No repair orders linked to this deal') }}
    </div>

    <!-- Order cards -->
    <div v-else class="flex flex-col gap-4">
      <div
        v-for="order in orderList"
        :key="order.name"
        class="rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-4"
      >
        <div class="mb-3 flex items-center justify-between">
          <span class="font-semibold text-ink-gray-9">{{ order.name }}</span>
          <a
            :href="`/app/repair-order/${encodeURIComponent(order.name)}`"
            target="_blank"
            :title="__('Open Repair Order')"
          >
            <Button size="sm" variant="ghost" :icon="ExternalLinkIcon" />
          </a>
        </div>

        <div class="mb-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div v-for="field in staticFields(order)" :key="field.label" class="flex gap-2">
            <span class="shrink-0 text-ink-gray-5">{{ field.label }}</span>
            <span class="truncate font-medium text-ink-gray-8">{{ field.value || '—' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="shrink-0 text-ink-gray-5">{{ __('Status') }}</span>
            <span
              class="rounded px-2 py-0.5 text-xs font-semibold"
              :class="statusClass(order.general_status)"
            >
              {{ order.general_status || '—' }}
            </span>
          </div>
          <div
            v-if="order.serial_numbers && order.serial_numbers.length"
            class="col-span-2 flex flex-wrap gap-x-4 gap-y-1"
          >
            <span class="shrink-0 text-ink-gray-5">{{ __('Serials') }}</span>
            <span v-for="sn in order.serial_numbers" :key="sn.serial_no" class="text-ink-gray-7">
              <span class="text-ink-gray-4">{{ sn.identifier_type }}:</span>
              {{ sn.serial_no }}
            </span>
          </div>
        </div>

        <div
          class="grid grid-cols-2 gap-x-8 gap-y-1.5 border-t border-outline-gray-2 pt-3 text-sm"
        >
          <div
            v-for="check in checkFields"
            :key="check.key"
            class="flex items-center gap-2 text-ink-gray-7"
          >
            <input
              type="checkbox"
              :checked="Boolean(order[check.key])"
              disabled
              class="h-3.5 w-3.5 cursor-default"
            />
            <span>{{ __(check.label) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Repair Order dialog -->
    <Dialog
      v-model="showAddDialog"
      :options="{ title: __('Add Repair Order'), size: 'md' }"
    >
      <template #body-content>
        <div class="flex flex-col gap-4 px-1">
          <div>
            <Link
              doctype="Device Model"
              v-model="newOrder.device_model"
              :label="__('Device Model *')"
              :placeholder="__('Select model')"
            />
          </div>
          <div>
            <Link
              doctype="Repair Type"
              v-model="newOrder.repair_to_be_done"
              :label="__('Repair Type')"
              :placeholder="__('Select repair')"
            />
          </div>
          <div>
            <Link
              doctype="Contact"
              v-model="newOrder.client"
              :label="__('Client')"
              :placeholder="__('Select contact')"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-ink-gray-5">{{ __('Condition') }}</label>
            <FormControl
              type="select"
              v-model="newOrder.general_status"
              :options="[
                { label: __('—'), value: '' },
                { label: __('Good'), value: 'Good' },
                { label: __('Bad'), value: 'Bad' },
                { label: __('Really Bad'), value: 'Really Bad' },
              ]"
            />
          </div>
          <div>
            <!-- Serial No must be pre-created in ERPNext; search only here. -->
            <Link
              doctype="Serial No"
              v-model="newOrder.imei"
              :label="__('IMEI / Serial No.')"
              :placeholder="__('Search existing serial no.')"
            />
          </div>
          <div class="flex flex-wrap gap-x-6 gap-y-2">
            <FormControl
              v-for="check in checkFields"
              :key="check.key"
              type="checkbox"
              v-model="newOrder[check.key]"
              :label="__(check.label)"
            />
          </div>
          <ErrorMessage v-if="addError" :message="addError" />
        </div>
      </template>
      <template #actions>
        <Button
          variant="solid"
          :label="__('Create & Link')"
          :loading="creating"
          @click="submitNewOrder"
        />
        <Button :label="__('Cancel')" @click="showAddDialog = false" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import ExternalLinkIcon from '@/components/Icons/ExternalLinkIcon.vue'
import LoadingIndicator from '@/components/Icons/LoadingIndicator.vue'
import Link from '@/components/Controls/Link.vue'
import { Button, FormControl, Dialog, ErrorMessage, createResource } from 'frappe-ui'
import { ref } from 'vue'

const props = defineProps({
  docname: { type: String, required: true },
  dealContact: { type: String, default: null },
})

const __ = window.__ || ((t) => t)

const checkFields = [
  { key: 'has_sim_tray', label: __('Has SIM Tray') },
  { key: 'is_wet', label: __('Is Wet') },
  { key: 'turns_on', label: __('Turns On') },
  { key: 'broken_screen', label: __('Broken Screen') },
]

// ── Existing orders ──────────────────────────────────────────────────────────────────────────

const orders = createResource({
  url: 'doco.doco.repair_orders.get_deal_repair_orders',
  params: { deal_name: props.docname },
  auto: true,
})

const orderList = computed(() => orders.data || [])

function staticFields(order) {
  return [
    { label: __('Device Model'), value: order.device_model_name },
    { label: __('Client'), value: order.client },
    { label: __('Repair'), value: order.repair_to_be_done },
  ]
}

function statusClass(status) {
  return {
    'bg-green-100 text-green-700': status === 'Good',
    'bg-orange-100 text-orange-700': status === 'Bad',
    'bg-red-100 text-red-700': status === 'Really Bad',
    'bg-gray-100 text-gray-500': !status,
  }
}

// ── Add dialog ────────────────────────────────────────────────────────────────────────

const showAddDialog = ref(false)
const creating = ref(false)
const addError = ref(null)

const newOrder = ref({
  device_model: null,
  repair_to_be_done: null,
  general_status: '',
  client: props.dealContact,
  imei: null,
  has_sim_tray: false,
  is_wet: false,
  turns_on: false,
  broken_screen: false,
})


function getVal(v) {
  return v && typeof v === 'object' ? v.value : v
}

function submitNewOrder() {
  addError.value = null
  const deviceModelVal = getVal(newOrder.value.device_model)
  if (!deviceModelVal) {
    addError.value = __('Device Model is required')
    return
  }

  creating.value = true
  createResource({
    url: 'doco.doco.repair_orders.create_and_link_repair_order',
    params: {
      deal_name: props.docname,
      device_model: deviceModelVal,
      repair_to_be_done: getVal(newOrder.value.repair_to_be_done) || null,
      general_status: newOrder.value.general_status || null,
      client: getVal(newOrder.value.client) || null,
      imei: getVal(newOrder.value.imei) || null,
      has_sim_tray: newOrder.value.has_sim_tray ? 1 : 0,
      is_wet: newOrder.value.is_wet ? 1 : 0,
      turns_on: newOrder.value.turns_on ? 1 : 0,
      broken_screen: newOrder.value.broken_screen ? 1 : 0,
    },
    auto: true,
    onSuccess() {
      creating.value = false
      showAddDialog.value = false
      newOrder.value = {
        device_model: null, repair_to_be_done: null, general_status: '',
        client: props.dealContact, imei: null, has_sim_tray: false, is_wet: false, turns_on: false, broken_screen: false,
      }
      orders.reload()
    },
    onError(err) {
      creating.value = false
      addError.value = err.messages?.join('\n') || err.message
    },
  })
}
</script>
