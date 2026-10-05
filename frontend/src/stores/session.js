import { defineStore } from 'pinia'
import { createResource } from 'frappe-ui'
import router from '@/router'
import { ref, computed } from 'vue'
import { safeIntendedRoute } from '@/utils/shellRoutes'
import { purgeContact360Cache } from '@/utils/contactos'

export const sessionStore = defineStore('crm-session', () => {
  function sessionUser() {
    let cookies = new URLSearchParams(document.cookie.split('; ').join('&'))
    let _sessionUser = cookies.get('user_id')
    if (_sessionUser === 'Guest') {
      _sessionUser = null
    }
    return _sessionUser
  }

  let user = ref(sessionUser())
  const isLoggedIn = computed(() => !!user.value)

  const login = createResource({
    url: 'login',
    onError() {
      throw new Error(__('Invalid Email or Password'))
    },
    onSuccess() {
      user.value = sessionUser()
      login.reset()
      router.replace({ path: '/' })
    },
  })

  const logout = createResource({
    url: 'logout',
    async onSuccess() {
      // purge the inbox cold-start cache (customer names/phones/last messages) —
      // must not survive logout on a shared device. Keys are per-user namespaced
      // (doco-inbox-queue-*, see composables/inbox.js) — sweep them all.
      try {
        for (const k of Object.keys(localStorage)) {
          if (
            k.startsWith('doco-inbox-queue-') ||
            k.startsWith('doco-wa-outbox-') ||
            // composer field memory: recipients / subjects / captions typed before
            k.startsWith('doco-composer-memory:') ||
            // saved views / column layouts — their search terms can hold customer
            // names/phones (audit 2026-07-26), same shared-terminal class
            k.startsWith('doco_leads_') ||
            k.startsWith('doco_deals_') ||
            // command-palette recents (record titles) — shell, per user
            k.startsWith('muelle:palette-recent:')
          )
            localStorage.removeItem(k)
        }
      } catch (e) {
        /* storage unavailable — nothing to purge */
      }
      // list back-navigation state (utils/listViewState) holds the search box
      try {
        for (const k of Object.keys(sessionStorage)) {
          if (
            k.startsWith('crm_list_state:') ||
            k.startsWith('muelle:') ||
            k.startsWith('contactos:') ||
            k.startsWith('muelle_contactos')
          )
            sessionStorage.removeItem(k)
        }
      } catch {
        /* storage unavailable — nothing to purge */
      }
      await purgeContact360Cache()
      user.value = null
      const intended = safeIntendedRoute(
        window.location.pathname + window.location.search,
      )
      window.location.href =
        '/login?redirect-to=' + encodeURIComponent(intended)
    },
  })

  return {
    user,
    isLoggedIn,
    login,
    logout,
  }
})
