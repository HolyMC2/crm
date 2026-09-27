// One authenticated owner for CRM's native onboarding registry. Layouts and
// completion callers share readiness; no optional sidebar owns initialization.
import { computed, reactive, ref, markRaw, nextTick } from 'vue'
import { useStorage } from '@vueuse/core'
import { call, createResource, getCachedResource } from 'frappe-ui'
import { useOnboarding, useTelemetry, minimize } from 'frappe-ui/frappe'
import { usersStore } from '@/stores/users'
import { sessionStore } from '@/stores/session'
import { useBroadcast } from '@/composables/useBroadcast'
import { showSettings, activeSettingsPage } from '@/composables/settings'
import { showChangePasswordModal } from '@/composables/modals'
import router from '@/router'
import SquareAsterisk from '@/components/Icons/SquareAsterisk.vue'
import LeadsIcon from '@/components/Icons/LeadsIcon.vue'
import InviteIcon from '@/components/Icons/InviteIcon.vue'
import ConvertIcon from '@/components/Icons/ConvertIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import EmailIcon from '@/components/Icons/EmailIcon.vue'
import StepsIcon from '@/components/Icons/StepsIcon.vue'

let owner

export function useCrmOnboarding() {
  const session = sessionStore()
  const user = session.user
  if (!session.isLoggedIn || !user || user === 'Guest') return null
  if (owner?.user === user) return owner

  const { users, isManager } = usersStore()
  const { capture } = useTelemetry()
  const { send } = useBroadcast()
  // Claim the canonical cache before native useOnboarding can launch an
  // unawaited auto fetch. The active App initializes before child layouts.
  const status =
    getCachedResource('onboarding_status') ||
    createResource({
      url: 'frappe.onboarding.get_onboarding_status',
      cache: 'onboarding_status',
      auto: false,
    })
  status.update({ auto: false })
  const savedStatus = useStorage('onboardingStatus', {})
  const native = useOnboarding('frappecrm')
  const error = ref(null)
  const ready = ref(false)
  const loading = ref(false)
  const pending = []
  let initializing = null

  async function getFirstLead() {
    let firstLead = localStorage.getItem('firstLead' + user)
    if (firstLead) return firstLead
    return await call('crm.api.onboarding.get_first_lead')
  }

  async function getFirstDeal() {
    let firstDeal = localStorage.getItem('firstDeal' + user)
    if (firstDeal) return firstDeal
    return await call('crm.api.onboarding.get_first_deal')
  }

  const showIntermediateModal = ref(false)
  const currentStep = ref({})

  const steps = reactive([
    {
      name: 'setup_your_password',
      title: __('Setup your password'),
      icon: markRaw(SquareAsterisk),
      completed: false,
      onClick: () => {
        minimize.value = true
        showChangePasswordModal.value = true
        capture('onboarding_step_clicked_setup_password')
      },
    },
    {
      name: 'create_first_lead',
      title: __('Create your first lead'),
      icon: markRaw(LeadsIcon),
      completed: false,
      onClick: () => {
        minimize.value = true
        router.push({ name: 'Leads' })
        send('trigger_lead_create', true)
        capture('onboarding_step_clicked_create_first_lead')
      },
    },
    {
      name: 'invite_your_team',
      title: __('Invite your team'),
      icon: markRaw(InviteIcon),
      completed: false,
      onClick: () => {
        minimize.value = true
        showSettings.value = true
        activeSettingsPage.value = 'Invite User'
        capture('onboarding_step_clicked_invite_your_team')
      },
      condition: () => isManager(),
    },
    {
      name: 'convert_lead_to_deal',
      title: __('Convert lead to deal'),
      icon: markRaw(ConvertIcon),
      completed: false,
      dependsOn: 'create_first_lead',
      onClick: async () => {
        minimize.value = true
        capture('onboarding_step_clicked_convert_lead_to_deal')
        currentStep.value = {
          title: __('Convert lead to deal'),
          buttonLabel: __('Convert'),
          videoURL: '/assets/crm/videos/convertToDeal.mov',
          onClick: async () => {
            showIntermediateModal.value = false
            currentStep.value = {}

            let lead = await getFirstLead()
            if (lead) {
              router.push({ name: 'Lead', params: { leadId: lead } })
            } else {
              router.push({ name: 'Leads' })
            }
          },
        }
        showIntermediateModal.value = true
      },
    },
    {
      name: 'create_first_task',
      title: __('Create your first task'),
      icon: markRaw(TaskIcon),
      completed: false,
      onClick: async () => {
        minimize.value = true
        let deal = await getFirstDeal()
        capture('onboarding_step_clicked_create_first_task')

        if (deal) {
          router.push({
            name: 'Deal',
            params: { dealId: deal },
            hash: '#tasks',
          })
        } else {
          router.push({ name: 'Tasks' })
        }
      },
    },
    {
      name: 'create_first_note',
      title: __('Create your first note'),
      icon: markRaw(NoteIcon),
      completed: false,
      onClick: async () => {
        minimize.value = true
        let deal = await getFirstDeal()
        capture('onboarding_step_clicked_create_first_note')

        if (deal) {
          router.push({
            name: 'Deal',
            params: { dealId: deal },
            hash: '#notes',
          })
        } else {
          router.push({ name: 'Notes' })
        }
      },
    },
    {
      name: 'add_first_comment',
      title: __('Add your first comment'),
      icon: markRaw(CommentIcon),
      completed: false,
      dependsOn: 'create_first_lead',
      onClick: async () => {
        minimize.value = true
        let deal = await getFirstDeal()
        capture('onboarding_step_clicked_add_first_comment')

        if (deal) {
          router.push({
            name: 'Deal',
            params: { dealId: deal },
            hash: '#comments',
          })
        } else {
          router.push({ name: 'Leads' })
        }
      },
    },
    {
      name: 'send_first_email',
      title: __('Send email'),
      icon: markRaw(EmailIcon),
      completed: false,
      dependsOn: 'create_first_lead',
      onClick: async () => {
        minimize.value = true
        let deal = await getFirstDeal()
        capture('onboarding_step_clicked_send_first_email')

        if (deal) {
          router.push({
            name: 'Deal',
            params: { dealId: deal },
            hash: '#emails',
          })
        } else {
          router.push({ name: 'Leads' })
        }
      },
    },
    {
      name: 'change_deal_status',
      title: __('Change deal status'),
      icon: markRaw(StepsIcon),
      completed: false,
      dependsOn: 'convert_lead_to_deal',
      onClick: async () => {
        minimize.value = true
        capture('onboarding_step_clicked_change_deal_status')

        currentStep.value = {
          title: __('Change deal status'),
          buttonLabel: __('Change'),
          videoURL: '/assets/crm/videos/changeDealStatus.mov',
          onClick: async () => {
            showIntermediateModal.value = false
            currentStep.value = {}

            let deal = await getFirstDeal()
            if (deal) {
              router.push({
                name: 'Deal',
                params: { dealId: deal },
                hash: '#activity',
              })
            } else {
              router.push({ name: 'Leads' })
            }
          },
        }
        showIntermediateModal.value = true
      },
    },
  ])

  function assertSession() {
    if (session.user !== user || !session.isLoggedIn) {
      throw new Error(__('The CRM session changed. Reload before continuing.'))
    }
  }

  async function initialize() {
    assertSession()
    if (ready.value) return
    if (initializing) return initializing
    loading.value = true
    initializing = (async () => {
      // These are the existing native resources, including their real failures.
      // Never register guessed roles or overwrite saved progress with an empty
      // result when the status endpoint is unavailable.
      if (
        users.error ||
        (error.value &&
          !users.data?.allUsers?.some((row) => row.name === user && row.role))
      )
        await users.reload()
      else if (users.promise) await users.promise
      if (users.error) throw users.error
      if (!users.data?.allUsers?.some((row) => row.name === user && row.role)) {
        throw new Error(
          __('Your CRM role could not be loaded. Retry onboarding setup.'),
        )
      }
      await status.fetch()
      if (status.error) throw status.error
      if (
        !status.fetched ||
        !status.data ||
        Array.isArray(status.data) ||
        typeof status.data !== 'object'
      ) {
        throw new Error(
          __(
            'Your onboarding status could not be loaded. Retry onboarding setup.',
          ),
        )
      }
      const savedSteps = status.data.frappecrm_onboarding_status
      if (
        savedSteps !== undefined &&
        (!Array.isArray(savedSteps) ||
          savedSteps.some(
            (step) =>
              !step ||
              typeof step.name !== 'string' ||
              !['boolean', 'number'].includes(typeof step.completed),
          ))
      ) {
        throw new Error(
          __('Your onboarding status is invalid. Retry onboarding setup.'),
        )
      }
      savedStatus.value = { ...savedStatus.value, [user]: status.data }
      // Let the native useStorage instance observe the same canonical key.
      await nextTick()
      assertSession()
      native.setUp(steps.filter((step) => !step.condition || step.condition()))
      ready.value = true
      error.value = null
    })()
    try {
      await initializing
    } catch (failure) {
      error.value = failure
      throw failure
    } finally {
      initializing = null
      loading.value = false
    }
  }

  async function retry() {
    try {
      await initialize()
      assertSession()
      while (pending.length) {
        const action = pending[0]
        // Keep a failed native action visible/retryable; never repeat the CRM
        // business action that already succeeded (Lead/Deal/Task creation).
        native[action.method](...action.args)
        pending.shift()
      }
      error.value = null
      return true
    } catch (failure) {
      error.value = failure
      return false
    }
  }

  const api = {
    user,
    error,
    ready,
    loading,
    retry,
    showIntermediateModal,
    currentStep,
    isOnboardingStepsCompleted: native.isOnboardingStepsCompleted,
    stepsCompleted: native.stepsCompleted,
    totalSteps: native.totalSteps,
    completedPercentage: native.completedPercentage,
    steps: computed(() =>
      steps.filter((step) => !step.condition || step.condition()),
    ),
  }
  for (const method of [
    'updateOnboardingStep',
    'skip',
    'skipAll',
    'reset',
    'resetAll',
  ]) {
    api[method] = (...args) => {
      pending.push({ method, args })
      // Callers historically invoke native completion inside onSuccess without
      // awaiting it. Report setup failures through shared state instead of an
      // unhandled promise; explicit Retry resumes only pending onboarding work.
      return retry()
    }
  }
  owner = api
  void retry()
  return api
}
