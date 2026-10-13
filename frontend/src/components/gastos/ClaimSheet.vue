<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      data-testid="claim-sheet"
    >
      <!-- The page behind never scrolls while the sheet is open. -->
      <div
        class="absolute inset-0 bg-black/30"
        aria-hidden="true"
        @click="close"
        @wheel.prevent
        @touchmove.prevent
      />
      <div
        ref="panel"
        class="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-base shadow-2xl sm:max-w-lg sm:rounded-2xl"
        tabindex="-1"
        @keydown.esc="close"
      >
        <header
          class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-2"
        >
          <h2
            :id="titleId"
            class="flex-1 text-lg font-semibold text-ink-gray-9"
          >
            {{ name ? __('Your expense') : __('New expense') }}
          </h2>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-lg text-ink-gray-7 hover:bg-surface-gray-2"
            data-act="sheet-close"
            :aria-label="__('Close', null, 'Gastos')"
            @click="close"
          >
            <FeatherIcon name="x" class="h-5 w-5" />
          </button>
        </header>
        <div
          class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
          data-testid="claim-sheet-body"
        >
          <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
            {{ __('Loading…', null, 'Gastos') }}
          </p>
          <template v-else-if="options">
            <ClaimGuard
              v-if="options.guard && !options.employee"
              :guard="options.guard"
            />
            <template v-else>
              <p
                v-if="resumed"
                role="status"
                class="rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
              >
                {{
                  __(
                    'We did not hear back about the expense you sent. Sending again checks that same expense; it is never filed twice.',
                  )
                }}
              </p>
              <!-- The receipt: the camera on a phone, a file on a computer. -->
              <section
                class="space-y-2"
                :aria-label="__('Receipt photo')"
                data-field="photo"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <label
                    class="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded bg-surface-gray-7 px-4 text-base font-medium text-ink-base focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-gray-4"
                  >
                    <FeatherIcon name="camera" class="h-4 w-4" />{{
                      __('Take the receipt photo')
                    }}
                    <input
                      ref="camera"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      class="sr-only"
                      @change="pick"
                    />
                  </label>
                  <label
                    class="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border border-outline-gray-2 px-4 text-base text-ink-gray-8 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-gray-4 sm:min-h-8"
                  >
                    <FeatherIcon name="upload" class="h-4 w-4" />{{
                      __('Choose file')
                    }}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      class="sr-only"
                      @change="pick"
                    />
                  </label>
                </div>
                <div v-if="preview" class="flex items-center gap-3">
                  <img
                    :src="preview"
                    :alt="__('Receipt photo')"
                    class="h-20 w-20 rounded-lg border border-outline-gray-2 object-cover"
                  />
                  <span class="min-w-0 truncate text-sm text-ink-gray-7">{{
                    form.photo?.name
                  }}</span>
                </div>
                <p
                  v-else-if="form.photo"
                  class="truncate text-sm text-ink-gray-7"
                >
                  {{ form.photo.name }}
                </p>
                <p v-else-if="photos" class="text-sm text-ink-gray-7">
                  {{ __('Receipt photos on this expense: {0}', [photos]) }}
                </p>
                <p
                  v-if="tried && missing.includes('photo')"
                  role="alert"
                  class="text-sm text-ink-red-7"
                >
                  {{ __('Take the photo of the receipt to send it.') }}
                </p>
              </section>
              <FormControl
                v-model="form.expense_type"
                type="select"
                data-field="expense_type"
                :label="__('Type of expense')"
                :options="[
                  { label: __('Choose a type'), value: '' },
                  ...options.types.map((t) => ({
                    label: t.ready
                      ? t.label
                      : __('{0} (needs setup)', [t.label]),
                    value: t.value,
                  })),
                ]"
              />
              <ClaimGuard
                v-if="chosenType && !chosenType.ready"
                :guard="{
                  code: 'setup',
                  message: chosenType.reason,
                  actions: [setupAction],
                }"
              />
              <div class="grid grid-cols-2 gap-3">
                <FormControl
                  v-model="form.amount"
                  type="number"
                  inputmode="decimal"
                  data-field="amount"
                  :label="__('Amount ({0})', [options.currency])"
                  :min="0"
                  :step="0.01"
                />
                <FormControl
                  v-model="form.expense_date"
                  type="date"
                  data-field="expense_date"
                  :label="__('Date', null, 'Gastos')"
                />
              </div>
              <FormControl
                v-model="form.description"
                type="text"
                data-field="description"
                :label="__('Note (optional)')"
                :placeholder="__('E.g. taxi to the bank with the deposit')"
              />
              <ClaimGuard v-if="options.guard" :guard="options.guard" />
              <FormControl
                v-else
                v-model="form.approver"
                type="select"
                data-field="approver"
                :label="__('Who approves it')"
                :options="[
                  { label: __('Choose a person'), value: '' },
                  ...options.approvers.map((a) => ({
                    label: a.puesto
                      ? `${a.full_name} · ${a.puesto}`
                      : a.full_name,
                    value: a.user,
                  })),
                ]"
              />
              <p
                v-if="options.advance"
                class="rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
              >
                {{
                  __(
                    'You have an advance of {0} to settle: it is discounted from this expense when approved.',
                    [
                      money(
                        options.advance.remaining,
                        options.advance.currency,
                      ),
                    ],
                  )
                }}
              </p>
              <p
                v-if="tried && missing.length"
                role="alert"
                class="text-sm text-ink-red-7"
              >
                {{ __('Missing: {0}', [missingText]) }}
              </p>
            </template>
          </template>
          <ClaimGuard v-if="refusal" :guard="refusal" @action="onAction" />
          <div
            v-if="problem"
            role="alert"
            class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
          >
            <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          </div>
        </div>
        <footer
          v-if="options && (options.employee || !options.guard)"
          class="flex flex-wrap items-center justify-end gap-2 border-t border-outline-gray-1 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <span
            v-if="step"
            role="status"
            class="mr-auto text-sm text-ink-gray-6"
            >{{ step }}</span
          >
          <Button
            class="min-h-11 sm:min-h-8"
            data-testid="claim-save"
            :label="__('Save', null, 'Gastos')"
            :disabled="busy"
            @click="submit(false)"
          />
          <Button
            variant="solid"
            class="min-h-11 sm:min-h-8"
            :loading="busy"
            :disabled="Boolean(options.guard)"
            data-testid="claim-send"
            :label="__('Send for approval')"
            @click="submit(true)"
          />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Button, FeatherIcon, FormControl } from 'frappe-ui'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import FilesUploadHandler from '@/components/FilesUploader/filesUploaderHandler'
