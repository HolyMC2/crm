<template>
  <!-- «Contactos» (capability «contacts»): who else receives Muelle's emails,
       by kind. The owner's address receives all of them; each kind lists the
       addresses added to it with where they stand, a bin that asks once more
       in place, and «Agregar correo» while there is room. Billing and
       technical notices can be paused for the contacts; account notices
       always go out. Rows and rules. -->
  <section aria-labelledby="cuenta-contactos" data-testid="cuenta-contactos">
    <h2
      id="cuenta-contactos"
      class="title-face pb-1 text-xl font-semibold text-ink-gray-9"
    >
      {{ __('Contacts', null, 'Cuenta') }}
    </h2>
    <p class="text-sm text-ink-gray-6">
      {{
        __(
          'Who else receives Muelle’s emails about your account.',
          null,
          'Cuenta',
        )
      }}
    </p>
    <!-- The address moves to the next line whole rather than split at a hyphen. -->
    <p
      v-if="view?.owner"
      class="pt-1 text-sm text-ink-gray-7"
      data-testid="contactos-dueno"
    >
      {{ ownerLine.before
      }}<span class="inline-block max-w-full [overflow-wrap:anywhere]"
        ><template v-for="(part, i) in emailBreaks(view.owner)" :key="i"
          >{{ part }}<wbr /></template
        >{{ ownerLine.after }}</span
      >
    </p>

    <p
      v-if="!view && busy === 'load'"
      class="py-3 text-base text-ink-gray-6"
      role="status"
    >
      {{ __('Loading your contacts…', null, 'Cuenta') }}
    </p>
    <div v-if="contacts.error.value" role="alert" class="space-y-2 py-2">
      <p class="text-sm text-ink-red-7">{{ contacts.error.value }}</p>
      <Button
        class="min-h-11"
        :label="__('Try again', null, 'Cuenta')"
        :loading="busy === 'load'"
        @click="contacts.load()"
      />
    </div>

    <template v-if="view">
      <section
        v-for="kind in view.categories"
        :key="kind.key"
        :aria-labelledby="`contactos-${kind.key}`"
        class="mt-4 border-t border-outline-gray-1 pt-4"
        :data-testid="`contactos-${kind.key}`"
      >
        <h3
          :id="`contactos-${kind.key}`"
          class="text-base font-semibold text-ink-gray-9"
        >
          {{ kind.title }}
        </h3>
        <p class="text-sm text-ink-gray-6 [text-wrap:pretty]">
          {{ kind.what }}
        </p>
        <!-- Pausing only makes sense once someone besides the owner is there.
             The switch says what it does: the owner keeps receiving either way. -->
        <div
          v-if="kind.optional && kind.contacts.length"
          class="mt-2 flex items-center gap-3"
        >
          <label
            :for="`contactos-switch-${kind.key}`"
            class="min-w-0 flex-1 text-base text-ink-gray-8"
          >
            {{ __('Send to these contacts too', null, 'Cuenta') }}
            <span
              v-if="!kind.enabled"
              class="block text-sm text-ink-gray-6"
              role="status"
              :data-testid="`contactos-pausa-${kind.key}`"
            >
              {{
                __(
                  'Paused: they stay on the list and receive nothing until you turn it back on.',
                  null,
                  'Cuenta',
                )
              }}
            </span>
          </label>
          <AjustesSwitch
            :id="`contactos-switch-${kind.key}`"
            :model-value="kind.enabled"
            :label="
              __('{0}: send to these contacts too', [kind.title], 'Cuenta')
            "
            :disabled="Boolean(busy)"
            :data-testid="`contactos-switch-${kind.key}`"
            @update:model-value="(on) => toggle(kind, on)"
          />
        </div>
        <ul
          v-if="kind.contacts.length"
          class="mt-1 divide-y divide-outline-gray-1"
          :data-testid="`contactos-filas-${kind.key}`"
        >
          <li v-for="row in kind.contacts" :key="row.email" class="py-2">
            <div class="flex items-center gap-3">
              <span
                class="lucide-mail size-5 flex-none text-ink-gray-6"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <p class="text-base text-ink-gray-9 [overflow-wrap:anywhere]">
                  <template v-for="(part, i) in emailBreaks(row.email)" :key="i"
                    >{{ part }}<wbr
                  /></template>
                </p>
                <p
                  class="text-sm"
                  :class="row.verified ? 'text-ink-gray-6' : 'text-ink-amber-8'"
                >
                  {{ row.state }}
                </p>
              </div>
              <!-- A small delete is two taps in place: the bin, then «Borrar». -->
              <button
                v-if="arming !== armKey(kind, row)"
                type="button"
                class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
                :aria-label="__('Remove {0}', [row.email], 'Cuenta')"
                :title="__('Remove {0}', [row.email], 'Cuenta')"
                :disabled="Boolean(busy)"
                data-testid="contacto-borrar"
                @click="arm(kind, row)"
              >
                <span class="lucide-trash-2 size-5" aria-hidden="true" />
              </button>
              <button
                v-else
                :ref="(el) => (confirmButton = el)"
                type="button"
                class="press min-h-11 flex-none rounded-full bg-surface-red-7 px-4 text-base font-medium text-white disabled:opacity-50"
                :disabled="busy === `remove:${kind.key}:${row.email}`"
                data-testid="contacto-borrar-si"
                @click="remove(kind, row)"
                @blur="disarm"
              >
                {{
                  busy === `remove:${kind.key}:${row.email}`
                    ? __('Removing…', null, 'Cuenta')
                    : __('Delete', null, 'Cuenta')
                }}
              </button>
            </div>
            <Button
              v-if="!row.verified"
              variant="subtle"
              class="ml-8 mt-1 min-h-11"
              :label="
                row.waiting
                  ? __('Type the code', null, 'Cuenta')
                  : __('Send a new code', null, 'Cuenta')
              "
              :disabled="Boolean(busy)"
              data-testid="contacto-codigo-abrir"
              @click="openSheet(kind, row)"
            />
          </li>
        </ul>
        <p v-else class="mt-2 text-sm text-ink-gray-7">
          {{ __('Only you receive these.', null, 'Cuenta') }}
        </p>
        <p
          v-if="notes[kind.key]"
          role="alert"
          class="mt-1 text-sm text-ink-red-7"
        >
          {{ notes[kind.key] }}
        </p>
        <Button
          v-if="!kind.full"
          variant="subtle"
          class="mt-2 min-h-11 max-sm:w-full"
          :label="__('Add an email', null, 'Cuenta')"
          :disabled="Boolean(busy)"
          :data-testid="`contactos-agregar-${kind.key}`"
          @click="openSheet(kind, null)"
        >
          <template #prefix>
            <span class="lucide-plus size-4" aria-hidden="true" />
          </template>
        </Button>
        <p v-else class="mt-2 text-sm text-ink-gray-6" role="status">
          {{
            __(
              'Up to {0} emails here. Remove one to add another.',
              [view.max],
              'Cuenta',
            )
          }}
        </p>
      </section>
    </template>
    <ContactoSheet
      v-if="sheet.mounted"
      :open="sheet.open"
      :kind="sheet.kind"
      :row="sheet.row"
      :owner="view?.owner || ''"
      :code-minutes="view?.codeMinutes || 15"
      :contacts="contacts"
      @close="sheet.open = false"
    />
  </section>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  reactive,
  ref,
  watch,
} from 'vue'
import { Button, toast } from 'frappe-ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { contactsView, createContacts, emailBreaks } from './contactos'

