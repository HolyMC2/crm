<template>
  <div class="mt-6 border-t pt-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <span class="text-base font-semibold text-ink-gray-8">
        {{ __('Repair Orders') }}
        <span
          v-if="repairOrders.data?.length"
          class="ml-1.5 text-xs font-normal text-ink-gray-5"
        >
          ({{ repairOrders.data.length }})
        </span>
      </span>
      <Button
        size="sm"
        variant="subtle"
        :icon="showForm ? 'x' : 'plus'"
        :tooltip="showForm ? __('Cancel') : __('Add Repair Order')"
        @click="toggleForm"
      />
    </div>

    <!-- Inline add form -->
    <div v-if="showForm" class="mb-4 rounded-lg border bg-surface-gray-1 p-4">
      <RepairOrderQuickForm v-model="newRepair" />
      <div class="mt-3 flex justify-end gap-2">
        <Button :label="__('Cancel')" @click="toggleForm" />
        <Button
          :label="__('Create')"
          variant="solid"
          :loading="creating"
          :disabled="!newRepair.device_model"
          @click="createRepairOrder"
        />
      </div>
      <ErrorMessage v-if="createError" class="mt-2" :message="createError" />
    </div>

    <!-- Loading -->
    <div v-if="repairOrders.loading" class="py-3 text-sm text-ink-gray-5">
      {{ __('Loading...') }}
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!repairOrders.data?.length"
      class="py-2 text-sm text-ink-gray-5"
    >
      {{ __('No repair orders linked to this deal.') }}
    </div>

    <!-- Repair order cards -->
    <div v-else class="space-y-3">
      <div
        v-for="ro in repairOrders.data"
        :key="ro.name"
        class="overflow-hidden rounded-xl border bg-surface-white shadow-sm"
      >
        <!-- Card header -->
        <div class="flex items-center justify-between border-b bg-surface-gray-1 px-4 py-2.5">
          <a
            :href="`/app/repair-order/${encodeURIComponent(ro.name)}`"
            target="_blank"
            class="text-sm font-semibold text-ink-blue-3 hover:underline"
          >
            {{ ro.name }}
          </a>
          <div class="flex items-center gap-1.5">
            <Badge :label="__(ro.status)" :theme="statusTheme(ro.status)" />
            <button
              :title="__('Print Ticket')"
              class="rounded p-1 text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-8"
              @click="printTicket(ro.name)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Card body -->
        <div class="px-4 py-3 text-sm">

          <!-- Row 1: device + repair type -->
          <div class="grid grid-cols-2 gap-x-6 gap-y-2.5">
            <div>
              <div class="mb-0.5 text-xs text-ink-gray-5">{{ __('Device Model') }}</div>
              <div class="font-medium text-ink-gray-8">{{ ro.device_model || '—' }}</div>
            </div>
            <div>
              <div class="mb-0.5 text-xs text-ink-gray-5">{{ __('Repair') }}</div>
              <div class="font-medium text-ink-gray-8">{{ ro.repair_to_be_done || '—' }}</div>
            </div>

            <!-- Row 2: client + device condition -->
            <div>
              <div class="mb-0.5 text-xs text-ink-gray-5">{{ __('Client') }}</div>
              <div class="font-medium text-ink-gray-8">{{ ro.client_name || ro.client || '—' }}</div>
            </div>
            <div>
              <div class="mb-0.5 text-xs text-ink-gray-5">{{ __('Device Condition') }}</div>
              <div class="font-medium text-ink-gray-8">{{ ro.general_status ? __(ro.general_status) : '—' }}</div>
            </div>

            <!-- Row 3: technician -->
            <div>
              <div class="mb-0.5 text-xs text-ink-gray-5">{{ __('Technician') }}</div>
              <div class="font-medium text-ink-gray-8">{{ ro.technician_name || ro.technician || '—' }}</div>
            </div>
          </div>

          <!-- Device state pills -->
          <div class="mt-2.5 flex flex-wrap gap-1.5">
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              :class="ro.turns_on ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'"
            >
              {{ ro.turns_on ? __('Turns on ✓') : __('Does not turn on ✗') }}
            </span>
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              :class="ro.has_sim_tray ? 'bg-green-100 text-green-700' : 'bg-surface-gray-2 text-ink-gray-5'"
            >
              {{ ro.has_sim_tray ? __('SIM tray ✓') : __('No SIM tray') }}
            </span>
            <span
              v-if="ro.broken_screen"
              class="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700"
            >
              {{ __('Broken screen ⚠') }}
            </span>
            <span
              v-if="ro.is_wet"
              class="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700"
            >
              {{ __('Wet ⚠') }}
            </span>
          </div>

          <!-- IMEI / serial numbers -->
          <div v-if="ro.serial_numbers?.length" class="mt-2.5">
            <div class="mb-1 text-xs text-ink-gray-5">{{ __('IMEI / Serial') }}</div>
            <div class="flex flex-wrap gap-1.5">
              <code
                v-for="sn in ro.serial_numbers"
                :key="sn.serial_no"
                class="rounded bg-surface-gray-2 px-1.5 py-0.5 font-mono text-xs text-ink-gray-7"
              >
                {{ sn.identifier_type }}: {{ sn.serial_no }}
              </code>
            </div>
          </div>

          <!-- Linked documents -->
          <div
            v-if="ro.quotation || ro.sales_order || ro.sales_invoice || ro.pos_invoice"
            class="mt-2.5 border-t pt-2"
          >
            <div class="mb-1 text-xs text-ink-gray-5">{{ __('Documents') }}</div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a
                v-if="ro.quotation"
                :href="`/app/quotation/${encodeURIComponent(ro.quotation)}`"
                target="_blank"
                class="text-ink-blue-3 hover:underline"
              >
                {{ __('Quote') }}: {{ ro.quotation }}
              </a>
              <a
                v-if="ro.sales_order"
                :href="`/app/sales-order/${encodeURIComponent(ro.sales_order)}`"
                target="_blank"
                class="text-ink-blue-3 hover:underline"
              >
                {{ __('SO') }}: {{ ro.sales_order }}
              </a>
              <a
                v-if="ro.sales_invoice"
                :href="`/app/sales-invoice/${encodeURIComponent(ro.sales_invoice)}`"
                target="_blank"
                class="text-ink-blue-3 hover:underline"
              >
                {{ __('Invoice') }}: {{ ro.sales_invoice }}
              </a>
              <a
                v-if="ro.pos_invoice"
                :href="`/app/pos-invoice/${encodeURIComponent(ro.pos_invoice)}`"
                target="_blank"
                class="text-ink-blue-3 hover:underline"
              >
                {{ __('POS') }}: {{ ro.pos_invoice }}
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import RepairOrderQuickForm from '@/components/doco/RepairOrderQuickForm.vue'
import { Badge, ErrorMessage, createResource } from 'frappe-ui'
import { ref } from 'vue'

