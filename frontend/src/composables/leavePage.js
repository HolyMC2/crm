// Another app's page (Escáner, Desk, a processor's checkout) in this tab.
//
// A BottomSheet owns one history entry and walks back over it when it closes
// (components/ui/sheetHistory.js). On a phone, a page load started by the same
// tap that closes a sheet is aborted when that back lands, so the button seems
// to do nothing. leaveTo waits for the back (the sheet's close runs in Vue's
// next flush), then loads the page. With no sheet closing it loads at once.
// Pages of this app use the router instead.
import { nextTick } from 'vue'
import { settle } from '@/components/ui/sheetHistory'

export async function leaveTo(href) {
  await nextTick()
  await settle()
  window.location.assign(href)
}
