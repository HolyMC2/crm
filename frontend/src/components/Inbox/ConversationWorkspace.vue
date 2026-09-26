<template>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col"
    data-testid="customer-workspace"
  >
    <div
      v-if="state.error"
      role="alert"
      class="border-b border-outline-gray-1 p-3 text-sm [overflow-wrap:anywhere]"
    >
      {{ state.error }}
    </div>
    <div
      v-if="state.initialized && !state.accounts.length"
      class="m-auto max-w-md p-6 text-center text-sm text-ink-gray-5"
    >
      No tienes cuentas de conversación disponibles. Esta vista requiere un
      canal configurado y acceso a su cuenta.
    </div>
    <button
      v-if="!state.initialized && !state.loading"
      type="button"
      class="m-4 self-start underline"
      @click="initialize"
    >
      Cargar cuentas
    </button>
    <div v-else class="flex min-h-0 min-w-0 flex-1">
      <ConversationQueue
        class="w-full sm:w-72 sm:flex-none"
        :class="
          state.conversation || state.historyLoading ? 'hidden sm:flex' : 'flex'
        "
        :accounts="state.accounts"
        :account="state.account"
        :threads="state.threads"
        :selected="state.conversation?.name"
        :loading="state.loading"
        :disabled="pendingWork"
        :more="!!state.threadsCursor"
        @account="selectAccount"
        @select="select"
        @more="workspace.loadThreads(true)"
      />
      <section
        class="min-h-0 min-w-0 flex-1 flex-col"
        :class="
          state.conversation || state.historyLoading ? 'flex' : 'hidden sm:flex'
        "
        aria-label="Historial de conversación"
      >
        <template v-if="state.conversation">
          <header
            class="flex min-w-0 items-start gap-3 border-b border-outline-gray-1 p-3"
          >
            <button
              type="button"
              class="shrink-0 underline sm:hidden"
              :disabled="pendingWork"
              @click="back"
            >
              Volver
            </button>
            <div class="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <h2 class="text-sm font-semibold">
                {{
                  state.conversation.display_name || state.conversation.peer_id
                }}
              </h2>
              <p class="mt-1 text-xs text-ink-gray-5">
                {{ state.conversation.provider }} · Cuenta
                {{
                  state.conversation.provider === 'Webchat'
                    ? state.account?.label
                    : state.conversation.account_id
                }}
              </p>
              <nav
                v-if="recordLinks.length"
                class="mt-2 flex flex-wrap gap-2 text-xs"
                aria-label="Registros de la conversación"
              >
                <a
                  v-for="link in recordLinks"
                  :key="link.doctype + ':' + link.name"
                  :href="link.url"
                  class="underline [overflow-wrap:anywhere]"
                  >{{ link.label || `${link.doctype} · ${link.name}` }}</a
                >
              </nav>
            </div>
            <button
              type="button"
              class="shrink-0 text-xs underline"
              :disabled="state.historyLoading || pendingWork"
              @click="workspace.loadHistory()"
            >
              Actualizar
            </button>
          </header>
          <ConversationControls
            :conversation="state.conversation"
            :operators="state.operators"
            :busy="
              state.controlLoading ||
              state.historyLoading ||
              queuePending ||
              outboxPending ||
              commercePending
            "
            :pending="state.pending"
            :provider-notice="state.providerNotice"
            @control="workspace.applyControl"
            @retry="workspace.applyControl()"
            @operators="workspace.loadOperators"
          />
          <button
            v-if="state.historyCursor"
            type="button"
            class="p-2 text-xs underline"
            :disabled="state.historyLoading"
            @click="workspace.loadHistory(true)"
          >
            Cargar mensajes anteriores
          </button>
          <MessengerArea
            class="min-h-0 min-w-0 flex-1"
            :messages="state.messages"
          />
          <p
            v-if="state.messages.some((m) => m.attachment_restricted)"
            class="px-3 py-1 text-xs text-ink-gray-5"
          >
            Algunos adjuntos no están disponibles en esta vista.
          </p>
          <ConversationOutbox
            v-if="NATIVE_PROVIDERS.includes(state.conversation.provider)"
            ref="outbox"
            :conversation="state.conversation"
            :actor="session.user"
            :blocked="!!state.pending || queuePending || commercePending"
            @pending="outboxPending = $event"
            @refresh="workspace.loadHistory()"
          />
          <CatalogCommerce
            :conversation="state.conversation"
            :actor="session.user"
            :blocked="
              !!state.pending ||
              queuePending ||
              outboxPending ||
              state.historyLoading
            "
            @pending="commercePending = $event"
            @queued="queued"
            @refresh="workspace.loadHistory()"
          />
          <ConversationComposer
            :conversation="state.conversation"
            :actor="session.user"
            :blocked="
              !!state.pending ||
              outboxPending ||
              commercePending ||
              state.historyLoading
            "
            @pending="queuePending = $event"
            @queued="queued"
            @refresh="workspace.loadHistory()"
          />
        </template>
        <p v-else class="m-auto p-6 text-sm text-ink-gray-5">
          {{
            state.historyLoading
              ? 'Cargando historial…'
              : 'Selecciona una conversación para ver su historial y responsable.'
          }}
        </p>
      </section>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, onUnmounted, watch, ref } from 'vue'
