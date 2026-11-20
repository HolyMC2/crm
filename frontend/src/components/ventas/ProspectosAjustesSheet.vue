<template>
  <!-- How the shop registers prospects (crm.lead.settings): what the form
       asks, whether Consultas has its own door, the first follow-up and the
       origins the form offers. Each tap saves; a refusal puts it back. -->
  <BottomSheet
    :open="open"
    title="Cómo registras prospectos"
    subtitle="Lo que pide el alta y lo que hace Muelle cuando llega uno."
    layer="prospectos-ajustes"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-6 pb-2" data-prospectos-ajustes>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-ajustes-problema
      >
        {{ problem }}
      </p>
      <div
        v-if="!values"
        role="status"
        aria-label="Cargando…"
        class="space-y-3"
      >
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
      </div>
      <template v-else>
        <section aria-labelledby="prospectos-ajustes-alta">
          <h3
            id="prospectos-ajustes-alta"
            class="text-sm font-semibold text-ink-gray-7"
          >
            Al registrar un prospecto
          </h3>
          <ul class="mt-1 divide-y divide-outline-gray-1">
            <li
              v-for="row in switches"
              :key="row.key"
              class="flex min-h-14 items-center gap-3 py-2"
            >
              <label
                :for="`prospectos-ajuste-${row.key}`"
                class="min-w-0 flex-1"
              >
                <span class="block text-base text-ink-gray-9">{{
                  row.label
                }}</span>
                <span class="block text-sm text-ink-gray-6">{{
                  values[row.key] ? row.on : row.off
                }}</span>
              </label>
              <AjustesSwitch
                :id="`prospectos-ajuste-${row.key}`"
                :model-value="Boolean(values[row.key])"
                :label="row.label"
                :disabled="busy"
                :data-ajuste="row.key"
                @update:model-value="save({ [row.key]: $event })"
              />
            </li>
          </ul>
        </section>

        <section aria-labelledby="prospectos-ajustes-seguimiento">
          <h3
            id="prospectos-ajustes-seguimiento"
            class="text-sm font-semibold text-ink-gray-7"
          >
            Primer seguimiento
          </h3>
          <Segmented
            class="mt-2"
            label="Primer seguimiento"
            :model-value="values.first_follow_up"
            :options="FOLLOW_UP_OPTIONS"
            data-ajuste="first_follow_up"
            @update:model-value="save({ first_follow_up: $event })"
          />
          <p class="mt-2 text-sm text-ink-gray-6" data-ajustes-seguimiento>
            {{ followUpSentence(values.first_follow_up) }}
          </p>
        </section>

        <section aria-labelledby="prospectos-ajustes-origenes">
          <h3
            id="prospectos-ajustes-origenes"
            class="text-sm font-semibold text-ink-gray-7"
          >
            Orígenes
          </h3>
          <p class="text-sm text-ink-gray-6">
            Los que se ofrecen al registrar un prospecto. Los prospectos que ya
            tienen uno lo conservan.
          </p>
          <ul class="mt-1 divide-y divide-outline-gray-1">
            <li
              v-for="origin in sources"
              :key="origin.name"
              class="flex min-h-12 items-center gap-3 py-1"
              :data-ajustes-origen="origin.name"
            >
              <label
                :for="`prospectos-origen-${origin.name}`"
                class="min-w-0 flex-1 break-words text-base"
                :class="origin.offered ? 'text-ink-gray-9' : 'text-ink-gray-5'"
                >{{ origin.label }}</label
              >
              <AjustesSwitch
                :id="`prospectos-origen-${origin.name}`"
                :model-value="origin.offered"
                :label="`Ofrecer ${origin.label}`"
                :disabled="busy"
                @update:model-value="setOffered(origin, $event)"
              />
            </li>
          </ul>
          <form
            v-if="adding"
            class="mt-3 flex flex-wrap items-end gap-2"
            data-ajustes-nuevo-origen
            @submit.prevent="addOrigin"
          >
            <label class="flex min-w-0 flex-1 basis-48 flex-col gap-1">
              <span class="text-sm text-ink-gray-7">Nombre del origen</span>
              <input
                ref="originInput"
                v-model="originName"
                autocomplete="off"
                maxlength="60"
                enterkeyhint="done"
                class="h-11 rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-4"
                placeholder="Por ejemplo, TikTok o volante"
              />
            </label>
            <button
              type="button"
              :class="['press', BTN.text]"
              @click="adding = false"
            >
              Cancelar
            </button>
            <button
              type="submit"
              :class="['press', BTN.filled]"
              :disabled="busy || !originName.trim()"
              data-ajustes-agregar-origen
            >
              Agregar origen
            </button>
          </form>
          <button
            v-else
            type="button"
            class="press mt-2 flex min-h-11 items-center gap-2 text-sm font-medium text-ink-gray-8"
            data-ajustes-abrir-origen
            @click="startAdding"
          >
            <span class="lucide-plus size-5" aria-hidden="true" />
            Agregar origen
          </button>
        </section>
      </template>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/utils/errorText'
