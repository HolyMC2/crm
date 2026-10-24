import { call, createResource } from 'frappe-ui'
import { useStorage } from '@vueuse/core'
import { computed, reactive } from 'vue'
import { minimize, showHelpModal } from './help'
import { sessionUser } from '../../utils/session'
import type {
  OnboardingBulkCallback,
  OnboardingStep,
  OnboardingStepCallback,
  UseOnboarding,
} from './types'

type StoredStep = { name: string; completed: boolean }
type StoredStatus = Record<string, Record<string, StoredStep[]>>

// Registered per (app, user): a second user signing in on the same tab must
// not read the first user's steps (SOURCE.json, local change 1).
const onboardings = reactive<Record<string, OnboardingStep[]>>({})
const onboardingStatus = useStorage<StoredStatus>('onboardingStatus', {})

/**
 * Read and write the signed-in user's getting-started checklist for one app.
 *
 * Returns `undefined` when nobody is signed in, so call sites have to guard —
 * the banner and the modal are not rendered for guests.
 *
 * Every write returns the persistence promise: local completion and the
 * callback are published only after the native status POST succeeds, and a
 * rejection reaches the caller, which can retain and retry the action
 * (SOURCE.json, local change 2).
 */
export function useOnboarding(appName: string): UseOnboarding | undefined {
  const user = sessionUser()

  if (!user || user === 'Guest') return

  // `updateOnboardingStep` and `updateAll` are hoisted function declarations, so
  // TypeScript does not carry the guard above into them. This const does.
  const userId: string = user
  const registryKey = JSON.stringify([appName, userId])

  const isOnboardingStepsCompleted = useStorage(
    'isOnboardingStepsCompleted' + appName + userId,
    false,
  )

  const onboardingSteps = computed<StoredStep[]>(
    () =>
      onboardingStatus.value?.[userId]?.[appName + '_onboarding_status'] || [],
  )

  if (!onboardingSteps.value.length && !isOnboardingStepsCompleted.value) {
    createResource({
      url: 'frappe.onboarding.get_onboarding_status',
      cache: ['onboarding_status', userId],
      auto: true,
      onSuccess: (data: Record<string, StoredStep[]>) => {
        onboardingStatus.value[userId] = data
        syncStatus()
      },
    })
  }

  const stepsCompleted = computed(
    () =>
      onboardings[registryKey]?.filter((step) => step.completed).length || 0,
  )
  const totalSteps = computed(() => onboardings[registryKey]?.length || 0)

  const completedPercentage = computed(() =>
    Math.floor((stepsCompleted.value / totalSteps.value) * 100),
  )

  function skip(step: string, callback: OnboardingStepCallback | null = null) {
    return updateOnboardingStep(step, true, true, callback)
  }

  function skipAll(callback: OnboardingBulkCallback | null = null) {
    return updateAll(true, callback)
  }

  function reset(step: string, callback: OnboardingStepCallback | null = null) {
    return updateOnboardingStep(step, false, false, callback)
  }

  function resetAll(callback: OnboardingBulkCallback | null = null) {
    return updateAll(false, callback)
  }

  async function updateOnboardingStep(
    step: string,
    value = true,
    skipped = false,
    callback: OnboardingStepCallback | null = null,
  ) {
    if (isOnboardingStepsCompleted.value) return

    const nextSteps = copySteps()
    const index = nextSteps.findIndex((s) => s.name === step)
    if (index !== -1) nextSteps[index]!.completed = value

    await updateUserOnboardingStatus(nextSteps)
    if (!onboardingStatus.value[userId]) onboardingStatus.value[userId] = {}
    onboardingStatus.value[userId]![appName + '_onboarding_status'] = nextSteps
    const currentStep = onboardings[registryKey]?.find((s) => s.name === step)
    if (currentStep) currentStep.completed = value
    callback?.(step, skipped)
    minimize.value = false
  }

  async function updateAll(
    value: boolean,
    callback: OnboardingBulkCallback | null = null,
  ) {
    if (isOnboardingStepsCompleted.value && value) return

    const currentNames = new Set(
      (onboardings[registryKey] || []).map((step) => step.name),
    )
    const nextSteps = copySteps().map((step) =>
      currentNames.has(step.name) ? { ...step, completed: value } : step,
    )
    await updateUserOnboardingStatus(nextSteps)
    if (!onboardingStatus.value[userId]) onboardingStatus.value[userId] = {}
    onboardingStatus.value[userId]![appName + '_onboarding_status'] = nextSteps
    onboardings[registryKey]?.forEach((step) => {
      step.completed = value
    })
    callback?.(value)
  }

  function updateUserOnboardingStatus(steps: StoredStep[]) {
    return call('frappe.onboarding.update_user_onboarding_status', {
      steps: JSON.stringify(steps),
      appName,
    })
  }

  // The saved list keeps historical, currently hidden steps and gains the
  // newly eligible ones, matched by name rather than by array position
  // (SOURCE.json, local change 3).
  function copySteps(): StoredStep[] {
    const steps = onboardingSteps.value.map((step) => ({ ...step }))
    const names = new Set(steps.map((step) => step.name))
    for (const step of onboardings[registryKey] || []) {
      if (!names.has(step.name)) {
        steps.push({ name: step.name, completed: false })
        names.add(step.name)
      }
    }
    return steps
  }

  function syncStatus() {
    const current = onboardings[registryKey]
    if (!current) return
    const saved = new Map(
      onboardingSteps.value.map((step) => [step.name, step]),
    )
    current.forEach((step) => {
      step.completed = Boolean(saved.get(step.name)?.completed)
    })
    // A new eligible step must reopen a previously completed onboarding.
    isOnboardingStepsCompleted.value =
      current.length > 0 && current.every((step) => step.completed)
  }

  function setUp(steps: OnboardingStep[]) {
    // Re-registration replaces callbacks owned by a previous app instance.
    onboardings[registryKey] = steps
    syncStatus()
    showHelpModal.value = !isOnboardingStepsCompleted.value
  }

  return {
    steps: onboardings[registryKey],
    stepsCompleted,
    totalSteps,
    completedPercentage,
    isOnboardingStepsCompleted,
    updateOnboardingStep,
    skip,
    skipAll,
    reset,
    resetAll,
    setUp,
    syncStatus,
  }
}
