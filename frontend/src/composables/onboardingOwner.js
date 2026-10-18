// The live onboarding owner (composables/onboarding.js), readable without
// loading onboarding: CrmRuntime shows its banner and step modal as soon as
// anyone created it (a page completing a step, or the first tap), and the
// onboarding files stay out of a route's first load (S1d).
import { shallowRef } from 'vue'

export const onboardingOwner = shallowRef(null)
