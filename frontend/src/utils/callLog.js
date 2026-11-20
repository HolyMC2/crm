import { formatDate } from '@/utils'
import { timestampCell } from '@/composables/useTimelinePreferences'
import { getMeta } from '@/stores/meta'

const { getFormattedPercent, getFormattedFloat, getFormattedCurrency } =
  getMeta('CRM Call Log')

export function getCallLogDetail(row, log, columns = []) {
  let incoming = log.type === 'Incoming'

  if (row === 'duration') {
    return {
      label: log._duration,
      icon: 'clock',
    }
  } else if (row === 'caller') {
    return {
      label: log._caller?.label,
      image: log._caller?.image,
    }
  } else if (row === 'receiver') {
    return {
      label: log._receiver?.label,
      image: log._receiver?.image,
    }
  } else if (row === 'type') {
    return {
      label: log.type,
      icon: incoming ? 'phone-incoming' : 'phone-outgoing',
    }
  } else if (row === 'status') {
    return {
      label: statusLabelMap[log.status],
      color: statusColorMap[log.status],
    }
  } else if (['modified', 'creation'].includes(row)) {
    return timestampCell(log[row])
  }

  let fieldType = columns?.find((col) => (col.key || col.value) == row)?.type

  if (fieldType && ['Date', 'Datetime'].includes(fieldType)) {
    return formatDate(log[row], '', true, fieldType == 'Datetime')
  }

  if (fieldType && fieldType == 'Currency') {
    return getFormattedCurrency(row, log)
  }

  if (fieldType && fieldType == 'Float') {
    return getFormattedFloat(row, log)
  }

  if (fieldType && fieldType == 'Percent') {
    return getFormattedPercent(row, log)
  }

  return log[row]
}

// Getters: each label translates when it renders, with the dictionary in use
// then (a table filled when the module loads keeps the words of that moment).
export const statusLabelMap = {
  get Completed() {
    return __('Completed')
  },
  get Initiated() {
    return __('Initiated')
  },
  get Busy() {
    return __('Declined')
  },
  get Failed() {
    return __('Failed')
  },
  get Queued() {
    return __('Queued')
  },
  get Canceled() {
    return __('Canceled')
  },
  get Ringing() {
    return __('Ringing')
  },
  get 'No Answer'() {
    return __('Missed Call')
  },
  get 'In Progress'() {
    return __('In Progress')
  },
}

export const statusColorMap = {
  Completed: 'green',
  Busy: 'orange',
  Failed: 'red',
  Initiated: 'gray',
  Queued: 'gray',
  Canceled: 'gray',
  Ringing: 'gray',
  'No Answer': 'red',
  'In Progress': 'blue',
}
