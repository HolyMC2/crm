<!--
  TallerPhotosPanel — «Foto del taller» in the composer (post diario del taller).
  Lists the recent repairs with a photo after the repair the worker can read, each with its
  repair type; a tap picks one photo, «Usar esta foto» draws the repair card on the server
  (doco_marketing taller_daily.use_photos: the photo, the repair type, the device, in the
  shop's colours). Repairs a post never shows (unlocking, account removal) are not listed.
  A photo not approved for marketing yet is approved by that same tap when taller lets this
  person do it, else the row says who can. Emits `changed` so the composer re-reads the post.
-->
<template>
  <section class="mb-4" data-testid="taller-photos">
    <div class="mb-1.5 flex items-center justify-between gap-2">
      <h3 class="text-[12px] font-semibold text-ink-gray-7">
        {{ __('Foto del taller') }}
      </h3>
      <button
        v-if="!open"
        type="button"
        class="press min-h-9 rounded-6 px-2.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
        @click="show"
      >
        {{ hasPhotos ? __('Cambiar foto') : __('Elegir foto') }}
      </button>
    </div>
    <div v-if="open" class="rounded-7 border border-outline-gray-2 p-2.5">
      <input
        v-model="query"
        type="search"
        class="mb-2 h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px] text-ink-gray-9 placeholder:text-ink-gray-5"
        :placeholder="__('Buscar equipo, reparación u orden')"
        :aria-label="__('Buscar equipo, reparación u orden')"
      />
      <p class="mb-2 text-[11.5px] text-ink-gray-6">
        {{
          __(
            'La foto de después, la del equipo ya reparado. Que no se vea una cara, un nombre ni un precio.',
          )
        }}
      </p>
      <p v-if="loading" class="py-3 text-[12px] text-ink-gray-5">
        {{ __('Cargando fotos…') }}
      </p>
      <p
        v-else-if="problem"
        role="alert"
        class="py-2 text-[12px] text-ink-red-7"
      >
        {{ problem }}
      </p>
      <p v-else-if="!groups.length" class="py-3 text-[12px] text-ink-gray-6">
        {{
          __(
            'No hay fotos de después en los últimos 60 días. Se toman en Taller al entregar el equipo.',
          )
        }}
      </p>
      <ul v-else class="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
        <li v-for="g in groups" :key="g.repair_order">
          <p class="mb-1 text-[12px] text-ink-gray-8">
            <span class="font-semibold">{{
              g.repair || __('Reparación')
            }}</span>
            <span class="text-ink-gray-7">
              · {{ g.device || __('Equipo') }}</span
            >
            <span class="text-ink-gray-5"> · {{ g.repair_order }}</span>
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in g.photos"
              :key="p.name"
              type="button"
              class="press relative size-[72px] overflow-hidden rounded-6 border-2"
              :class="
                isPicked(p)
                  ? 'border-[var(--muelle-accent)]'
                  : 'border-transparent'
              "
              :aria-pressed="isPicked(p)"
              :aria-label="photoLabel(g, p)"
              :title="photoLabel(g, p)"
              :disabled="!p.approved && !g.can_approve"
              @click="pick(p)"
            >
              <img
                :src="p.url"
                alt=""
                loading="lazy"
                class="size-full object-cover"
                :class="!p.approved && !g.can_approve ? 'opacity-40' : ''"
              />
              <span
                v-if="p.used"
                class="absolute bottom-0.5 left-0.5 rounded-4 bg-black/60 px-1 text-[9.5px] text-white"
                >{{ __('ya usada') }}</span
              >
              <span
                v-else-if="!p.approved"
                class="absolute bottom-0.5 left-0.5 rounded-4 bg-black/60 px-1 text-[9.5px] text-white"
                >{{ __('sin aprobar') }}</span
              >
            </button>
          </div>
          <p
            v-if="!g.can_approve && g.photos.some((p) => !p.approved)"
            class="mt-1 text-[11px] text-ink-gray-5"
          >
            {{
              __(
                'Las fotos sin aprobar de esta orden las aprueba el encargado del taller.',
              )
            }}
          </p>
        </li>
      </ul>
      <div
        class="mt-2.5 flex flex-wrap items-center justify-end gap-2 border-t border-outline-gray-1 pt-2.5"
      >
        <span class="mr-auto text-[11.5px] text-ink-gray-6">{{
          pickedLine
        }}</span>
        <button
          type="button"
          class="press min-h-10 rounded-6 px-3 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
          @click="open = false"
        >
          {{ __('Cancelar') }}
        </button>
        <button
          type="button"
          class="press min-h-10 rounded-6 bg-surface-gray-10 px-3.5 text-[12.5px] font-semibold text-ink-base disabled:opacity-50"
          :disabled="!picked || busy"
          data-testid="use-taller-photos"
          @click="use"
        >
          {{ busy ? __('Dibujando…') : __('Usar esta foto') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { call, toast } from 'frappe-ui'
import { errorText } from '@/utils/errorText'
import { matchTokens } from '@/vendor/muelle-shell/contracts'
import { pickPhoto } from '@/composables/socialDaily'

const props = defineProps({
  postName: { type: String, required: true },
  hasPhotos: { type: Boolean, default: false },
})
const emit = defineEmits(['changed'])

const open = ref(false)
const loading = ref(false)
const busy = ref(false)
const problem = ref('')
const all = ref([])
const query = ref('')
const picked = ref(null)

const groups = computed(() =>
  query.value.trim()
    ? all.value.filter((g) =>
        matchTokens(
          query.value,
          g.device || '',
          g.repair || '',
          g.repair_order,
        ),
      )
    : all.value,
)
const pickedLine = computed(() =>
  picked.value ? __('Foto elegida') : __('Elige una foto de después.'),
)

function isPicked(p) {
  return picked.value?.name === p.name
}
function photoLabel(g, p) {
  const state = p.approved
    ? ''
    : g.can_approve
      ? __('sin aprobar: se aprueba al usarla')
      : __('sin aprobar')
  return [g.repair, g.device, state].filter(Boolean).join(' · ')
}
function pick(p) {
  picked.value = pickPhoto(picked.value, p)
}

async function show() {
  open.value = true
  picked.value = null
  if (all.value.length) return
  loading.value = true
  problem.value = ''
  try {
    const r = await call('doco_marketing.api.social_taller.taller_photos', {
      post: props.postName,
    })
    all.value = r?.groups || []
  } catch (e) {
    problem.value = errorText(e, __('No se pudieron cargar las fotos.'))
  } finally {
    loading.value = false
  }
}

async function use() {
  busy.value = true
  try {
    await call('doco_marketing.api.social_taller.use_taller_photos', {
      post: props.postName,
      photos: JSON.stringify([picked.value.name]),
    })
    toast.success(__('Foto puesta en la publicación'))
    open.value = false
    all.value = []
    emit('changed')
  } catch (e) {
    toast.error(errorText(e, __('No se pudo usar esa foto.')))
  } finally {
    busy.value = false
  }
}
</script>
