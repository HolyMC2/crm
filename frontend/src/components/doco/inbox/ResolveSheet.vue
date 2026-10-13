<!-- «Resolver» (Atención a clientes): the sheet is the confirmation. It says, before
     anything happens, whether we will ask the customer «¿Cómo te atendimos?» (a manager
     approves the WhatsApp first) or why not, with the way out: answer first, register
     the customer, set the question up, or copy a request for the owner. -->
<template>
  <Dialog
    v-model="open"
    :options="{ title: __('Is it resolved?'), size: 'md' }"
  >
    <template #body-content>
      <div class="space-y-3" data-testid="resolve-sheet">
        <p v-if="loading" role="status" class="text-p-base text-ink-gray-6">
          {{ __('Checking…') }}
        </p>
        <template v-else-if="notice">
          <p
            class="flex items-start gap-2 rounded-lg px-3 py-2 text-p-base"
            :class="
              preview?.ask
                ? 'bg-surface-green-2 text-ink-green-8'
                : 'bg-surface-amber-2 text-ink-amber-9'
            "
            data-testid="resolve-notice"
          >
            <FeatherIcon
              :name="preview?.ask ? 'message-circle' : 'info'"
              class="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{{ notice.message }}</span>
          </p>
          <div v-if="notice.actions?.length" class="flex flex-wrap gap-2">
            <Button
              v-for="action in notice.actions"
              :key="action.label"
              :label="action.label"
              :variant="refused ? 'solid' : undefined"
              :loading="busy === action.label"
              class="min-h-11 sm:min-h-8"
              :data-testid="
                'resolve-action-' +
                (action.kind === 'call' ? action.target : action.kind)
              "
              @click="run(action)"
            />
          </div>
        </template>
        <p
          v-if="status"
          role="status"
          class="text-p-sm text-ink-gray-6"
          data-testid="resolve-status"
        >
          {{ status }}
        </p>
        <p
          v-if="problem"
          role="alert"
          class="rounded-lg bg-surface-red-1 px-3 py-2 text-p-sm text-ink-red-7"
        >
          {{ problem }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          :label="__('Cancel')"
          class="min-h-11 sm:min-h-8"
          @click="open = false"
        />
        <!-- After a refusal the way forward is the notice's own action (read the new message). -->
        <Button
          v-if="!refused"
          variant="solid"
          :label="resolveLabel({ ask: Boolean(preview?.ask), next })"
          :loading="busy === 'resolve'"
          :disabled="loading"
          class="min-h-11 sm:min-h-8"
          data-testid="resolve-confirm"
          @click="confirm"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dialog, FeatherIcon, call } from 'frappe-ui'
import { requestId } from '@/composables/useCompras'
import { resolvePreview, resolveConversation } from '@/composables/inbox'
import {
  guardRoute,
  resolveLabel,
  resolveRefused,
  resolveReturn,
} from '@/utils/atencion'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps({
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
  // 'queue' = «Resolver y siguiente», 'return' = back to where the worker came from
  next: { type: String, default: null },
})
const emit = defineEmits(['resolved', 'reply', 'show-message'])
const router = useRouter()

const loading = ref(false)
const busy = ref('')
const preview = ref(null)
const problem = ref('')
const status = ref('')
// The server refused because the customer wrote something this sheet did not show.
const refused = ref(false)
// One id per opening: a double tap on «Resolver» stages one question.
let request = requestId()

const notice = computed(() => preview.value?.notice || null)

function messageOf(error) {
  return (
    error?.messages?.[0] ||
    error?.message ||
    __('Something went wrong. Try again.')
  )
}

async function load() {
  loading.value = true
  problem.value = ''
  try {
    preview.value = await resolvePreview(props.doctype, props.name)
  } catch (error) {
    preview.value = null
    problem.value = messageOf(error)
  } finally {
    loading.value = false
  }
}

// The way back from a guard's screen: this conversation, in «Por responder» when we came
// from it, with this sheet open again so it checks once more (resolveReturn).
function here() {
  return resolveReturn(window.location.href, props.doctype, props.name)
}

async function run(action) {
  status.value = ''
  problem.value = ''
  if (action.kind === 'call' && action.target === 'reply') {
    open.value = false
    emit('reply')
    return
  }
  if (action.kind === 'call' && action.target === 'show_message') {
    open.value = false
    emit('show-message')
    return
  }
  if (action.kind === 'route') {
    const to = guardRoute(action.target, here(), 'Conversaciones')
    if (to) {
      open.value = false
      router.push(to)
    }
    return
  }
  if (action.kind === 'copy') {
    try {
      await navigator.clipboard.writeText(action.target)
      status.value = __('Request copied. Share it with the owner.')
    } catch {
      status.value = action.target
    }
    return
  }
  if (action.kind === 'call') {
    busy.value = action.label
    try {
      await call(action.target, action.args || {})
      status.value = __('Done. Checking again…')
      await load()
    } catch (error) {
      problem.value = messageOf(error)
    } finally {
      busy.value = ''
    }
  }
}

async function confirm() {
  busy.value = 'resolve'
  problem.value = ''
  try {
    const out = await resolveConversation(props.doctype, props.name, {
      ask: Boolean(preview.value?.ask),
      requestId: request,
      seen: preview.value?.seen,
    })
    if (resolveRefused(out)) {
      // Nothing was resolved: the conversation stays in «Por responder» and the sheet
      // stays here with why and the way to the new message (never «Siguiente»).
      refused.value = true
      preview.value = { ask: false, notice: out.notice, seen: out.seen }
      request = requestId()
      return
    }
    open.value = false
    emit('resolved', out)
  } catch (error) {
    // The sheet stays open with what happened; nothing was resolved.
    problem.value = messageOf(error)
  } finally {
    busy.value = ''
  }
}

watch(open, (value) => {
  if (!value) return
  request = requestId()
  status.value = ''
  refused.value = false
  preview.value = null
  load()
})
</script>
