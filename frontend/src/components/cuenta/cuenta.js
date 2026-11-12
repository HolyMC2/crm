// Mi cuenta's Resumen in the owner's words, from one Mi plan bootstrap
// (doco.docoutils.miplan.bootstrap → boat tenant_portal.bootstrap). Pure: the
// page renders what these return. Meter math keeps Mi plan's meters.js rules:
// allowance 0 is «sin límite», a capped meter warns from 85 %.
import {
  LOCALE,
  dayDiff,
  formatDate,
  formatDateTime,
  formatMoney,
  parseServerDate,
} from '@/utils/display'

const t = (text, replace) => __(text, replace, 'Cuenta')
const MXN = 'MXN'

// Boat's site status is a key; the owner never reads it raw. Colour only
// where the owner has something to do: an active site is grey.
const SITE_STATUS = {
  Active: ['Active', 'neutral'],
  Suspended: ['Suspended', 'danger'],
  Archived: ['Archived', 'danger'],
  Broken: ['Having problems', 'danger'],
  Degraded: ['Having faults', 'warning'],
  Pending: ['Being prepared', 'warning'],
  Provisioning: ['Being prepared', 'warning'],
  Inactive: ['Inactive', 'neutral'],
}
export function siteStatus(status) {
  const [label, tone] = SITE_STATUS[status] || ['Having problems', 'danger']
  return { label: t(label), tone }
}

// The catalog's plan keys, as the owner reads them; another plan keeps its name.
const PLAN_NAMES = {
  basico: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
  corporativo: 'Corporativo',
}
const norm = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
export function planName(plan) {
  return plan ? PLAN_NAMES[norm(plan)] || String(plan) : ''
}

export const money = (value) => formatMoney(value || 0, MXN)
const num = (value) =>
  typeof value === 'number' ? value : parseFloat(value) || 0
const int = (value) =>
  new Intl.NumberFormat(LOCALE).format(Math.round(value || 0))
const plural = (n, one, many) => (n === 1 ? t(one) : t(many, [n]))

/** Plan, trial and next charge, from the bootstrap's site and billing meter. */
export function planView(data, now = new Date()) {
  const site = data?.site || {}
  const billing = data?.meters?.billing || {}
  const isTrial = Boolean(billing.is_trial ?? site.is_trial)
  const daysLeft =
    isTrial && typeof billing.trial_days_left === 'number'
      ? billing.trial_days_left
      : null
  // Boat counts the days left from 0 up: past its end date (and before the
  // suspension) the trial is over, not «ending today».
  const trialEnd = isTrial ? parseServerDate(billing.trial_end_date) : null
  const trialOver = Boolean(trialEnd) && dayDiff(trialEnd, now) < 0
  const price = num(billing.monthly_price_mxn ?? site.monthly_price_mxn)
  // Boat's cycle (meters.billing.billing_cycle): an Anual plan pays its
  // anualidad once, in the anniversary month; no cycle reads as monthly.
  const annual = billing.billing_cycle === 'Anual'
  const yearly = num(billing.annual_price_mxn)
  const cyclePrice = annual && yearly > 0 ? yearly : price
  // The base fee the next invoice bills (0 for an Anual plan outside its
  // anniversary month); a Boat without it bills the monthly price.
  const nextFee =
    typeof billing.next_plan_fee_mxn === 'number'
      ? billing.next_plan_fee_mxn
      : price
  const chargeDate = billing.next_charge_date || null
  const name = planName(site.plan)
  let next = ''
  if (!site.plan) next = t('No active plan')
  else if (isTrial)
    // The trial's days have their own strip (CuentaResumen): this line says
    // what the plan costs once it is activated.
    next =
      cyclePrice > 0
        ? annual
          ? t('Once activated: {0} a year, IVA included', [money(cyclePrice)])
          : t('Once activated: {0} a month, IVA included', [money(price)])
        : ''
  else if (chargeDate && !nextFee)
    next = t('Next invoice {0}', [formatDate(chargeDate)])
  else if (chargeDate)
    next = annual
      ? t('Charged {0}, annual fee {1} IVA included', [
          formatDate(chargeDate),
          money(nextFee),
        ])
      : t('Charged {0}, {1} IVA included', [
          formatDate(chargeDate),
          money(nextFee),
        ])
  return {
    name,
    title: name ? t('Plan {0}', [name]) : t('No plan'),
    status: siteStatus(site.status),
    active: site.status === 'Active',
    isTrial,
    daysLeft,
    trialOver,
    price,
    annual,
    cyclePrice,
    next,
  }
}

