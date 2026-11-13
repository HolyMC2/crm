<template>
  <!-- «Respaldos» (capability «backups»), opened from Resumen's «Último
       respaldo»: when the newest copy was made, the next one and the copy kept
       off site, then each copy with its day and size. «Descargar» asks for the
       password and then gives Boat's 5-minute link, to the account owner only
       («Mi Plan» reads the list and why it has no download). A late copy reads
       «Tu respaldo más reciente es de hace N días; ya lo estamos revisando» and
       offers no download while Boat holds it; «Pedir mis datos» is the way on
       meanwhile. Rows and rules. -->
  <BottomSheet
    :open="open"
    :title="
      phase === 'list'
        ? __('Backups', null, 'Cuenta')
        : __('Download backup', null, 'Cuenta')
    "
    :subtitle="
      phase === 'list'
        ? __('A copy of your whole system, made every day.', null, 'Cuenta')
        : ''
    "
    :dismissible="!busy"
    @update:open="(value) => !value && close()"
  >
    <div class="space-y-4 pb-2" data-testid="respaldos">
      <template v-if="phase === 'list'">
        <p
          v-if="view.state === 'loading'"
          class="text-base text-ink-gray-6"
          role="status"
        >
          {{ __('Reading your backups…', null, 'Cuenta') }}
        </p>
        <p
          v-else-if="view.state === 'off'"
          class="text-base text-ink-gray-8"
          role="status"
          data-testid="respaldos-apagado"
        >
          {{ view.message }}
        </p>
        <div
          v-else-if="view.state === 'failed'"
          class="space-y-2"
          role="status"
          data-testid="respaldos-sin-lectura"
        >
          <p class="text-base text-ink-gray-8">
            {{
              __('We could not read your backups right now.', null, 'Cuenta')
            }}
          </p>
          <Button
            class="min-h-11"
            :loading="loading"
            :label="__('Try once more', null, 'Cuenta')"
            @click="load"
          />
        </div>
        <template v-else>
          <p
            v-if="view.held"
            class="flex items-start gap-2 text-base"
            :class="view.stale ? 'text-ink-amber-8' : 'text-ink-gray-8'"
            role="status"
            data-testid="respaldos-retenido"
          >
            <span
              class="lucide-triangle-alert mt-0.5 size-5 flex-none"
              :class="view.stale ? '' : 'text-ink-gray-6'"
              aria-hidden="true"
            />
            <span class="min-w-0">{{ view.held }}</span>
          </p>
          <!-- While Boat holds the download, a copy of the data is the way on,
               right under why (seven copies would push it off the screen) and
               lined up with its words, past the icon. -->
          <div
            v-if="view.held"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 pl-7"
            data-testid="respaldos-datos-propios"
          >
            <p class="min-w-0 flex-1 basis-48 text-sm text-ink-gray-7">
              {{
                __(
                  'Meanwhile you can ask for a copy of your data: one zip with your sales, customers, products and more.',
                  null,
                  'Cuenta',
                )
              }}
            </p>
            <Button
              variant="subtle"
              class="min-h-11"
              :label="__('Ask for my data', null, 'Cuenta')"
              @click="act('export')"
            />
          </div>
          <dl
            v-if="view.facts.length"
            class="divide-y divide-outline-gray-1 border-y border-outline-gray-1"
            data-testid="respaldos-datos"
          >
            <div
              v-for="fact in view.facts"
              :key="fact.key"
              class="flex items-baseline gap-3 py-2"
            >
              <dt class="min-w-0 flex-1 text-sm text-ink-gray-7">
                {{ fact.label }}
              </dt>
              <dd
                class="shrink-0 text-right text-base"
                :class="fact.warn ? 'text-ink-amber-8' : 'text-ink-gray-9'"
              >
                {{ fact.value }}
              </dd>
            </div>
          </dl>
          <p
            v-if="view.ownerOnly"
            class="text-sm text-ink-gray-7"
            data-testid="respaldos-solo-dueno"
          >
            {{ view.ownerOnly }}
          </p>
          <p
            v-if="view.state === 'empty'"
            class="text-base text-ink-gray-8"
            data-testid="respaldos-vacio"
          >
            {{ __('There is no backup to download yet.', null, 'Cuenta') }}
          </p>
          <ul
            v-else
            class="divide-y divide-outline-gray-1"
            data-testid="respaldos-lista"
          >
            <li
              v-for="row in view.rows"
              :key="row.id"
              class="flex items-center gap-3 py-2.5"
            >
              <span
                class="lucide-database size-5 flex-none text-ink-gray-6"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <p class="text-base text-ink-gray-9">{{ row.when }}</p>
                <p v-if="row.size" class="num text-sm text-ink-gray-6">
                  {{ row.size }}
                </p>
              </div>
              <Button
                v-if="view.downloadable"
                variant="subtle"
                class="min-h-11"
                :label="__('Download', null, 'Cuenta')"
                data-testid="respaldo-descargar"
                @click="choose(row)"
              />
            </li>
          </ul>
        </template>
      </template>

      <!-- The copy being downloaded, on the password step and with its link. -->
      <div
        v-if="phase !== 'list' && chosen"
        class="flex items-center gap-3 border-y border-outline-gray-1 py-2.5"
        data-testid="respaldo-elegido"
      >
        <span
          class="lucide-database size-5 flex-none text-ink-gray-6"
          aria-hidden="true"
        />
        <p class="min-w-0 flex-1 text-base text-ink-gray-9">
          {{ chosen.when }}
        </p>
        <p v-if="chosen.size" class="num shrink-0 text-sm text-ink-gray-6">
          {{ chosen.size }}
        </p>
      </div>
      <template v-if="phase === 'password' && chosen">
        <p class="text-sm text-ink-gray-7">
          {{
            __(
              'It holds all of your system’s data. Keep it somewhere safe.',
              null,
              'Cuenta',
            )
          }}
        </p>
        <label class="block">
          <span class="text-sm text-ink-gray-7">{{
            __('Your password, to confirm', null, 'Cuenta')
          }}</span>
          <input
            ref="passwordInput"
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
            data-testid="respaldo-password"
            @keydown.enter.prevent="confirm"
          />
        </label>
        <!-- A refusal sits under the field it is about, before the way out. -->
        <p
          v-if="error"
          role="alert"
          class="text-sm text-ink-red-7"
          data-testid="respaldo-error"
        >
          {{ error }}
        </p>
        <OlvidoContrasena @act="act" />
      </template>

      <template v-else-if="phase === 'ready' && link">
        <p
          class="text-base text-ink-gray-8"
          role="status"
          data-testid="respaldo-listo"
        >
          {{
            expired
              ? __(
                  'The link stopped working. Ask for another one.',
                  null,
                  'Cuenta',
                )
              : link.ready
          }}
        </p>
      </template>
    </div>
    <template v-if="phase === 'password'" #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Cuenta')"
        :disabled="busy"
        @click="back"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Download', null, 'Cuenta')"
        :loading="busy"
        :disabled="busy || !password"
        data-testid="respaldo-confirmar"
        @click="confirm"
      />
    </template>
    <template v-else-if="phase === 'ready'" #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Back to backups', null, 'Cuenta')"
        @click="back"
      />
      <Button
        v-if="!expired"
        variant="solid"
        class="min-h-11 w-full"
        :href="link?.url"
        :label="__('Download backup', null, 'Cuenta')"
        data-testid="respaldo-enlace"
      />
      <Button
        v-else
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Ask for another link', null, 'Cuenta')"
        data-testid="respaldo-otro"
        @click="again"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { seam } from './api'
