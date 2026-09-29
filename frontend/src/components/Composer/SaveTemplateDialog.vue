<!--
  «Guardar como plantilla»: turns the composer text into a Canned Reply with a
  `/shortcut` (doco_marketing.api.composer.save_template). The shortcut follows
  the title until the operator edits it. Variable chips insert {{variables}}
  at the caret; the backend fills them when the template is used.
-->
<template>
  <Dialog
    v-model="show"
    :options="{ title: __('Guardar como plantilla'), size: 'xl' }"
  >
    <template #body-content>
      <div
        class="space-y-3"
        @keydown.ctrl.enter.prevent.stop="submit"
        @keydown.meta.enter.prevent.stop="submit"
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
              >{{ __('Título') }}</span
            >
            <input
              ref="titleInput"
              v-model="title"
              type="text"
              :class="inputClass"
              :placeholder="__('Horario de atención')"
            />
          </label>
          <label class="space-y-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
              >{{ __('Atajo') }}</span
            >
            <span class="flex items-center gap-1">
              <span class="font-mono text-sm text-ink-gray-5">/</span>
              <input
                v-model="shortcut"
                type="text"
                :class="inputClass"
                placeholder="horario"
                @input="shortcutEdited = true"
                @blur="shortcut = slugify(shortcut)"
              />
            </span>
          </label>
          <label class="space-y-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
              >{{ __('Canal') }}</span
            >
            <select v-model="channel" :class="inputClass">
              <option
                v-for="c in channelOptions"
                :key="c.value"
                :value="c.value"
              >
                {{ c.label }}
              </option>
            </select>
          </label>
          <label class="space-y-1">
            <span
              class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
              >{{ __('Documento (opcional)') }}</span
            >
            <select v-model="documentType" :class="inputClass">
              <option
                v-for="d in documentOptions"
                :key="d.value"
                :value="d.value"
              >
                {{ d.label }}
              </option>
            </select>
          </label>
        </div>
        <div class="space-y-1">
          <span
            class="text-[11px] font-semibold uppercase tracking-wide text-ink-gray-5"
            >{{ __('Texto') }}</span
          >
          <textarea
            ref="bodyInput"
            v-model="text"
            rows="6"
            :class="inputClass"
            :aria-label="__('Texto')"
          />
          <div class="flex flex-wrap gap-1">
            <button
              v-for="v in VARIABLES"
              :key="v"
              type="button"
              class="rounded bg-surface-gray-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-gray-7 hover:bg-surface-gray-3"
              :title="__('Insertar variable')"
              @click="insertVariable(v)"
            >
              {{ chip(v) }}
            </button>
          </div>
          <p v-if="documentType" class="text-[11px] text-ink-gray-5">
            {{ __('Se usará como texto al enviar este tipo de documento.') }}
          </p>
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button :label="__('Cancelar')" @click="show = false" />
        <Button
          variant="solid"
          :label="__('Guardar')"
          :loading="saving"
          :disabled="!title.trim() || !text.trim()"
          @click="submit"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { Dialog, Button, toast } from 'frappe-ui'
import { slugify } from '@/composables/slashCommands'
import { saveTemplate } from '@/composables/composerCommands'

const VARIABLES = [
  'cliente',
  'nombre',
  'empresa',
  'trato',
  'vendedor',
  'fecha',
  'total',
  'documento',
  'link',
  'saldo',
]

const props = defineProps({
  body: { type: String, default: '' },
})
const emit = defineEmits(['saved'])
const show = defineModel({ type: Boolean, default: false })

const inputClass =
  'w-full rounded border border-outline-gray-2 bg-surface-gray-2 px-2 py-1.5 text-sm text-ink-gray-8 placeholder-ink-gray-4 focus:border-outline-gray-4 focus:bg-surface-base focus:outline-none focus:ring-0'

const channelOptions = [
  { value: 'Any', label: __('Cualquiera') },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Messenger', label: 'Messenger' },
  { value: 'Email', label: __('Correo') },
]
const documentOptions = [
  { value: '', label: __('Ninguno') },
  { value: 'Quotation', label: __('Cotización') },
  { value: 'Sales Order', label: __('Orden de venta') },
  { value: 'Repair Order', label: __('Orden de reparación') },
  { value: 'Adeudo', label: __('Adeudo') },
]
const chip = (v) => `{{${v}}}`

const title = ref('')
const shortcut = ref('')
const shortcutEdited = ref(false)
const channel = ref('Any')
const documentType = ref('')
const text = ref('')
const saving = ref(false)
const titleInput = ref(null)
const bodyInput = ref(null)

watch(title, (t) => {
  if (!shortcutEdited.value) shortcut.value = slugify(t)
})

watch(
  show,
  (open) => {
    if (!open) return
    title.value = ''
    shortcut.value = ''
    shortcutEdited.value = false
    channel.value = 'Any'
    documentType.value = ''
    text.value = props.body || ''
    nextTick(() => titleInput.value?.focus())
  },
  { immediate: true },
)

function insertVariable(v) {
  const token = `{{${v}}}`
  const el = bodyInput.value
  const current = text.value || ''
  const start = el?.selectionStart ?? current.length
  const end = el?.selectionEnd ?? current.length
  text.value = current.slice(0, start) + token + current.slice(end)
  nextTick(() => {
    el?.focus()
    el?.setSelectionRange?.(start + token.length, start + token.length)
  })
}

async function submit() {
  if (!title.value.trim() || !text.value.trim() || saving.value) return
  saving.value = true
  try {
    const row = await saveTemplate({
      title: title.value.trim(),
      body: text.value,
      channel: channel.value,
      shortcut: slugify(shortcut.value) || undefined,
      document_type: documentType.value || undefined,
    })
    toast.success(__('Plantilla guardada'))
    emit('saved', row)
    show.value = false
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo guardar la plantilla'))
  } finally {
    saving.value = false
  }
}
</script>
