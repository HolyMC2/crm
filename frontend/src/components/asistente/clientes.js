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
