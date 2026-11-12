// Facturación › Datos fiscales over Boat's billing_profile (capability
// «billing_profile»): the RFC, razón social, régimen, código postal and uso CFDI
// Boat holds for this site's billing, whether they are enough to invoice
// (fiscal_ready), and the form's choices: the régimenes for the RFC's persona
// type (13 characters física, 12 moral; Boat's `personas` per régimen) and the
// usos each régimen allows (Boat's `regimenes` per uso). Boat validates the
// save; this only keeps the form from offering what Boat would refuse. Pure.
const t = (text, replace) => __(text, replace, 'Cuenta')

export const FIELDS = ['rfc', 'razon_social', 'regimen', 'cp', 'uso_cfdi']
export const DEFAULT_USO = 'G03'

/** The RFC as SAT writes it: capitals, no spaces or dashes. */
export function normRfc(value) {
  return String(value || '')
    .replace(/[\s-]/g, '')
    .toUpperCase()
}

/** 'fisica' (13 characters), 'moral' (12) or '' for anything else. */
export function rfcPersona(rfc) {
  const length = normRfc(rfc).length
  return length === 13 ? 'fisica' : length === 12 ? 'moral' : ''
}

const list = (value) => (Array.isArray(value) ? value : [])
const label = (row) => row?.label || row?.code || ''

/** The régimenes Boat offers, only those of the RFC's persona type once it is typed. */
export function regimenChoices(options, rfc) {
  const persona = rfcPersona(rfc)
  return list(options?.regimenes)
    .filter((row) => row?.code)
    .filter(
      (row) =>
        !persona ||
        !Array.isArray(row.personas) ||
        row.personas.includes(persona),
    )
    .map((row) => ({ value: row.code, label: label(row) }))
}

/** The usos CFDI that go with `regimen` (all of them before one is chosen). */
export function usoChoices(options, regimen) {
  return list(options?.usos)
    .filter((row) => row?.code)
    .filter(
      (row) =>
        !regimen ||
        !Array.isArray(row.regimenes) ||
        row.regimenes.includes(regimen),
    )
    .map((row) => ({ value: row.code, label: label(row) }))
}

/** The uso to keep when the régimen changes: the one chosen, else G03, else the first. */
export function fitUso(options, regimen, uso) {
  const choices = usoChoices(options, regimen)
  if (choices.some((row) => row.value === uso)) return uso
  if (choices.some((row) => row.value === DEFAULT_USO)) return DEFAULT_USO
  return choices[0]?.value || ''
}

const NAMES = {
  rfc: () => t('RFC'),
  razon_social: () => t('business name'),
  regimen: () => t('tax regime'),
  cp: () => t('postal code'),
  uso_cfdi: () => t('CFDI use'),
}

/** What a stored profile still lacks, in the owner's words. */
export function missingFields(profile) {
  return FIELDS.filter((key) => !String(profile?.[key] || '').trim()).map(
    (key) => NAMES[key](),
  )
}

/**
 * Boat's answer as the section reads it: the rows that hold data, and one
 * line that says «Listo para facturar» or what is missing.
 */
export function fiscalView(answer) {
  const profile = answer?.profile || {}
  const options = answer?.options || {}
  const nameOf = (rows, code) =>
    list(rows).find((row) => row?.code === code)?.label || code || ''
  const rows = [
    { key: 'rfc', label: t('RFC'), value: profile.rfc || '' },
    {
      key: 'razon_social',
      label: t('Business name'),
      value: profile.razon_social || '',
    },
    {
      key: 'regimen',
      label: t('Tax regime'),
      value: nameOf(options.regimenes, profile.regimen),
    },
    { key: 'cp', label: t('Postal code'), value: profile.cp || '' },
    {
      key: 'uso_cfdi',
      label: t('CFDI use'),
      value: nameOf(options.usos, profile.uso_cfdi),
    },
  ].filter((row) => row.value)
  const missing = missingFields(profile)
  let status
  if (answer?.fiscal_ready === true)
    status = { ready: true, text: t('Ready to invoice') }
  else if (!rows.length)
    status = {
      ready: false,
      text: t('Add your tax details so we can issue your CFDI.'),
    }
  else if (missing.length)
    status = {
      ready: false,
      text: t('Missing: {0}.', [missing.join(', ')]),
    }
  else
    status = {
      ready: false,
      // Every field is there and Boat still says no: the régimen does not fit the RFC.
      text: t(
        'Check your tax regime: it must match your RFC type, as on your tax certificate.',
      ),
    }
  return {
    rows,
    status,
    empty: !rows.length,
    canSave: answer?.can_save !== false,
  }
}

/** The form's starting values: what Boat holds, with the default uso. */
export function formFrom(profile) {
  return {
    rfc: profile?.rfc || '',
    razon_social: profile?.razon_social || '',
    regimen: profile?.regimen || '',
    cp: profile?.cp || '',
    uso_cfdi: profile?.uso_cfdi || DEFAULT_USO,
  }
}

/** Whether saving replaces an RFC already on file: miplan asks for the password then. */
export function replacesRfc(stored, typed) {
  const before = normRfc(stored)
  return Boolean(before) && normRfc(typed) !== before
}

/** What the form still needs before Boat can check it, in the owner's words; '' when complete. */
export function formGap(form) {
  const missing = FIELDS.filter((key) => !String(form?.[key] || '').trim())
  if (missing.length)
    return t('Fill in {0}.', [missing.map((key) => NAMES[key]()).join(', ')])
  if (!rfcPersona(form.rfc))
    return t('The RFC has 13 characters for a person or 12 for a company.')
  if (!/^\d{5}$/.test(String(form.cp).trim()))
    return t('The postal code has five digits.')
  return ''
}

/** The save's payload: the fields, the RFC as SAT writes it. */
export function savePayload(form) {
  return {
    rfc: normRfc(form.rfc),
    razon_social: String(form.razon_social || '').trim(),
    regimen: String(form.regimen || '').trim(),
    cp: String(form.cp || '').trim(),
    uso_cfdi: String(form.uso_cfdi || '').trim(),
  }
}
