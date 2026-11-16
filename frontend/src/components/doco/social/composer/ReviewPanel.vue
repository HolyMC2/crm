<!--
  ReviewPanel — who has the post in their Pendientes, and «Pedir revisión».
  Each person asked gets a Pendiente on the post (doco encargos); whoever asked hears
  back when it is published or cancelled, and every Pendiente closes then.
  People without access to Redes are listed but cannot be picked: the line says why.
-->
<template>
  <section class="mb-4" data-testid="review-panel">
    <div class="flex flex-wrap items-center gap-2">
      <ul
        v-if="review.length"
        class="flex flex-wrap gap-1.5"
        :aria-label="__('Quién la revisa')"
      >
        <li
          v-for="r in review"
          :key="r.todo"
          class="flex items-center gap-1.5 rounded-full bg-surface-gray-2 py-0.5 pl-0.5 pr-2.5 text-[12px] text-ink-gray-8"
          :title="r.status === 'Open' ? __('Pendiente') : __('Hecho')"
        >
          <span
            class="flex size-6 items-center justify-center rounded-full bg-surface-gray-4 text-[10px] font-semibold text-ink-gray-8"
            aria-hidden="true"
            >{{ initials(r.full_name) }}</span
          >
          {{ r.full_name }}
          <span
            v-if="r.status !== 'Open'"
            class="lucide-check size-3.5 text-ink-green-8"
            :aria-label="__('Hecho')"
          />
        </li>
      </ul>
      <span v-else class="text-[12px] text-ink-gray-6">{{
        __('Nadie la tiene en sus pendientes.')
      }}</span>
      <button
        v-if="editable"
        type="button"
        class="press ml-auto min-h-9 rounded-6 px-2.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
        data-testid="ask-review"
        @click="openPicker"
      >
        {{ __('Pedir revisión') }}
      </button>
    </div>
    <div
      v-if="picking"
      class="mt-2 rounded-7 border border-outline-gray-2 p-2.5"
    >
      <input
        v-model="query"
        type="search"
        class="mb-2 h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px]"
        :placeholder="__('Buscar persona')"
        :aria-label="__('Buscar persona')"
      />
      <p v-if="loading" class="text-[12px] text-ink-gray-5">
        {{ __('Cargando…') }}
      </p>
      <ul v-else class="max-h-56 overflow-y-auto">
        <li v-for="p in shown" :key="p.user">
          <label
            class="flex min-h-11 items-center gap-2.5 px-1"
            :class="p.access ? 'cursor-pointer' : 'opacity-60'"
          >
            <input
              v-model="chosen"
              type="checkbox"
              :value="p.user"
              :disabled="!p.access"
              class="size-4"
            />
            <span class="min-w-0 flex-1 text-[13px] text-ink-gray-9">{{
              p.full_name
            }}</span>
            <span v-if="!p.access" class="text-[11px] text-ink-gray-5">{{
              __('sin acceso a Redes')
            }}</span>
          </label>
        </li>
      </ul>
      <p
        v-if="people.some((p) => !p.access)"
        class="mt-1 text-[11px] text-ink-gray-5"
      >
        {{
          __(
            'Para pedírsela a alguien sin acceso, dale acceso en «Post diario del taller» (gestor) o el rol Marketing User en Equipo.',
          )
        }}
      </p>
      <div class="mt-2 flex justify-end gap-2">
        <button
          type="button"
          class="press min-h-10 rounded-6 px-3 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
          @click="picking = false"
        >
          {{ __('Cancelar') }}
        </button>
        <button
          type="button"
          class="press min-h-10 rounded-6 bg-surface-gray-10 px-3 text-[12.5px] font-semibold text-ink-base disabled:opacity-50"
          :disabled="!chosen.length || busy"
          @click="ask"
        >
          {{ busy ? __('Pidiendo…') : __('Pedir revisión') }}
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
import { initials } from '@/composables/socialDaily'

const props = defineProps({
  postName: { type: String, required: true },
  shop: { type: String, default: '' },
  review: { type: Array, default: () => [] },
  editable: { type: Boolean, default: true },
})
const emit = defineEmits(['changed'])

const picking = ref(false)
const loading = ref(false)
const busy = ref(false)
const people = ref([])
const chosen = ref([])
const query = ref('')

const asked = computed(
  () =>
    new Set(props.review.filter((r) => r.status === 'Open').map((r) => r.user)),
)
const shown = computed(() =>
  people.value.filter(
    (p) =>
      !asked.value.has(p.user) &&
      (!query.value.trim() || matchTokens(query.value, p.full_name, p.user)),
  ),
)

async function openPicker() {
  picking.value = true
  chosen.value = []
  if (people.value.length || !props.shop) return
  loading.value = true
  try {
    const r = await call('doco_marketing.api.social_taller.daily_settings', {
      shop: props.shop,
    })
    people.value = r?.people || []
  } catch (e) {
    toast.error(errorText(e, __('No se pudo cargar la lista de personas.')))
  } finally {
    loading.value = false
  }
}

async function ask() {
  busy.value = true
  try {
    const r = await call('doco_marketing.api.social_taller.request_review', {
      post: props.postName,
      users: JSON.stringify(chosen.value),
    })
    const names = (r?.asked || []).map((p) => p.full_name)
    if (names.length)
      toast.success(__('Revisión pedida a {0}', [names.join(', ')]))
    for (const s of r?.skipped || []) toast.error(`${s.full_name}: ${s.reason}`)
    picking.value = false
    emit('changed')
  } catch (e) {
    toast.error(errorText(e, __('No se pudo pedir la revisión.')))
  } finally {
    busy.value = false
  }
}
</script>
