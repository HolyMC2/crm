// Cadence authoring helpers (Campaigns/CampaignDetail «Cadencias» mode, spec 4.2
// completion). Pure + dependency-free so vitest exercises them without Vue or a
// frappe-ui mock (dodges the vitest-4 spy-results trap — see outbox.test.js).
//
// A cadence IS an ordinary CRM Campaign flagged is_cadence=1; it walks the SAME
// engine as every campaign (services/campaign_engine._advance). That engine waits
// `wait_hours` from the moment a `wait` step runs, THEN the next step (a send)
// fires. So consecutive (wait, send_whatsapp) pairs whose INTER-step gaps are
// 24 / 48 / 96 h land the three touches at ~día 1, 3 y 7 after enrollment — the
// «no contestó → toque día 1/3/7» shape. Templates are left BLANK: the operator
// fills each slot before activating. Draft tolerates empty templates; the
// missing-template guard only bites at activation (crm_campaign._validate_send_content).

// Inter-step gaps that produce touches at día 1, 3 y 7 (cumulative 24/72/168 h).
export const CADENCE_TOUCH_WAITS_HOURS = [24, 48, 96]

// Build the day-1/3/7 scaffold as CRM Campaign Step rows the editor + engine both
// accept. Step shape mirrors StepCardList.addStep so the cards render immediately.
export function buildCadenceScaffold(waits = CADENCE_TOUCH_WAITS_HOURS) {
  const steps = []
  for (const hours of waits) {
    steps.push({
      step_type: 'wait',
      channel: '',
      wait_hours: hours,
      template: '',
      branch_condition: 'opened_previous',
    })
    steps.push({
      step_type: 'send_whatsapp',
      channel: 'whatsapp',
      wait_hours: 0,
      template: '',
      branch_condition: 'opened_previous',
    })
  }
  return steps
}

// A campaign's is_cadence nature may only flip while it has NO enrollments — once
// deals are marching a sequence, changing its nature would strand them between two
// mental models (audience-driven campaign vs deal-scoped cadence). This is a
// CLIENT guard only; the server (save_campaign) does NOT enforce it yet — flagged
// in the S19 report. Fails safe: any positive/truthy count locks the toggle.
export function cadenceToggleLocked(enrolledCount) {
  const n = Number(enrolledCount)
  return Number.isFinite(n) ? n > 0 : Boolean(enrolledCount)
}
