// The shell's doors to Mi cuenta and its one notice, from the boot's `account`
// (crm.api.cuenta.account: doco's plan summary on this site, never a platform
// call). Only the owner and «Mi Plan» delegates receive a plan; for everyone
// else these say nothing.
import { computed, ref } from 'vue'
import { shellBoot } from '@/composables/muelleShell'
import { cuentaAllowed } from '@/utils/shellRoutes'

const t = (text, replace) => __(text, replace, 'Cuenta')
// The notice speaks up this many days before a suspension (doco plan_state).
export const SUSPEND_SOON_DAYS = 3
const HIDDEN_KEY = 'muelle:cuenta-aviso'

export const cuentaOpen = computed(() => cuentaAllowed(shellBoot.value))

// doco's summary says `trial_over` once the end date has passed and Boat has
// not suspended the site yet; the day count stays at 0 then.
function trialEnds(plan, days) {
  if (plan.trial_over) return t('Your trial ended.')
  if (days <= 0) return t('Your trial ends today.')
  if (days === 1) return t('Your trial ends tomorrow.')
  return t('Your trial ends in {0} days.', [days])
}

/** One line under «Mi cuenta» in the menus: the trial's days or what is overdue. */
export function cuentaLine(account) {
  const plan = account?.cuenta === true ? account.plan : null
  if (!plan) return ''
  if (plan.overdue_count > 0)
    return plan.overdue_count === 1
      ? t('An invoice is overdue')
      : t('{0} invoices are overdue', [plan.overdue_count])
  if (plan.is_trial && typeof plan.trial_days_left === 'number') {
    const days = plan.trial_days_left
    if (plan.trial_over) return t('Your trial ended')
    if (days <= 0) return t('Your trial ends today')
    return days === 1
      ? t('Trial: 1 day left')
      : t('Trial: {0} days left', [days])
  }
  return ''
}

/** The shell's notice: an invoice past due, or a suspension within days; `cta` names where its link goes. */
export function accountNotice(account) {
  const plan = account?.cuenta === true ? account.plan : null
  if (!plan) return null
  if (plan.overdue_count > 0)
    return {
      key: `overdue:${plan.overdue_count}:${plan.overdue_amount}`,
      kind: 'overdue',
      text:
        plan.overdue_count === 1
          ? t('You have an overdue invoice. Pay it so you keep the service.')
          : t(
              'You have {0} overdue invoices. Pay them so you keep the service.',
              [plan.overdue_count],
            ),
      // Straight to the invoices: «Pagar» is one tap from there.
      to: '/cuenta?tab=facturacion',
      cta: t('See invoices'),
    }
  const days = plan.suspend_days_left
  if (typeof days !== 'number' || days > SUSPEND_SOON_DAYS) return null
  if (plan.is_trial)
    return {
      key: `suspend:${plan.suspend_at}`,
      kind: 'trial',
      text: `${trialEnds(plan, plan.trial_days_left ?? Math.max(0, days - 1))} ${t('Activate your plan so you keep the service.')}`,
      // Straight to the activation sheet, as Hoy's trial card does.
      to: '/cuenta?activar=1',
      cta: t('Activate'),
    }
  return {
    key: `suspend:${plan.suspend_at}`,
    kind: 'suspend',
    text:
      days <= 0
        ? t('Your site is suspended today. Check your account to avoid it.')
        : days === 1
          ? t(
              'Your site is suspended tomorrow. Check your account to avoid it.',
            )
          : t(
              'Your site is suspended in {0} days. Check your account to avoid it.',
              [days],
            ),
    to: '/cuenta',
    cta: t('See my account'),
  }
}

function readHidden() {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) || ''
  } catch {
    return ''
  }
}
const hidden = ref(readHidden())

/** The notice unless dismissed this session; a new one shows again. */
export const shellNotice = computed(() => {
  const notice = accountNotice(shellBoot.value?.account)
  return notice && notice.key !== hidden.value ? notice : null
})

export function dismissNotice() {
  const notice = accountNotice(shellBoot.value?.account)
  if (!notice) return
  hidden.value = notice.key
  try {
    sessionStorage.setItem(HIDDEN_KEY, notice.key)
  } catch {
    // private mode: hidden for this page only
  }
}
