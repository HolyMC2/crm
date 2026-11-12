// One more user (or caja) where the plan's cap refuses something outside Mi
// cuenta: Equipo's alta asks here what to offer (doco's sheet `seatStep`).
// The owner or a «Mi Plan» delegate (the boot's account.cuenta) on a Boat that
// sells seats (bootstrap capability «seats») buys one in place: Mi cuenta's
// quote sheet (UsuariosSheet) preset to one more, over the same miplan seams.
// Without the capability the way is Mi cuenta › Tienda; anyone else is told
// to ask the owner, with no money on screen. Every figure is Boat's. Boat
// applies a purchase at once and the site's cap follows a moment later: while
// Boat's count is above the site's, the answer is to check again, not to buy.
import { ref, shallowRef } from 'vue'
import { mutate, read, seam } from './api'
import { capable, money, refusalView, seamOff } from './autoservicio'
import { readSeats, seatNames, seatRows } from './usuarios'

const t = (text, replace) => __(text, replace, 'Cuenta')
// An offer read from Boat answers the refusals of the next minute.
const FRESH_MS = 60_000
// Without the site's own cap to compare, a purchase from this page counts as
// on its way for this long.
const BOUGHT_MS = 5 * 60_000
// The site's caps in the bootstrap (miplan's seats_local).
const LOCAL_CAP = { users: 'users_cap', sucursales: 'sucursales_cap' }

/** «Agregar 1 usuario por $99.00 al mes, IVA incluido», from Boat's unit price. */
export function offerLabel(key, unit) {
  return t('Add 1 {0} for {1} a month, IVA included', [
    seatNames(key).one,
    money(unit),
  ])
}

/** Who to ask when this person cannot buy: the owner. */
export function askLabel(key) {
  return key === 'sucursales'
    ? t('Ask the owner to add a register.')
    : t('Ask the owner to add a user.')
}

/** A seat the plan already has that has not reached this site yet. */
export function waitLabel(key) {
  return key === 'sucursales'
    ? t(
        'Your plan already has one more register; it takes a moment to reach this system.',
      )
    : t(
        'Your plan already has one more user; it takes a moment to reach this system.',
      )
}

/**
 * How many seats Boat counts (included + extra) above this site's own cap,
 * from Boat's quote and the bootstrap's seats_local: a purchase Boat applied
 * whose cap has not reached the site. null when the site's cap is unknown.
 */
export function seatsOnTheWay(quote, data, key) {
  const local = data?.seats_local?.[LOCAL_CAP[key]]
  const d = quote?.[key]
  if (!Number.isInteger(local) || !d?.included) return null
  // 0 on the site is no limit: nothing there waits for a seat.
  if (local <= 0) return 0
  return Math.max(0, d.included + d.extra - local)
}

// Boat's next steps (autoservicio's acts) as Mi cuenta's addresses.
const ROUTES = {
  activate: { path: '/cuenta', query: { activar: '1' } },
  pay: { path: '/cuenta', query: { tab: 'facturacion' } },
  resume: { path: '/cuenta', query: { tab: 'resumen' } },
}
/** Where an act takes the owner in Mi cuenta; Tienda (plans, users) by default. */
export function cuentaRoute(act) {
  return ROUTES[act] || { path: '/cuenta', query: { tab: 'tienda' } }
}

/**
 * What a refusal at the cap offers, from whether this person may open Mi
 * cuenta, the bootstrap Boat answered (null when it could not be read), its
 * seat read (usuarios.readSeats: {quote} or {refusal}) and whether this page
 * bought one of these seats a moment ago (`bought`). Pure:
 * {mode: 'buy', label, change} with the sheet's change preset to one more
 * than today's extras, {mode: 'wait', label} while a seat Boat has not reached
 * the site, {mode: 'link', label, act, text} toward Mi cuenta, or
 * {mode: 'ask', label}.
 */
