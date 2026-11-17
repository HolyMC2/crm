<template>
  <!-- How the shop checks transfers (crm docs/DINERO_EN_ORDEN.md §3e): on or
       off, what the register does while one has not arrived, the owner's
       notice, and the CLABE of each account customers pay into. -->
  <BottomSheet
    :open="open"
    title="Transferencias de clientes"
    subtitle="Cómo revisa Muelle las transferencias que te mandan."
    layer="transferencias-ajustes"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-5 pb-2" data-transferencias-ajustes>
      <button
        type="button"
        role="switch"
        class="press flex min-h-12 w-full items-center gap-3 text-left"
        :aria-checked="Boolean(setup?.activo)"
        :disabled="busy"
        data-ajustes-activo
        @click="save({ activo: setup?.activo ? 0 : 1 })"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-base text-ink-gray-9">Revisar con Banxico</span>
          <span class="block text-sm text-ink-gray-6">En caja y en Muelle, antes o mientras se hace la venta.</span>
        </span>
        <span
          class="relative h-7 w-12 flex-none rounded-full transition-colors"
          :class="setup?.activo ? 'bg-[var(--muelle-accent)]' : 'bg-surface-gray-4'"
          aria-hidden="true"
        >
          <span
            class="absolute top-0.5 size-6 rounded-full bg-surface-base shadow transition-transform"
            :class="setup?.activo ? 'translate-x-5' : 'translate-x-0.5'"
          />
        </span>
      </button>

      <div :class="{ 'opacity-50': !setup?.activo }">
        <p class="text-sm font-medium text-ink-gray-7">Si aún no llega cuando la caja cobra</p>
        <Segmented
          class="mt-2"
          label="Si aún no llega"
          :model-value="setup?.politica"
          :options="[
            { value: 'dejar', label: 'Cobrar y avisarme' },
            { value: 'esperar', label: 'Esperar a que llegue' },
          ]"
          @update:model-value="save({ politica: $event })"
        />
        <p class="mt-2 text-sm text-ink-gray-6">
          {{
            setup?.politica === 'esperar'
              ? 'La caja no cobra hasta que Banxico o tu banco la confirman.'
              : 'La caja cobra y Muelle sigue buscando; si no llega en 30 minutos, te avisa.'
          }}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        class="press flex min-h-12 w-full items-center gap-3 text-left"
        :aria-checked="Boolean(setup?.avisar)"
        :disabled="busy"
        data-ajustes-avisar
        @click="save({ avisar: setup?.avisar ? 0 : 1 })"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-base text-ink-gray-9">Avisarme si una no llega</span>
          <span class="block text-sm text-ink-gray-6">En la campana de Muelle, con la venta.</span>
        </span>
        <span
          class="relative h-7 w-12 flex-none rounded-full transition-colors"
          :class="setup?.avisar ? 'bg-[var(--muelle-accent)]' : 'bg-surface-gray-4'"
          aria-hidden="true"
        >
          <span
            class="absolute top-0.5 size-6 rounded-full bg-surface-base shadow transition-transform"
            :class="setup?.avisar ? 'translate-x-5' : 'translate-x-0.5'"
          />
        </span>
      </button>

      <section>
        <h3 class="text-sm font-semibold text-ink-gray-7">Cuentas que reciben</h3>
        <ul class="mt-2 divide-y divide-outline-gray-1 rounded-7 border border-outline-gray-2">
          <li
            v-for="c in setup?.cuentas || []"
            :key="c.bank_account"
            class="flex min-h-12 items-center gap-3 px-3 py-2"
            :data-ajustes-cuenta="c.bank_account"
          >
            <span class="lucide-circle-check size-5 flex-none text-ink-green-7" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="block break-words text-base text-ink-gray-9">{{ c.nombre }}</span>
              <span class="block text-sm text-ink-gray-6">{{ c.banco }} · CLABE {{ c.ultimos }}</span>
            </span>
          </li>
          <li
            v-for="c in setup?.sin_clabe || []"
            :key="c.bank_account"
            class="px-3 py-2"
            :data-ajustes-sin-clabe="c.bank_account"
          >
            <div class="flex min-h-10 items-center gap-3">
              <span class="lucide-circle-dashed size-5 flex-none text-ink-gray-5" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block break-words text-base text-ink-gray-9">{{ c.nombre }}</span>
                <span class="block text-sm text-ink-gray-6">Sin CLABE: no recibe transferencias</span>
              </span>
              <button
                v-if="editing !== c.bank_account"
                type="button"
                class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
                :aria-label="`Agregar la CLABE de ${c.nombre}`"
                :title="`Agregar la CLABE de ${c.nombre}`"
                @click="startEdit(c.bank_account)"
              >
                <span class="lucide-pencil size-5" aria-hidden="true" />
              </button>
            </div>
            <form
              v-if="editing === c.bank_account"
              class="mt-2 space-y-2"
              @submit.prevent="saveClabe(c.bank_account)"
            >
              <input
                v-model="clabeText"
                inputmode="numeric"
                autocomplete="off"
                class="num min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base tracking-wide text-ink-gray-9"
                placeholder="18 dígitos"
                aria-label="CLABE"
                data-ajustes-clabe
              />
              <p class="text-sm" :class="clabeHint.tone">{{ clabeHint.text }}</p>
              <div class="flex gap-2">
                <Button class="min-h-11 flex-1" label="Cancelar" @click="editing = ''" />
                <Button
                  class="min-h-11 flex-1"
                  variant="solid"
                  label="Guardar CLABE"
                  :disabled="!clabeOk"
                  :loading="busy"
                  data-ajustes-guardar-clabe
                  @click="saveClabe(c.bank_account)"
                />
              </div>
            </form>
          </li>
        </ul>
        <p v-if="!(setup?.cuentas || []).length" class="mt-2 text-sm text-ink-gray-6">
          Agrega la CLABE de la cuenta donde tus clientes te transfieren; está en la app de tu banco.
        </p>
        <!-- A shop with no bank account yet adds the one customers pay into, from its CLABE. -->
        <button
          v-if="!adding"
          type="button"
          class="press mt-2 flex min-h-11 items-center gap-2 text-sm font-medium text-ink-gray-8"
          data-ajustes-nueva-cuenta
          @click="startAdd()"
        >
          <span class="lucide-plus size-5" aria-hidden="true" />
          {{ (setup?.cuentas || []).length || (setup?.sin_clabe || []).length ? 'Agregar otra cuenta' : 'Agregar la cuenta donde te transfieren' }}
        </button>
        <form v-else class="mt-2 space-y-2 rounded-7 border border-outline-gray-2 p-3" @submit.prevent="addAccount()">
          <label class="block text-sm font-medium text-ink-gray-7" for="ajustes-nueva-nombre">Nombre</label>
          <input
            id="ajustes-nueva-nombre"
            v-model="nueva.nombre"
            autocomplete="off"
            class="min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
            placeholder="Por ejemplo, BBVA de la tienda"
          />
          <label class="block text-sm font-medium text-ink-gray-7" for="ajustes-nueva-clabe">CLABE</label>
          <input
            id="ajustes-nueva-clabe"
            v-model="clabeText"
            inputmode="numeric"
            autocomplete="off"
            class="num min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base tracking-wide text-ink-gray-9"
            placeholder="18 dígitos"
            data-ajustes-nueva-clabe
          />
          <p class="text-sm" :class="clabeHint.tone">{{ clabeHint.text }}</p>
          <div class="flex gap-2">
            <Button class="min-h-11 flex-1" label="Cancelar" @click="adding = false" />
            <Button
              class="min-h-11 flex-1"
              variant="solid"
              label="Agregar cuenta"
              :disabled="!clabeOk"
              :loading="busy"
              data-ajustes-agregar
              @click="addAccount()"
            />
          </div>
        </form>
      </section>

      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">{{ problem }}</p>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import { errorText } from '@/components/bancos/bancos'