const props = defineProps({
  docname: { type: String, required: true },
})

const showForm = ref(false)
const creating = ref(false)
const createError = ref(null)

const emptyRepair = () => ({
  device_model: '',
  repair_to_be_done: '',
  general_status: '',
  technician: '',
  client: '',
  has_sim_tray: false,
  is_wet: false,
  turns_on: false,
  broken_screen: false,
})

const newRepair = ref(emptyRepair())

const repairOrders = createResource({
  url: 'taller.repair.repair_orders.get_deal_repair_orders',
  params: { deal_name: props.docname },
  auto: true,
})

function toggleForm() {
  showForm.value = !showForm.value
  if (!showForm.value) {
    newRepair.value = emptyRepair()
    createError.value = null
  }
}

function createRepairOrder() {
  creating.value = true
  createError.value = null
  const rd = newRepair.value
  createResource({
    url: 'taller.repair.repair_orders.create_and_link_repair_order',
    params: {
      deal_name: props.docname,
      device_model: rd.device_model,
      repair_to_be_done: rd.repair_to_be_done || null,
      general_status: rd.general_status || null,
      technician: rd.technician || null,
      client: rd.client || null,
      has_sim_tray: rd.has_sim_tray ? 1 : 0,
      is_wet: rd.is_wet ? 1 : 0,
      turns_on: rd.turns_on ? 1 : 0,
      broken_screen: rd.broken_screen ? 1 : 0,
    },
    auto: true,
    onSuccess() {
      creating.value = false
      showForm.value = false
      newRepair.value = emptyRepair()
      repairOrders.reload()
    },
    onError(err) {
      creating.value = false
      createError.value = err.messages?.join('\n') || err.message
    },
  })
}

const STATUS_THEMES = {
  'Entregado': 'green',
  'Listo para Entregar': 'green',
  'En Reparación': 'blue',
  'Control de Calidad': 'blue',
  'En Diagnóstico': 'orange',
  'Esperando Aprobación': 'yellow',
  'En Espera de Pieza': 'purple',
  'Por Revisar': 'gray',
  'Cancelado': 'red',
}

function statusTheme(status) {
  return STATUS_THEMES[status] || 'gray'
}

function printTicket(roName) {
  createResource({
    url: 'taller.repair.repair_orders.get_repair_ticket_print_url',
    params: { name: roName },
    auto: true,
    onSuccess(data) {
      const params = new URLSearchParams({
        doctype: 'Repair Order',
        name: roName,
        format: data.format,
        trigger_print: '1',
        simplified: '1',
      })
      if (data.letterhead) params.set('letterhead', data.letterhead)
      window.open('/printview?' + params.toString(), '_blank', 'width=400,height=600')
    },
    onError(err) {
      const msg = err?.messages?.join('\n') || err?.message || 'Print failed'
      alert(__('Print failed: ') + msg)
    },
  })
}
</script>
