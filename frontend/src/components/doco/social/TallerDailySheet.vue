<!--
  TallerDailySheet — «Post diario del taller» for one shop (Redes managers).
  On: each morning the system drafts the day's repair post from taller photos and asks
  the people chosen here to review it (photos, text, music), then approve it or publish
  it by hand. Whoever turns it on hears back when the day's post is published or
  cancelled. People without Redes are offered access in the same save («Dar acceso y
  guardar»), when this person may edit users. Server: doco_marketing api/social_taller.
-->
<template>
  <component
    :is="isMobile ? BottomSheet : Dialog"
    v-model:open="open"
    v-bind="isMobile ? {} : { bare: true, size: 'lg' }"
  >
    <div
      class="flex flex-col bg-surface-base"
      :class="
        isMobile ? 'h-full min-h-0' : 'max-h-[86vh] overflow-hidden rounded-7'
      "
      data-testid="taller-daily-sheet"
    >
      <div
        class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
      >
        <h2 class="text-[15px] font-semibold text-ink-gray-9">
          {{ __('Post diario del taller') }}
        </h2>
        <button
          type="button"
          class="press ml-auto flex size-9 items-center justify-center rounded-full hover:bg-surface-gray-2"
          :aria-label="__('Cerrar')"
          :title="__('Cerrar')"
          @click="open = false"
        >
          <span class="lucide-x size-4 text-ink-gray-7" aria-hidden="true" />
        </button>
      </div>
      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
        <label
          v-if="shopOptions.length > 1"
          class="block text-[12.5px] text-ink-gray-7"
          >{{ __('Sucursal') }}
          <select
            v-model="shop"
            class="mt-1 h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px]"
            @change="load"
          >
            <option v-for="s in shopOptions" :key="s.name" :value="s.name">
              {{ s.shop_name }}
            </option>
          </select>
        </label>
        <p v-if="loading" class="text-[12.5px] text-ink-gray-5">
          {{ __('Cargando…') }}
        </p>
        <p
          v-else-if="problem"
          role="alert"
          class="text-[12.5px] text-ink-red-7"
        >
          {{ problem }}
        </p>
        <template v-else-if="data">
          <label class="flex min-h-11 items-center gap-3">
            <input
              v-model="form.enabled"
              type="checkbox"
              class="size-5"
              :disabled="!data.can_edit"
            />
            <span class="text-[13.5px] text-ink-gray-9">{{
              __('Preparar un post del taller cada día')
            }}</span>
          </label>
          <p class="-mt-2 text-[12px] text-ink-gray-6">
            {{
              __(
                'Se arma con la reparación más reciente que tenga foto de después aprobada y no se haya publicado: la foto, el tipo de reparación y el equipo. Si no hay, la tarea es elegirla.',
              )
            }}
          </p>
          <div class="grid grid-cols-2 gap-3">
            <label class="block text-[12.5px] text-ink-gray-7"
              >{{ __('Se prepara a las') }}
              <input
                v-model="form.prepare_at"
                type="time"
                class="mt-1 h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px]"
                :disabled="!data.can_edit"
              />
            </label>
            <label class="block text-[12.5px] text-ink-gray-7"
              >{{ __('Se publica a las') }}
              <input
                v-model="form.time"
                type="time"
                class="mt-1 h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px]"
                :disabled="!data.can_edit"
              />
            </label>
          </div>
          <fieldset>
            <legend class="mb-1 text-[12.5px] text-ink-gray-7">
              {{ __('Cómo se publica') }}
            </legend>
            <div class="flex flex-wrap gap-2" role="radiogroup">
              <button
                v-for="m in modes"
                :key="m.value"
                type="button"
                role="radio"
                class="press min-h-10 rounded-full border px-3.5 text-[12.5px] font-semibold"
                :class="
                  form.mode === m.value
                    ? 'border-transparent bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                    : 'border-outline-gray-2 text-ink-gray-7'
                "
                :aria-checked="form.mode === m.value"
                :disabled="!data.can_edit"
                @click="form.mode = m.value"
              >
                {{ m.label }}
              </button>
            </div>
            <p class="mt-1 text-[12px] text-ink-gray-6">
              {{ modeHint }}
            </p>
          </fieldset>
          <div>
            <p class="mb-1 text-[12.5px] text-ink-gray-7">
              {{ __('Lo revisan') }}
            </p>
            <ul v-if="chosen.length" class="mb-2 flex flex-wrap gap-1.5">
              <li
                v-for="p in chosen"
                :key="p.user"
                class="flex items-center gap-1 rounded-full bg-surface-gray-2 py-0.5 pl-2.5 pr-0.5 text-[12.5px] text-ink-gray-8"
              >
                {{ p.full_name }}
                <span v-if="!p.access" class="text-[11px] text-ink-amber-8"
                  >· {{ __('sin acceso a Redes') }}</span
                >
                <button
                  v-if="data.can_edit"
                  type="button"
                  class="press flex size-7 items-center justify-center rounded-full hover:bg-surface-gray-3"
                  :aria-label="__('Quitar a {0}', [p.full_name])"
                  :title="__('Quitar')"
                  @click="removePerson(p.user)"
                >
                  <span class="lucide-x size-3.5" aria-hidden="true" />
                </button>
              </li>
            </ul>
            <input
              v-if="data.can_edit"
              v-model="query"
              type="search"
              class="h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px]"
              :placeholder="__('Agregar persona')"
              :aria-label="__('Agregar persona')"
            />
            <ul
              v-if="query.trim() && matches.length"
              class="mt-1 max-h-48 overflow-y-auto rounded-6 border border-outline-gray-2"
            >
              <li v-for="p in matches" :key="p.user">
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] hover:bg-surface-gray-1"
                  @click="addPerson(p)"
                >
                  <span class="min-w-0 flex-1">{{ p.full_name }}</span>
                  <span v-if="!p.access" class="text-[11px] text-ink-gray-5">{{
                    __('sin acceso a Redes')
                  }}</span>
                </button>
              </li>
            </ul>
            <p class="mt-1 text-[12px] text-ink-gray-6">
              {{
                __(
                  'Cada una recibe el pendiente del día: elegir fotos si faltan, revisar el texto, ponerle música y aprobarlo o publicarlo.',
                )
              }}
            </p>
          </div>
          <p class="text-[12px] text-ink-gray-6">
            {{
              data.requester
                ? __(
                    'Te avisamos a ti ({0}) cuando el post del día sale o se cancela.',
                    [data.requester.full_name],
                  )
                : __(
                    'Te avisamos a ti cuando el post del día sale o se cancela.',
                  )
            }}
          </p>
          <p
            v-if="!data.connected.length"
            class="rounded-6 bg-surface-gray-2 px-3 py-2 text-[12px] text-ink-gray-7"
          >
            {{
              __(
                'Esta sucursal no tiene Facebook ni Instagram conectados: los posts se publican a mano en la app.',
              )
            }}
          </p>
          <div
            v-if="needsAccess.length"
            role="alert"
            class="rounded-6 bg-surface-amber-1 px-3 py-2.5 text-[12.5px] text-ink-amber-9"
          >
            <p class="mb-2">
              {{
                needsAccess.length === 1
                  ? __('{0} no tiene acceso a Redes. ¿Se lo damos?', [
                      needsAccess[0].full_name,
                    ])
                  : __('{0} no tienen acceso a Redes. ¿Se lo damos?', [
                      needsAccess.map((p) => p.full_name).join(', '),
                    ])
              }}
            </p>
            <p v-if="!data.can_grant" class="text-[12px]">
              {{
                __(
                  'Solo quien administra usuarios puede darlo: pídeselo, o elige a otra persona.',
                )
              }}
            </p>
          </div>
          <p v-if="data.today" class="text-[12.5px] text-ink-gray-7">
            {{ __('El post de hoy ya está en el calendario.') }}
            <button
              type="button"
              class="font-semibold text-ink-gray-9 underline"
              @click="$emit('open-post', data.today)"
            >
              {{ __('Abrirlo') }}
            </button>
          </p>
        </template>
      </div>
      <div
        v-if="data?.can_edit"
        class="flex flex-wrap items-center justify-end gap-2 border-t border-outline-gray-1 px-4 py-3"
      >
        <button
          v-if="form.enabled && !data.today"
          type="button"
          class="press mr-auto min-h-10 rounded-6 px-3 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="busy || dirty"
          :title="dirty ? __('Guarda primero') : ''"
          data-testid="prepare-today"
          @click="prepareToday"
        >
          {{ __('Preparar el de hoy') }}
        </button>
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
          :disabled="busy || (needsAccess.length && !data.can_grant)"
          data-testid="save-daily"
          @click="save(Boolean(needsAccess.length))"
        >
          {{ needsAccess.length ? __('Dar acceso y guardar') : __('Guardar') }}
        </button>
      </div>
    </div>
  </component>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet, Dialog, call, toast } from 'frappe-ui'
