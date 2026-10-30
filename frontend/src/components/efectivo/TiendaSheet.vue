<template>
  <!-- A store: the place whose cajas share a business day and a safe
       (register_foundation create_store / update_store). Its permitted POS
       profiles decide which profiles its cajas may sell with. -->
  <BottomSheet
    :open="open"
    :title="store ? `Configurar ${store.store_name}` : 'Nueva tienda'"
    :dismissible="!busy"
    data-efectivo-tienda-sheet
    @update:open="(v) => !busy && $emit('update:open', v)"
  >
    <div class="space-y-4 pb-2">
      <label v-if="!store && companies.length > 1" class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7">Empresa</span>
        <select
          v-model="form.company"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          :disabled="busy"
        >
          <option v-for="c in companies" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7"
          >Nombre de la tienda</span
        >
        <input
          v-model.trim="form.store_name"
          maxlength="120"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          placeholder="Centro"
          :disabled="busy"
          data-field="store_name"
        />
      </label>
      <label v-if="!store" class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7">Código corto</span>
        <input
          v-model.trim="form.store_code"
          maxlength="32"
          autocapitalize="characters"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          placeholder="CENTRO"
          :disabled="busy"
          data-field="store_code"
        />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block min-w-0 space-y-1">
          <span class="text-sm font-medium text-ink-gray-7">Zona horaria</span>
          <input
            v-model.trim="form.timezone"
            maxlength="64"
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
            :disabled="busy"
            data-field="timezone"
          />
        </label>
        <label v-if="!store" class="block min-w-0 space-y-1">
          <span class="text-sm font-medium text-ink-gray-7"
            >El día empieza a las</span
          >
          <input
            v-model="form.business_day_cutoff"
            type="time"
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
            :disabled="busy"
          />
        </label>
      </div>
      <fieldset class="space-y-1">
        <legend class="text-sm font-medium text-ink-gray-7">
          Perfiles de POS que pueden usar sus cajas
        </legend>
        <p v-if="profilesError" role="alert" class="text-sm text-ink-red-7">
          {{ profilesError }}
        </p>
        <p
          v-else-if="profilesLoaded && !profiles.length"
          class="text-sm text-ink-gray-7"
        >
          La empresa no tiene perfiles de POS activos todavía.
        </p>
        <label
          v-for="p in profiles"
          :key="p"
          class="flex min-h-11 items-center gap-3"
        >
          <input
            v-model="form.profiles"
            type="checkbox"
            class="size-5 flex-none rounded"
            :value="p"
            :disabled="busy"
          />
          <span class="text-base text-ink-gray-9">{{ p }}</span>
        </label>
      </fieldset>
    </div>
    <template #actions>
      <p
        v-if="error"
        role="alert"
        class="mb-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-efectivo-error
      >
        {{ error }}
      </p>
      <Button
        variant="solid"
        size="lg"
        class="w-full"
        :label="
          busy ? 'Guardando…' : store ? 'Guardar cambios' : 'Crear tienda'
        "
        :disabled="busy || !!missing"
        data-efectivo-confirm
        @click="save"
      />
      <p v-if="missing" class="mt-2 text-center text-sm text-ink-gray-6">
        {{ missing }}
      </p>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import {
  companyProfiles,
  createStore,
  setupOptions,
  updateStore,
} from './cajas'
import { errorText } from './efectivo'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The store row (list_stores) when configuring; null creates one. */
  store: { type: Object, default: null },
  /** Companies this worker may create stores in (list_stores.can_create_in). */
  companies: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:open', 'saved'])

const form = reactive({ profiles: [] })
const profiles = ref([])
const profilesLoaded = ref(false)
const profilesError = ref('')
const before = ref([])
const error = ref('')
const busy = ref(false)
let send = null

const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/
// The worker's own zone is the likely one; the store keeps what is typed.
const localZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    const s = props.store
    Object.assign(form, {
      company: s?.company || props.companies[0] || '',
      store_name: s?.store_name || '',
      store_code: s?.store_code || '',
      timezone: s?.timezone || localZone(),
      business_day_cutoff: '00:00',
      profiles: [],
    })
    error.value = ''
    send = s ? updateStore() : createStore()
    await loadProfiles()
  },
  { immediate: true },
)
watch(
  () => form.company,
  () => props.open && !props.store && loadProfiles(),
)

async function loadProfiles() {
  profilesLoaded.value = false
  profilesError.value = ''
  try {
    const company = form.company
    const [all, current] = await Promise.all([
      company ? companyProfiles(company) : [],
      props.store ? setupOptions(props.store.name) : null,
    ])
    before.value = current?.profiles || []
    if (props.store) form.profiles = [...before.value]
    // A permitted profile that is disabled now still shows, so it can be removed.
    profiles.value = [...new Set([...all, ...before.value])]
  } catch (e) {
    profilesError.value = errorText(e)
  } finally {
    profilesLoaded.value = true
  }
}

const missing = computed(() => {
  if (!props.store && !form.company)
    return 'No puedes crear tiendas en ninguna empresa.'
  if (!form.store_name) return 'Escribe el nombre de la tienda.'
  if (!props.store && !CODE.test(form.store_code || ''))
    return 'Escribe un código corto: letras, números, guion o guion bajo.'
  if (!form.timezone) return 'Escribe la zona horaria.'
  return ''
})

async function save() {
  busy.value = true
  error.value = ''
  try {
    let result
    if (props.store) {
      const values = {}
      if (form.store_name !== props.store.store_name)
        values.store_name = form.store_name
      if (form.timezone !== props.store.timezone)
        values.timezone = form.timezone
      const same =
        form.profiles.length === before.value.length &&
        form.profiles.every((p) => before.value.includes(p))
      if (!same) values.profiles = [...form.profiles]
      result = Object.keys(values).length
        ? await send(props.store, values)
        : props.store
    } else {
      result = await send({
        company: form.company,
        store_name: form.store_name,
        store_code: form.store_code,
        timezone: form.timezone,
        business_day_cutoff: `${form.business_day_cutoff || '00:00'}:00`,
        profiles: form.profiles,
      })
    }
    emit('saved', result)
    emit('update:open', false)
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    busy.value = false
  }
}
</script>
