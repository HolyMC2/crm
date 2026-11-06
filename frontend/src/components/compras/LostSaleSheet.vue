<template>
  <!-- «No lo tenía»: what a customer asked for that the shop did not have, in
       three taps (type, model, colour) and a quantity. It moves no stock and is
       no sale; the levels and the buy plan count it as demand. -->
  <BottomSheet
    v-model:open="open"
    :title="__('We did not have it', null, 'VentasPerdidas')"
    :subtitle="
      __(
        'What the customer asked for; it counts as demand for the levels.',
        null,
        'VentasPerdidas',
      )
    "
    :dismissible="!busy"
  >
    <form class="space-y-4 pb-4" @submit.prevent="save">
      <p v-if="failed" role="alert" class="text-sm text-ink-red-7">
        {{ failed }}
      </p>
      <fieldset v-if="opts.groups.length">
        <legend class="mb-1.5 text-xs text-ink-gray-5">
          {{ __('Product type', null, 'VentasPerdidas') }}
        </legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="g in opts.groups.slice(0, GROUPS)"
            :key="g"
            type="button"
            :class="chipClass(form.item_group === g)"
            :aria-pressed="form.item_group === g"
            @click="pickGroup(g)"
          >
            {{ g }}
          </button>
        </div>
      </fieldset>
      <div>
        <FormControl
          v-model="form.model"
          type="text"
          :label="__('Model', null, 'VentasPerdidas')"
          :placeholder="__('iPhone 12, A15…', null, 'VentasPerdidas')"
          autocomplete="off"
          @update:model-value="findModels"
        />
        <div v-if="opts.models.length" class="mt-2 flex flex-wrap gap-1.5">
          <button
            v-for="m in opts.models.slice(0, MODELS)"
            :key="m"
            type="button"
            :class="chipClass(form.model === m)"
            :aria-pressed="form.model === m"
            @click="form.model = m"
          >
            {{ m }}
          </button>
        </div>
      </div>
      <fieldset v-if="opts.colours.length">
        <legend class="mb-1.5 text-xs text-ink-gray-5">
          {{ __('Colour (optional)', null, 'VentasPerdidas') }}
        </legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in opts.colours.slice(0, COLOURS)"
            :key="c"
            type="button"
            :class="chipClass(form.colour === c)"
            :aria-pressed="form.colour === c"
            @click="form.colour = form.colour === c ? '' : c"
          >
            {{ c }}
          </button>
        </div>
      </fieldset>
      <div class="grid grid-cols-2 gap-3">
        <FormControl
          v-model="form.qty"
          type="number"
          min="1"
          :label="__('Pieces', null, 'VentasPerdidas')"
        />
        <FormControl
          v-model="form.note"
          type="text"
          :label="__('Note (optional)', null, 'VentasPerdidas')"
          autocomplete="off"
        />
      </div>
      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>
      <div class="flex justify-end">
        <Button
          type="submit"
          variant="solid"
          :label="__('Record it', null, 'VentasPerdidas')"
          class="min-h-11 sm:min-h-8"
          :disabled="!canSave"
          :loading="busy"
        />
      </div>
      <p v-if="!canSave && !busy" class="text-right text-xs text-ink-gray-5">
        {{
          __('Choose the product type and the model.', null, 'VentasPerdidas')
        }}
      </p>
    </form>
  </BottomSheet>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Button, FormControl, toast } from 'frappe-ui'
import { BottomSheet, chipClass } from '@/components/ui'
import { comprasApi, problemOf } from '@/composables/useCompras'

const props = defineProps({
  /** Where it was asked: «Mostrador», «WhatsApp»… (doco lost_sales.CHANNELS). */
  channel: { type: String, default: 'Mostrador' },
  referenceDoctype: { type: String, default: '' },
  referenceName: { type: String, default: '' },
  customer: { type: String, default: '' },
})
const emit = defineEmits(['recorded'])
const open = defineModel('open', { type: Boolean, default: false })

const API = 'doco.workspaces.ventas_perdidas.'
const GROUPS = 12
const MODELS = 12
const COLOURS = 16

const opts = ref({ groups: [], models: [], colours: [], warehouse: '' })
const form = reactive({
  item_group: '',
  model: '',
  colour: '',
  qty: 1,
  note: '',
})
const failed = ref('')
const problem = ref('')
const busy = ref(false)
const canSave = computed(
  () =>
    !!form.item_group && !!String(form.model).trim() && Number(form.qty) >= 1,
)

async function options(search = '') {
  try {
    const out = await comprasApi(API + 'options', {
      item_group: form.item_group || null,
      search,
    })
    opts.value = { groups: [], models: [], colours: [], ...out }
    if (!form.item_group) form.item_group = out.item_group || ''
    failed.value = ''
  } catch (error) {
    failed.value = problemOf(error).detail
  }
}

let timer = null
function findModels(text) {
  clearTimeout(timer)
  timer = setTimeout(() => options(String(text || '').trim()), 250)
}

function pickGroup(group) {
  form.item_group = group
  options(form.model)
}

watch(open, (value) => {
  if (!value) return
  Object.assign(form, { model: '', colour: '', qty: 1, note: '' })
  problem.value = ''
  options()
})

async function save() {
  if (!canSave.value) return
  busy.value = true
  problem.value = ''
  try {
    const got = await comprasApi(API + 'record', {
      item_group: form.item_group,
      model: String(form.model).trim(),
      colour: form.colour || null,
      qty: Math.round(Number(form.qty)),
      note: form.note || null,
      channel: props.channel,
      customer: props.customer || null,
      reference_doctype: props.referenceDoctype || null,
      reference_name: props.referenceName || null,
    })
    toast.success(__('Recorded: {0}', [got.title], 'VentasPerdidas'))
    emit('recorded', got)
    open.value = false
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => clearTimeout(timer))
</script>