export function seatOffer({
  allowed,
  data = null,
  seats = null,
  key,
  bought = false,
}) {
  if (!allowed) return { mode: 'ask', label: askLabel(key) }
  const store = {
    mode: 'link',
    label: t('See plans in My account'),
    act: 'plans',
    text: '',
  }
  if (!data || !capable(data, 'seats') || !seats || seamOff(seats.refusal))
    return store
  if (!seats.quote) {
    // Boat's sentence (a trial, an unpaid invoice) with its own next step.
    const why = refusalView(seats.refusal)
    return why?.next
      ? { ...store, text: why.text, label: why.next.label, act: why.next.act }
      : { ...store, text: why?.text || '' }
  }
  const row = seatRows(seats.quote, data).find((r) => r.key === key)
  if (!row || row.limitless) return store
  const coming = seatsOnTheWay(seats.quote, data, key)
  if (coming > 0 || (coming == null && bought))
    return { mode: 'wait', label: waitLabel(key) }
  if (!row.sold)
    return {
      ...store,
      text: t(
        'Your plan does not sell extra ones; another plan may include more.',
      ),
    }
  return {
    mode: 'buy',
    label: offerLabel(key, seats.quote[key].unit_price_mxn),
    // One more than the site has today: with a decrease scheduled, one more
    // than the scheduled figure would only change or cancel that decrease.
    change: {
      key,
      extra: row.extra,
      planned: row.planned,
      target: Math.max(row.extra, row.planned) + 1,
    },
  }
}

/**
 * The page's seat step: `offer(key)` answers doco's sheet, and `door`, `open`
 * and `change` drive SeatStepSheet. The payment door (pagos.js) loads with the
 * first refusal, and a purchase, a close or a way out settle the sheet that
 * asked (`done(true | false | 'left')`).
 * @param {object} options
 * @param {() => boolean} options.allowed whether this person may open Mi cuenta
 * @param {(to: object) => void} options.navigate the router's push
 */
export function createSeatStep({
  allowed,
  navigate,
  pagos = () => import('./pagos'),
  io = { read, mutate, seam },
  now = () => Date.now(),
}) {
  const door = shallowRef(null)
  const open = ref(false)
  const change = ref(null)
  let reply = null
  let cached = null
  // {key, at}: the last seat this page bought (Boat said it applied).
  let bought = null

  async function plan() {
    if (!door.value) {
      const { createPagos } = await pagos()
      door.value = createPagos({
        read: io.read,
        mutate: io.mutate,
        panel: 'cuenta',
        tab: () => 'tienda',
      })
    }
    await door.value.load()
    return door.value.error.value ? null : door.value.boot.value
  }

  async function describe(key) {
    if (!allowed()) return seatOffer({ allowed: false, key })
    let data = null
    let seats = null
    try {
      data = await plan()
      if (data && capable(data, 'seats')) seats = await readSeats(io.seam, data)
    } catch {
      // The plan could not be read: Mi cuenta says why.
      seats = null
    }
    const recent = bought?.key === key && now() - bought.at < BOUGHT_MS
    return seatOffer({ allowed: true, data, seats, key, bought: recent })
  }

  function settle(result) {
    const answer = reply
    reply = null
    open.value = false
    answer?.(result)
  }

  function go(act) {
    if (act === 'support' && door.value) door.value.contactSupport()
    else navigate(cuentaRoute(act))
  }

  async function offer(key) {
    const at = now()
    if (!cached || cached.key !== key || at - cached.at > FRESH_MS)
      cached = { key, at, promise: describe(key) }
    const found = await cached.promise
    // A seat on its way is asked again next time: it may have arrived.
    if (found.mode === 'wait') {
      cached = null
      return { mode: 'wait', label: found.label }
    }
    if (found.mode === 'buy')
      return {
        mode: 'buy',
        label: found.label,
        run(done) {
          reply = done
          change.value = { ...found.change }
          open.value = true
        },
      }
    if (found.mode === 'link')
      return {
        mode: 'link',
        label: found.label,
        text: found.text,
        run: () => go(found.act),
      }
    return { mode: 'ask', label: found.label }
  }

  return {
    door,
    open,
    change,
    offer,
    /** The sheet closed without a change: back to the alta as it was. */
    close: () => settle(false),
    /**
     * Boat applied the change (set_seats' answer): when it raised this seat
     * the alta goes again on its own; any other change (a decrease, a
     * cancelled one) brings the alta back as it was.
     */
    done(answer = null) {
      const key = change.value?.key
      const raised =
        !Array.isArray(answer?.applied) || answer.applied.includes(key)
      cached = null
      if (raised) bought = { key, at: now() }
      settle(raised)
    },
    /** A next step out of the sheet (invoices, plans, support): the alta closes too. */
    act(key) {
      settle('left')
      go(key)
    },
    dispose: () => door.value?.dispose(),
  }
}
