// «Importar del teléfono»: the contacts a phone exported (.vcf) that Contactos
// does not have yet. The server (doco.contactos.api.import_preview) reads the
// file and leaves out known numbers; the owner chooses Cliente, Otro or No for
// each row here, and import_contacts creates them in batches.

export const ACCEPT = '.vcf,text/vcard,text/x-vcard'
export const MAX_BYTES = 5 * 1024 * 1024
export const BATCH = 100

/** Where the owner exports the contacts, by phone. Words only; es-MX. */
export const SOURCES = Object.freeze([
  {
    value: 'android',
    label: 'Android',
    steps: [
      'Abre Contactos y toca el menú (☰ o ⋮).',
      'Toca Administrar contactos › Exportar contactos.',
      'Elige el almacenamiento del teléfono y toca Exportar: se guarda un archivo .vcf.',
    ],
  },
  {
    value: 'iphone',
    label: 'iPhone',
    steps: [
      'Abre Contactos y toca Listas.',
      'Mantén presionado Todos los contactos y toca Exportar.',
      'Guárdalo en Archivos: es un archivo .vcf.',
    ],
  },
  {
    value: 'google',
    label: 'Google',
    steps: [
      'En la computadora abre contacts.google.com.',
      'Toca Exportar, elige vCard y descarga el archivo.',
    ],
  },
])

export const CHOICES = Object.freeze([
  { value: 'cliente', label: 'Cliente' },
  { value: 'otro', label: 'Otro' },
  { value: 'no', label: 'No' },
])

/** A problem with the chosen file before it is sent, or ''. */
export function fileProblem(file) {
  if (!file) return ''
  if (!/\.vcf$/i.test(file.name || '') && !/vcard/i.test(file.type || ''))
    return 'Elige el archivo .vcf que exportó el teléfono.'
  if (file.size > MAX_BYTES)
    return 'El archivo pesa más de 5 MB. Exporta solo los contactos, sin fotos.'
  return ''
}

/** Rows from the server with the owner's choice; every row starts as Cliente. */
export function withChoices(rows, choice = 'cliente') {
  return (rows || []).map((row) => ({ ...row, kind: choice }))
}

const digits = (text) => String(text || '').replace(/\D/g, '')

/** Rows whose name, company or number contains what was typed. */
export function filterRows(rows, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (!q) return rows || []
  const qDigits = digits(q)
  return (rows || []).filter(
    (row) =>
      String(row.name || '')
        .toLowerCase()
        .includes(q) ||
      String(row.org || '')
        .toLowerCase()
        .includes(q) ||
      (qDigits.length >= 3 &&
        (row.numbers || []).some((number) => digits(number).includes(qDigits))),
  )
}

/** How many go in as Cliente and as Otro. */
export function tally(rows) {
  const counts = { cliente: 0, otro: 0, total: 0 }
  for (const row of rows || []) {
    if (row.kind === 'cliente' || row.kind === 'otro') {
      counts[row.kind] += 1
      counts.total += 1
    }
  }
  return counts
}

/** The chosen rows as the server takes them, in batches. */
export function batches(rows, size = BATCH) {
  const chosen = (rows || [])
    .filter((row) => row.kind === 'cliente' || row.kind === 'otro')
    .map(({ key, kind, name, first, last, numbers, emails }) => ({
      key,
      kind,
      name,
      first,
      last,
      numbers,
      emails,
    }))
  const out = []
  for (let i = 0; i < chosen.length; i += size)
    out.push(chosen.slice(i, i + size))
  return out
}

/** «+52 669 123 4567» for Mexican numbers; others as they came. */
export function displayNumber(number) {
  const text = String(number || '')
  const mx = /^\+52(\d{3})(\d{3})(\d{4})$/.exec(text)
  if (mx) return `+52 ${mx[1]} ${mx[2]} ${mx[3]}`
  const nanp = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(text)
  if (nanp) return `+1 ${nanp[1]} ${nanp[2]} ${nanp[3]}`
  return text
}

/** Adds one batch's answer to the running result. */
export function addResult(total, part) {
  return {
    created: (total?.created || 0) + (part?.created || 0),
    skipped: (total?.skipped || 0) + (part?.skipped || 0),
    failed: [...(total?.failed || []), ...(part?.failed || [])],
  }
}