import { clabeEnGrupos, clabeValida, transferenciasApi } from '@/components/dinero/transferencias'

defineProps({
  open: { type: Boolean, default: false },
  setup: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'update:setup'])

const busy = ref(false)
const problem = ref('')
const editing = ref('')
const clabeText = ref('')
const adding = ref(false)
const nueva = ref({ nombre: '' })

const clabeDigits = computed(() => clabeText.value.replace(/\D/g, ''))
const clabeOk = computed(() => clabeValida(clabeDigits.value))
const clabeHint = computed(() => {
  const n = clabeDigits.value.length
  if (!n) return { text: 'Está en la app de tu banco, en los datos de la cuenta.', tone: 'text-ink-gray-6' }
  if (n < 18) return { text: `${clabeEnGrupos(clabeDigits.value)} · faltan ${18 - n}`, tone: 'text-ink-gray-6' }
  if (n > 18) return { text: 'Una CLABE tiene 18 dígitos.', tone: 'text-ink-red-7' }
  return clabeOk.value
    ? { text: `${clabeEnGrupos(clabeDigits.value)} · correcta`, tone: 'text-ink-green-7' }
    : { text: 'El último dígito no cuadra: revisa la CLABE.', tone: 'text-ink-red-7' }
})

function startEdit(name) {
  adding.value = false
  editing.value = name
  clabeText.value = ''
}

function startAdd() {
  editing.value = ''
  adding.value = true
  clabeText.value = ''
  nueva.value = { nombre: '' }
}

async function addAccount() {
  if (!clabeOk.value) return
  busy.value = true
  problem.value = ''
  try {
    emit('update:setup', await transferenciasApi('nueva_cuenta', { numero: clabeDigits.value, nombre: nueva.value.nombre }))
    adding.value = false
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = false
  }
}

async function save(changes) {
  busy.value = true
  problem.value = ''
  try {
    emit('update:setup', await transferenciasApi('guardar_ajustes', changes))
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = false
  }
}

async function saveClabe(bankAccount) {
  if (!clabeOk.value) return
  busy.value = true
  problem.value = ''
  try {
    emit('update:setup', await transferenciasApi('guardar_clabe', { bank_account: bankAccount, numero: clabeDigits.value }))
    editing.value = ''
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = false
  }
}

</script>
