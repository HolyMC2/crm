import { computed, ref, watch } from 'vue'

// Bills registering in the background (Gastos «Registrar»). Vue only, so the
// app entry can tell whether to load the tray without loading Gastos; a reload
// keeps them (this tab's sessionStorage). The tray (RegistrationTray.vue)
// listens for the outcome and says it.

const KEY = 'gastos.registrations'
// A registration older than this is not waited for after a reload.
const MAX_AGE_MS = 6 * 60 * 60 * 1000

function restore() {
  try {
    const rows = JSON.parse(globalThis.sessionStorage?.getItem(KEY) || '[]')
    return Array.isArray(rows)
      ? rows.filter(
          (row) => row?.name && Date.now() - (row.startedAt || 0) < MAX_AGE_MS,
        )
      : []
  } catch {
    return []
  }
}

export const registrations = ref(restore())
export const hasRegistrations = computed(() => registrations.value.length > 0)

watch(
  registrations,
  (rows) => {
    try {
      globalThis.sessionStorage?.setItem(KEY, JSON.stringify(rows))
    } catch {
      // Private mode or a full quota: the tray still works for this page.
    }
  },
  { deep: true },
)

export function registrationOf(name) {
  return registrations.value.find((row) => row.name === name) || null
}

/** Add the bill, or update the one already there (same name). */
export function upsertRegistration(entry) {
  const at = registrations.value.findIndex((row) => row.name === entry.name)
  if (at < 0) registrations.value = [...registrations.value, entry]
  else
    registrations.value = registrations.value.map((row, i) =>
      i === at ? { ...row, ...entry } : row,
    )
}

export function dismissRegistration(name) {
  registrations.value = registrations.value.filter((row) => row.name !== name)
}
