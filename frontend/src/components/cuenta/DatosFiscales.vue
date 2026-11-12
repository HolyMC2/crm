<template>
  <!-- Datos fiscales (capability «billing_profile»): what Boat holds for the
       CFDI of Muelle's charges, one line that says «Listo para facturar» or
       what is missing, and a pencil that opens the form in a sheet. -->
  <section
    v-if="phase !== 'off'"
    aria-labelledby="cuenta-fiscal"
    data-testid="cuenta-fiscal"
  >
    <div class="flex items-center gap-3 pb-1">
      <h2
        id="cuenta-fiscal"
        class="title-face min-w-0 flex-1 text-xl font-semibold text-ink-gray-9"
      >
        {{ __('Tax details', null, 'Cuenta') }}
      </h2>
      <button
        v-if="view && !view.empty && view.canSave"
        type="button"
        class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="__('Edit tax details', null, 'Cuenta')"
        :title="__('Edit tax details', null, 'Cuenta')"
        data-testid="fiscal-editar"
        @click="edit"
      >
        <span class="lucide-pencil size-5" aria-hidden="true" />
      </button>
    </div>
    <p
      v-if="phase === 'loading'"
      class="py-3 text-base text-ink-gray-6"
      role="status"
    >
      {{ __('Checking your tax details…', null, 'Cuenta') }}
    </p>
    <div v-else-if="phase === 'error'" role="alert" class="space-y-2 py-3">
      <p class="text-base text-ink-gray-8">{{ failure }}</p>
      <Button
        class="min-h-11"
        :label="__('Try again', null, 'Cuenta')"
        @click="load"
      />
    </div>
    <template v-else-if="view">
      <p
        class="flex items-center gap-2 py-1 text-base"
        :class="view.status.ready ? 'text-ink-gray-8' : 'text-ink-amber-8'"
        role="status"
        data-testid="fiscal-estado"
      >
        <span
          :class="
            view.status.ready ? 'lucide-circle-check' : 'lucide-triangle-alert'
          "
          class="size-5 flex-none"
          aria-hidden="true"
        />
        {{ view.status.text }}
      </p>
      <dl
        v-if="view.rows.length"
        class="divide-y divide-outline-gray-1"
        data-testid="fiscal-datos"
      >
        <div
          v-for="row in view.rows"
          :key="row.key"
          class="flex items-baseline gap-3 py-2"
        >
          <dt class="w-32 flex-none text-sm text-ink-gray-6">
            {{ row.label }}
          </dt>
          <dd
            class="min-w-0 flex-1 break-words text-base text-ink-gray-9"
            :class="row.key === 'rfc' || row.key === 'cp' ? 'num' : ''"
          >
            {{ row.value }}
          </dd>
        </div>
      </dl>
      <p v-if="saved" class="pt-2 text-sm text-ink-gray-7" role="status">
        {{ saved }}
      </p>
      <Button
        v-if="view.empty && view.canSave"
        variant="subtle"
        class="mt-2 min-h-11"
        :label="__('Add tax details', null, 'Cuenta')"
        data-testid="fiscal-agregar"
        @click="edit"
      />
      <!-- No billing customer yet: the save would refuse, so say who helps. -->
      <div v-if="!view.canSave" class="space-y-2 pt-2">
        <p class="text-sm text-ink-gray-7">
          {{
            __(
              'Your billing account is not ready to keep tax details yet. Ask support and we will set it up.',
              null,
              'Cuenta',
            )
          }}
        </p>
        <Button
          class="min-h-11"
          :label="__('Ask support for help', null, 'Cuenta')"
          @click="
            door.contactSupport(
              __('I want to add my tax details for invoicing.', null, 'Cuenta'),
            )
          "
        />
      </div>
    </template>
    <DatosFiscalesSheet
      v-if="sheetMounted"
      :open="editing"
      :answer="answer"
      @close="editing = false"
      @act="sheetAct"
      @saved="savedNow"
    />
    <p
      v-if="askedSupport && door.supportError.value"
      class="pt-2 text-sm text-ink-red-7"
    >
      {{ door.supportError.value }}
    </p>
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { seam } from './api'
import { failureText, refusalView, seamOff } from './autoservicio'
import { fiscalView } from './fiscal'

// The form mounts on its first open.
const DatosFiscalesSheet = defineAsyncComponent(
  () => import('./DatosFiscalesSheet.vue'),
)

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
})
const emit = defineEmits(['off'])

const phase = ref('loading')
const answer = ref(null)
const failure = ref('')
const saved = ref('')
const editing = ref(false)
const sheetMounted = ref(false)
const askedSupport = ref(false)
const view = computed(() =>
  phase.value === 'ready' ? fiscalView(answer.value) : null,
)
let asked = 0

async function load() {
  const turn = ++asked
  if (!answer.value) phase.value = 'loading'
  try {
    const out = await seam('billing_profile')
    if (turn !== asked) return
    if (seamOff(out)) {
      phase.value = 'off'
      emit('off')
    } else if (out?.ok === true) {
      answer.value = out
      phase.value = 'ready'
    } else {
      const fallback = __('We could not read your tax details.', null, 'Cuenta')
      failure.value = refusalView(out, fallback)?.text || fallback
      phase.value = 'error'
    }
  } catch (error) {
    if (turn !== asked) return
    failure.value = failureText(error)
    phase.value = 'error'
  }
}
watch(
  () => props.door.boot.value,
  (boot) => boot && load(),
  { immediate: true },
)

function edit() {
  sheetMounted.value = true
  editing.value = true
}
// The form's next step (support) once it is closed: support's dialog never
// opens under the modal sheet.
async function sheetAct(key) {
  editing.value = false
  if (key !== 'support') return
  await nextTick()
  askedSupport.value = true
  props.door.contactSupport()
}
async function savedNow(out) {
  editing.value = false
  saved.value = typeof out?.message === 'string' ? out.message : ''
  toast.success(__('Tax details saved', null, 'Cuenta'))
  await load()
}
</script>
