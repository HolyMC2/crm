<template>
  <!-- «Fotos del taller»: the photos the technician uploaded to this
       conversation's repair orders. Pick, review the picked strip and the
       text, then one «Enviar»: each photo goes as its own WhatsApp image,
       the text with the first. Nothing is sent without that tap. -->
  <BottomSheet
    :open="open"
    :title="__('Fotos del taller')"
    :subtitle="
      __('Elige las fotos y revísalas antes de enviarlas a la conversación.')
    "
    :dismissible="!sending"
    @update:open="(value) => !value && close()"
  >
    <EmptyState v-if="loadError" state="error" :message="loadError" />
    <p v-else-if="loading" role="status" class="py-6 text-base text-ink-gray-6">
      {{ __('Cargando fotos…') }}
    </p>
    <EmptyState
      v-else-if="!withPhotos.length"
      :title="__('Aún no hay fotos del taller')"
      :message="
        orders.length
          ? __(
              'Cuando el técnico suba fotos de la orden en Taller, aparecen aquí para enviarlas.',
            )
          : __('Este chat no tiene órdenes de reparación vinculadas.')
      "
    />
    <div v-else class="space-y-5 pb-1">
      <section v-for="order in withPhotos" :key="order.name">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <h3 class="truncate text-base font-semibold text-ink-gray-9">
              {{ order.device_model || __('Equipo') }}
            </h3>
            <p class="text-sm text-ink-gray-5">
              {{ photoCount(order.photos.length) }}
              <span class="max-sm:hidden"> · {{ order.name }}</span>
            </p>
          </div>
          <StatusChip
            v-if="order.status"
            :label="__(order.status)"
            :tone="repairTone(order.status)"
          />
        </div>
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <button
            v-for="photo in order.photos"
            :key="photo.name"
            type="button"
            class="press relative aspect-square overflow-hidden rounded-6 bg-surface-gray-2"
            :class="[
              rank(photo) ? 'ring-2 ring-[var(--muelle-accent)]' : '',
              photo.attach ? '' : 'opacity-50',
            ]"
            :aria-pressed="String(!!rank(photo))"
            :aria-label="photoLabel(photo)"
            :title="photo.blocked_reason || photoLabel(photo)"
            :data-photo="photo.name"
            @click="toggle(photo)"
          >
            <img
              :src="photo.thumbnail_url || photo.display_url"
              :alt="photoLabel(photo)"
              class="size-full object-cover"
              loading="lazy"
            />
            <span
              v-if="rank(photo)"
              class="num absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-[var(--muelle-accent)] text-xs font-semibold text-[var(--muelle-accent-ink)]"
              aria-hidden="true"
              >{{ rank(photo) }}</span
            >
            <span
              class="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/45 px-1.5 py-0.5 text-left text-[11px] text-white"
            >
              <span
                v-if="photo.show_on_tracker"
                class="lucide-eye size-3 flex-none"
                :title="__('Visible para el cliente en el seguimiento')"
                aria-hidden="true"
              />
              <span class="truncate">{{
                photo.photo_type ? __(photo.photo_type) : __('Foto')
              }}</span>
            </span>
          </button>
        </div>
      </section>
    </div>

    <template v-if="withPhotos.length" #actions>
      <div v-if="picked.length" class="flex gap-1.5 overflow-x-auto pb-1">
        <img
          v-for="photo in picked"
          :key="photo.name"
          :src="photo.thumbnail_url || photo.display_url"
          :alt="photoLabel(photo)"
          class="size-11 flex-none rounded-4 object-cover"
        />
      </div>
      <textarea
        v-model="caption"
        rows="2"
        maxlength="1024"
        class="w-full resize-none rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0"
        :placeholder="__('Mensaje (opcional): va con la primera foto')"
        :disabled="sending"
      />
      <p v-if="notice" role="alert" class="text-base text-ink-red-7">
        {{ notice }}
      </p>
      <p v-else-if="!picked.length" class="text-sm text-ink-gray-6">
        {{ __('Elige al menos una foto para enviarla.') }}
      </p>
      <button
        type="button"
        class="press inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-surface-gray-10 px-5 text-base-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50"
        :disabled="sending || !picked.length"
        data-testid="taller-photos-send"
        @click="send"
      >
        <span class="lucide-send size-4" aria-hidden="true" />
        {{ sendLabel }}
      </button>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet, EmptyState, StatusChip } from '@/components/ui'