/** «Tu prueba termina en 5 días», today and tomorrow in words; «terminó» once past. */
export function trialTitle(daysLeft, over = false) {
  if (over) return t('Your trial ended')
  if (daysLeft == null) return t('You are on a trial')
  if (daysLeft <= 0) return t('Your trial ends today')
  if (daysLeft === 1) return t('Your trial ends tomorrow')
  return t('Your trial ends in {0} days', [daysLeft])
}

function walletState(meters) {
  const saldo = meters?.saldo || null
  const runway =
    typeof saldo?.recarga_days_left === 'number'
      ? saldo.recarga_days_left
      : null
  const threshold = saldo?.low_balance_threshold || 0
  // The wallet funds airtime only once this site has sold some (Mi plan's rule).
  const sellsAirtime = Boolean(
    saldo &&
      (saldo.recarga_last_at ||
        (saldo.recarga_spend_30d || 0) > 0 ||
        (saldo.recarga_count_month || 0) > 0),
  )
  return {
    balance: saldo ? saldo.balance_mxn ?? null : null,
    status: saldo?.status || '',
    low: Boolean(saldo) && threshold > 0 && saldo.balance_mxn <= threshold,
    runway,
    sellsAirtime,
    paysStamps: Boolean(meters?.cfdi),
  }
}

/**
 * What the wallet holds, or null when this site cannot hold saldo. Before its
 * first movement Boat sends no meter; with «wallet_return» on, bootstrap's
 * `wallet` says the site can hold saldo and the wallet reads $0.00.
 */
export function walletView(data) {
  const wallet = walletState(data?.meters)
  if (wallet.balance == null) {
    if (data?.wallet?.holds_saldo !== true) return null
    wallet.balance = num(data.wallet.balance_mxn)
  }
  let pace = ''
  if (wallet.sellsAirtime)
    pace =
      wallet.runway != null
        ? plural(
            wallet.runway,
            'At the pace of the last 30 days it lasts about 1 day.',
            'At the pace of the last 30 days it lasts about {0} days.',
          )
        : t('No recent spending to estimate how long it lasts.')
  return { ...wallet, text: money(wallet.balance), pace }
}

// A site that is not active, in the owner's words, with the one step that
// fixes it (Mi plan's siteStatusAlert): a trial comes back by activating, a
// debt suspension by paying, anything else needs a person.
function siteAlert(status, { isTrial, owesOverdue }) {
  const help = ['support', t('Ask for help')]
  if (status === 'Suspended') {
    if (isTrial)
      return [
        t(
          'Your trial ended and the site is suspended. Activate your plan to use it again.',
        ),
      ]
    if (owesOverdue)
      return [
        t(
          'The site is suspended for an overdue invoice. Pay it to reactivate it.',
        ),
        'pay',
        t('See invoices'),
      ]
    return [
      t(
        'The site is suspended. Write to us to find out why and reactivate it.',
      ),
      ...help,
    ]
  }
  if (status === 'Archived')
    return isTrial
      ? [t('The site is archived. Activate your plan to get it back.')]
      : [t('The site is archived. Write to us to get it back.'), ...help]
  if (status === 'Degraded' || status === 'Broken')
    return [
      t(
        'The site has technical faults. If something does not work for you, write to us.',
      ),
      ...help,
    ]
  if (status === 'Pending' || status === 'Provisioning')
    return [t('We are preparing the site. Check the status in a few minutes.')]
  return [
    t('The site is {0}. Write to us to check it.', [
      siteStatus(status).label.toLowerCase(),
    ]),
    ...help,
  ]
}

// What this site pays from the wallet: stamps beyond its package, airtime it sells.
function walletEmptyText(wallet) {
  if (wallet.paysStamps && wallet.sellsAirtime)
    return t(
      'The wallet is at zero and it pays for the stamps beyond your package and the airtime you sell. Top it up so they do not stop.',
    )
  if (wallet.paysStamps)
    return t(
      'The wallet is at zero and it pays for the stamps beyond your package. Top it up so they do not stop.',
    )
  if (wallet.sellsAirtime)
    return t(
      'The wallet is at zero and it pays for the airtime you sell. Top it up so it does not stop.',
    )
  return ''
}

