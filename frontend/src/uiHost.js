// components/ui is the vendored @muelle/ui kit (muelle/workspace/packages/ui).
// This wires it to the crm once: its status words, its phone breakpoint and
// the Avisos bell. Translation needs nothing: the kit uses window.__.
import { defineAsyncComponent } from 'vue'
import { configureUi } from '@/components/ui/host'
import { statusLabel, statusTone } from '@/utils/display'
import { isMobile } from '@/composables/breakpoint'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import { shellBoot } from '@/composables/muelleShell'

configureUi({
  statusLabel,
  statusTone,
  isMobile,
  bell: defineAsyncComponent(
    () => import('@/components/avisos/AvisosBell.vue'),
  ),
  showBell: () => moduleEnabled(shellBoot.value, 'avisos'),
})
