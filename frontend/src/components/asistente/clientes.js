// Ajustes › Asistente para clientes (pages/AsistenteClientes.vue): the words and icons
// of the screen, kept here so a unit test reads what the worker sees.

export const modes = [
  {
    value: 'borrador',
    label: 'Todo pasa por revisión',
    line: 'Un gerente aprueba cada respuesta antes de que salga.',
  },
  {
    value: 'informativo',
    label: 'Contesta lo informativo',
    line: 'Precios, existencias, horarios y estado de reparaciones salen solos; lo demás espera revisión.',
  },
  {
    value: 'automatico',
    label: 'Automático',
    line: 'Todo sale solo.',
    trial: true,
  },
]

// Literal classes: an icon class built at runtime is never generated.
const ICONS = {
  WhatsApp: 'lucide-message-circle',
  Messenger: 'lucide-messages-square',
  Instagram: 'lucide-camera',
  Webchat: 'lucide-store',
}
const LABELS = {
  WhatsApp: 'WhatsApp',
  Messenger: 'Messenger',
  Instagram: 'Instagram',
  Webchat: 'Chat de la tienda',
}

export function providerIcon(provider) {
  return ICONS[provider] || 'lucide-message-circle'
}

export function providerLabel(provider) {
  return LABELS[provider] || provider
}

/** What would happen to a test reply in the current mode. */
export function decisionText(line) {
  if (line.decision === 'handoff') return 'Pasaría con una persona del equipo.'
  if (line.decision === 'send') return 'Saldría sola.'
  const reason = String(line.reason || '')
  if (reason.startsWith('ungrounded:'))
    return `Esperaría revisión: ${reason.slice(11)} no salió de una herramienta.`
  if (reason === 'promise')
    return 'Esperaría revisión: promete algo al cliente.'
  if (reason === 'drafted_something')
    return 'Esperaría revisión: registra una solicitud.'
  return 'Esperaría revisión de un gerente.'
}

/**
 * What a tool still lacks on this shop, in the owner's words: an unavailable tool's
 * blocker or an available tool's note («Cobrar en línea» with no online payment).
 */
export function toolLimits(tools) {
  return (tools || [])
    .map((tool) => ({
      name: tool.name,
      text: !tool.available ? tool.blocker : tool.note,
      label: tool.label,
      off: !tool.available,
    }))
    .filter((line) => line.text)
}

/** A product page as the chat shows it: the shop's domain and the path, no scheme. */
export function linkLabel(url) {
  try {
    const { hostname, pathname } = new URL(String(url))
    return (
      hostname.replace(/^www\./, '') + decodeURI(pathname).replace(/\/$/, '')
    )
  } catch {
    return String(url || '')
  }
}

/** The product cards a review row or a test reply carries (never anything else). */
export function productCards(value) {
  return (Array.isArray(value) ? value : [])
    .filter(
      (card) => card && typeof card.title === 'string' && card.title.trim(),
    )
    .slice(0, 3)
}