/**
 * Everything that could interrupt selling, worst first (Mi plan's alerts).
 * `act` names the next step the page wires: support, pay, topup, activate, plans.
 */
export function accountAlerts(data) {
  const out = []
  const push = (level, text, act = '', cta = '') =>
    out.push({ level, text, act, cta })
  const site = data?.site || {}
  const meters = data?.meters || {}
  const invoices = data?.invoices || []
  const wallet = walletState(meters)
  const plan = planView(data)

  const overdue = invoices.filter((i) =>
    ['Overdue', 'Failed'].includes(i.status),
  )
  const pending = invoices.filter((i) =>
    ['Unpaid', 'Sent', 'Draft'].includes(i.status),
  )
  // A suspension caused by the overdue invoice already asks for that payment.
  const suspendedForDebt =
    site.status === 'Suspended' && !plan.isTrial && overdue.length > 0
  if (site.status && site.status !== 'Active')
    push(
      'bad',
      ...siteAlert(site.status, {
        isTrial: plan.isTrial,
        owesOverdue: overdue.length > 0,
      }),
    )
  // Every invoice to pay is one notice: its button opens Facturación, where
  // each one has its own «Pagar».
  const owed = suspendedForDebt ? 0 : overdue.length
  if (owed)
    push('bad', invoicesText(owed, pending.length), 'pay', t('See invoices'))
  if (wallet.status === 'empty') {
    // A wallet nothing draws on is no reason to act today.
    const text = walletEmptyText(wallet)
    if (text) push('bad', text, 'topup', t('Top up'))
  } else if (wallet.runway != null && wallet.runway <= 3)
    push(
      'bad',
      plural(
        wallet.runway,
        'At this pace the balance lasts 1 day. Top up today.',
        'At this pace the balance lasts {0} days. Top up today.',
      ),
      'topup',
      t('Top up'),
    )
  else if (wallet.status === 'low' || wallet.low)
    push(
      'warn',
      t('The balance is running low. Top up before it runs out.'),
      'topup',
      t('Top up'),
    )
  else if (wallet.runway != null && wallet.runway <= 7)
    push(
      'warn',
      t('The balance covers about {0} days.', [wallet.runway]),
      'topup',
      t('Top up'),
    )
  if (plan.isTrial && plan.daysLeft != null && plan.daysLeft <= 3)
    push(
      'warn',
      trialTitle(plan.daysLeft, plan.trialOver),
      'activate',
      t('Activate'),
    )
  if (!owed && pending.length)
    push('warn', invoicesText(0, pending.length), 'pay', t('See invoices'))
  const ssl = meters.health?.ssl_days_left
  if (ssl != null && ssl <= 15)
    push(
      'warn',
      plural(
        ssl,
        'The security certificate renews by itself; it expires in 1 day.',
        'The security certificate renews by itself; it expires in {0} days.',
      ),
    )
  const cfdi = meters.cfdi
  if (cfdi && cfdi.monthly_cap && cfdi.remaining === 0)
    push(
      'warn',
      t('You reached this month’s stamp limit.'),
      'plans',
      t('See plans'),
    )
  return out
}

// «Tienes 3 facturas por pagar, 1 vencida»: the overdue ones and the rest.
function invoicesText(overdue, pending) {
  if (!pending)
    return plural(
      overdue,
      'You have an overdue invoice. Pay it so you keep the service.',
      'You have {0} overdue invoices. Pay them so you keep the service.',
    )
  if (!overdue)
    return plural(
      pending,
      'You have an invoice to pay.',
      'You have {0} invoices to pay.',
    )
  return overdue === 1
    ? t('You have {0} invoices to pay, 1 overdue.', [overdue + pending])
    : t('You have {0} invoices to pay, {1} overdue.', [
        overdue + pending,
        overdue,
      ])
}

/** The verdict line: the worst alert decides. */
export function verdict(alerts) {
  if (alerts.some((a) => a.level === 'bad'))
    return { tone: 'bad', text: t('Needs action today') }
  if (alerts.some((a) => a.level === 'warn'))
    return { tone: 'warn', text: t('Needs attention') }
  return { tone: 'ok', text: t('All in order') }
}

