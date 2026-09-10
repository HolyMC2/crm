import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { call } from 'frappe-ui'
import { INQUIRY_API, inquiryError, requestGate } from '@/utils/inquiries'

export function useInquiryWorkspace(
  actor,
  selectedName,
  { socket, focusTarget = window } = {},
) {
  const items = ref([])
  const hasMore = ref(false)
  const start = ref(0)
  const status = ref('')
  const assignedTo = ref('')
  const listBusy = ref(false)
  const listError = ref(null)
  const inquiry = ref(null)
  const detailBusy = ref(false)
  const detailError = ref(null)
  const detailUpdateAvailable = ref(false)
  const transferNotice = ref('')
  const mutationBusy = ref('')
  const mutationError = ref(null)
  const assignees = ref([])
  const assigneeError = ref(null)
  const pageLength = 20
  const listGate = requestGate(() =>
    JSON.stringify([actor.value, status.value, assignedTo.value, start.value]),
  )
  const detailGate = requestGate(() =>
    JSON.stringify([actor.value, selectedName.value]),
  )
  const mutationGate = requestGate(() =>
    JSON.stringify([actor.value, selectedName.value]),
  )
  const assigneeGate = requestGate(() => actor.value)

  async function loadList() {
    const token = listGate.begin()
    if (!actor.value) return
    listBusy.value = true
    listError.value = null
    try {
      const result = await call(`${INQUIRY_API}.list_inquiries`, {
        status: status.value || undefined,
        assigned_to: assignedTo.value || undefined,
        start: start.value,
        page_length: pageLength,
      })
      if (!listGate.current(token)) return
      if (!Array.isArray(result?.items))
        throw new Error('Invalid inquiry list response')
      items.value = result.items
      hasMore.value = !!result.has_more
    } catch (e) {
      if (listGate.current(token)) listError.value = inquiryError(e)
    } finally {
      if (listGate.current(token)) listBusy.value = false
    }
  }

  async function loadDetail() {
    if (mutationBusy.value) return
    const token = detailGate.begin()
    if (!actor.value || !selectedName.value) return
    detailBusy.value = true
    detailError.value = null
    try {
      const result = await call(`${INQUIRY_API}.get_inquiry`, {
        name: selectedName.value,
      })
      if (detailGate.current(token)) {
        if (!result?.name) throw new Error('Invalid inquiry response')
        inquiry.value = result
        mutationError.value = null
        detailUpdateAvailable.value = false
      }
    } catch (e) {
      if (detailGate.current(token)) {
        detailError.value = inquiryError(e)
        // Stop showing protected record data after a denied reload.
        if (detailError.value.kind === 'permission') inquiry.value = null
      }
    } finally {
      if (detailGate.current(token)) detailBusy.value = false
    }
  }

  async function loadAssignees() {
    const token = assigneeGate.begin()
    if (!actor.value) return
    assigneeError.value = null
    try {
      const result = await call(`${INQUIRY_API}.get_assignees`)
      if (assigneeGate.current(token)) {
        if (!Array.isArray(result)) throw new Error('Invalid assignee response')
        assignees.value = result
      }
    } catch (e) {
      if (assigneeGate.current(token)) assigneeError.value = inquiryError(e)
    }
  }

  async function mutate(method, values = {}) {
    if (mutationBusy.value || !inquiry.value?.can_write || !actor.value)
      return null
    const token = mutationGate.begin()
    const source = inquiry.value
    detailGate.invalidate()
    detailBusy.value = false
    mutationBusy.value = method
    mutationError.value = null
    try {
      const result = await call(`${INQUIRY_API}.${method}`, {
        name: source.name,
        ...(method === 'convert_person' ? {} : { modified: source.modified }),
        ...values,
      })
      if (!mutationGate.current(token)) return null
      if (!(result?.inquiry || result)?.name)
        throw new Error('Invalid inquiry response')
      if (result.access_revoked) {
        inquiry.value = null
        items.value = items.value.filter((item) => item.name !== source.name)
        detailError.value = null
        detailUpdateAvailable.value = false
        transferNotice.value =
          'Consulta transferida; ya no tienes acceso a este registro.'
        void loadList()
        return result
      }
      inquiry.value = result.inquiry || result
      void loadList()
      return result
    } catch (e) {
      if (mutationGate.current(token)) mutationError.value = inquiryError(e)
      return null
    } finally {
      if (mutationGate.current(token)) mutationBusy.value = ''
    }
  }

  watch(
    actor,
    () => {
      for (const gate of [listGate, detailGate, mutationGate, assigneeGate])
        gate.invalidate()
      items.value = []
      assignees.value = []
      listError.value = null
      listBusy.value = false
      start.value = 0
      assignedTo.value = ''
    },
    { flush: 'sync' },
  )
  watch([status, assignedTo], () => {
    start.value = 0
  })
  watch(
    [actor, status, assignedTo, start],
    () => {
      items.value = []
      hasMore.value = false
      void loadList()
    },
    { immediate: true },
  )
  watch(
    [actor, selectedName],
    () => {
      detailGate.invalidate()
      mutationGate.invalidate()
      inquiry.value = null
      detailBusy.value = false
      mutationBusy.value = ''
      detailError.value = null
      detailUpdateAvailable.value = false
      transferNotice.value = ''
      mutationError.value = null
      void loadDetail()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    actor,
    () => {
      assignees.value = []
      void loadAssignees()
    },
    { immediate: true },
  )
  // Realtime payloads deliberately contain no record identity or source content.
  // Refresh the permission-filtered list and let the user reload the selected
  // record; its component merges untouched fields while retaining pending edits.
  function refreshFromSignal() {
    if (!actor.value) return
    void loadList()
    if (selectedName.value && !transferNotice.value)
      detailUpdateAvailable.value = true
  }
  onMounted(() => {
    socket?.on('crm_inquiry_updated', refreshFromSignal)
    focusTarget?.addEventListener('focus', refreshFromSignal)
  })
  onBeforeUnmount(() => {
    for (const gate of [listGate, detailGate, mutationGate, assigneeGate])
      gate.invalidate()
    socket?.off('crm_inquiry_updated', refreshFromSignal)
    focusTarget?.removeEventListener('focus', refreshFromSignal)
  })

  return {
    items,
    hasMore,
    start,
    status,
    assignedTo,
    pageLength,
    listBusy,
    listError,
    inquiry,
    detailBusy,
    detailError,
    detailUpdateAvailable,
    transferNotice,
    mutationBusy,
    mutationError,
    assignees,
    assigneeError,
    loadList,
    loadDetail,
    loadAssignees,
    mutate,
  }
}
