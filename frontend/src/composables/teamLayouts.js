import { computed, ref } from 'vue'
import { call } from 'frappe-ui'
import { shellBoot } from '@/composables/muelleShell'

/**
 * The owner's layouts per puesto class (crm.api.shell.team_layouts): the bar
 * and Más when `module` is null, else that module's own sections. `following`
 * counts, per class, the people without an arrangement of their own, so a
 * reset can say whom it reaches.
 */
export function useTeamLayouts(module = null) {
  const klass = ref(shellBoot.value?.user?.nav_role || 'vendedor')
  const layouts = ref({})
  const following = ref({})
  const loaded = ref(false)
  const loadError = ref('')
  const args = (extra = {}) => (module ? { ...extra, module } : extra)
  function take(answer) {
    layouts.value = answer?.layouts || {}
    following.value = answer?.following || {}
  }

  async function load() {
    loadError.value = ''
    try {
      take(await call('crm.api.shell.team_layouts', args()))
      loaded.value = true
    } catch (error) {
      loadError.value =
        error?.messages?.[0] ||
        __('We could not read the arrangements by puesto. Retry in a moment.')
    }
  }
  /** Set the chosen class's layout. */
  async function save(layout) {
    take(
      await call(
        'crm.api.shell.save_team_layout',
        args({ nav_class: klass.value, layout: JSON.stringify(layout) }),
      ),
    )
  }
  /** The chosen class back to the suggested layout. */
  async function resetOne() {
    take(
      await call(
        'crm.api.shell.save_team_layout',
        args({ nav_class: klass.value }),
      ),
    )
  }
  /** Every class back to the suggested layout. */
  async function resetAll() {
    take(await call('crm.api.shell.reset_team_layouts', args()))
  }

  // The classes with a layout, and the people who follow them: what a reset
  // of every puesto changes.
  const arranged = computed(() => Object.keys(layouts.value))
  const reach = computed(() =>
    arranged.value.reduce((sum, key) => sum + (following.value[key] || 0), 0),
  )
  return {
    klass,
    layouts,
    following,
    loaded,
    loadError,
    load,
    save,
    resetOne,
    resetAll,
    arranged,
    reach,
  }
}
