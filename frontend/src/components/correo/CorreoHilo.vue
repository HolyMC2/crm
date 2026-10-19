<template>
  <!-- Correos of a record (Shell D12), under Actividad: what was sent or
       received about it, newest first; a row opens the message. -->
  <section
    v-if="loading || correos.length || canSend"
    aria-labelledby="doc-correos"
    class="px-4"
    data-testid="correo-hilo"
  >
    <div class="flex items-center justify-between gap-2 pb-1">
      <h2 id="doc-correos" class="text-base font-semibold text-ink-gray-9">
        Correos<template v-if="correos.length">
          ({{ correos.length }})</template
        >
      </h2>
      <button
        v-if="canSend"
        type="button"
        class="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-2"
        data-testid="correo-hilo-enviar"
        @click="emit('compose')"
      >
        <span class="lucide-mail size-5" aria-hidden="true" />
        Enviar por correo
      </button>
    </div>
    <p v-if="error" class="pb-2 text-base text-ink-gray-6">{{ error }}</p>
    <p
      v-else-if="!loading && !correos.length"
      class="pb-2 text-base text-ink-gray-6"
    >
      Aún no se ha mandado ningún correo de este documento.
    </p>
    <ul class="-mx-4 divide-y divide-outline-gray-1">
      <li v-for="c in visible" :key="c.name">
        <ListRow
          :to="{ path: `/correo/${encodeURIComponent(c.name)}` }"
          :avatar="isSystem(c.de) ? undefined : senderName(c.de)"
          :icon="isSystem(c.de) ? 'lucide-bell' : ''"
          :title="c.asunto"
          :subtitle="`${c.direccion === 'enviado' ? 'Enviado' : 'Recibido'} · ${who(c)}`"
          :meta="shortWhen(c.fecha)"
        >
          <template v-if="c.adjuntos" #trailing>
            <span
              class="lucide-paperclip size-4 text-ink-gray-6"
              aria-label="Con adjunto"
            />
          </template>
        </ListRow>
      </li>
    </ul>
    <button
      v-if="correos.length > LIMIT && !all"
      type="button"
      class="min-h-11 text-base font-medium text-ink-gray-8"
      @click="all = true"
    >
      Ver todos los correos ({{ correos.length }})
    </button>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { ListRow } from '@/components/ui'
import { errorText, hilo, isSystem, senderName, shortWhen } from './correo'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  /** Bump to reload (after «Enviar por correo» sent one). */
  version: { type: Number, default: 0 },
})
const emit = defineEmits(['compose', 'loaded'])
const LIMIT = 3
const correos = ref([])
const canSend = ref(false)
const loading = ref(false)
const error = ref('')
const all = ref(false)
const visible = computed(() =>
  all.value ? correos.value : correos.value.slice(0, LIMIT),
)

function who(c) {
  if (c.direccion === 'enviado') return c.para?.[0] || senderName(c.de)
  return senderName(c.de)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const out = await hilo(props.doctype, props.name)
    correos.value = out?.correos || []
    canSend.value = Boolean(out?.puede_enviar)
    emit('loaded', out)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

watch(() => [props.doctype, props.name, props.version], load, {
  immediate: true,
})
</script>
