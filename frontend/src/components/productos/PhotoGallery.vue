<template>
  <section
    id="fotos"
    class="scroll-mt-4 rounded-xl border border-outline-gray-2 bg-surface-base"
  >
    <header
      class="flex flex-wrap items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
    >
      <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
        {{ __('Photos', null, CTX) }}
      </h2>
      <Button
        v-if="data?.can_share && data.rows.length"
        class="min-h-11 sm:min-h-8"
        :loading="busy === 'share'"
        :label="__('Story image', null, CTX)"
        :title="
          __('A ready-to-post image with photo, name and price', null, CTX)
        "
        @click="story"
      >
        <template #prefix>
          <FeatherIcon name="share-2" class="h-4 w-4" aria-hidden="true" />
        </template>
      </Button>
      <FileUploader
        v-if="data?.can_manage"
        file-types="image/*"
        :upload-args="{ doctype: 'Item', docname: item, private: false }"
        @success="uploaded"
        @failure="failed"
      >
        <template #default="{ openFileSelector, uploading, progress }">
          <Button
            class="min-h-11 sm:min-h-8"
            :loading="uploading"
            :label="
              uploading
                ? __('Uploading {0}%', [progress])
                : __('Add photo', null, CTX)
            "
            @click="openFileSelector"
          >
            <template #prefix>
              <FeatherIcon name="plus" class="h-4 w-4" aria-hidden="true" />
            </template>
          </Button>
        </template>
      </FileUploader>
    </header>
    <p
      v-if="problem"
      role="alert"
      class="m-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      {{ problem }}
    </p>
    <p
      v-if="data && !data.can_manage && data.reason"
      class="mx-4 mt-3 text-sm text-ink-gray-6"
    >
      {{ data.reason }}
    </p>
    <p
      v-if="data && !data.rows.length"
      class="px-4 py-4 text-sm text-ink-gray-6"
    >
      {{ __('No photos yet.', null, CTX) }}
    </p>
    <ul
      v-else-if="data"
      class="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4"
    >
      <li
        v-for="photo in data.rows"
        :key="photo.file_url"
        class="flex flex-col gap-1.5"
      >
        <a
          :href="photo.file_url"
          target="_blank"
          rel="noopener"
          class="relative block overflow-hidden rounded-lg ring-1"
          :class="
            photo.principal
              ? 'ring-2 ring-outline-gray-4'
              : 'ring-outline-gray-2'
          "
        >
          <img
            :src="photo.file_url"
            :alt="photo.file_name || item"
            class="aspect-square w-full object-cover"
            loading="lazy"
          />
          <span
            v-if="photo.principal"
            class="absolute left-1.5 top-1.5 rounded-full bg-surface-base px-2 py-0.5 text-xs font-medium text-ink-gray-8 shadow-sm ring-1 ring-outline-gray-2"
            >{{ __('Main', null, CTX) }}</span
          >
        </a>
        <span
          v-if="data.can_manage || data.can_turn"
          class="flex flex-wrap gap-1"
        >
          <Button
            v-if="data.can_manage && !photo.principal"
            size="sm"
            :loading="busy === `main:${photo.file_url}`"
            :label="__('Make main', null, CTX)"
            @click="makeMain(photo)"
          />
          <Button
            v-if="data.can_turn"
            size="sm"
            :loading="busy === `turn:${photo.file_url}`"
            :aria-label="__('Turn right', null, CTX)"
            :title="__('Turn right', null, CTX)"
            @click="turn(photo)"
          >
            <FeatherIcon name="rotate-cw" class="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            v-if="data.can_manage"
            size="sm"
            theme="red"
            :loading="busy === `delete:${photo.file_url}`"
            :aria-label="__('Delete photo', null, CTX)"
            :title="__('Delete photo', null, CTX)"
            @click="remove(photo)"
          >
            <FeatherIcon name="trash-2" class="h-4 w-4" aria-hidden="true" />
          </Button>
        </span>
      </li>
    </ul>
  </section>
</template>
<script setup>
import { onMounted, ref, watch } from 'vue'
import { Button, FeatherIcon, FileUploader, toast } from 'frappe-ui'
import {
  CTX,
  problemOf,
  productosApi,
  requestId,
} from '@/composables/useProductos'

// A product's photos: the main one first, then the rest. Whoever keeps the
// catalogue adds, chooses the main one and deletes; turning and the story
// image are Mercado's (shown only where it is installed and allowed).
const props = defineProps({ item: { type: String, required: true } })
const emit = defineEmits(['changed'])
const MEDIA = 'doco.workspaces.product_media'
const data = ref(null)
const busy = ref('')
const problem = ref('')

function fail(error) {
  const found = problemOf(error)
  problem.value = [found.title, found.detail].filter(Boolean).join('. ')
}

async function load() {
  try {
    data.value = await productosApi(`${MEDIA}.photos`, { item: props.item })
  } catch (error) {
    fail(error)
  }
}

async function act(key, call, message) {
  busy.value = key
  problem.value = ''
  try {
    await call()
    if (message) toast.success(message)
    await load()
    emit('changed')
  } catch (error) {
    fail(error)
  } finally {
    busy.value = ''
  }
}

function makeMain(photo) {
  return act(
    `main:${photo.file_url}`,
    () =>
      productosApi('set_photo', {
        request_id: requestId(),
        item: props.item,
        file_url: photo.file_url,
      }),
    __('Main photo changed', null, CTX),
  )
}
function turn(photo) {
  return act(`turn:${photo.file_url}`, () =>
    productosApi('mercado.api.photos.rotate_photo', {
      item_code: props.item,
      file_url: photo.file_url,
      degrees: 90,
    }),
  )
}
function remove(photo) {
  if (!window.confirm(__('Delete this photo?', null, CTX))) return
  return act(
    `delete:${photo.file_url}`,
    () =>
      productosApi(`${MEDIA}.delete_photo`, {
        request_id: requestId(),
        item: props.item,
        file_url: photo.file_url,
      }),
    __('Photo deleted', null, CTX),
  )
}
async function uploaded(file) {
  // The first photo becomes the main one; later ones join the gallery.
  const hasMain = data.value?.rows?.some((row) => row.principal)
  if (hasMain)
    return act('upload', async () => {}, __('Photo added', null, CTX))
  return act(
    'upload',
    () =>
      productosApi('set_photo', {
        request_id: requestId(),
        item: props.item,
        file_url: file?.file_url,
      }),
    __('Photo added', null, CTX),
  )
}
function failed(error) {
  fail(error)
}
async function story() {
  // Opened inside the click, so a popup blocker lets it through.
  const tab = window.open('', '_blank')
  busy.value = 'share'
  problem.value = ''
  try {
    const answer = await productosApi('mercado.api.exports.build_item_share', {
      item_code: props.item,
      aspect: 'story',
    })
    if (answer?.file_url && tab) tab.location.href = answer.file_url
    else if (answer?.file_url) window.location.assign(answer.file_url)
    else tab?.close()
  } catch (error) {
    tab?.close()
    fail(error)
  } finally {
    busy.value = ''
  }
}

watch(() => props.item, load)
onMounted(load)
defineExpose({ refresh: load })
</script>
