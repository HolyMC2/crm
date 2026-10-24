<template>
  <!-- The shared sheet (S1 ui/BottomSheet): handle, scrim, back closes it;
       the actions full width at the thumb, «Enviar» last. -->
  <BottomSheet
    :open="open"
    :title="name ? __('Your expense') : __('New expense')"
    :subtitle="employeeLine"
    :dismissible="!busy"
    @update:open="(value) => (value ? (open = true) : close())"
  >
    <div data-testid="claim-sheet">
      <div ref="panel" class="space-y-5" data-testid="claim-sheet-body">
        <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Loading…', null, 'Gastos') }}
        </p>
        <template v-else-if="options">
          <ClaimGuard
            v-if="options.guard && !options.employee"
            :guard="options.guard"
          />
          <!-- Nothing can be filed while no expense type has its account: say it
               once, with who sets it up, instead of a dropdown of dead ends. -->
          <template v-else-if="setupBlocked">
            <ClaimGuard :guard="options.types_guard" />
            <p class="text-sm text-ink-gray-6">
              {{
                __(
                  'When your accountant sets up the expense types, this screen fills in as usual.',
                )
              }}
            </p>
          </template>
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
              class="rounded-xl border border-outline-gray-2 p-3"
              :aria-label="__('Receipt photo')"
              data-field="photo"
            >
              <div class="flex items-center gap-3">
                <span
                  class="flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <LucideCamera class="h-5 w-5" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-ink-gray-9">
                    {{ __('Receipt photo') }}
                  </p>
                  <p class="truncate text-sm text-ink-gray-6">
                    {{ photoLine }}
                  </p>
                </div>
              </div>
              <img
                v-if="preview"
                :src="preview"
                :alt="__('Receipt photo')"
                class="mt-3 h-40 w-full rounded-lg border border-outline-gray-2 object-cover"
              />
              <div class="mt-3 flex flex-wrap gap-2">
                <label
                  class="relative inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-surface-gray-7 px-3 text-base font-medium text-ink-base focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-gray-4"
                >
                  <LucideCamera class="h-4 w-4" />{{
                    form.photo || photos
                      ? __('Replace the photo')
                      : __('Take the receipt photo')
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
                  class="relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-outline-gray-2 px-3 text-base text-ink-gray-8 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-gray-4"
                >
                  <LucideUpload class="h-4 w-4" />{{ __('Choose a file') }}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    class="sr-only"
                    @change="pick"
                  />
                </label>
              </div>
              <p
                v-if="tried && missing.includes('photo')"
                role="alert"
                class="mt-2 text-sm text-ink-red-7"
              >
                {{ __('Take the photo of the receipt to send it.') }}
              </p>
            </section>

            <section class="space-y-3" :aria-label="__('The expense')">
              <div>
                <ClaimPicker
                  v-model="form.expense_type"
                  field="expense_type"
                  :label="__('Type of expense')"
                  :placeholder="__('Choose a type')"
                  :options="typeOptions"
                />
                <ClaimGuard
                  v-if="typesToSetUp.length"
                  :guard="typesSetupGuard"
                />
              </div>
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
            </section>

            <section class="space-y-2" :aria-label="__('Who approves it')">
              <template v-if="options.guard">
                <h3 class="text-sm font-semibold text-ink-gray-9">
                  {{ __('Who approves it') }}
                </h3>
                <ClaimGuard :guard="options.guard" />
              </template>
              <ClaimPicker
                v-else
                v-model="form.approver"
                field="approver"
                :label="__('Who approves it')"
                :placeholder="__('Choose a person')"
                :options="approverOptions"
                :hint="
                  options.approvers.length === 1
                    ? __('Only {0} can approve your expenses.', [
                        approverOptions[0]?.label,
                      ])
                    : ''
                "
              />
            </section>

            <p
              v-if="options.advance"
              class="flex items-start gap-2 rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
            >
              <LucideWallet class="mt-0.5 h-4 w-4 flex-none text-ink-gray-6" />
              <span>
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
              </span>
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
    </div>
    <template v-if="canAct" #actions>
      <span v-if="step" role="status" class="text-sm text-ink-gray-6">{{
        step
      }}</span>
      <Button
        class="min-h-11 w-full"
        variant="subtle"
        data-testid="claim-save"
        :label="__('Save as draft')"
        :disabled="busy"
        @click="submit(false)"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :loading="busy"
        :disabled="Boolean(options.guard)"
        data-testid="claim-send"
        :label="__('Send for approval')"
        @click="submit(true)"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import ClaimPicker from '@/components/gastos/ClaimPicker.vue'
import FilesUploadHandler from '@/components/FilesUploader/filesUploaderHandler'
import {
  CLAIM,
  claimApproverOptions,
  claimMissing,
  claimProblem,
  claimRows,
  claimTypeOptions,
  claimTypesToSetUp,
  claimsApi,
  money,
  pendingOperation,
  runOnce,
} from '@/composables/useGastosEmpleados'
import LucideCamera from '~icons/lucide/camera'
import LucideUpload from '~icons/lucide/upload'
import LucideWallet from '~icons/lucide/wallet'

// «Nuevo gasto» / «Enviar a aprobar»: save → photo → send, each replay-safe.
// A failed step keeps the draft and what was typed, and names what is missing.
const props = defineProps({
  name: { type: String, default: '' },
  // The record's own payload when editing (document, expenses, photos).
  claim: { type: Object, default: null },
})
const emit = defineEmits(['saved', 'sent'])
const open = defineModel({ type: Boolean, default: false })
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
const employeeLine = computed(() => {
  const employee = options.value?.employee
  return employee
    ? [employee.employee_name, employee.company].filter(Boolean).join(' · ')
    : ''
})
// No expense type has its account yet: the sheet stops at the setup guard.
const setupBlocked = computed(() => Boolean(options.value?.types_guard))
const typeOptions = computed(() => claimTypeOptions(options.value?.types))
const approverOptions = computed(() =>
  claimApproverOptions(options.value?.approvers),
)
const typesToSetUp = computed(() => claimTypesToSetUp(options.value?.types))
const typesSetupGuard = computed(() => ({
  code: 'types_partial',
  message: __(
    '{0} expense types still have no account in {1}: they cannot be used until someone sets them up.',
    [typesToSetUp.value.length, options.value?.employee?.company || ''],
  ),
  actions: [setupAction],
}))
const setupAction = {
  key: 'request_setup',
  what: 'types',
  label: __('Ask for it to be set up'),
}
const canAct = computed(
  () =>
    Boolean(options.value) &&
    !setupBlocked.value &&
    (Boolean(options.value.employee) || !options.value.guard),
)
const missing = computed(() =>
  claimMissing(form, { photos: photos.value, sending: true }),
)
const photoLine = computed(() => {
  if (form.photo) return form.photo.name
  if (photos.value)
    return __('Receipt photos on this expense: {0}', [photos.value])
  return __('It goes with the expense and stays private.')
})
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

watch(
  open,
  async (value) => {
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
  },
  { immediate: true },
)

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
    `[data-field="${key}"] button, [data-field="${key}"] input, [data-field="${key}"] select, [data-field="${key}"]`,
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
      rows: claimRows(form),
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
