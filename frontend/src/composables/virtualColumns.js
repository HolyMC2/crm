// The virtual (`_v_*`) columns a doctype's list can show, asked once per
// doctype per session. A site whose crm build has no get_virtual_columns (or
// any failure) answers an empty list: the picker then offers native fields only.
import { frappeRequest } from 'frappe-ui'
import { ref } from 'vue'
import { normalizeVirtualColumns } from '@/utils/listColumns'

const cache = new Map()

export function useVirtualColumns(doctype) {
  if (!cache.has(doctype)) {
    const columns = ref([])
    cache.set(doctype, columns)
    // the endpoint is GET-only (read, cacheable)
    frappeRequest({
      url: 'crm.api.list_columns.get_virtual_columns',
      method: 'GET',
      params: { doctype },
    })
      .then((data) => (columns.value = normalizeVirtualColumns(data)))
      .catch(() => (columns.value = []))
  }
  return cache.get(doctype)
}
