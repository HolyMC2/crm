// The «⋯» tools of a record (Shell SPEC §6 DD5): which tools show, in what
// order, and why one is off. Pure, so the sheet stays a thin view and tests
// can read the rules. Permissions come from the server (`record.actions`,
// Frappe permissions and docstatus); a refused tool keeps its reason.

/**
 * The tools sheet entries for a record, in order. `allowed: false` entries stay
 * visible with their `reason` (the prerequisite is explained at the action);
 * tools that make no sense for this state are left out.
 * `wide` (≥1024) adds «Abrir en escritorio»; `avisame` adds «Avísame…»;
 * `extra` are entries other packages add (D6: «Todos los ajustes», «Pregúntale…»).
 */
export function toolsFor(
  record,
  { wide = false, avisame = false, extra = [] } = {},
) {
  if (!record) return []
  const a = record.actions || {}
  const docstatus = record.header?.docstatus ?? record.doc?.docstatus ?? 0
  const submittable = !!record.submittable
  const tool = (key, label, icon, opts = {}) => {
    const action = opts.action ? a[opts.action] : null
    return {
      key,
      label,
      icon,
      allowed: action ? !!action.allowed : true,
      reason: action && !action.allowed ? action.reason || '' : '',
      danger: !!opts.danger,
      hint: opts.hint || '',
    }
  }
  const out = [
    tool('assign', 'Asignar', 'lucide-user-plus', { action: 'assign' }),
    tool('comment', 'Comentar', 'lucide-message-square', {
      action: 'comment',
    }),
    tool('attach', 'Adjuntar', 'lucide-paperclip', { action: 'attach' }),
    tool('share', 'Compartir', 'lucide-share-2', {
      hint: 'Manda el PDF o el enlace',
    }),
    tool('print', 'Imprimir o PDF', 'lucide-printer', { action: 'print' }),
  ]
  if (avisame) out.push(tool('avisame', 'Avísame…', 'lucide-bell-plus'))
  for (const entry of extra || []) if (entry?.key) out.push({ ...entry })
  out.push(
    tool('duplicate', 'Duplicar', 'lucide-copy', { action: 'duplicate' }),
    tool('link', 'Copiar enlace', 'lucide-link'),
  )
  if (submittable && docstatus === 1)
    out.push(
      tool('cancel', 'Cancelar', 'lucide-ban', {
        action: 'cancel',
        danger: true,
      }),
    )
  if (submittable && docstatus === 2)
    out.push(tool('amend', 'Modificar', 'lucide-file-pen', { action: 'amend' }))
  if (docstatus !== 1)
    out.push(
      tool('delete', 'Eliminar', 'lucide-trash-2', {
        action: 'delete',
        danger: true,
      }),
    )
  if (wide)
    out.push(tool('desk', 'Abrir en escritorio', 'lucide-external-link'))
  return out
}

/** Desk's form URL (only «Abrir en escritorio» at ≥1024 uses it). */
export function deskUrl(doctype, name) {
  const slug = String(doctype || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  return `/app/${slug}/${encodeURIComponent(name)}`
}

/** The PDF of a record in one print format, in Spanish. */
export function pdfUrl(doctype, name, format = '') {
  const params = new URLSearchParams({ doctype, name, language: 'es-MX' })
  if (format) params.set('format', format)
  return `/api/method/frappe.utils.print_format.download_pdf?${params}`
}

/** The record's shell link, absolute, for «Copiar enlace» and «Compartir». */
export function shellUrl(path, origin = globalThis.location?.origin || '') {
  return `${origin}/crm${path.startsWith('/') ? path : `/${path}`}`
}

/** «Confirmar», «Cancelar», «Eliminar»: what each asks before it acts. */
export function confirmCopy(kind, { noun = 'el documento', title = '' } = {}) {
  const who = title ? ` de ${title}` : ''
  if (kind === 'submit')
    return {
      title: `¿Confirmar ${noun}${who}?`,
      message:
        'Ya confirmado no se puede editar; para corregirlo hay que cancelarlo y modificarlo.',
      confirm: 'Confirmar',
      tone: 'primary',
    }
  if (kind === 'cancel')
    return {
      title: `¿Cancelar ${noun}${who}?`,
      message:
        'Deja de contar en tus números. Lo que salió de él (entregas, cobros) se cancela aparte.',
      confirm: 'Cancelar documento',
      back: 'No cancelar',
      tone: 'danger',
    }
  if (kind === 'delete')
    return {
      title: `¿Eliminar ${noun}${who}?`,
      message: 'El borrador se borra para siempre.',
      confirm: 'Eliminar',
      tone: 'danger',
    }
  return null
}

// Button styles of the documentos sheets (Material 3: one filled action, tonal
// and text for the rest; 48px targets).
export const BTN = Object.freeze({
  filled:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-surface-gray-10 px-5 text-base font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50',
  danger:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-surface-red-7 px-5 text-base font-medium text-ink-red-1 hover:opacity-90 disabled:opacity-50',
  tonal:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-surface-gray-2 px-5 text-base font-medium text-ink-gray-9 hover:bg-surface-gray-3 disabled:opacity-50',
  text: 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50',
})

/** Copy text; true when it worked (clipboard API, then a hidden textarea). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

/**
 * Compartir: the PDF itself when the phone can share files (WhatsApp, correo),
 * else the link through the share sheet, else the link copied.
 * Returns 'shared' | 'copied' | 'cancelled' | 'failed'.
 */
export async function shareDocument({
  doctype,
  name,
  title,
  url,
  format = '',
}) {
  const nav = globalThis.navigator
  try {
    if (nav?.canShare && typeof File !== 'undefined') {
      const res = await fetch(pdfUrl(doctype, name, format), {
        credentials: 'same-origin',
      })
      if (res.ok) {
        const blob = await res.blob()
        const file = new File([blob], `${title || name}.pdf`, {
          type: 'application/pdf',
        })
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: title || name })
          return 'shared'
        }
      }
    }
    if (nav?.share) {
      await nav.share({ title: title || name, url })
      return 'shared'
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled'
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}

/** Adjuntar: upload one file to the record (private by default). */
export async function uploadAttachment({
  doctype,
  name,
  file,
  isPrivate = true,
}) {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('is_private', isPrivate ? '1' : '0')
  form.append('folder', 'Home/Attachments')
  form.append('doctype', doctype)
  form.append('docname', name)
  const headers = { Accept: 'application/json' }
  const token = globalThis.window?.csrf_token
  if (token && token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = token
  const res = await fetch('/api/method/upload_file', {
    method: 'POST',
    body: form,
    headers,
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let message = ''
    try {
      const body = await res.json()
      message = JSON.parse(
        JSON.parse(body._server_messages || '[]')[0] || '{}',
      ).message
    } catch {
      // the generic sentence below
    }
    throw new Error(
      message ||
        (res.status === 413
          ? 'El archivo es demasiado grande.'
          : 'No se pudo subir el archivo. Inténtalo de nuevo.'),
    )
  }
  return (await res.json()).message
}
