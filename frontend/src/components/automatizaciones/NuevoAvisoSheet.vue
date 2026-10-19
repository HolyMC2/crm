<template>
  <!-- «Nuevo aviso» (Shell D12, Frappe Notification), built from pickers only:
       Documento → Cuándo → Condición → A quién → Por dónde → Mensaje →
       Confirmar. The condition is a field and a value (never code); the
       message is plain Spanish with [Campo] chips, previewed with the latest
       record. -->
  <BottomSheet
    v-model:open="open"
    title="Nuevo aviso"
    :subtitle="`Paso ${index + 1} de ${PASOS_AVISO.length} · ${paso.title}`"
    :dismissible="!busy"
    flush
  >
    <div class="pb-2" :data-paso="paso.key">
      <!-- 1 · Documento -->
      <template v-if="paso.key === 'documento'">
        <p class="px-4 pb-2 text-base text-ink-gray-8">
          ¿Sobre qué documento quieres avisar?
        </p>
        <div class="px-4 pb-1">
          <FormControl
            v-model="search"
            type="text"
            placeholder="Buscar otro tipo de documento"
            aria-label="Buscar otro tipo de documento"
            class="[&_input]:min-h-12"
          />
        </div>
        <ul role="radiogroup" aria-label="Documento">
          <li v-for="tipo in tipos" :key="tipo.doctype">
            <ListRow
              role="radio"
              :aria-checked="state.doctype === tipo.doctype ? 'true' : 'false'"
              :title="tipo.label"
              :selected="state.doctype === tipo.doctype"
              @click="elegirTipo(tipo)"
            >
              <template #leading>
                <RadioDot :on="state.doctype === tipo.doctype" />
              </template>
            </ListRow>
          </li>
        </ul>
        <p
          v-if="!tipos.length && !loadingTipos"
          class="px-4 py-2 text-sm text-ink-gray-6"
        >
          No encontramos ese documento.
        </p>
      </template>

      <!-- 2 · Cuándo -->
      <template v-else-if="paso.key === 'cuando' && opciones">
        <ul role="radiogroup" aria-label="Cuándo">
          <li v-for="evento in opciones.eventos" :key="evento.value">
            <ListRow
              role="radio"
              :aria-checked="state.evento === evento.value ? 'true' : 'false'"
              :title="eventoLabel(evento)"
              :selected="state.evento === evento.value"
              @click="elegirEvento(evento.value)"
            >
              <template #leading>
                <RadioDot :on="state.evento === evento.value" />
              </template>
            </ListRow>
          </li>
        </ul>
        <div v-if="pideCampo" class="space-y-2 px-4 pt-3">
          <label class="block space-y-1">
            <span class="block text-sm font-medium text-ink-gray-7">{{
              state.evento === 'Value Change'
                ? '¿Qué campo cambia?'
                : '¿Qué fecha?'
            }}</span>
            <select
              v-model="state.campo"
              class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
            >
              <option value="" disabled>Elige…</option>
              <option
                v-for="campo in camposEvento"
                :key="campo.fieldname"
                :value="campo.fieldname"
              >
                {{ campo.label }}
              </option>
            </select>
          </label>
          <div v-if="esDias" class="flex items-center gap-2">
            <button
              type="button"
              class="flex size-11 flex-none items-center justify-center rounded-lg bg-surface-gray-2 disabled:opacity-50"
              aria-label="Un día menos"
              :disabled="state.dias <= 0"
              @click="state.dias = Math.max(0, state.dias - 1)"
            >
              <span class="lucide-minus size-4" aria-hidden="true" />
            </button>
            <input
              v-model.number="state.dias"
              type="number"
              inputmode="numeric"
              min="0"
              max="90"
              aria-label="Días"
              class="min-h-11 w-20 rounded-lg border border-outline-gray-2 bg-surface-white px-2 text-center text-base"
            />
            <button
              type="button"
              class="flex size-11 flex-none items-center justify-center rounded-lg bg-surface-gray-2 disabled:opacity-50"
              aria-label="Un día más"
              :disabled="state.dias >= 90"
              @click="state.dias = Math.min(90, state.dias + 1)"
            >
              <span class="lucide-plus size-4" aria-hidden="true" />
            </button>
            <span class="text-base text-ink-gray-7">{{
              state.dias === 1 ? 'día' : 'días'
            }}</span>
          </div>
        </div>
        <p v-if="fraseCuando" class="px-4 pt-3 text-base text-ink-gray-9">
          {{ fraseCuando }}
        </p>
      </template>

      <!-- 3 · Condición -->
      <template v-else-if="paso.key === 'condicion' && opciones">
        <ul role="radiogroup" aria-label="Condición">
          <li>
            <ListRow
              role="radio"
              :aria-checked="!state.condicion ? 'true' : 'false'"
              :title="`Siempre`"
              :subtitle="`Con cualquier ${sustantivo}`"
              :selected="!state.condicion"
              @click="state.condicion = null"
            >
              <template #leading><RadioDot :on="!state.condicion" /></template>
            </ListRow>
          </li>
          <li>
            <ListRow
              role="radio"
              :aria-checked="state.condicion ? 'true' : 'false'"
              title="Solo si…"
              subtitle="Un campo tiene un valor"
              :selected="Boolean(state.condicion)"
              @click="
                state.condicion = state.condicion || { campo: null, valor: '' }
              "
            >
              <template #leading>
                <RadioDot :on="Boolean(state.condicion)" />
              </template>
            </ListRow>
          </li>
        </ul>
        <div v-if="state.condicion" class="space-y-3 px-4 pt-3">
          <label class="block space-y-1">
            <span class="block text-sm font-medium text-ink-gray-7">Campo</span>
            <select
              :value="state.condicion.campo?.fieldname || ''"
              class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
              @change="elegirCampoCondicion($event.target.value)"
            >
              <option value="" disabled>Elige…</option>
              <option
                v-for="campo in opciones.condiciones"
                :key="campo.fieldname"
                :value="campo.fieldname"
              >
                {{ campo.label }}
              </option>
            </select>
          </label>
          <template v-if="state.condicion.campo">
            <div
              v-if="state.condicion.campo.fieldtype === 'Check'"
              role="radiogroup"
              aria-label="Valor"
              class="flex gap-x-2"
            >
              <button
                v-for="option in SI_NO"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="
                  state.condicion.valor === option.value ? 'true' : 'false'
                "
                class="flex min-h-11 items-center"
                @click="state.condicion.valor = option.value"
              >
                <span
                  :class="chipClass(state.condicion.valor === option.value)"
                  >{{ option.label }}</span
                >
              </button>
            </div>
            <label
              v-else-if="state.condicion.campo.options?.length"
              class="block space-y-1"
            >
              <span class="block text-sm font-medium text-ink-gray-7">Es</span>
              <select
                v-model="state.condicion.valor"
                class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
              >
                <option value="" disabled>Elige…</option>
                <option
                  v-for="option in state.condicion.campo.options"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label v-else class="block space-y-1">
              <span class="block text-sm font-medium text-ink-gray-7">Es</span>
              <input
                v-model.trim="state.condicion.valor"
                type="text"
                maxlength="140"
                class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
              />
            </label>
          </template>
          <p v-if="fraseSolo" class="text-base text-ink-gray-9">
            Solo si {{ fraseSolo }}
          </p>
        </div>
      </template>

      <!-- 4 · A quién -->
      <template v-else-if="paso.key === 'quien' && opciones">
        <section>
          <h3 class="px-4 pb-1 pt-2 text-sm font-medium text-ink-gray-7">
            Del documento
          </h3>
          <ul>
            <li v-for="campo in opciones.correos" :key="campo.fieldname">
              <ListRow
                role="checkbox"
                :aria-checked="tieneCorreo(campo) ? 'true' : 'false'"
                :title="campo.label"
                :subtitle="
                  campo.fieldname === 'owner'
                    ? 'Quien lo creó'
                    : 'La persona de ese campo'
                "
                @click="toggleCorreo(campo)"
              >
                <template #trailing>
                  <CheckMark :on="tieneCorreo(campo)" />
                </template>
              </ListRow>
            </li>
          </ul>
        </section>
        <section>
          <h3 class="px-4 pb-1 pt-3 text-sm font-medium text-ink-gray-7">
            Equipos
          </h3>
          <ul v-if="state.destinatarios.roles.length">
            <li v-for="role in state.destinatarios.roles" :key="role.role">
              <ListRow
                role="checkbox"
                aria-checked="true"
                :title="role.label"
                subtitle="Todo el equipo, también quien entre después"
                @click="toggleRol(role)"
              >
                <template #trailing><CheckMark :on="true" /></template>
              </ListRow>
            </li>
          </ul>
          <div class="px-4 pt-1">
            <FormControl
              v-model="roleSearch"
              type="text"
              placeholder="Buscar un equipo: ventas, cuentas, almacén…"
              aria-label="Buscar un equipo"
              class="[&_input]:min-h-12"
            />
          </div>
          <ul v-if="rolesFound.length" class="pt-1">
            <li v-for="role in rolesFound" :key="role.role">
              <ListRow
                role="checkbox"
                aria-checked="false"
                :title="role.label"
                @click="toggleRol(role)"
              >
                <template #trailing><CheckMark :on="false" /></template>
              </ListRow>
            </li>
          </ul>
        </section>
        <p v-if="fraseQuien" class="px-4 pt-3 text-base text-ink-gray-9">
          Le llega a {{ fraseQuien }}.
        </p>
      </template>

      <!-- 5 · Por dónde -->
      <template v-else-if="paso.key === 'canal' && opciones">
        <ul role="radiogroup" aria-label="Por dónde">
          <li v-for="canal in opciones.canales" :key="canal.value">
            <ListRow
              role="radio"
              :aria-checked="state.canal === canal.value ? 'true' : 'false'"
              :title="canal.label"
              :subtitle="
                canal.value === 'Email'
                  ? 'Le llega a su correo'
                  : 'Le llega a la campana de Avisos en Muelle'
              "
              :selected="state.canal === canal.value"
              @click="state.canal = canal.value"
            >
              <template #leading>
                <RadioDot :on="state.canal === canal.value" />
              </template>
            </ListRow>
          </li>
        </ul>
      </template>

      <!-- 6 · Mensaje -->
      <template v-else-if="paso.key === 'mensaje' && opciones">
        <div class="space-y-3 px-4">
          <label class="block space-y-1">
            <span class="block text-sm font-medium text-ink-gray-7"
              >Título</span
            >
            <input
              ref="asuntoEl"
              v-model="state.asunto"
              type="text"
              maxlength="140"
              :placeholder="`Ejemplo: ${opciones.label} de [${primerDato}]`"
              class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
              @focus="foco = 'asunto'"
            />
          </label>
          <label class="block space-y-1">
            <span class="block text-sm font-medium text-ink-gray-7"
              >Mensaje</span
            >
            <textarea
              ref="mensajeEl"
              v-model="state.mensaje"
              rows="4"
              maxlength="2000"
              placeholder="Lo que tu equipo debe saber o hacer"
              class="w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-base text-ink-gray-9"
              @focus="foco = 'mensaje'"
            />
          </label>
          <div>
            <p class="pb-1 text-sm font-medium text-ink-gray-7">
              Insertar un dato del documento
            </p>
            <div class="flex flex-wrap gap-x-2">
              <button
                v-for="campo in insertables"
                :key="campo.fieldname"
                type="button"
                class="flex min-h-11 items-center"
                :aria-label="`Insertar ${campo.label}`"
                @click="insertar(campo)"
              >
                <span :class="chipClass(false)">{{ campo.label }}</span>
              </button>
              <button
                v-if="!todos && opciones.insertables.length > 10"
                type="button"
                class="flex min-h-11 items-center px-2 text-sm font-medium text-ink-gray-8"
                @click="todos = true"
              >
                Más datos
              </button>
            </div>
          </div>
          <button
            type="button"
            :class="BTN.tonal"
            :disabled="previewing || Boolean(pendiente)"
            @click="previsualizar"
          >
            Ver cómo queda
          </button>
          <PreviewCard v-if="preview" :preview="preview" />
        </div>
      </template>

      <!-- 7 · Confirmar -->
      <template v-else-if="paso.key === 'confirmar' && opciones">
        <dl class="space-y-2 px-4 text-base" data-aviso-resumen>
          <div>
            <dt class="text-sm text-ink-gray-6">Cuándo</dt>
            <dd class="text-ink-gray-9">
              {{ fraseCuando }}{{ fraseSolo ? `, solo si ${fraseSolo}` : '' }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-6">A quién</dt>
            <dd class="text-ink-gray-9">{{ fraseQuien }}</dd>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-6">Por dónde</dt>
            <dd class="text-ink-gray-9">{{ canalLabel }}</dd>
          </div>
        </dl>
        <div class="px-4 pt-3">
          <PreviewCard v-if="preview" :preview="preview" />
          <p v-else-if="previewing" class="text-sm text-ink-gray-6">
            Preparando la vista previa…
          </p>
        </div>
      </template>

      <p v-if="error" role="alert" class="px-4 pt-3 text-base text-ink-red-7">
        {{ error }}
      </p>
    </div>

    <template #actions>
      <button
        type="button"
        :class="BTN.filled"
        :disabled="busy || Boolean(pendiente)"
        data-aviso-siguiente
        @click="siguiente"
      >
        <span
          v-if="busy"
          class="lucide-loader-circle size-5 animate-spin"
          aria-hidden="true"
        />
        {{ paso.key === 'confirmar' ? 'Crear aviso' : 'Siguiente' }}
      </button>
      <p
        v-if="pendiente && touched"
        class="text-center text-sm text-ink-gray-6"
      >
        {{ pendiente }}
      </p>
      <button
        v-if="index > 0"
        type="button"
        :class="BTN.text"
        :disabled="busy"
        @click="index--"
      >
        Atrás
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import {
  computed,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  watch,
} from 'vue'
import { watchDebounced } from '@vueuse/core'
import { FormControl, toast } from 'frappe-ui'
import { BottomSheet, ListRow } from '@/components/ui'
import CheckMark from '@/components/disparadores/CheckMark.vue'
import RadioDot from '@/components/documentos/RadioDot.vue'
import { BTN } from '@/documentos/tools'
import {
  PASOS_AVISO,
  autoApi,
  chipClass,
  datosAviso,
  errorText,
  fraseCondicion,
  fraseDestinatarios,
  fraseEvento,
  insertarCampo,
  pasoPendiente,
} from './automatizaciones'

const open = defineModel('open', { type: Boolean, default: false })
const emit = defineEmits(['created'])

const SI_NO = [
  { value: '1', label: 'Sí' },
  { value: '0', label: 'No' },
]

// The rendered title and message against the latest record; never raw Jinja.
const PreviewCard = defineComponent({
  props: { preview: { type: Object, required: true } },
  setup(props) {
    return () => {
      const p = props.preview
      if (!p.registro)
        return h(
          'p',
          { class: 'text-sm text-ink-gray-6' },
          'Todavía no hay documentos para la vista previa.',
        )
      return h(
        'div',
        {
          class: 'space-y-1 rounded-lg bg-surface-gray-1 p-3',
          'data-aviso-preview': '',
        },
        [
          h(
            'p',
            { class: 'text-sm text-ink-gray-6' },
            `Así se vería con ${p.registro}:`,
          ),
          h(
            'p',
            { class: 'break-words text-base font-medium text-ink-gray-9' },
            p.asunto,
          ),
          p.mensaje
            ? h(
                'p',
                {
                  class:
                    'whitespace-pre-line break-words text-base text-ink-gray-8',
                },
                p.mensaje,
              )
            : null,
          p.cumple === 'No'
            ? h(
                'p',
                { class: 'text-sm text-ink-gray-6' },
                'Este documento no cumple la condición; a él no le llegaría.',
              )
            : null,
        ],
      )
    }
  },
})

const index = ref(0)
const paso = computed(() => PASOS_AVISO[index.value])
const busy = ref(false)
const error = ref('')
const touched = ref(false)
const search = ref('')
const tipos = ref([])
const loadingTipos = ref(false)
const opciones = ref(null)
const roleSearch = ref('')
const todos = ref(false)
const foco = ref('mensaje')
const asuntoEl = ref(null)
const mensajeEl = ref(null)
const preview = ref(null)
const previewing = ref(false)

const state = reactive({
  doctype: '',
  evento: '',
  campo: '',
  dias: 3,
  condicion: null,
  destinatarios: { roles: [], dueno: false, campo: null },
  canal: 'System Notification',
  asunto: '',
  mensaje: '',
})

const sustantivo = computed(() =>
  String(opciones.value?.articulo || 'documento').replace(/^(un|una) /, ''),
)
const esDias = computed(() =>
  ['Days Before', 'Days After'].includes(state.evento),
)
const pideCampo = computed(
  () => esDias.value || state.evento === 'Value Change',
)
const camposEvento = computed(() =>
  esDias.value ? opciones.value?.fechas || [] : opciones.value?.cambios || [],
)
const campoLabel = computed(
  () =>
    camposEvento.value.find((c) => c.fieldname === state.campo)?.label || '',
)
const fraseCuando = computed(() =>
  state.evento
    ? fraseEvento({
        evento: state.evento,
        articulo: opciones.value?.articulo,
        campo: campoLabel.value,
        dias: state.dias,
      })
    : '',
)
const fraseSolo = computed(() =>
  state.condicion?.campo
    ? fraseCondicion(state.condicion.campo, state.condicion.valor)
    : '',
)
const fraseQuien = computed(() => fraseDestinatarios(state.destinatarios))
const canalLabel = computed(
  () =>
    opciones.value?.canales?.find((c) => c.value === state.canal)?.label || '',
)
const rolesFound = computed(() => {
  const text = roleSearch.value.trim().toLowerCase()
  if (text.length < 2) return []
  const chosen = new Set(state.destinatarios.roles.map((r) => r.role))
  return (opciones.value?.roles || [])
    .filter(
      (r) =>
        !chosen.has(r.role) &&
        (r.label.toLowerCase().includes(text) ||
          r.role.toLowerCase().includes(text)),
    )
    .slice(0, 8)
})
const insertables = computed(() => {
  const all = opciones.value?.insertables || []
  return todos.value ? all : all.slice(0, 10)
})
const primerDato = computed(
  () => opciones.value?.insertables?.[1]?.label || 'Número',
)
const pendiente = computed(() => pasoPendiente(paso.value.key, state))

function eventoLabel(evento) {
  if (evento.value === 'Value Change') return 'Cuando cambia un campo'
  if (evento.value === 'Days Before') return 'Unos días antes de una fecha'
  if (evento.value === 'Days After') return 'Unos días después de una fecha'
  return evento.label
}

async function loadTipos() {
  loadingTipos.value = true
  try {
    tipos.value =
      (await autoApi('tipos', { search: search.value.trim() })) || []
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    loadingTipos.value = false
  }
}
watchDebounced(search, loadTipos, { debounce: 250 })

async function elegirTipo(tipo) {
  if (state.doctype === tipo.doctype && opciones.value) return
  state.doctype = tipo.doctype
  state.evento = ''
  state.campo = ''
  state.condicion = null
  state.destinatarios = { roles: [], dueno: false, campo: null }
  preview.value = null
  opciones.value = null
  error.value = ''
  try {
    opciones.value = await autoApi('opciones_aviso', { doctype: tipo.doctype })
  } catch (failure) {
    error.value = errorText(failure)
    state.doctype = ''
  }
}

function elegirEvento(value) {
  if (state.evento !== value) state.campo = ''
  state.evento = value
}

function elegirCampoCondicion(fieldname) {
  const campo = opciones.value.condiciones.find(
    (c) => c.fieldname === fieldname,
  )
  state.condicion = { campo, valor: '' }
}

function tieneCorreo(campo) {
  return campo.fieldname === 'owner'
    ? state.destinatarios.dueno
    : state.destinatarios.campo?.fieldname === campo.fieldname
}

function toggleCorreo(campo) {
  if (campo.fieldname === 'owner') {
    state.destinatarios.dueno = !state.destinatarios.dueno
    return
  }
  // One field of the document at a time (Frappe reads one per recipient row).
  state.destinatarios.campo = tieneCorreo(campo) ? null : campo
}

function toggleRol(role) {
  const roles = state.destinatarios.roles
  state.destinatarios.roles = roles.some((r) => r.role === role.role)
    ? roles.filter((r) => r.role !== role.role)
    : [...roles, role]
  roleSearch.value = ''
}

async function insertar(campo) {
  const key = foco.value === 'asunto' ? 'asunto' : 'mensaje'
  const el = key === 'asunto' ? asuntoEl.value : mensajeEl.value
  const result = insertarCampo(state[key], el?.selectionStart, campo.label)
  state[key] = result.text
  preview.value = null
  await nextTick()
  el?.focus()
  el?.setSelectionRange?.(result.cursor, result.cursor)
}

async function previsualizar() {
  previewing.value = true
  error.value = ''
  try {
    preview.value = await autoApi('vista_previa', { datos: datosAviso(state) })
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    previewing.value = false
  }
}

async function siguiente() {
  touched.value = true
  if (pendiente.value) return
  if (paso.value.key === 'confirmar') return crear()
  index.value++
  touched.value = false
  if (paso.value.key === 'confirmar' && !preview.value) previsualizar()
}

async function crear() {
  busy.value = true
  error.value = ''
  try {
    const row = await autoApi('crear_aviso', { datos: datosAviso(state) })
    toast.success('Listo: el aviso quedó encendido.')
    emit('created', row)
    open.value = false
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    busy.value = false
  }
}

watch(
  () => [state.asunto, state.mensaje, state.condicion?.valor, state.canal],
  () => {
    if (paso.value.key !== 'confirmar') preview.value = null
  },
)
watch(index, () => {
  error.value = ''
})
watch(
  open,
  (value) => {
    if (value && !tipos.value.length) loadTipos()
  },
  { immediate: true },
)
</script>
