<template>
  <Dialog v-model="open" :options="{ title: __('Edit product details') }">
    <template #body-content>
      <div class="space-y-4">
        <FormControl
          v-model="form.item_name"
          type="text"
          maxlength="140"
          :label="__('Name', null, 'Productos')"
        />
        <Link
          v-model="form.item_group"
          doctype="Item Group"
          :filters="{ is_group: 0 }"
          :label="__('Group', null, 'Productos')"
        />
        <Link
          v-model="form.brand"
          doctype="Brand"
          :label="__('Brand', null, 'Productos')"
        />
        <FormControl
          v-model="form.description"
          type="textarea"
          :label="__('Description', null, 'Productos')"
        />
        <fieldset class="space-y-2">
          <legend class="text-sm text-ink-gray-7">
            {{ __('Barcodes', null, 'Productos') }}
          </legend>
          <div
            v-for="(row, index) in form.barcodes"
            :key="index"
            class="flex items-center gap-2"
          >
            <FormControl
              v-model="row.barcode"
              class="flex-1"
              type="text"
              inputmode="numeric"
              :aria-label="__('Barcode {0}', [index + 1])"
            />
            <Button
              icon="x"
              :aria-label="__('Remove barcode {0}', [row.barcode])"
              class="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
              @click="form.barcodes.splice(index, 1)"
            />
          </div>
          <Button
            icon-left="plus"
            :label="__('Add barcode')"
            @click="form.barcodes.push({ barcode: '', barcode_type: '' })"
          />
        </fieldset>
        <label class="flex min-h-11 items-center gap-2 text-sm">
          <input v-model="form.disabled" type="checkbox" />
          {{ __('Disabled: not sold or bought any more') }}
        </label>
        <div
          v-if="compare.length"
          role="status"
          class="rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-7"
        >
          <p class="font-medium">
            {{ __('Someone else changed this product. Yours are kept:') }}
          </p>
          <ul class="mt-1 list-disc pl-5">
            <li v-for="line in compare" :key="line.field">
              {{
                __('{0}: now «{1}», yours «{2}»', [
                  line.label,
                  line.current,
                  line.mine,
                ])
              }}
            </li>
          </ul>
        </div>
        <div
          v-if="problem"
          role="alert"
          class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <div class="mt-2 flex flex-wrap gap-2">
            <Button
              v-if="problem.kind === 'conflict'"
              :label="__('Refresh and compare')"
              @click="refresh"
            />
            <Button
              v-if="problem.kind === 'permission'"
              :label="__('Ask for the change')"
              @click="$emit('request')"
            />
            <Button
              v-if="problem.kind === 'offline'"
              :label="__('Check result')"
              @click="save"
            />
          </div>
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          :label="__('Cancel', null, 'Productos')"
          @click="open = false"
        />
        <Button
          variant="solid"
          :label="
            compare.length ? __('Save mine') : __('Save', null, 'Productos')
          "
          :loading="saving"
          :disabled="!changed || !form.item_name.trim()"
          @click="save"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
import {
  editPayload,
  outcomeUnknown,
  problemOf,
  productosApi,
  requestId,
} from '@/composables/useProductos'

// «Editar datos»: the native Item save as this worker; a newer version is
// compared field by field and the worker's input is kept.
const props = defineProps({
  item: { type: Object, required: true },
})
const emit = defineEmits(['saved', 'refresh', 'request'])
const open = defineModel({ type: Boolean, default: false })
const form = reactive(blank(props.item))
const base = ref({ ...props.item })
const saving = ref(false)
const problem = ref(null)
const waitingRefresh = ref(false)
const compare = ref([])
let rid = null
let sentPayload = ''

function blank(item) {
  return {
    item_name: item.item_name || '',
    item_group: item.item_group || '',
    brand: item.brand || '',
    description: item.description || '',
    disabled: Boolean(Number(item.disabled || 0)),
    barcodes: (item.barcodes || []).map((row) => ({ ...row })),
  }
}
const payload = computed(() =>
  editPayload(base.value, { ...form, disabled: form.disabled ? 1 : 0 }),
)
const changed = computed(() => Object.keys(payload.value).length > 0)

watch(open, (value) => {
  if (!value) return
  Object.assign(form, blank(props.item))
  base.value = { ...props.item }
  problem.value = null
  compare.value = []
  rid = null
})
// After «Actualizar y comparar» the newer version arrives: show what differs
// from the worker's input, keep the input, save on top of the new version.
watch(
  () => props.item,
  (current) => {
    if (!waitingRefresh.value) return
    waitingRefresh.value = false
    const labels = {
      item_name: __('Name', null, 'Productos'),
      item_group: __('Group', null, 'Productos'),
      brand: __('Brand', null, 'Productos'),
      description: __('Description', null, 'Productos'),
    }
    compare.value = Object.keys(labels)
      .filter((field) => (current[field] || '') !== (form[field] || ''))
      .map((field) => ({
        field,
        label: labels[field],
        current: current[field] || '—',
        mine: form[field] || '—',
      }))
    base.value = { ...current }
    problem.value = null
    rid = null
  },
)

function refresh() {
  waitingRefresh.value = true
  emit('refresh')
}
async function save() {
  const body = JSON.stringify(payload.value)
  if (!rid || body !== sentPayload) rid = requestId()
  sentPayload = body
  saving.value = true
  problem.value = null
  try {
    const result = await productosApi('save_item', {
      request_id: rid,
      item: props.item.name,
      modified: base.value.modified,
      data: payload.value,
    })
    rid = null
    compare.value = []
    open.value = false
    emit('saved', result)
  } catch (error) {
    problem.value = problemOf(error)
    if (!outcomeUnknown(error)) rid = null
  } finally {
    saving.value = false
  }
}
</script>