import {
  CLAIM,
  claimMissing,
  claimProblem,
  claimsApi,
  money,
  pendingOperation,
  runOnce,
} from '@/composables/useGastosEmpleados'

// «Nuevo gasto» / «Enviar a aprobar»: save → photo → send, each replay-safe.
// A failed step keeps the draft and what was typed, and names what is missing.
const props = defineProps({
  name: { type: String, default: '' },
  // The record's own payload when editing (document, expenses, photos).
  claim: { type: Object, default: null },
})
const emit = defineEmits(['saved', 'sent'])
const open = defineModel({ type: Boolean, default: false })
const titleId = `claim-sheet-${Math.random().toString(36).slice(2)}`
const panel = ref(null)
const camera = ref(null)
const options = ref(null)
const loading = ref(false)
const busy = ref(false)
const step = ref('')
const tried = ref(false)
const refusal = ref(null)
const problem = ref(null)
const resumed = ref(false)
const preview = ref('')
const uploaded = ref(false)
const claimName = ref('')
const modified = ref('')
const photos = ref(0)
let opener = null
const form = reactive({
  expense_type: '',
  amount: '',
  expense_date: '',
  description: '',
  approver: '',
  photo: null,
})

const saveKey = computed(() => `save:${claimName.value || 'new'}`)
const chosenType = computed(() =>
  options.value?.types?.find((t) => t.value === form.expense_type),
)
const setupAction = {
  key: 'request_setup',
  what: 'types',
  label: __('Ask for it to be set up'),
}
const missing = computed(() =>
  claimMissing(form, { photos: photos.value, sending: true }),
)
const LABELS = {
  expense_type: 'type of expense',
  amount: 'amount',
  expense_date: 'date',
  approver: 'who approves it',
  photo: 'receipt photo',
}
const missingText = computed(() =>
  missing.value.map((key) => __(LABELS[key])).join(', '),
)