import { isMobile } from '@/composables/breakpoint'
import { errorText } from '@/utils/errorText'
import { matchTokens } from '@/vendor/muelle-shell/contracts'
import { MANUAL } from '@/composables/socialDaily'

const props = defineProps({
  shopOptions: { type: Array, default: () => [] },
  initialShop: { type: String, default: '' },
})
const emit = defineEmits(['saved', 'open-post'])
const open = defineModel('open', { type: Boolean, default: false })

const shop = ref('')
const data = ref(null)
const loading = ref(false)
const busy = ref(false)
const problem = ref('')
const query = ref('')
const needsAccess = ref([])
const form = ref(blank())
let saved = ''

function blank() {
  return {
    enabled: false,
    prepare_at: '09:00',
    time: '19:00',
    mode: 'Programada',
    reviewers: [],
  }
}

const modes = [
  { value: 'Programada', label: __('Sale sola al aprobarla') },
  { value: MANUAL, label: __('La publican a mano') },
]
const modeHint = computed(() =>
  form.value.mode === MANUAL
    ? __(
        'Quien lo revisa lo publica en la app de Facebook o Instagram, con música de la app, y lo marca publicado con su enlace.',
      )
    : __(
        'Un gestor lo aprueba y sale solo a su hora. La música se pone con canciones de la tienda.',
      ),
)
const people = computed(() => data.value?.people || [])
const chosen = computed(() =>
  form.value.reviewers.map(
    (u) =>
      people.value.find((p) => p.user === u) || {
        user: u,
        full_name: u,
        access: true,
      },
  ),
)
const matches = computed(() =>
  people.value
    .filter(
      (p) =>
        !form.value.reviewers.includes(p.user) &&
        matchTokens(query.value, p.full_name, p.user),
    )
    .slice(0, 8),
)
const dirty = computed(() => JSON.stringify(form.value) !== saved)

