<template>
  <!-- Add a caja to a store, or change its setup (register_foundation
       create_register / configure_register). It asks only what the server
       needs: a name, a code, the POS profile it sells with and, for a cash
       caja, the drawer's own cash account. New cajas start as drafts. -->
  <BottomSheet
    :open="open"
    :title="caja ? `Configurar ${caja.label}` : 'Nueva caja'"
    :subtitle="storeName"
    :dismissible="!busy"
    data-efectivo-caja-sheet
    @update:open="(v) => !busy && $emit('update:open', v)"
  >
    <div class="space-y-4 pb-2">
      <p
        v-if="caja?.work_state === 'Open'"
        class="rounded-6 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-7"
      >
        Tiene turno abierto: el perfil y la cuenta del cajón cambian en su
        próxima apertura.
      </p>
      <p
        v-if="loadError"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ loadError }}
        <button type="button" class="font-medium underline" @click="load">
          Reintentar
        </button>
      </p>

      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7"
          >Nombre que reconoce el equipo</span
        >
        <input
          v-model.trim="form.label"
          maxlength="120"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          placeholder="Caja mostrador"
          :disabled="busy"
          data-field="label"
        />
      </label>
      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7">Código corto</span>
        <input
          v-model.trim="form.register_code"
          maxlength="32"
          autocapitalize="characters"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          placeholder="CAJA1"
          :disabled="busy || !!caja"
          data-field="register_code"
        />
        <span class="block text-xs text-ink-gray-6">{{
          caja
            ? 'El código no cambia después de crear la caja.'
            : 'Letras, números, guion o guion bajo. No se reutiliza después de vender.'
        }}</span>
      </label>

      <Segmented
        v-model="form.mode"
        label="Tipo de caja"
        :options="[
          { value: 'Cash', label: 'Con cajón de efectivo' },
          { value: 'Cashless', label: 'Sin efectivo' },
        ]"
      />

      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7">Perfil de POS</span>
        <select
          v-model="form.pos_profile"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          :disabled="busy || !options"
          data-field="pos_profile"
        >
          <option value="" disabled>Elige un perfil</option>
          <option v-for="p in options?.profiles || []" :key="p" :value="p">
            {{ p }}
          </option>
        </select>
        <span
          v-if="options && !options.profiles.length"
          class="block text-sm text-ink-gray-7"
        >
          La tienda no tiene perfiles de POS permitidos. Agrégalos en la
          configuración de la tienda.
        </span>
      </label>

      <div v-if="form.mode === 'Cash'" class="space-y-1">
        <label
          for="efectivo-caja-drawer"
          class="text-sm font-medium text-ink-gray-7"
          >Cuenta de efectivo del cajón</label
        >
        <select
          id="efectivo-caja-drawer"
          v-model="form.drawer_account"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          :disabled="busy || !options"
          data-field="drawer_account"
        >
          <option value="" disabled>Elige la cuenta propia del cajón</option>
          <option
            v-for="a in options?.drawer_accounts || []"
            :key="a.name"
            :value="a.name"
            :disabled="taken(a)"
          >
            {{ a.account_name || a.name }}{{ taken(a) ? ' · ya en uso' : '' }}
          </option>
        </select>
        <span class="block text-xs text-ink-gray-6">
          Cada caja con efectivo necesita una cuenta solo suya. Las que ya usa
          otra caja, caja fuerte o forma de pago no se pueden elegir.
        </span>
        <button
          v-if="form.pos_profile && !freeAccounts"
          type="button"
          class="press inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-8"
          :disabled="busy || creatingAccount"
          data-efectivo-create-drawer
          @click="newAccount"
        >
          <span class="lucide-plus size-4" aria-hidden="true" />
          {{ creatingAccount ? 'Creando…' : 'Crear su propia cuenta' }}
        </button>
      </div>

      <label
        class="flex items-start gap-3 rounded-6 bg-surface-gray-1 px-3 py-3"
      >
        <input
          v-model="form.requires_enrolled_device"
          type="checkbox"
          class="mt-0.5 size-5 flex-none rounded"
          :disabled="busy"
        />
        <span class="text-base text-ink-gray-9">
          Solo un dispositivo conectado puede abrirla
          <span class="block text-sm text-ink-gray-6">{{
            form.requires_enrolled_device
              ? 'Una persona supervisora conecta cada dispositivo con un código de un solo uso.'
              : 'Cualquier persona cajera de la tienda la abre desde su navegador.'
          }}</span>
        </span>
      </label>
      <p v-if="!caja" class="text-sm text-ink-gray-6">
        Las cajas nuevas empiezan por configurar: conecta su dispositivo y
        actívala cuando tenga todo.
      </p>
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
        :label="busy ? 'Guardando…' : caja ? 'Guardar cambios' : 'Crear caja'"
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
import { BottomSheet, Segmented } from '@/components/ui'
import {
  configureCaja,
  createCaja,
  createDrawerAccount,
  setupOptions,
} from './cajas'
import { errorText } from './efectivo'

