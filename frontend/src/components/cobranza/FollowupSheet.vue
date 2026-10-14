<template>
  <CobranzaSheet
    :model-value="modelValue"
    kind="followup"
    :title="
      focus === 'assign' ? __('Assign collector') : __('Schedule follow-up')
    "
    :subtitle="customerName"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <FormControl
      v-model="form.collector"
      type="select"
      :label="__('Collector')"
      :options="collectorOptions"
      :disabled="!collectors.length"
    />
    <p v-if="loadProblem" role="alert" class="text-sm text-ink-red-7">
      {{ loadProblem.detail }}
      <Button
        class="ml-2"
        size="sm"
        :label="__('Retry', null, CTX)"
        @click="loadCollectors(true)"
      />
    </p>
    <FormControl
      v-model="form.date"
      type="date"
      :label="__('Next follow-up')"
      :min="today"
    />
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="preset in presets"
        :key="preset.value"
        size="sm"
        class="min-h-11 sm:min-h-7"
        :variant="form.date === preset.value ? 'solid' : 'subtle'"
        :label="preset.label"
        @click="form.date = preset.value"
      />
      <Button
        v-if="form.date"
        size="sm"
        variant="ghost"
        class="min-h-11 sm:min-h-7"
        :label="__('No date')"
        @click="form.date = ''"
      />
    </div>
    <FormControl
      v-model="form.note"
      type="textarea"
      :label="__('Note (optional)')"
      :placeholder="followup?.note || ''"
    />
    <p class="text-xs text-ink-gray-6">
      {{
        __(
          'It shows in their Pendientes and Agenda on that day, and the customer joins their «My customers».',
        )
      }}
    </p>
    <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
      {{ problem.detail }}
    </p>
    <template #actions>
      <Button
        v-if="followup"
        class="min-h-11 sm:min-h-8"
        variant="ghost"
        theme="red"
        :label="__('End follow-up')"
        :loading="saving === 'clear'"
        @click="save(true)"
      />
      <Button
        class="min-h-11 sm:min-h-8"
        :label="__('Cancel')"
        @click="$emit('update:modelValue', false)"
      />
      <Button
        class="min-h-11 sm:min-h-8"
        variant="solid"
        :label="__('Save', null, CTX)"
        :loading="saving === 'save'"
        :disabled="!form.collector && !form.date"
        @click="save(false)"
      />
    </template>
  </CobranzaSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import CobranzaSheet from '@/components/cobranza/CobranzaSheet.vue'
import {
  ACTIONS,
  CTX,
  cobranzaApi,
  followupPresets,
  problemOf,
} from '@/composables/useCobranza'
import { createRequests } from '@/composables/useCobranzaActions'

// «Asignar cobrador» / «Programar seguimiento»: one ToDo on the customer,
// assigned to the collector and dated the follow-up day. The page sends the
// whole state; «Deshacer» sends back what the server says was there before.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  customer: { type: String, default: '' },
  customerName: { type: String, default: '' },
  followup: { type: Object, default: null },
  today: { type: String, default: '' },
  focus: { type: String, default: 'followup' },
})
const emit = defineEmits(['update:modelValue', 'saved'])
const call = createRequests()
const form = reactive({ customer: '', collector: '', date: '', note: '' })
const saving = ref('')
const problem = ref(null)
const loadProblem = ref(null)
const presets = computed(() => followupPresets(props.today))

// Who may follow customers up, once per page load.
const collectors = ref([])
const me = ref('')
let loaded = null
async function loadCollectors(force = false) {
  if (loaded && !force) return loaded
  loadProblem.value = null
  loaded = cobranzaApi(`${ACTIONS}.get_collectors`)
    .then((data) => {
      collectors.value = data.collectors || []
      me.value = data.me || ''
      if (!form.collector && props.focus === 'followup')
        form.collector = me.value
    })
    .catch((error) => {
      loaded = null
      loadProblem.value = problemOf(error)
    })
  return loaded
}
const collectorOptions = computed(() => [
  { label: __('Nobody'), value: '' },
  ...collectors.value.map((c) => ({
    label: c.user === me.value ? __('{0} (me)', [c.full_name]) : c.full_name,
    value: c.user,
  })),
])

watch(
  () => [props.modelValue, props.customer],
  ([open, customer]) => {
    if (!open || !customer) return
    loadCollectors()
    if (form.customer === customer) return
    Object.assign(form, {
      customer,
      collector: props.followup?.user || me.value || '',
      date: props.followup?.date || '',
      note: '',
    })
    problem.value = null
  },
  { immediate: true },
)

async function save(clear) {
  saving.value = clear ? 'clear' : 'save'
  problem.value = null
  try {
    const result = await call(
      `followup:${form.customer}`,
      `${ACTIONS}.set_followup`,
      {
        customer: form.customer,
        collector: clear ? '' : form.collector,
        date: clear ? '' : form.date,
        note: clear ? '' : form.note,
      },
    )
    form.customer = ''
    emit('update:modelValue', false)
    emit('saved', result)
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    saving.value = ''
  }
}
</script>