/** Mi plan's meters.js: «12 / 100 timbres», a bare count without a cap. */
export function meterText(m) {
  if (!m) return ''
  const used = Math.round((m.used || 0) * 10) / 10
  if (!m.allowance) return `${used} ${m.unit || ''}`.trim()
  return `${used} / ${m.allowance} ${m.unit || ''}`.trim()
}
export function meterPct(m) {
  if (!m || !m.allowance) return 0
  return Math.min(100, Math.round(((m.used || 0) / m.allowance) * 100))
}

const gb = (v) => String(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10)
function row(key, label, value, pct, capped, sub = '') {
  return {
    key,
    label,
    value,
    pct: capped ? pct : null,
    warn: Boolean(capped) && pct >= 85,
    sub,
  }
}
function seatRow(key, label, used, cap) {
  return cap
    ? row(
        key,
        label,
        `${int(used)} / ${int(cap)}`,
        Math.min(100, Math.round((used / cap) * 100)),
        cap,
      )
    : row(key, label, int(used), null, 0, t('No limit'))
}

/** «Uso» in Mi plan's order: storage, stamps, seats, mail, WhatsApp. */
export function usageRows(data) {
  const m = data?.meters || {}
  const rows = []
  if (m.storage) {
    const parts = [
      [t('database'), m.storage.db_gb],
      [t('files'), m.storage.disk_gb],
      [t('backups'), m.storage.b2_gb],
    ]
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .map(([k, v]) => `${k} ${gb(v)} GB`)
    if (!m.storage.allowance) parts.push(t('no limit'))
    const split = parts.join(', ')
    rows.push(
      row(
        'storage',
        t('Storage'),
        meterText(m.storage).replace(/GB-month/g, 'GB'),
        meterPct(m.storage),
        m.storage.allowance,
        split ? split[0].toUpperCase() + split.slice(1) : '',
      ),
    )
  }
  if (m.cfdi) {
    const cap = m.cfdi.monthly_cap || m.cfdi.allowance || 0
    const used = Math.round(m.cfdi.used || 0)
    rows.push(
      cap
        ? row(
            'cfdi',
            t('CFDI stamps'),
            `${int(used)} / ${int(cap)}`,
            Math.min(100, Math.round((used / cap) * 100)),
            cap,
            m.cfdi.remaining != null
              ? t('{0} left this month', [int(m.cfdi.remaining)])
              : '',
          )
        : row(
            'cfdi',
            t('CFDI stamps'),
            int(used),
            null,
            0,
            t('This month, no limit'),
          ),
    )
  }
  // Seats counted on this site (boat only knows the caps), with the filters
  // that refuse the next user (doco seats.py).
  const local = data?.seats_local
  const caps = m.seats
  if (local) {
    rows.push(
      seatRow(
        'users',
        t('Active users'),
        local.users_used,
        local.users_cap || caps?.max_users || 0,
      ),
    )
    rows.push(
      seatRow(
        'registers',
        t('Registers and branches'),
        local.sucursales_used,
        local.sucursales_cap || caps?.max_sucursales || 0,
      ),
    )
  } else if (caps && (caps.max_users || caps.max_sucursales)) {
    rows.push(
      row(
        'seats',
        t('Users and registers allowed'),
        `${caps.max_users || '∞'} / ${caps.max_sucursales || '∞'}`,
        null,
        0,
      ),
    )
  }
  rows.push(
    row(
      'emails',
      t('System emails'),
      int(m.emails_sent),
      null,
      0,
      t('No limit'),
    ),
  )
  rows.push(
    row(
      'whatsapp',
      t('WhatsApp messages'),
      int(m.whatsapp_msgs),
      null,
      0,
      t('No limit'),
    ),
  )
  return rows
}

/** «Estado del sitio»: the last backup, the certificate and the last check. */
export function healthRows(data, now = new Date()) {
  const h = data?.meters?.health
  if (!h) return []
  const backupDays = h.last_backup_at
    ? Math.round(
        (now - new Date(String(h.last_backup_at).replace(' ', 'T'))) / 86400000,
      )
    : null
  return [
    {
      key: 'backup',
      label: t('Last backup'),
      value: h.last_backup_at
        ? formatDate(h.last_backup_at, { now })
        : t('No record'),
      warn: backupDays != null && backupDays > 2,
    },
    {
      key: 'ssl',
      label: t('Security certificate'),
      value:
        h.ssl_days_left != null
          ? plural(h.ssl_days_left, 'Renews in 1 day', 'Renews in {0} days')
          : '—',
      warn: h.ssl_days_left != null && h.ssl_days_left <= 15,
    },
    {
      key: 'check',
      label: t('Last check'),
      value: h.last_health_check
        ? formatDateTime(h.last_health_check, { now })
        : '—',
      warn: false,
    },
  ]
}