const props = defineProps({
  open: { type: Boolean, default: false },
  store: { type: String, required: true },
  storeName: { type: String, default: '' },
  /** The caja's detail when configuring; null adds a new one. */
  caja: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'saved'])

const options = ref(null)
const loadError = ref('')
const error = ref('')
const busy = ref(false)
const creatingAccount = ref(false)
const form = reactive({})
let send = null

const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/

function reset() {
  const c = props.caja
  Object.assign(form, {
    label: c?.label || '',
    register_code: c?.register_code || '',
    mode: c?.mode || 'Cash',
    pos_profile: c?.pos_profile || '',
    drawer_account: c?.drawer_account || '',
    requires_enrolled_device: c ? !!c.requires_enrolled_device : true,
  })
  error.value = ''
  send = c ? configureCaja() : createCaja()
}

async function load() {
  loadError.value = ''
  try {
    options.value = await setupOptions(props.store)
  } catch (e) {
    loadError.value = errorText(e)
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    reset()
    load()
  },
  { immediate: true },
)

/** An account another drawer, safe or payment method already posts to. */
const taken = (a) =>
  (a.conflicts || []).length > 0 && a.name !== props.caja?.drawer_account
const freeAccounts = computed(
  () => (options.value?.drawer_accounts || []).filter((a) => !taken(a)).length,
)

const missing = computed(() => {
  if (!form.label) return 'Escribe el nombre de la caja.'
  if (!props.caja && !CODE.test(form.register_code || ''))
    return 'Escribe un código corto: letras, números, guion o guion bajo.'
  if (!form.pos_profile) return 'Elige el perfil de POS.'
  if (form.mode === 'Cash' && !form.drawer_account)
    return 'Elige la cuenta de efectivo del cajón.'
  return ''
})

async function newAccount() {
  creatingAccount.value = true
  error.value = ''
  try {
    const { account } = await createDrawerAccount(props.store, form.pos_profile)
    await load()
    form.drawer_account = account
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    creatingAccount.value = false
  }
}

function values() {
  const out = {
    label: form.label,
    pos_profile: form.pos_profile,
    mode: form.mode,
    drawer_account: form.mode === 'Cash' ? form.drawer_account : null,
    requires_enrolled_device: form.requires_enrolled_device ? 1 : 0,
  }
  if (!props.caja) return { ...out, register_code: form.register_code }
  // Only what changed: an unchanged field never bumps the caja's setup.
  const before = props.caja
  return Object.fromEntries(
    Object.entries(out).filter(([key, value]) =>
      key === 'requires_enrolled_device'
        ? Boolean(value) !== Boolean(before[key])
        : (value || null) !== (before[key] || null),
    ),
  )
}

async function save() {
  busy.value = true
  error.value = ''
  try {
    const changes = values()
    const result =
      props.caja && !Object.keys(changes).length
        ? props.caja
        : props.caja
          ? await send(props.caja, changes)
          : await send(props.store, changes)
    emit('saved', result)
    emit('update:open', false)
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    busy.value = false
  }
}
</script>
