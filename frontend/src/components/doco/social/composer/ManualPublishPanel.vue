<!--
  ManualPublishPanel — «Se publica a mano»: the person posts it in the Facebook or
  Instagram app (where the platform's music library is) and comes back with the link.
  Download the picture and the reel, copy the text, paste the link, «Ya lo publiqué».
  The post becomes Published, its Pendientes close and whoever asked hears back.
-->
<template>
  <section
    class="mb-4 rounded-7 border border-outline-gray-2 p-3"
    data-testid="manual-publish"
  >
    <h3 class="mb-1 text-[13px] font-semibold text-ink-gray-9">
      {{ __('Publicar a mano') }}
    </h3>
    <ol
      class="mb-2.5 list-decimal space-y-0.5 pl-5 text-[12.5px] text-ink-gray-7"
    >
      <li>{{ __('Descarga la imagen o el reel y copia el texto.') }}</li>
      <li>
        {{
          __(
            'Publícalo en la app de Facebook o Instagram; ahí le pones música.',
          )
        }}
      </li>
      <li>{{ __('Copia el enlace de la publicación y pégalo aquí.') }}</li>
    </ol>
    <div class="mb-2.5 flex flex-wrap gap-2">
      <a
        v-for="m in files"
        :key="m.media_file"
        :href="m.media_file"
        :download="fileName(m)"
        class="press flex min-h-10 items-center gap-1.5 rounded-6 bg-surface-gray-2 px-3 text-[12.5px] font-semibold text-ink-gray-8"
      >
        <span class="lucide-download size-4" aria-hidden="true" />
        {{ m.media_type === 'Video' ? __('Reel') : __('Imagen') }}
      </a>
      <button
        type="button"
        class="press flex min-h-10 items-center gap-1.5 rounded-6 bg-surface-gray-2 px-3 text-[12.5px] font-semibold text-ink-gray-8"
        :disabled="!caption"
        @click="copy"
      >
        <span class="lucide-copy size-4" aria-hidden="true" />
        {{ copied ? __('Texto copiado') : __('Copiar texto') }}
      </button>
    </div>
    <label class="mb-2 block text-[12px] text-ink-gray-7"
      >{{ __('Enlace en Facebook') }}
      <input
        v-model="fb"
        type="url"
        inputmode="url"
        class="mt-1 h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px]"
        placeholder="https://www.facebook.com/…"
      />
    </label>
    <label class="mb-2 block text-[12px] text-ink-gray-7"
      >{{ __('Enlace en Instagram') }}
      <input
        v-model="ig"
        type="url"
        inputmode="url"
        class="mt-1 h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px]"
        placeholder="https://www.instagram.com/p/…"
      />
    </label>
    <p v-if="wrong" role="alert" class="mb-2 text-[12px] text-ink-red-7">
      {{ wrong }}
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-if="canUndo"
        type="button"
        class="press min-h-10 rounded-6 px-3 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
        @click="$emit('manual', false)"
      >
        {{ __('Mejor que salga sola') }}
      </button>
      <button
        type="button"
        class="press ml-auto min-h-10 rounded-6 bg-surface-gray-10 px-3.5 text-[12.5px] font-semibold text-ink-base disabled:opacity-50"
        :disabled="busy || (!fb.trim() && !ig.trim()) || Boolean(wrong)"
        data-testid="mark-published"
        @click="done"
      >
        {{ busy ? __('Guardando…') : __('Ya lo publiqué') }}
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { call, toast } from 'frappe-ui'
import { errorText } from '@/utils/errorText'
import { linkPlatform } from '@/composables/socialDaily'

const props = defineProps({
  postName: { type: String, required: true },
  media: { type: Array, default: () => [] },
  caption: { type: String, default: '' },
  canUndo: { type: Boolean, default: true },
})
const emit = defineEmits(['changed', 'manual'])

const fb = ref('')
const ig = ref('')
const busy = ref(false)
const copied = ref(false)

const files = computed(() => props.media.filter((m) => m.media_file))
const wrong = computed(() => {
  if (fb.value.trim() && linkPlatform(fb.value) !== 'Facebook')
    return __('El primer enlace no es de Facebook.')
  if (ig.value.trim() && linkPlatform(ig.value) !== 'Instagram')
    return __('El segundo enlace no es de Instagram.')
  return ''
})

function fileName(m) {
  const ext = m.media_type === 'Video' ? 'mp4' : 'jpg'
  return `${props.postName}.${ext}`
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.caption)
    copied.value = true
    setTimeout(() => (copied.value = false), 2500)
  } catch {
    toast.error(__('No se pudo copiar; selecciona el texto y cópialo.'))
  }
}

async function done() {
  busy.value = true
  try {
    await call('doco_marketing.api.social_taller.mark_published', {
      post: props.postName,
      fb_link: fb.value.trim() || undefined,
      ig_link: ig.value.trim() || undefined,
    })
    toast.success(__('Marcada como publicada'))
    emit('changed')
  } catch (e) {
    toast.error(errorText(e, __('No se pudo marcar como publicada.')))
  } finally {
    busy.value = false
  }
}
</script>
