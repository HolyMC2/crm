import { ref } from 'vue'

// A page may name its phone top bar itself (Hoy puts its greeting there, so
// the bar and the page do not show two titles). It sets this while mounted
// and clears it on unmount; the document title keeps the route's title.
export const pageTitle = ref('')
