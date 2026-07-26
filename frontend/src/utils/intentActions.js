// Intent → action-chip mapping (IntentChips.vue, spec 5.3). Pure + dependency-free
// so it unit-tests without a component mount or an i18n catalog. The backend
// (doco_marketing.api.intent.detect_intent) returns {intent, confidence, label};
// this decides WHICH single chip — if any — the composer surfaces, and which
// event it emits when tapped. Chips never send: the event opens an existing
// surface or prefills the composer (send stays human).
//
// Confidence gate: below MIN_CONFIDENCE nothing renders (avoid nagging the
// operator with a low-signal guess). 'otro' and unrecognized intents map to
// nothing. `label` (the model's short es-MX phrase, when present) overrides the
// static default; the component wraps the returned label in __() so the default
// strings below stay translatable while a dynamic backend label passes through.

export const MIN_CONFIDENCE = 0.6

// intent → chip descriptor. Order of keys mirrors spec 5.3.
export const INTENT_CHIPS = {
  pago: { icon: '💳', event: 'cobrar', label: 'Cobrar' },
  factura: { icon: '🧾', event: 'factura', label: 'Facturar' },
  cotizar_reparacion: { icon: '🔧', event: 'taller', label: 'Cotizar reparación' },
  precio: { icon: '🏷', event: 'catalogo', label: 'Ver catálogo' },
}

// Confidence must be a real number at or above the threshold. NaN / strings /
// null all fail closed (nothing renders).
export function passesConfidence(confidence) {
  return typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= MIN_CONFIDENCE
}

// The single chip descriptor to render, or null when nothing should show.
// Returns {icon, event, label}. `label` prefers a non-empty backend phrase,
// falling back to the static es-MX default for the intent.
export function chipForIntent(intent, confidence, label) {
  if (!passesConfidence(confidence)) return null
  const base = INTENT_CHIPS[intent]
  if (!base) return null
  const custom = (typeof label === 'string' ? label : '').trim()
  return { icon: base.icon, event: base.event, label: custom || base.label }
}
