import { ref } from 'vue'

// Phone pane of the inbox / deal 360 ('list' | 'thread' | 'context'). Its own
// module so the shell can read it without loading the inbox.
export const mobileView = ref('list')
