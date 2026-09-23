import IndicatorIcon from '@/components/Icons/IndicatorIcon.vue'
import { parseColor, isTranslatable } from '@/utils'
import { guardStatusChange } from '@/utils/statusGuard'
import { defineStore } from 'pinia'
import { useTelemetry } from 'frappe-ui/frappe'
import { createListResource } from 'frappe-ui'
import { computed, reactive, h } from 'vue'

export const statusesStore = defineStore('crm-statuses', () => {
  let leadStatusesByName = reactive({})
  let dealStatusesByName = reactive({})
  let communicationStatusesByName = reactive({})

  const { capture } = useTelemetry()

  const leadStatuses = createListResource({
    doctype: 'CRM Lead Status',
    fields: ['name', 'color', 'position', 'type'],
    orderBy: 'position asc',
    cache: 'lead-statuses',
    initialData: [],
    auto: true,
    transform(statuses) {
      for (let status of statuses) {
        status.color = parseColor(status.color)
        leadStatusesByName[status.name] = status
      }
      return statuses
    },
  })

  // `probability` drives the weighted column totals; `hidden` marks the stages of
  // the tenant's INACTIVE language set (taller seeds the taxonomy in both). Cache
  // key bumped with the field set so nobody is served a cached row without them.
  const dealStatuses = createListResource({
    doctype: 'CRM Deal Status',
    fields: ['name', 'color', 'position', 'type', 'probability', 'hidden'],
    orderBy: 'position asc',
    cache: 'deal-statuses-v2',
    initialData: [],
    auto: true,
    transform(statuses) {
      for (let status of statuses) {
        status.color = parseColor(status.color)
        dealStatusesByName[status.name] = status
      }
      return statuses
    },
  })

  const communicationStatuses = createListResource({
    doctype: 'CRM Communication Status',
    fields: ['name'],
    cache: 'communication-statuses',
    initialData: [],
    auto: true,
    transform(statuses) {
      for (let status of statuses) {
        communicationStatusesByName[status.name] = status
      }
      return statuses
    },
  })

  // Pickers, boards, funnels and analytics use these; the by-name maps above keep
  // EVERY row, so a deal parked on a hidden twin still renders its own colour and
  // label instead of falling back to gray.
  // CRM Lead Status has no `hidden` column — the filter is a no-op there.
  const visibleDealStatuses = computed(() =>
    (dealStatuses.data || []).filter((s) => !s.hidden),
  )
  const visibleLeadStatuses = computed(() =>
    (leadStatuses.data || []).filter((s) => !s.hidden),
  )

  function getLeadStatus(name) {
    if (!name) {
      name = leadStatuses.data[0].name
    }
    return leadStatusesByName[name]
  }

  function getDealStatus(name) {
    if (!name) {
      name = dealStatuses.data[0].name
    }
    return dealStatusesByName[name]
  }

  function getCommunicationStatus(name) {
    if (!name) {
      name = communicationStatuses.data[0].name
    }
    return communicationStatuses[name]
  }

  function statusOptions(
    doctype,
    statuses = [],
    triggerStatusChange = null,
    triggerStatusChangeSilent = null,
  ) {
    let statusesByName =
      doctype == 'deal' ? dealStatusesByName : leadStatusesByName

    if (statuses?.length) {
      statusesByName = statuses.reduce((acc, status) => {
        acc[status] = statusesByName[status]
        return acc
      }, {})
    }

    let translatable = isTranslatable(
      doctype == 'deal' ? 'CRM Deal Status' : 'CRM Lead Status',
    )

    // A hidden stage is excluded from pickers too — otherwise a rep can still
    // park a deal on the inactive-language twin the board no longer shows. An
    // explicitly passed `statuses` list wins: the caller asked for those rows.
    const explicitSubset = Boolean(statuses?.length)

    let options = []
    for (const status in statusesByName) {
      if (!explicitSubset && statusesByName[status]?.hidden) continue
      options.push({
        label: translatable
          ? __(statusesByName[status]?.name)
          : statusesByName[status]?.name,
        value: statusesByName[status]?.name,
        icon: () => h(IndicatorIcon, { class: statusesByName[status]?.color }),
        onClick: async () => {
          // Completado/Entregado can auto-send WhatsApp — require explicit confirm
          // (3 wrong-WABA misclick incidents; see utils/statusGuard). Pages that
          // pass triggerStatusChangeSilent also get the "SIN avisar" escape for
          // stale orders (silent server path skips campaign enrollment).
          guardStatusChange(
            statusesByName[status]?.name,
            async () => {
              await triggerStatusChange?.(statusesByName[status]?.name)
              capture('status_changed', { doctype, status })
            },
            {
              onSilent: triggerStatusChangeSilent
                ? async () => {
                    await triggerStatusChangeSilent(
                      statusesByName[status]?.name,
                    )
                    capture('status_changed_silent', { doctype, status })
                  }
                : undefined,
            },
          )
        },
      })
    }
    return options
  }

  return {
    leadStatuses,
    dealStatuses,
    visibleLeadStatuses,
    visibleDealStatuses,
    communicationStatuses,
    getLeadStatus,
    getDealStatus,
    getCommunicationStatus,
    statusOptions,
  }
})