watch(open, async (value) => {
  if (!value) return
  opener = document.activeElement
  refusal.value = null
  problem.value = null
  tried.value = false
  uploaded.value = false
  claimName.value = props.name
  modified.value = props.claim?.document?.modified || ''
  photos.value = props.claim?.photos?.length || 0
  const line = props.claim?.expenses?.[0]
  const pending = pendingOperation(`save:${props.name || 'new'}`)
  resumed.value = Boolean(pending)
  const kept = pending?.data?.rows?.[0]
  Object.assign(form, {
    expense_type: kept?.expense_type || line?.type || '',
    amount: kept?.amount ?? line?.amount ?? '',
    expense_date: kept?.expense_date || line?.date || '',
    description: kept?.description ?? line?.description ?? '',
    approver: props.claim?.document?.approver || '',
    photo: null,
  })
  setPreview(null)
  loading.value = true
  await nextTick()
  panel.value?.focus()
  try {
    options.value = await claimsApi('form_options', { name: props.name })
    if (!form.expense_date) form.expense_date = options.value.today || ''
    if (!form.approver) form.approver = options.value.approver || ''
  } catch (error) {
    options.value = null
    problem.value = claimProblem(error)
  } finally {
    loading.value = false
  }
})

function setPreview(file) {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value =
    file && file.type?.startsWith('image/') && typeof URL !== 'undefined'
      ? URL.createObjectURL(file)
      : ''
}
function pick(event) {
  const file = event.target.files?.[0]
  if (!file) return
  form.photo = file
  uploaded.value = false
  setPreview(file)
  event.target.value = ''
}

function close() {
  if (busy.value) return
  open.value = false
  setPreview(null)
  nextTick(() => opener?.focus?.())
}

function focusField(key) {
  const node = panel.value?.querySelector(
    `[data-field="${key}"] input, [data-field="${key}"] select, [data-field="${key}"]`,
  )
  node?.scrollIntoView?.({ block: 'nearest' })
  node?.focus?.()
}

function onAction(action) {
  if (action.key === 'take_photo') camera.value?.click()
  else if (action.key === 'next') close()
}

async function upload(name) {
  const handler = new FilesUploadHandler()
  await handler.upload(form.photo, {
    fileObj: form.photo,
    private: true,
    folder: 'Home/Attachments',
    doctype: CLAIM,
    docname: name,
  })
}

async function submit(sending) {
  tried.value = true
  refusal.value = null
  problem.value = null
  const blocking = claimMissing(form, { photos: photos.value, sending })
  if (blocking.length) return focusField(blocking[0])
  busy.value = true
  try {
    step.value = __('Saving…')
    const saved = await runOnce(claimsApi, 'save_claim', saveKey.value, {
      name: claimName.value,
      modified: modified.value,
      rows: [
        {
          expense_type: form.expense_type,
          amount: Number(form.amount),
          expense_date: form.expense_date,
          description: String(form.description || '').trim(),
        },
      ],
    })
    resumed.value = false
    if (!saved.ok) {
      refusal.value = saved
      return
    }
    claimName.value = saved.name
    modified.value = saved.modified
    if (form.photo && !uploaded.value) {
      step.value = __('Uploading the photo…')
      await upload(saved.name)
      uploaded.value = true
      photos.value += 1
    }
    if (!sending) {
      emit('saved', saved)
      busy.value = false
      return close()
    }
    step.value = __('Sending…')
    const sent = await runOnce(claimsApi, 'send', `send:${saved.name}`, {
      name: saved.name,
      approver: form.approver,
    })
    if (!sent.ok) {
      refusal.value = sent
      return
    }
    emit('sent', sent)
    busy.value = false
    close()
  } catch (error) {
    // The uploader rejects with Frappe's text (e.g. a file too large) or nothing.
    problem.value = claimProblem(
      typeof error === 'string' ? { message: error } : error,
    )
  } finally {
    busy.value = false
    step.value = ''
  }
}
</script>
