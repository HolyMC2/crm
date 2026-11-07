<template>
  <!-- The register's customer cards (posawesome customer cards): how many
       the shop has given and has blank, a new print batch, and the recent
       batches with their sheet for the shop's printer and the file for a
       print shop. Only blank cards are ever printed again. The register
       gives the cards out: a blank card scanned there goes to the customer
       on the sale. -->
  <div data-testid="fidelidad-tarjetas">
    <p
      v-if="error"
      role="alert"
      class="px-4 sm:px-5 pb-2 text-sm text-ink-red-7"
    >
      {{ error }}
    </p>
    <div
      v-else-if="!state && !absent"
      class="space-y-2 px-4 sm:px-5"
      role="status"
    >
      <div class="h-16 animate-pulse rounded-7 bg-surface-gray-2" />
      <div class="h-12 animate-pulse rounded-6 bg-surface-gray-2" />
    </div>
    <template v-else-if="state">
      <dl
        class="mx-4 sm:mx-5 grid grid-cols-3 gap-px overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-gray-2"
        data-testid="tarjetas-cifras"
      >
        <div
          v-for="fact in facts"
          :key="fact.key"
          class="bg-surface-base px-3 py-2"
        >
          <dt class="text-xs text-ink-gray-6">{{ fact.label }}</dt>
          <dd class="num text-base font-semibold text-ink-gray-9">
            {{ fact.value }}
          </dd>
        </div>
      </dl>
      <p class="px-4 sm:px-5 pt-3 text-sm text-ink-gray-6">
        {{
          __(
            'Print a batch of blank cards; at the register, scanning one gives it to the customer on the sale.',
          )
        }}
      </p>

      <form
        v-if="making"
        class="mx-4 sm:mx-5 mt-3 space-y-3 rounded-7 border border-outline-gray-2 p-3"
        data-testid="tarjetas-nuevo-lote"
        @submit.prevent="make"
      >
        <label class="block text-sm font-medium text-ink-gray-8">
          {{ __('How many cards') }}
          <input
            v-model.number="form.quantity"
            type="number"
            inputmode="numeric"
            min="1"
            :max="MAX"
            class="num mt-1 block min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base"
            data-testid="tarjetas-cantidad"
          />
        </label>
        <label class="block text-sm font-medium text-ink-gray-8">
          {{ __('Note (optional)') }}
          <input
            v-model="form.note"
            maxlength="140"
            :placeholder="__('Counter, a campaign, the print shop…')"
            class="mt-1 block min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base"
          />
        </label>
        <p v-if="!quantityOk" class="text-sm text-ink-gray-6" role="note">
          {{ __('A batch holds between 1 and {0} cards.', [MAX]) }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="submit"
            :class="BTN.filled"
            class="press"
            :disabled="busy || !quantityOk"
            data-testid="tarjetas-hacer-lote"
          >
            {{ __('Make the batch') }}
          </button>
          <button
            type="button"
            :class="BTN.text"
            class="press"
            @click="making = false"
          >
            {{ __('Cancel') }}
          </button>
        </div>
      </form>
      <div v-else class="px-4 sm:px-5 pt-3">
        <button
          v-if="state.can_create"
          type="button"
          :class="BTN.tonal"
          class="press"
          data-testid="tarjetas-nuevo"
          @click="startBatch"
        >
          <span class="lucide-plus size-4" aria-hidden="true" />
          {{ __('New print batch') }}
        </button>
        <p v-else class="text-sm text-ink-gray-6" role="note">
          {{ state.denied }}
        </p>
      </div>

      <p
        v-if="notice"
        role="status"
        class="px-4 sm:px-5 pt-2 text-sm text-ink-green-7"
      >
        {{ notice }}
      </p>
      <p
        v-if="actionError"
        role="alert"
        class="px-4 sm:px-5 pt-2 text-sm text-ink-red-7"
      >
        {{ actionError }}
      </p>

      <ul
        v-if="state.batches.length"
        class="mt-3 divide-y divide-outline-gray-1 border-t border-outline-gray-1"
        data-testid="tarjetas-lotes"
      >
        <li
          v-for="batch in state.batches"
          :key="batch.name"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3"
          data-tarjetas-lote
        >
          <span
            class="grid size-9 flex-none place-items-center rounded-full bg-surface-gray-2 text-ink-gray-7"
            aria-hidden="true"
          >
            <span class="lucide-id-card size-5" />
          </span>
          <span class="min-w-0 flex-1 basis-40">
            <span class="block truncate text-md font-medium text-ink-gray-9">
              {{ batch.note || __('{0} cards', [batch.made]) }}
            </span>
            <span class="block text-sm text-ink-gray-6">
              {{ batchLine(batch) }}
            </span>
          </span>
          <span class="ms-auto flex flex-none gap-1">
            <button
              type="button"
              class="press inline-flex min-h-10 items-center gap-1.5 rounded-full bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3 disabled:opacity-50"
              :disabled="!batch.blank || working === batch.name"
              :title="
                batch.blank
                  ? __('Print')
                  : __('Every card of this batch was given out.')
              "
              :data-testid="`tarjetas-imprimir-${batch.name}`"
              @click="printBatch(batch)"
            >
              <span class="lucide-printer size-4" aria-hidden="true" />
              {{ __('Print') }}
            </button>
            <button
              type="button"
              class="press inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
              :disabled="!batch.blank || working === batch.name"
              :title="__('File for a print shop')"
              :aria-label="__('File for a print shop')"
              :data-testid="`tarjetas-archivo-${batch.name}`"
              @click="downloadBatch(batch)"
            >
              <span class="lucide-download size-4" aria-hidden="true" />
              <span class="hidden sm:inline">{{ __('File') }}</span>
            </button>
          </span>
        </li>
      </ul>
      <p v-else class="px-4 sm:px-5 pt-3 text-sm text-ink-gray-6">
        {{ __('No print batch yet.') }}
      </p>
    </template>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import { requestId } from '@/utils/contactos'
import { fidelidadApi } from '@/composables/fidelidad'
import { formatDate } from '@/utils/display'

const props = defineProps({
  company: { type: String, default: '' },
})
const emit = defineEmits(['available'])

const PRINTING = 'posawesome.posawesome.api.customer_cards.printing'
const MAX = 1000

const state = ref(null)
/** The site has no customer cards (the register app is not there). */
const absent = ref(false)
const error = ref('')
const busy = ref(false)
const working = ref('')
const notice = ref('')
const actionError = ref('')
const making = ref(false)
const form = reactive({ quantity: 50, note: '', requestId: '' })
const quantityOk = computed(
  () =>
    Number.isInteger(form.quantity) &&
    form.quantity >= 1 &&
    form.quantity <= MAX,
)

const facts = computed(() => {
  const counts = state.value?.counts || {}
  return [
    {
      key: 'active',
      label: __('Given', null, 'Tarjetas'),
      value: counts.active ?? 0,
    },
    {
      key: 'digital',
      label: __('Digital', null, 'Tarjetas'),
      value: counts.digital ?? 0,
    },
    {
      key: 'blank',
      label: __('Blank', null, 'Tarjetas'),
      value: counts.blank ?? 0,
    },
  ]
})

function batchLine(batch) {
  const made = formatDate(batch.created) || '—'
  return batch.note
    ? __('{0} blank of {1}, made {2}', [batch.blank, batch.made, made])
    : __('{0} blank, made {1}', [batch.blank, made])
}

let sequence = 0
async function load() {
  const mine = ++sequence
  error.value = ''
  try {
    const out = await fidelidadApi('get_cards', { company: props.company })
    if (mine !== sequence) return
    state.value = out ? { ...out, batches: out.batches || [] } : null
    absent.value = !out
    emit('available', !!out)
  } catch (failure) {
    if (mine === sequence) error.value = errorText(failure)
  }
}
watch(() => props.company, load, { immediate: true })

function startBatch() {
  Object.assign(form, { quantity: 50, note: '', requestId: requestId() })
  notice.value = ''
  actionError.value = ''
  making.value = true
}

async function make() {
  if (!quantityOk.value) return
  busy.value = true
  actionError.value = ''
  try {
    const batch = await fidelidadApi('create_card_batch', {
      data: {
        company: state.value?.company || props.company,
        quantity: form.quantity,
        note: form.note.trim(),
      },
      request_id: form.requestId,
    })
    making.value = false
    notice.value = __('{0} blank cards are ready to print.', [
      batch?.made ?? form.quantity,
    ])
    await load()
  } catch (failure) {
    actionError.value = errorText(failure)
  } finally {
    busy.value = false
  }
}

/** The sheet opens on the tap (a browser blocks a window opened after an
 * await) and is filled once the server answers. */
async function printBatch(batch) {
  actionError.value = ''
  const popup = window.open('', '_blank')
  if (!popup) {
    actionError.value = __('Allow pop-ups to print the cards.')
    return
  }
  working.value = batch.name
  try {
    const html = await call(`${PRINTING}.batch_sheet`, { batch: batch.name })
    popup.opener = null
    popup.document.open()
    popup.document.write(String(html ?? ''))
    popup.document.close()
    popup.focus()
    popup.setTimeout(() => popup.print(), 250)
  } catch (failure) {
    popup.close()
    actionError.value = errorText(failure)
  } finally {
    working.value = ''
  }
}

async function downloadBatch(batch) {
  actionError.value = ''
  working.value = batch.name
  try {
    const text = await call(`${PRINTING}.batch_csv`, { batch: batch.name })
    // The byte-order mark lets a spreadsheet read the file as UTF-8.
    const blob = new Blob([`\uFEFF${text ?? ''}`], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${batch.name}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (failure) {
    actionError.value = errorText(failure)
  } finally {
    working.value = ''
  }
}

defineExpose({ reload: load })
</script>