// The sheet mounts on its first open.
const ContactoSheet = defineAsyncComponent(() => import('./ContactoSheet.vue'))

const props = defineProps({
  /** The page's payment door (pagos.js createPagos): a new plan read reloads the list. */
  door: { type: Object, required: true },
})

const contacts = createContacts()
const view = computed(() => contactsView(contacts.answer.value))
// «Tú los recibes todos en {0}.» around the address, which keeps its own box.
const ownerLine = computed(() => {
  const mark = '\u0000'
  const [before, after = ''] = __(
    'You receive all of them at {0}.',
    [mark],
    'Cuenta',
  ).split(mark)
  return { before, after }
})
const busy = computed(() => contacts.busy.value)
const notes = reactive({})
const sheet = reactive({ mounted: false, open: false, kind: null, row: null })
const arming = ref('')
const confirmButton = ref(null)

// The list with the tab, and again after «Revisar estado» or a pull.
watch(
  () => props.door.boot.value,
  (boot) => {
    if (boot) contacts.load()
  },
  { immediate: true },
)

function openSheet(kind, row) {
  notes[kind.key] = ''
  sheet.kind = kind
  sheet.row = row
  sheet.mounted = true
  sheet.open = true
}

const armKey = (kind, row) => `${kind.key}:${row.email}`
async function arm(kind, row) {
  arming.value = armKey(kind, row)
  await nextTick()
  confirmButton.value?.focus?.()
}
function disarm() {
  if (!busy.value.startsWith('remove:')) arming.value = ''
}

async function remove(kind, row) {
  notes[kind.key] = ''
  const result = await contacts.remove(kind.key, row.email)
  arming.value = ''
  if (result.ok)
    toast.success(
      __('{0} no longer receives these notices', [row.email], 'Cuenta'),
    )
  else notes[kind.key] = result.text
}

async function toggle(kind, on) {
  notes[kind.key] = ''
  const result = await contacts.toggle(kind.key, on)
  if (!result.ok) notes[kind.key] = result.text
}
</script>
