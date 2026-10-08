<template>
  <Dialog v-model="open" :options="{ title: __('Choose purchase') }">
    <template #body-content>
      <div class="space-y-3">
        <p class="text-sm text-ink-gray-7">
          {{
            __(
              'The sale or delivered Taller order this case is about. It decides how the case is solved.',
            )
          }}
        </p>
        <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Looking up purchases…') }}
        </p>
        <template v-else>
          <label
            v-for="option in options"
            :key="option.key"
            class="flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-2 py-1 hover:bg-surface-gray-1"
          >
            <input
              type="radio"
              name="claim-source-pick"
              class="mt-1"
              :checked="chosen?.key === option.key"
              @change="chosen = option"
            />
            <span class="min-w-0">
              <span class="block text-sm text-ink-gray-9">
                {{ option.label }}
                <span class="text-ink-gray-5"
                  >·
                  {{
                    option.kind === 'order'
                      ? __('Taller order')
                      : __('Sale', null, 'Garantías')
                  }}</span
                >
              </span>
              <span class="block text-xs text-ink-gray-6">{{
                option.hint
              }}</span>
            </span>
          </label>
          <p v-if="!options.length" class="text-sm text-ink-gray-6">
            {{
              __(
                'No recent sales or delivered orders for this customer. Search by the sale or order number.',
              )
            }}
          </p>
          <FormControl
            v-model="search"
            type="search"
            :label="__('Sale or order number')"
            :placeholder="__('E.g. ACC-PSINV-2026-00012')"
            @keydown.enter.prevent="load"
          />
        </template>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :label="__('Close', null, 'Garantías')" @click="open = false" />
        <Button :label="__('Search', null, 'Garantías')" @click="load" />
        <Button
          variant="solid"
          :label="__('Use this purchase')"
          :disabled="!chosen"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import {
  garantiasApi,
  problemOf,
  sourceOptions,
} from '@/composables/useGarantias'

const props = defineProps({ claim: { type: Object, required: true } })
const emit = defineEmits(['changed'])
const open = defineModel({ type: Boolean, default: false })
const found = ref(null)
const loading = ref(false)
const saving = ref(false)
const problem = ref(null)
const chosen = ref(null)
const search = ref('')
// With a number typed the server may find another customer's sale; set_source explains then.
const options = computed(() => sourceOptions(found.value))

watch(open, (value) => {
  if (!value) return
  search.value = ''
  chosen.value = null
  problem.value = null
  load()
})

async function load() {
  loading.value = true
  problem.value = null
  try {
    found.value = await garantiasApi('sources', {
      customer: props.claim.customer,
      q: search.value.trim() || null,
    })
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  problem.value = null
  try {
    const view = await garantiasApi('set_source', {
      name: props.claim.name,
      against_doctype: chosen.value.against_doctype,
      against_name: chosen.value.against_name,
      against_row: chosen.value.against_row || null,
      serial_no: chosen.value.serial_no || null,
      batch_no: chosen.value.batch_no || null,
      modified: props.claim.modified,
    })
    emit('changed', view)
    open.value = false
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    saving.value = false
  }
}
</script>