function addPerson(p) {
  form.value.reviewers = [...form.value.reviewers, p.user]
  query.value = ''
  needsAccess.value = []
}
function removePerson(user) {
  form.value.reviewers = form.value.reviewers.filter((u) => u !== user)
  needsAccess.value = needsAccess.value.filter((p) => p.user !== user)
}

function fill(answer) {
  data.value = answer
  form.value = {
    enabled: Boolean(answer.enabled),
    prepare_at: answer.prepare_at || '09:00',
    time: answer.time || '19:00',
    mode: answer.mode || 'Programada',
    reviewers: (answer.reviewers || []).map((p) => p.user),
  }
  saved = JSON.stringify(form.value)
  needsAccess.value = []
}

async function load() {
  if (!shop.value) return
  loading.value = true
  problem.value = ''
  try {
    fill(
      await call('doco_marketing.api.social_taller.daily_settings', {
        shop: shop.value,
      }),
    )
  } catch (e) {
    problem.value = errorText(e, __('No se pudo cargar la configuración.'))
  } finally {
    loading.value = false
  }
}

// The sheet mounts on its first open, already open: read the shop then too.
watch(
  open,
  (on) => {
    if (!on) return
    shop.value = props.initialShop || props.shopOptions[0]?.name || ''
    load()
  },
  { immediate: true },
)

async function save(grant) {
  busy.value = true
  try {
    const r = await call(
      'doco_marketing.api.social_taller.save_daily_settings',
      {
        shop: shop.value,
        enabled: form.value.enabled ? 1 : 0,
        prepare_at: form.value.prepare_at,
        time: form.value.time,
        mode: form.value.mode,
        reviewers: JSON.stringify(form.value.reviewers),
        grant: grant ? 1 : 0,
      },
    )
    if (!r?.saved) {
      needsAccess.value = r?.needs_access || []
      return
    }
    fill(r.settings)
    for (const p of r.granted || [])
      toast.success(__('{0} ya tiene acceso a Redes', [p.full_name]))
    toast.success(
      form.value.enabled
        ? __('Post diario guardado')
        : __('Post diario apagado'),
    )
    emit('saved')
  } catch (e) {
    toast.error(errorText(e, __('No se pudo guardar.')))
  } finally {
    busy.value = false
  }
}

async function prepareToday() {
  busy.value = true
  try {
    const r = await call('doco_marketing.api.social_taller.prepare_today', {
      shop: shop.value,
    })
    const asked = (r?.asked || []).map((p) => p.full_name)
    toast.success(
      asked.length
        ? __('Post de hoy listo; se lo pedimos a {0}', [asked.join(', ')])
        : __('Post de hoy listo'),
    )
    for (const s of r?.skipped || []) toast.error(`${s.full_name}: ${s.reason}`)
    emit('saved')
    emit('open-post', r.name)
    open.value = false
  } catch (e) {
    toast.error(errorText(e, __('No se pudo preparar el post de hoy.')))
  } finally {
    busy.value = false
  }
}
</script>