/**
 * What the activation sheet charges. Boat's quote (miplan.activation_quote) is
 * the exact amount with its lines; without one the plan's monthly price shows,
 * IVA included either way.
 */
export function validQuote(quote) {
  return (
    quote?.ok === true &&
    typeof quote.amount_mxn === 'number' &&
    Array.isArray(quote.lines) &&
    quote.lines.every(
      (line) =>
        line &&
        typeof line.label === 'string' &&
        typeof line.amount_mxn === 'number',
    )
  )
}

function dayOf(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null
}

/** «1–30 de noviembre», «28 de octubre–27 de noviembre»; '' without both days. */
export function periodRange(start, end) {
  const from = dayOf(start)
  const to = dayOf(end)
  if (!from || !to) return ''
  const format = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
  })
  return typeof format.formatRange === 'function'
    ? format.formatRange(from, to)
    : `${format.format(from)} – ${format.format(to)}`
}

// What the charge covers (Mi plan's quotePeriod): an Anual base fee is the
// anualidad, 12 months; every other line covers the invoice's month.
function quoteCovers(quote, plan) {
  const month = periodRange(quote.period?.start, quote.period?.end)
  const annual =
    (quote.billing_cycle || (plan?.annual ? 'Anual' : '')) === 'Anual'
  if (annual && quote.lines.some((line) => line.kind === 'base_fee')) {
    const rest = quote.lines.some(
      (line) =>
        line.kind && !['base_fee', 'partner_discount'].includes(line.kind),
    )
    return rest && month
      ? t('The annual fee covers 12 months; the rest covers {0}.', [month])
      : t('The annual fee covers 12 months.')
  }
  return month ? t('Covers {0}.', [month]) : ''
}

export function activationView(quote, plan) {
  if (validQuote(quote))
    return {
      exact: true,
      amount: money(quote.amount_mxn),
      lines: quote.lines.map((line, index) => ({
        key: `${index}:${line.label}`,
        label: line.label,
        amount: money(line.amount_mxn),
      })),
      note: t('IVA included'),
      covers: quoteCovers(quote, plan),
      free: !quote.amount_mxn,
    }
  const annual = Boolean(plan?.annual)
  return {
    exact: false,
    amount: money(annual ? plan.cyclePrice : plan?.price || 0),
    lines: [],
    note: annual ? t('a year, IVA included') : t('a month, IVA included'),
    covers: annual
      ? t(
          'It is the plan’s annual fee: it covers 12 months. Extra users and add-ons are added on the invoice.',
        )
      : t(
          'It is the plan’s monthly price. Extra users and add-ons are added on the invoice.',
        ),
    free: false,
  }
}

/** The top-up amounts offered as chips, inside the platform's bounds. */
export function topupChoices(store) {
  const lo = store?.topup_min || 50
  const hi = store?.topup_max || 10000
  return {
    min: lo,
    max: hi,
    quick: [200, 500, 1000, 2000].filter((v) => v >= lo && v <= hi),
  }
}

/**
 * «¿Para qué sirve?»: what the saldo pays on this site and how to top it up.
 * The stamps beyond the plan and the package always draw on it (Boat's prepaid
 * cfdi_stamp), with their price where Boat shows it (IVA included); airtime
 * only where this site sells it. Nothing about expiry: Boat's policy says none.
 */
export function walletHelp(data) {
  const cfdi = (data?.store?.addons || []).find(
    (addon) => addon?.service_key === 'cfdi_timbres',
  )
  const price = cfdi?.extra_stamp_price_mxn
  const pays = [
    typeof price === 'number' && price > 0
      ? t(
          'The stamps you issue beyond the ones your plan and package include: {0} each, IVA included.',
          [money(price)],
        )
      : t(
          'The stamps you issue beyond the ones your plan and package include.',
        ),
  ]
  if (walletState(data?.meters).sellsAirtime)
    pays.push(t('The airtime you sell.'))
  const { min, max } = topupChoices(data?.store)
  return {
    pays,
    topUp: t(
      'To add balance, tap Top up, choose an amount from {0} to {1} and pay on the secure payment page. You will see it here once the payment arrives.',
      [money(min), money(max)],
    ),
  }
}