import {
  FOLLOW_UP_OPTIONS,
  followUpSentence,
  rememberProspectSettings,
} from '@/utils/prospects'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The site has Consultas: only then is there a door to turn off. */
  inquiriesAvailable: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'changed'])

const API = 'crm.api.prospect_settings.'
const values = ref(null)
const sources = ref([])
const busy = ref(false)
const problem = ref('')
const adding = ref(false)
const originName = ref('')
const originInput = ref(null)

const SWITCHES = [
  {
    key: 'companies',
    label: 'Vendo a empresas',
    on: 'Prospectos y tratos piden empresa, sitio web, giro y empleados.',
    off: 'Solo personas: prospectos y tratos sin empresa.',
  },
  {
    key: 'phone_required',
    label: 'Pedir teléfono',
    on: 'No se guarda un prospecto sin teléfono.',
    off: 'El teléfono es opcional.',
  },
  {
    key: 'ask_salutation',
    label: 'Preguntar el trato (Sr., Sra.)',
    on: 'El alta lo pregunta.',
    off: 'El alta no lo pregunta.',
  },
  {
    key: 'ask_gender',
    label: 'Preguntar el género',
    on: 'El alta lo pregunta.',
    off: 'El alta no lo pregunta.',
  },
  {
    key: 'inquiries',
    label: 'Registrar consultas',
    on: 'Además de prospectos, registras preguntas que alguien dejó.',
    off: 'Solo prospectos. Las consultas que lleguen solas de tus redes siguen apareciendo.',
  },
]
const switches = computed(() =>
  SWITCHES.filter((row) => row.key !== 'inquiries' || props.inquiriesAvailable),
)

function take(state) {
  values.value = { ...state.settings }
  sources.value = state.sources || []
  rememberProspectSettings(state.settings)
}

async function read() {
  problem.value = ''
  try {
    take(await call(API + 'get_settings'))
  } catch (e) {
    problem.value = errorText(
      e,
      'No se pudieron abrir los ajustes. Vuelve a intentar.',
    )
  }
}
watch(
  () => props.open,
  (open) => open && read(),
  { immediate: true },
)

// The tap shows at once; the server's answer replaces it, a refusal puts it back.
async function send(method, args, undo) {
  busy.value = true
  problem.value = ''
  try {
    take(await call(API + method, args))
    emit('changed', values.value)
    return true
  } catch (e) {
    undo()
    problem.value = errorText(e, 'No se guardó. Vuelve a intentar.')
    return false
  } finally {
    busy.value = false
  }
}

function save(changes) {
  const before = { ...values.value }
  values.value = { ...values.value, ...changes }
  return send('save_settings', { changes }, () => (values.value = before))
}

function setOffered(origin, offered) {
  const before = sources.value
  sources.value = sources.value.map((row) =>
    row.name === origin.name ? { ...row, offered } : row,
  )
  return send(
    'set_source_offered',
    { name: origin.name, offered: offered ? 1 : 0 },
    () => (sources.value = before),
  )
}

async function startAdding() {
  adding.value = true
  originName.value = ''
  await nextTick()
  originInput.value?.focus({ preventScroll: true })
}

async function addOrigin() {
  const name = originName.value.trim()
  if (!name) return
  if (await send('add_source', { name }, () => {})) adding.value = false
}
</script>
