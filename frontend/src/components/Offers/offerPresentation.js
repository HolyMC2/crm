import { dayjs, dayjsLocal, getConfig } from 'frappe-ui'

const nativeFormat = 'YYYY-MM-DD HH:mm:ss'
const displayFormat = 'D MMM YYYY, h:mm a'

function validTimezone(zone) {
  if (!zone || typeof zone !== 'string') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(0)
    return true
  } catch {
    return false
  }
}

export function offerDecisionTime(value) {
  // Native Datetime values are naive site time, optionally with microseconds.
  // Never reinterpret missing/invalid site metadata as browser-local time.
  const match =
    typeof value === 'string' &&
    value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?$/)
  if (!match) return __('Recorded time unavailable')
  const native = `${match[1]} ${match[2]}`
  const wallTime = dayjs(native, nativeFormat, true)
  if (!wallTime.isValid()) return __('Recorded time unavailable')
  const unverified = () =>
    `${wallTime.format(displayFormat)} · ${__('Timezone unavailable')}`
  const site = getConfig('systemTimezone')
  if (!validTimezone(site)) return unverified()
  try {
    const local =
      getConfig('localTimezone') ||
      Intl.DateTimeFormat().resolvedOptions().timeZone
    const zone = validTimezone(local) ? local : site
    const date = zone === local ? dayjsLocal(native) : dayjs.tz(native, site)
    return `${date.format(displayFormat)} · ${zone}`
  } catch {
    // A formatter/runtime lacking timezone data must not invent a conversion.
    return unverified()
  }
}
