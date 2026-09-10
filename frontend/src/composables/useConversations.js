import { reactive, watch } from 'vue'
import { call } from 'frappe-ui'

const API = 'crm.api.conversation_threads.'
const CONTROL = 'crm.api.conversations.apply_control'
const errorType = (e) =>
  e?.exc_type ||
  e?.responseJSON?.exc_type ||
  e?.exception?.split(':')[0]?.split('.').pop()
const identity = (a) => (a ? `${a.provider}:${a.account_id}` : '')

// Per-mounted workspace; never persist customer text or commands across users.
export function useConversations({
  actor,
  rpc = call,
  commandId = () => crypto.randomUUID(),
}) {
  const state = reactive({
    accounts: [],
    account: null,
    threads: [],
    threadsCursor: null,
    conversation: null,
    messages: [],
    historyCursor: null,
    operators: [],
    loading: false,
    historyLoading: false,
    controlLoading: false,
    pending: null,
    error: '',
    initialized: false,
  })
  let epoch = 0
  let threadEpoch = 0
  let historyRequest = 0
  let queueRequest = 0
  let operatorRequest = 0
  const current = (stamp, user) => stamp === epoch && user === actor()
  const clearThread = () => {
    threadEpoch++
    state.conversation = null
    state.messages = []
    state.historyCursor = null
    state.operators = []
    state.historyLoading = false
  }
  const reset = () => {
    epoch++
    clearThread()
    Object.assign(state, {
      accounts: [],
      account: null,
      threads: [],
      threadsCursor: null,
      pending: null,
      loading: false,
      controlLoading: false,
      error: '',
      initialized: false,
    })
  }
  watch(actor, reset, { flush: 'sync' })
  function failed(e) {
    if (['PermissionError', 'AuthenticationError'].includes(errorType(e))) {
      reset()
      state.error = 'Tu acceso cambió. Vuelve a cargar las cuentas disponibles.'
    } else {
      state.error = 'No se pudo cargar la conversación. Intenta de nuevo.'
    }
  }
  async function loadAccounts() {
    if (state.pending) return false
    reset()
    const stamp = epoch,
      user = actor()
    state.loading = true
    try {
      const result = await rpc(API + 'list_accounts')
      if (!current(stamp, user)) return false
      state.accounts = result.accounts || []
      state.initialized = true
      return true
    } catch (e) {
      if (current(stamp, user)) failed(e)
      return false
    } finally {
      if (current(stamp, user)) state.loading = false
    }
  }
  async function selectAccount(account) {
    if (state.pending) return false
    epoch++
    clearThread()
    state.account = account
    state.threads = []
    state.threadsCursor = null
    state.error = ''
    return loadThreads()
  }
  async function loadThreads(more = false) {
    if (!state.account || (more && !state.threadsCursor)) return false
    const stamp = epoch,
      user = actor(),
      account = { ...state.account }
    const request = ++queueRequest
    state.loading = true
    try {
      const result = await rpc(API + 'list_threads', {
        provider: account.provider,
        account_id: account.account_id,
        cursor: more ? state.threadsCursor : null,
      })
      if (
        !current(stamp, user) ||
        request !== queueRequest ||
        identity(account) !== identity(state.account)
      )
        return false
      state.threads = more ? [...state.threads, ...result.items] : result.items
      state.threadsCursor = result.next_cursor
      return true
    } catch (e) {
      if (current(stamp, user) && request === queueRequest) failed(e)
      return false
    } finally {
      if (current(stamp, user) && request === queueRequest)
        state.loading = false
    }
  }
  async function selectThread(thread) {
    if (state.pending) return false
    clearThread()
    state.error = ''
    const stamp = epoch,
      selected = threadEpoch,
      user = actor()
    state.historyLoading = true
    try {
      // Legacy rows require the explicit account + peer selection from the list.
      const doc = thread.name
        ? thread
        : await rpc(API + 'open_thread', {
            provider: thread.provider,
            account_id: thread.account_id,
            peer_id: thread.peer_id,
          })
      if (!current(stamp, user) || selected !== threadEpoch) return false
      return await loadHistory(false, doc.name)
    } catch (e) {
      if (current(stamp, user) && selected === threadEpoch) failed(e)
      return false
    } finally {
      if (current(stamp, user) && selected === threadEpoch)
        state.historyLoading = false
    }
  }
  async function loadHistory(more = false, name = state.conversation?.name) {
    if (!name || (more && !state.historyCursor)) return false
    const stamp = epoch,
      selected = threadEpoch,
      user = actor()
    const request = ++historyRequest
    state.historyLoading = true
    try {
      const result = await rpc(API + 'get_history', {
        conversation: name,
        cursor: more ? state.historyCursor : null,
      })
      if (
        !current(stamp, user) ||
        selected !== threadEpoch ||
        request !== historyRequest
      )
        return false
      state.conversation = result.conversation
      state.account =
        state.accounts.find(
          (a) => identity(a) === identity(result.conversation),
        ) || state.account
      const combined = more
        ? [...result.messages, ...state.messages]
        : result.messages
      state.messages = [...new Map(combined.map((m) => [m.id, m])).values()]
      state.historyCursor = result.next_cursor
      return true
    } catch (e) {
      if (
        current(stamp, user) &&
        selected === threadEpoch &&
        request === historyRequest
      ) {
        clearThread()
        failed(e)
      }
      return false
    } finally {
      if (
        current(stamp, user) &&
        selected === threadEpoch &&
        request === historyRequest
      )
        state.historyLoading = false
    }
  }
  async function loadOperators(query = '') {
    if (!state.conversation) return
    const stamp = epoch,
      selected = threadEpoch,
      user = actor()
    const request = ++operatorRequest
    try {
      const result = await rpc(API + 'list_operators', {
        conversation: state.conversation.name,
        query,
      })
      if (
        current(stamp, user) &&
        selected === threadEpoch &&
        request === operatorRequest
      )
        state.operators = result
    } catch (e) {
      if (
        current(stamp, user) &&
        selected === threadEpoch &&
        request === operatorRequest
      )
        failed(e)
    }
  }
  async function applyControl(action, values = {}) {
    if (
      state.controlLoading ||
      state.historyLoading ||
      (!state.pending && !state.conversation)
    )
      return false
    if (!state.pending) {
      state.pending = Object.freeze({
        name: state.conversation.name,
        action,
        expected_generation: state.conversation.generation,
        command_id: commandId(),
        owner: values.owner || null,
        reason: values.reason || null,
      })
    }
    const command = { ...state.pending },
      stamp = epoch,
      user = actor()
    state.controlLoading = true
    state.error = ''
    try {
      await rpc(CONTROL, command)
      if (!current(stamp, user)) return false
      state.pending = null
      // A replay may describe an older generation. Always fetch current state.
      await loadHistory(false, command.name)
      await loadThreads()
      return true
    } catch (e) {
      if (!current(stamp, user)) return false
      const type = errorType(e)
      if (
        [
          'TimestampMismatchError',
          'ValidationError',
          'PermissionError',
          'AuthenticationError',
        ].includes(type)
      ) {
        state.pending = null
        if (type === 'PermissionError' || type === 'AuthenticationError')
          failed(e)
        else {
          await loadHistory(false, command.name)
          state.error =
            type === 'TimestampMismatchError'
              ? 'Otra persona cambió el control. Revisa el estado actualizado antes de actuar.'
              : 'No se aplicó el cambio. Revisa el responsable y el motivo.'
        }
      } else {
        state.error =
          'La respuesta no llegó. Comprueba el mismo cambio antes de continuar.'
      }
      return false
    } finally {
      if (current(stamp, user)) state.controlLoading = false
    }
  }
  function back() {
    if (!state.pending) clearThread()
  }
  return {
    state,
    loadAccounts,
    selectAccount,
    loadThreads,
    selectThread,
    loadHistory,
    loadOperators,
    applyControl,
    back,
    reset,
  }
}
