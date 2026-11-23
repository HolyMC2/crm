<template>
  <!-- «Mostrar a clientes»: whether the promotion reaches the shop's customer
       app, with its own title and picture there, and for a coupon promotion
       whether customers switch their coupon on themselves. One line says where
       it shows. Each tap saves at once; a refusal puts the switch back. -->
  <section
    v-if="view"
    class="space-y-3 rounded-7 border border-outline-gray-2 p-3"
    :aria-label="__('Customers', null, CTX)"
    data-testid="fidelidad-clientes"
  >
    <div class="flex items-center gap-3">
      <span
        class="lucide-smartphone size-5 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <p class="text-base font-medium text-ink-gray-9">
          {{ __('Show to customers', null, CTX) }}
        </p>
        <p class="text-sm text-ink-gray-6" data-testid="clientes-donde">
          {{ where }}
        </p>
      </div>
      <AjustesSwitch
        :model-value="view.show"
        :label="__('Show to customers', null, CTX)"
        :disabled="!canEdit || busy"
        data-testid="clientes-mostrar"
        @update:model-value="(v) => save({ show: v })"
      />
    </div>
    <RouterLink
      v-if="view.show && !app?.promos && canOpenApp"
      :to="APP_ROUTE"
      class="press inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-gray-8 underline"
      data-testid="clientes-abrir-app"
    >
      {{ __('Open the customer app settings', null, CTX) }}
    </RouterLink>

    <template v-if="view.show">
      <label class="block space-y-1">
        <span class="text-sm text-ink-gray-7">{{
          __('Title for customers (optional)', null, CTX)
        }}</span>
        <span class="flex items-center gap-2">
          <input
            v-model="title"
            type="text"
            :maxlength="TITLE_MAX + 20"
            :placeholder="offer?.title || ''"
            :disabled="!canEdit || busy"
            class="min-h-11 min-w-0 flex-1 rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
            data-testid="clientes-titulo"
            @keydown.enter.prevent="saveTitle"
          />
          <button
            v-if="titleDirty"
            type="button"
            :class="BTN.tonal"
            class="press flex-none"
            :disabled="busy || !!titleIssue"
            data-testid="clientes-titulo-guardar"
            @click="saveTitle"
          >
            {{ __('Save title', null, CTX) }}
          </button>
        </span>
        <span v-if="titleIssue" class="text-sm text-ink-red-7">{{
          titleIssue
        }}</span>
      </label>

      <div class="flex items-center gap-3">
        <img
          v-if="view.image"
          :src="view.image"
          :alt="__('Picture for customers', null, CTX)"
          class="size-16 flex-none rounded-6 object-cover"
          data-testid="clientes-foto"
        />
        <label
          v-if="canEdit"
          class="press flex min-h-11 cursor-pointer items-center gap-2 rounded-6 border border-dashed border-outline-gray-3 px-3 text-sm text-ink-gray-8"
          :class="busy && 'pointer-events-none opacity-60'"
        >
          <span
            :class="
              uploading
                ? 'lucide-loader-circle animate-spin'
                : 'lucide-image-plus'
            "
            class="size-4"
            aria-hidden="true"
          />
          {{
            view.image
              ? __('Change picture', null, CTX)
              : __('Add a picture', null, CTX)
          }}
          <input
            type="file"
            accept="image/*"
            class="sr-only"
            data-testid="clientes-foto-subir"
            @change="pick"
          />
        </label>
        <button
          v-if="view.image && canEdit"
          type="button"
          :class="confirmRemove ? BTN.danger : BTN.tonal"
          class="press"
          :disabled="busy"
          :aria-label="__('Remove picture', null, CTX)"
          :title="__('Remove picture', null, CTX)"
          data-testid="clientes-foto-quitar"
          @click="removePicture"
        >
          <span
            v-if="!confirmRemove"
            class="lucide-trash-2 size-4"
            aria-hidden="true"
          />
          <span v-else>{{ __('Remove', null, CTX) }}</span>
        </button>
      </div>

      <div v-if="view.can_activate" class="flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-base text-ink-gray-9">
            {{ __('Customers can switch it on', null, CTX) }}
          </p>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Each customer switches their own coupon on in the app and uses it at the register.',
                null,
                CTX,
              )
            }}
          </p>
        </div>
        <AjustesSwitch
          :model-value="view.activatable"
          :label="__('Customers can switch it on', null, CTX)"
          :disabled="!canEdit || busy"
          data-testid="clientes-activar"
          @update:model-value="(v) => save({ activatable: v })"
        />
      </div>
    </template>
    <p v-if="error" role="alert" class="text-sm text-ink-red-7">{{ error }}</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import {
  APP_ROUTE,
  CTX,
  TITLE_MAX,
  cleanTitle,
  setCustomerView,
  titleProblem,
  uploadPicture,
  shownToast,
  viewChange,
  whereLine,
} from './clientes'

const props = defineProps({
  /** the promotion's detail (doco.fidelidad offer_detail) */
  offer: { type: Object, default: null },
  canEdit: { type: Boolean, default: false },
})
const emit = defineEmits(['changed'])

const pending = ref(null)
const busy = ref(false)
const uploading = ref(false)
const error = ref('')
const title = ref('')
const confirmRemove = ref(false)
let confirmTimer = 0

const view = computed(() =>
  props.offer?.customers
    ? { ...props.offer.customers, ...(pending.value || {}) }
    : null,
)
const app = computed(() => props.offer?.customer_app || null)
const canOpenApp = computed(() => props.canEdit)
const where = computed(() =>
  whereLine({ ...props.offer, customers: view.value }, app.value),
)
const titleDirty = computed(
  () => cleanTitle(title.value) !== (props.offer?.customers?.title || ''),
)
const titleIssue = computed(() => titleProblem(title.value))

watch(
  () => [props.offer?.name, props.offer?.customers?.title],
  () => {
    title.value = props.offer?.customers?.title || ''
  },
  { immediate: true },
)

async function save(patch) {
  const change = viewChange(props.offer?.customers, patch)
  if (!Object.keys(change).length || busy.value) return
  busy.value = true
  error.value = ''
  // the tap shows at once; the server's answer replaces it
  pending.value = { ...(pending.value || {}), ...change }
  try {
    const detail = await setCustomerView(props.offer.name, change)
    pending.value = null
    emit('changed', detail)
    if ('show' in change) toast.success(shownToast(change.show, app.value))
  } catch (failure) {
    pending.value = null
    error.value = errorText(failure)
  } finally {
    busy.value = false
  }
}

function saveTitle() {
  if (titleIssue.value || !titleDirty.value) return
  save({ title: title.value })
}

async function pick(event) {
  const file = event.target?.files?.[0]
  if (event.target) event.target.value = ''
  if (!file) return
  uploading.value = true
  error.value = ''
  try {
    const url = await uploadPicture(props.offer.name, file)
    if (!url)
      throw new Error(
        __('The picture did not upload. Try another one.', null, CTX),
      )
    await save({ image: url })
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    uploading.value = false
  }
}

function removePicture() {
  if (!confirmRemove.value) {
    confirmRemove.value = true
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirmRemove.value = false), 4000)
    return
  }
  confirmRemove.value = false
  save({ image: '' })
}
</script>