import { failureText } from './autoservicio'
import OlvidoContrasena from './OlvidoContrasena.vue'
import { backupsView, linkView, readyText } from './respaldos'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** doco's `account_owner`: only the account owner sees «Descargar». */
  owner: { type: Boolean, default: false },
})
// «act»: a next step the parent takes after closing this sheet («export»:
// Resumen's block asks for a copy of the data; «support»).
const emit = defineEmits(['close', 'act'])

const phase = ref('list')
const answer = ref(null)
const loading = ref(false)
const chosen = ref(null)
const password = ref('')
const busy = ref(false)
const error = ref('')
const link = ref(null)
const expired = ref(false)
const passwordInput = ref(null)
let seq = 0
let timer = 0

const view = computed(() =>
  backupsView(answer.value, new Date(), { owner: props.owner }),
)

async function load() {
  const mine = ++seq
  loading.value = true
  try {
    const out = await seam('my_backups')
    if (mine === seq) answer.value = out
  } catch {
    if (mine === seq) answer.value = { ok: false, reason: 'unreachable' }
  } finally {
    if (mine === seq) loading.value = false
  }
}

function forgetLink() {
  clearTimeout(timer)
  timer = 0
  link.value = null
  expired.value = false
}

// Each open reads the copies again; the password never outlives the sheet.
watch(
  () => props.open,
  (open) => {
    password.value = ''
    error.value = ''
    chosen.value = null
    forgetLink()
    phase.value = 'list'
    if (open) {
      answer.value = null
      load()
    }
  },
  { immediate: true },
)
onBeforeUnmount(forgetLink)

async function focusPassword() {
  await nextTick()
  passwordInput.value?.focus?.()
}

function choose(row) {
  chosen.value = row
  password.value = ''
  error.value = ''
  phase.value = 'password'
  focusPassword()
}

function back() {
  forgetLink()
  password.value = ''
  error.value = ''
  phase.value = 'list'
}

function again() {
  forgetLink()
  phase.value = 'password'
  focusPassword()
}

function close() {
  if (busy.value) return
  emit('close')
}

function act(key) {
  emit('act', key)
}

async function confirm() {
  if (busy.value || !password.value || !chosen.value) return
  busy.value = true
  error.value = ''
  try {
    const out = await seam(
      'download_backup',
      { backup_id: chosen.value.id },
      { password: password.value },
    )
    password.value = ''
    const read = linkView(out)
    if (read.url) {
      link.value = { url: read.url, ready: readyText(read.seconds) }
      phase.value = 'ready'
      timer = setTimeout(() => {
        expired.value = true
      }, read.seconds * 1000)
      return
    }
    if (read.held) {
      // Boat holds it now: the list says why.
      phase.value = 'list'
      load()
      return
    }
    error.value = read.refusal
    if (read.password) focusPassword()
  } catch (e) {
    password.value = ''
    error.value = failureText(e)
  } finally {
    busy.value = false
  }
}
</script>