import {
  MAX_PHOTOS,
  loadConversationPhotos,
  sendTallerPhotos,
} from '@/composables/tallerPhotos'
import { repairTone } from '@/utils/repairOrders'

const props = defineProps({
  open: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  to: { type: String, default: '' },
  account: { type: String, default: '' },
  // {order, photo} from the Reparación tab: that order first, that photo picked.
  preselect: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'sent'])

const orders = ref([])
const loading = ref(false)
const loadError = ref('')
const selected = ref([])
const caption = ref('')
const sending = ref(false)
const progress = ref(0)
const notice = ref('')

const withPhotos = computed(() => {
  const list = orders.value.filter((order) => order.photos?.length)
  const first = props.preselect?.order
  return first
    ? [
        ...list.filter((o) => o.name === first),
        ...list.filter((o) => o.name !== first),
      ]
    : list
})
const byName = computed(
  () =>
    new Map(
      orders.value.flatMap((o) => (o.photos || []).map((p) => [p.name, p])),
    ),
)
const picked = computed(() =>
  selected.value.map((name) => byName.value.get(name)).filter(Boolean),
)
const sendLabel = computed(() => {
  if (sending.value)
    return __('Enviando {0} de {1}…', [progress.value + 1, picked.value.length])
  if (notice.value && picked.value.length) return __('Reintentar')
  if (!picked.value.length) return __('Enviar fotos')
  return picked.value.length === 1
    ? __('Enviar 1 foto')
    : __('Enviar {0} fotos', [picked.value.length])
})

function photoCount(n) {
  return n === 1 ? __('1 foto') : __('{0} fotos', [n])
}
function photoLabel(photo) {
  return (
    [photo.photo_type && __(photo.photo_type), photo.caption]
      .filter(Boolean)
      .join(' · ')
      .trim() || __('Foto del taller')
  )
}
function rank(photo) {
  const i = selected.value.indexOf(photo.name)
  return i < 0 ? 0 : i + 1
}
function toggle(photo) {
  if (sending.value) return
  notice.value = ''
  if (!photo.attach) {
    notice.value = photo.blocked_reason || __('Esta foto no se puede enviar.')
    return
  }
  const i = selected.value.indexOf(photo.name)
  if (i >= 0) return selected.value.splice(i, 1)
  if (selected.value.length >= MAX_PHOTOS) {
    notice.value = __('Puedes enviar hasta {0} fotos a la vez.', [MAX_PHOTOS])
    return
  }
  selected.value.push(photo.name)
}

let read = 0
async function load() {
  const request = ++read
  loading.value = true
  loadError.value = ''
  try {
    const list = await loadConversationPhotos(props.doctype, props.name)
    if (request !== read) return
    orders.value = list
    const photo = props.preselect?.photo
    selected.value = photo && byName.value.get(photo)?.attach ? [photo] : []
  } catch (error) {
    if (request === read)
      loadError.value =
        error?.messages?.[0] ||
        __('No se pudieron cargar las fotos del taller. Intenta de nuevo.')
  } finally {
    if (request === read) loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    caption.value = ''
    notice.value = ''
    selected.value = []
    load()
  },
  { immediate: true },
)

function close() {
  if (!sending.value) emit('update:open', false)
}

async function send() {
  if (sending.value || !picked.value.length) return
  sending.value = true
  notice.value = ''
  progress.value = 0
  const photos = picked.value
  try {
    const result = await sendTallerPhotos(
      {
        doctype: props.doctype,
        name: props.name,
        to: props.to,
        account: props.account,
        caption: caption.value,
      },
      photos,
      (i) => (progress.value = i),
    )
    if (result.sent.length) {
      emit('sent', result.sent.length)
      caption.value = '' // it went with the first photo
    }
    selected.value = selected.value.filter((n) => !result.sent.includes(n))
    if (result.failed) {
      notice.value = result.sent.length
        ? __('Se enviaron {0} de {1}. {2}', [
            result.sent.length,
            photos.length,
            result.error,
          ])
        : result.error
      return
    }
    toast.success(
      result.sent.length === 1
        ? __('Se envió 1 foto')
        : __('Se enviaron {0} fotos', [result.sent.length]),
    )
    emit('update:open', false)
  } finally {
    sending.value = false
  }
}
</script>
