<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- A sub-page of Contactos: up to the list in the one bar (Shell S4.2). -->
    <AppBar
      v-if="isPhone"
      :back="{ name: 'Contactos' }"
      back-label="Contactos"
      context="Contactos"
      :title="__('En los teléfonos')"
    />
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-2xl px-4 pb-12 pt-4 sm:px-6">
        <nav v-if="!isPhone" class="mb-3">
          <RouterLink
            :to="{ name: 'Contactos' }"
            class="press flex min-h-11 w-fit items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          >
            <span class="lucide-arrow-left size-4" aria-hidden="true" />
            {{ __('Volver a Contactos') }}
          </RouterLink>
        </nav>
        <h1
          v-if="!isPhone"
          class="title-face break-words text-2xl font-semibold text-ink-gray-9 [text-wrap:balance]"
        >
          {{ __('Contactos en los teléfonos') }}
        </h1>
        <p class="mb-5 text-sm text-ink-gray-6">
          {{
            __(
              'Los teléfonos de la tienda muestran el nombre de quien llama, también en WhatsApp. Los contactos llegan de solo lectura y se actualizan solos.',
            )
          }}
        </p>

        <section v-if="failure" role="alert" class="space-y-3 py-4">
          <p class="text-base text-ink-gray-8">{{ failure }}</p>
          <button type="button" :class="SECONDARY" @click="load">
            {{ __('Volver a intentar') }}
          </button>
        </section>
        <p
          v-else-if="!state"
          role="status"
          class="flex items-center gap-2 py-10 text-sm text-ink-gray-6"
        >
          <span
            class="lucide-loader-circle size-4 animate-spin"
            aria-hidden="true"
          />
          {{ __('Abriendo los contactos de los teléfonos…') }}
        </p>
        <section
          v-else-if="!state.can_manage"
          role="status"
          class="space-y-2 py-4"
          data-testid="telefonos-solo-dueno"
        >
          <p class="text-base text-ink-gray-8">
            {{
              state.enabled
                ? __('Está encendido en esta tienda.')
                : __('Todavía no está encendido en esta tienda.')
            }}
          </p>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Pídele al dueño o al encargado que agregue tu teléfono desde aquí.',
              )
            }}
          </p>
        </section>

        <template v-else>
          <div :class="SWITCH_ROW" data-testid="telefonos-encendido">
            <div class="min-w-0 flex-1">
              <p class="text-base font-medium text-ink-gray-9">
                {{ __('Mandar contactos a los teléfonos') }}
              </p>
              <p class="text-sm text-ink-gray-6">
                {{
                  state.enabled
                    ? __(
                        'Hasta {0} contactos van a los teléfonos que agregues.',
                        [formatQty(total)],
                      )
                    : __('Apagado: ningún teléfono recibe contactos.')
                }}
              </p>
            </div>
            <AjustesSwitch
              :model-value="state.enabled"
              :label="__('Mandar contactos a los teléfonos')"
              @update:model-value="save({ enabled: $event })"
            />
          </div>
          <p v-if="problem" role="alert" class="mt-1 text-sm text-ink-red-6">
            {{ problem }}
          </p>

          <h2 :class="HEADING">{{ __('¿Qué contactos van?') }}</h2>
          <div class="divide-y divide-outline-gray-1">
            <div
              v-for="kind in kinds"
              :key="kind.key"
              :class="SWITCH_ROW"
              :data-kind="kind.key"
            >
              <div class="min-w-0 flex-1">
                <p class="text-base text-ink-gray-9">{{ __(kind.label) }}</p>
                <p class="num text-sm text-ink-gray-6">
                  {{ __('{0} con teléfono', [formatQty(kind.count)]) }}
                </p>
              </div>
              <AjustesSwitch
                :model-value="kind.included"
                :label="__(kind.label)"
                @update:model-value="save({ [kind.key]: $event })"
              />
            </div>
          </div>

          <h2 :class="HEADING">{{ __('Al nombre agrega') }}</h2>
          <Segmented
            :model-value="state.name_suffix"
            :options="suffixOptions"
            :label="__('Al nombre agrega')"
            @update:model-value="save({ name_suffix: $event })"
          />
          <p class="mt-2 text-sm text-ink-gray-6" data-testid="telefonos-vista">
            {{ __('Así se ve al llamar: {0}', [preview]) }}
          </p>

          <h2 :class="HEADING">{{ __('Teléfonos') }}</h2>
          <p
            v-if="!state.phones.length"
            class="py-2 text-sm text-ink-gray-6"
            data-testid="telefonos-vacio"
          >
            {{
              __(
                'Todavía no hay teléfonos. Agrega el de la tienda: tardas un minuto.',
              )
            }}
          </p>
          <ul v-else class="divide-y divide-outline-gray-1">
            <li
              v-for="phone in state.phones"
              :key="phone.name"
              class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2"
              :data-phone="phone.name"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-base text-ink-gray-9">
                  {{ phone.label }}
                  <span class="text-sm text-ink-gray-6">
                    · {{ platformLabel(phone.platform) }}</span
                  >
                </p>
                <p class="text-sm text-ink-gray-6">{{ phoneStatus(phone) }}</p>
              </div>
              <div class="flex flex-none items-center gap-2">
                <button
                  type="button"
                  :class="ICON"
                  :disabled="busy"
                  :aria-label="
                    __('Volver a generar el código de {0}', [phone.label])
                  "
                  :title="
                    __('Volver a generar el código de {0}', [phone.label])
                  "
                  @click="renew(phone)"
                >
                  <span class="lucide-qr-code size-4" aria-hidden="true" />
                </button>
                <button
                  v-if="removing !== phone.name"
                  type="button"
                  :class="ICON"
                  :aria-label="__('Quitar {0}', [phone.label])"
                  :title="__('Quitar {0}', [phone.label])"
                  @click="removing = phone.name"
                >
                  <span class="lucide-trash-2 size-4" aria-hidden="true" />
                </button>
                <button
                  v-else
                  type="button"
                  :class="DANGER"
                  :disabled="busy"
                  data-testid="telefonos-quitar"
                  @click="remove(phone)"
                >
                  {{ __('Quitar') }}
                </button>
              </div>
            </li>
          </ul>
          <button
            type="button"
            :class="[PRIMARY, 'mt-4']"
            data-testid="telefonos-agregar"
            @click="openAdd"
          >
            <span class="lucide-plus size-4" aria-hidden="true" />
            {{ __('Agregar teléfono') }}
          </button>
          <p v-if="!state.enabled" class="mt-2 text-sm text-ink-gray-6">
            {{
              __(
                'Puedes agregarlo ya; recibe los contactos cuando enciendas el envío.',
              )
            }}
          </p>
        </template>
      </div>
    </div>

    <BottomSheet
      v-model:open="sheetOpen"
      :title="
        setup ? __('Listo para {0}', [setup.label]) : __('Agregar teléfono')
      "
      :dismissible="!busy"
    >
      <form
        v-if="!setup"
        id="telefono-nuevo"
        class="space-y-4"
        @submit.prevent="add"
      >
        <label class="block">
          <span class="mb-1 block text-sm text-ink-gray-7">
            {{ __('¿Cómo le llamas?') }}
          </span>
          <input
            v-model="draft.label"
            :class="FIELD"
            maxlength="80"
            :placeholder="__('Mostrador')"
            autocomplete="off"
            enterkeyhint="done"
          />
        </label>
        <div>
          <span class="mb-1 block text-sm text-ink-gray-7">
            {{ __('¿Qué teléfono es?') }}
          </span>
          <Segmented
            v-model="draft.platform"
            :options="platformOptions"
            :label="__('¿Qué teléfono es?')"
          />
        </div>
        <p v-if="sheetProblem" role="alert" class="text-sm text-ink-red-6">
          {{ sheetProblem }}
        </p>
      </form>

      <div v-else class="space-y-4" data-testid="telefonos-listo">
        <template v-if="setup.platform === 'iphone'">
          <ol class="list-decimal space-y-1 pl-5 text-base text-ink-gray-8">
            <li>
              {{ __('En el iPhone abre la cámara y apunta a este código.') }}
            </li>
            <li>{{ __('Toca el aviso y permite descargar el perfil.') }}</li>
            <li>
              {{ __('Abre Configuración › Perfil descargado › Instalar.') }}
            </li>
          </ol>
        </template>
        <template v-else-if="setup.platform === 'android'">
          <ol class="list-decimal space-y-1 pl-5 text-base text-ink-gray-8">
            <li>
              {{ __('Instala DAVx⁵ en el teléfono:') }}
              <a
                :href="DAVX5_PLAY"
                target="_blank"
                rel="noopener"
                :class="LINK"
              >
                {{ __('Play Store') }}
              </a>
              {{ __('o') }}
              <a
                :href="DAVX5_FDROID"
                target="_blank"
                rel="noopener"
                :class="LINK"
              >
                {{ __('F-Droid, sin costo') }}
              </a>
            </li>
            <li>
              {{ __('Abre la cámara del teléfono y apunta a este código.') }}
            </li>
            <li>{{ __('En DAVx⁵ toca Entrar y elige los contactos.') }}</li>
          </ol>
        </template>
        <img
          v-if="setup.qr"
          :src="setup.qr"
          :alt="__('Código para configurar {0}', [setup.label])"
          class="mx-auto size-56 rounded-8 bg-white p-2"
        />
        <a
          v-if="setup.link && device === setup.platform"
          :href="setup.link"
          :class="[PRIMARY, 'w-full']"
        >
          {{
            setup.platform === 'iphone'
              ? __('Instalar en este iPhone')
              : __('Abrir en DAVx⁵')
          }}
        </a>
        <dl
          v-if="setup.password"
          class="space-y-2 rounded-8 bg-surface-gray-1 p-3 text-sm"
          data-testid="telefonos-datos"
        >
          <p v-if="setup.platform === 'other'" class="text-ink-gray-8">
            {{
              __(
                'Agrega una cuenta CardDAV en la app de contactos con estos datos:',
              )
            }}
          </p>
          <div v-for="row in credentialRows" :key="row.key">
            <dt class="text-ink-gray-6">{{ row.label }}</dt>
            <dd class="flex items-center gap-2">
              <code class="min-w-0 flex-1 break-all text-ink-gray-9">{{
                row.value
              }}</code>
              <button
                type="button"
                class="press inline-flex size-11 flex-none items-center justify-center rounded-8 text-ink-gray-7 hover:bg-surface-gray-2"
                :aria-label="__('Copiar {0}', [row.label])"
                :title="__('Copiar {0}', [row.label])"
                @click="copy(row.value)"
              >
                <span class="lucide-copy size-4" aria-hidden="true" />
              </button>
            </dd>
          </div>
        </dl>
        <p class="text-sm text-ink-gray-6">
          {{
            setup.platform === 'iphone'
              ? __(
                  'El código sirve una vez y vence en {0} minutos. Si no alcanzas, genera otro con el ícono de código junto al teléfono.',
                  [setup.expires_in_minutes],
                )
              : __(
                  'La contraseña solo se ve ahora. Si la pierdes, genera otra con el ícono de código junto al teléfono; la anterior deja de servir.',
                )
          }}
        </p>
      </div>

      <template #actions>
        <template v-if="!setup">
          <button
            type="button"
            :class="SECONDARY"
            :disabled="busy"
            @click="sheetOpen = false"
          >
            {{ __('Cancelar') }}
          </button>
          <button
            type="submit"
            form="telefono-nuevo"
            :class="PRIMARY"
            :disabled="busy"
          >
            {{ __('Agregar teléfono') }}
          </button>
        </template>
        <button
          v-else
          type="button"
          :class="PRIMARY"
          @click="sheetOpen = false"
        >
          {{ __('Listo') }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'frappe-ui'
import { AppBar, BottomSheet, Segmented } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { telefonosApi } from '@/composables/useContactos'
import { formatQty } from '@/utils/display'
import { errorText } from '@/utils/errorText'
import {
  DAVX5_FDROID,
  DAVX5_PLAY,
  PLATFORMS,
  SUFFIXES,
  availableKinds,
  chosenCount,
  currentDevice,
  namePreview,
  phoneStatus,
  platformLabel,
} from '@/utils/contactosTelefonos'

const HEADING = 'title-face mb-1 mt-7 text-base font-semibold text-ink-gray-9'
const SWITCH_ROW = 'flex min-h-14 items-center gap-3 py-2'
const FIELD =
  'h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 sm:h-10'
const LINK = 'font-medium text-ink-gray-9 underline'
const ICON =
  'press inline-flex size-11 items-center justify-center rounded-8 text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50'
const PRIMARY =
  'press inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-8 bg-[var(--muelle-accent)] px-5 text-base font-semibold text-[var(--muelle-accent-ink)] disabled:opacity-50'
const SECONDARY =
  'press inline-flex min-h-11 items-center justify-center rounded-8 bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-50'
const DANGER =
  'press inline-flex min-h-11 items-center justify-center rounded-8 bg-surface-red-2 px-4 text-base font-semibold text-ink-red-7 disabled:opacity-50'

const state = ref(null)
const failure = ref('')
const problem = ref('')
const busy = ref(false)
const removing = ref('')
const sheetOpen = ref(false)
const sheetProblem = ref('')
const setup = ref(null)
const draft = reactive({ label: '', platform: 'android' })
const device = currentDevice(
  typeof navigator === 'undefined' ? '' : navigator.userAgent,
)

const kinds = computed(() => availableKinds(state.value))
const total = computed(() => chosenCount(state.value))
const preview = computed(() =>
  namePreview(state.value?.name_suffix, state.value?.shop),
)
const suffixOptions = SUFFIXES.map((o) => ({ ...o, label: __(o.label) }))
const platformOptions = PLATFORMS.map((o) => ({ ...o, label: __(o.label) }))
const credentialRows = computed(() =>
  setup.value?.password
    ? [
        { key: 'server', label: __('Servidor'), value: setup.value.server },
        { key: 'login', label: __('Usuario'), value: setup.value.login },
        {
          key: 'password',
          label: __('Contraseña'),
          value: setup.value.password,
        },
      ]
    : [],
)

async function load() {
  failure.value = ''
  try {
    state.value = await telefonosApi('get_state')
  } catch (error) {
    failure.value = errorText(
      error,
      __('No pude abrir los contactos de los teléfonos.'),
    )
  }
}

async function save(change) {
  problem.value = ''
  const before = state.value
  // What the owner tapped shows at once; a refusal puts it back and says why.
  state.value = {
    ...before,
    ...change,
    kinds: before.kinds.map((kind) =>
      kind.key in change ? { ...kind, included: change[kind.key] } : kind,
    ),
  }
  try {
    state.value = await telefonosApi('save_settings', {
      settings_data: JSON.stringify(change),
    })
  } catch (error) {
    state.value = before
    problem.value = errorText(error, __('No pude guardar el cambio.'))
  }
}

function openAdd() {
  setup.value = null
  sheetProblem.value = ''
  draft.label = ''
  draft.platform = device || 'android'
  sheetOpen.value = true
}

async function add() {
  if (busy.value) return
  if (!draft.label.trim()) {
    sheetProblem.value = __(
      'Ponle nombre al teléfono, por ejemplo «Mostrador» o «Celular de Ana».',
    )
    return
  }
  busy.value = true
  sheetProblem.value = ''
  try {
    setup.value = await telefonosApi('add_phone', {
      label: draft.label.trim(),
      platform: draft.platform,
    })
    await load()
  } catch (error) {
    sheetProblem.value = errorText(error, __('No pude agregar el teléfono.'))
  } finally {
    busy.value = false
  }
}

async function renew(phone) {
  busy.value = true
  problem.value = ''
  try {
    setup.value = await telefonosApi('renew_phone', { name: phone.name })
    sheetOpen.value = true
    await load()
  } catch (error) {
    problem.value = errorText(error, __('No pude generar el código.'))
  } finally {
    busy.value = false
  }
}

async function remove(phone) {
  busy.value = true
  problem.value = ''
  try {
    await telefonosApi('remove_phone', { name: phone.name })
    toast.success(
      __(
        'Quitaste {0}. Ya no recibe cambios; para borrar los contactos que tiene, borra la cuenta en ese teléfono.',
        [phone.label],
      ),
    )
    await load()
  } catch (error) {
    problem.value = errorText(error, __('No pude quitar el teléfono.'))
  } finally {
    busy.value = false
    removing.value = ''
  }
}

async function copy(value) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(__('Copiado'))
  } catch {
    toast.error(__('No pude copiarlo; selecciónalo y cópialo a mano.'))
  }
}

// The one-time password leaves the screen with the sheet.
watch(sheetOpen, (open) => {
  if (!open) setup.value = null
})

onMounted(load)
</script>