import {
  useRoute,
  useRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
} from 'vue-router'
import { sessionStore } from '@/stores/session'
import { globalStore } from '@/stores/global'
import { useConversations } from '@/composables/useConversations'
import ConversationQueue from './ConversationQueue.vue'
import ConversationControls from './ConversationControls.vue'
import ConversationComposer from './ConversationComposer.vue'
import ConversationOutbox from './ConversationOutbox.vue'
import CatalogCommerce from './CatalogCommerce.vue'
import MessengerArea from '@/components/Activities/MessengerArea.vue'
const NATIVE_PROVIDERS = ['WhatsApp', 'Webchat', 'Messenger', 'Instagram']
const session = sessionStore(),
  route = useRoute(),
  router = useRouter()
const workspace = useConversations({ actor: () => session.user })
const { state } = workspace
const outbox = ref(null),
  queuePending = ref(false),
  outboxPending = ref(false),
  commercePending = ref(false)
const pendingWork = computed(
  () =>
    !!state.pending ||
    queuePending.value ||
    outboxPending.value ||
    commercePending.value,
)
const emit = defineEmits(['pending'])
watch(
  () => pendingWork.value,
  (pending) => emit('pending', pending),
  { flush: 'sync' },
)
onBeforeRouteLeave(() => !pendingWork.value)
onBeforeRouteUpdate(
  (to, from) =>
    !pendingWork.value ||
    (to.query.workspace === from.query.workspace &&
      to.query.conversation === from.query.conversation),
)
const { $socket } = globalStore()
const referenceLink = computed(() => {
  const d = state.conversation
  if (d?.reference_doctype === 'CRM Deal' && d.reference_name)
    return `/crm/deal/${encodeURIComponent(d.reference_name)}`
  const paths = {
    'CRM Inquiry': 'crm-inquiry',
    'CRM Lead': 'crm-lead',
    'CRM Deal': 'crm-deal',
  }
  return d?.reference_name && paths[d.reference_doctype]
    ? `/app/${paths[d.reference_doctype]}/${encodeURIComponent(d.reference_name)}`
    : null
})
const recordLinks = computed(() => {
  const doc = state.conversation
  const rows = [...(doc?.context_links || [])]
  if (referenceLink.value)
    rows.unshift({
      doctype: doc.reference_doctype,
      name: doc.reference_name,
      url: referenceLink.value,
    })
  return [
    ...new Map(
      rows
        .filter((row) => /^\/(?:app|desk|crm)\//.test(row.url || ''))
        .map((row) => [`${row.doctype}:${row.name}`, row]),
    ).values(),
  ]
})
async function select(thread) {
  if (pendingWork.value) return
  if (await workspace.selectThread(thread)) {
    await router.replace({
      query: { ...route.query, conversation: state.conversation.name },
    })
  }
}
function back() {
  if (pendingWork.value) return
  workspace.back()
  if (!state.pending)
    router.replace({ query: { ...route.query, conversation: undefined } })
}
async function initialize() {
  if (pendingWork.value) return
  if (!(await workspace.loadAccounts())) return
  if (typeof route.query.conversation === 'string')
    await workspace.selectThread({ name: route.query.conversation })
  if (state.account || state.accounts[0]) {
    if (state.conversation) await workspace.loadThreads()
    else await workspace.selectAccount(state.accounts[0])
  }
}
function updated(event) {
  if (
    !pendingWork.value &&
    !state.historyLoading &&
    !state.controlLoading &&
    event?.name === state.conversation?.name
  )
    workspace.loadHistory()
}
// Messenger/Instagram rows (customer messages, echoes, accepted replies)
// announce only their page-scoped peer; reload just that open conversation.
function socialMessage(event) {
  const current = state.conversation
  if (
    ['Messenger', 'Instagram'].includes(current?.provider) &&
    typeof event?.psid === 'string' &&
    event.psid === current.peer_id
  )
    updated({ name: current.name })
}
function selectAccount(account) {
  if (!pendingWork.value) workspace.selectAccount(account)
}
function queued(intent) {
  outbox.value?.upsert(intent)
  outbox.value?.load()
}
function outboxUpdated(event) {
  if (event?.conversation === state.conversation?.name) outbox.value?.load()
}
let refreshTimer,
  refreshActive = false
function scheduleRefresh() {
  if (!refreshActive) return
  refreshTimer = setTimeout(async () => {
    if (
      state.account?.provider === 'Webchat' &&
      document.visibilityState === 'visible' &&
      !pendingWork.value &&
      !state.loading &&
      !state.historyLoading &&
      !state.controlLoading &&
      !document.activeElement?.closest('textarea, input, select') &&
      !state.historyCursor
    ) {
      const selected = state.conversation?.name
      await workspace.loadThreads()
      if (
        refreshActive &&
        !pendingWork.value &&
        !state.historyLoading &&
        !state.controlLoading &&
        !document.activeElement?.closest('textarea, input, select') &&
        selected &&
        state.conversation?.name === selected
      )
        await workspace.loadHistory()
    }
    scheduleRefresh()
  }, 15000)
}
watch(
  () => route.query.conversation,
  (name) => {
    if (
      !pendingWork.value &&
      typeof name === 'string' &&
      name !== state.conversation?.name
    )
      workspace.selectThread({ name })
  },
)
onMounted(() => {
  initialize()
  refreshActive = true
  scheduleRefresh()
  $socket?.on('crm_conversation_updated', updated)
  $socket?.on('crm_outbox_updated', outboxUpdated)
  $socket?.on('messenger_message', socialMessage)
})
onUnmounted(() => {
  refreshActive = false
  clearTimeout(refreshTimer)
  workspace.reset()
  $socket?.off('crm_conversation_updated', updated)
  $socket?.off('crm_outbox_updated', outboxUpdated)
  $socket?.off('messenger_message', socialMessage)
})
</script>
