import { describe, expect, it, vi, afterEach } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXPLORAR_KEYS,
  BROWSE_CHANNELS,
  BROWSE_KINDS,
  SORTS,
  browseKindIcon,
  browseKindLabel,
  canManageItem,
  channelLabel,
  fileLink,
  flattenFolders,
  folderLine,
  folderTree,
  groupLabel,
  isBrowseView,
  monthLabel,
  parseBrowseState,
  parseCsv,
  prettyXml,
  previewIcon,
  selectionRange,
  sortLabel,
  whereLabel,
} from '../../src/composables/useArchivos.js'
import ArchivosBrowser from '../../src/components/archivos/ArchivosBrowser.vue'
import ArchivoPreview from '../../src/components/archivos/ArchivoPreview.vue'
import ArchivosNav from '../../src/components/archivos/ArchivosNav.vue'

const doc = (over = {}) => ({
  id: 'doc:DOC-1',
  source: 'document',
  name: 'DOC-1',
  title: 'Factura luz',
  file_name: 'luz.pdf',
  media_type: 'application/pdf',
  preview: 'pdf',
  file_size: 2048,
  file_url: '/private/files/luz.pdf',
  date: '2026-10-01',
  creation: '2026-10-01 09:00:00',
  modified: '2026-10-01 09:00:00',
  kind: 'factura',
  channel: 'whatsapp',
  owner: 'ana@example.invalid',
  owner_label: 'Ana',
  is_private: 1,
  trashed_on: null,
  status: 'Review',
  visibility: 'Private',
  counterparty: 'CFE',
  version_no: 1,
  version_of: null,
  folder: 'FOL-1',
  folder_title: 'Contratos',
  can_edit: true,
  links: [],
  ...over,
})
const attachment = (over = {}) => ({
  id: 'file:F-1',
  source: 'attachment',
  name: 'F-1',
  title: 'ine.jpg',
  file_name: 'ine.jpg',
  media_type: 'image/jpeg',
  preview: 'image',
  file_size: 900,
  file_url: '/private/files/ine.jpg',
  date: null,
  creation: '2026-10-02 09:00:00',
  modified: '2026-10-02 09:00:00',
  kind: 'foto',
  channel: 'subida',
  owner: 'ana@example.invalid',
  owner_label: 'Ana',
  is_private: 1,
  trashed_on: null,
  attached_to: { doctype: 'Customer', name: 'ACME', title: 'Acme SA' },
  can_edit: false,
  can_promote: true,
  ...over,
})

describe('the URL says which list is open', () => {
  it('keeps only values the server knows and falls back for the rest', () => {
    expect(
      parseBrowseState({
        view: 'carpeta',
        key: 'FOL-1',
        file: 'doc:DOC-1',
        q: 'luz',
        kind: 'factura',
        channel: 'whatsapp',
        month: '2026-10',
        sort: 'name',
      }),
    ).toEqual({
      view: 'carpeta',
      key: 'FOL-1',
      file: 'doc:DOC-1',
      q: 'luz',
      kind: 'factura',
      channel: 'whatsapp',
      month: '2026-10',
      sort: 'name',
    })
    const loose = parseBrowseState({
      view: 'bogus',
      kind: 'drop table',
      channel: 'smoke',
      month: '2026-13-01',
      sort: 'rm -rf',
      key: 'A\\B',
    })
    expect(loose).toMatchObject({
      view: 'por_clasificar',
      kind: '',
      channel: '',
      month: '',
      sort: 'recent',
      key: '',
    })
    expect(parseBrowseState({}).q).toBe('')
    expect(parseBrowseState({ q: 'x'.repeat(300) }).q).toHaveLength(120)
  })
  it('knows which views are the file manager and which are the inbox', () => {
    expect(isBrowseView('recientes')).toBe(true)
    expect(isBrowseView('papelera')).toBe(true)
    expect(isBrowseView('por_clasificar')).toBe(false)
    expect(isBrowseView('ayuda')).toBe(false)
  })
  it('builds a link to one file inside its list', () => {
    const href = fileLink('doc:DOC-1', {
      view: 'carpeta',
      key: 'FOL-1',
      origin: 'https://muelle.invalid',
    })
    const url = new URL(href)
    expect(url.pathname).toBe('/crm/archivos')
    expect(url.searchParams.get('view')).toBe('carpeta')
    expect(url.searchParams.get('key')).toBe('FOL-1')
    expect(url.searchParams.get('file')).toBe('doc:DOC-1')
    // Without a browse view the page opens the Bandeja and ignores `file`.
    expect(fileLink('file:F-1', { view: 'recientes', origin: '' })).toBe(
      '/crm/archivos?view=recientes&file=file%3AF-1',
    )
    expect(fileLink('doc:D-1', { view: 'por_clasificar', origin: '' })).toBe(
      '/crm/archivos?view=recientes&file=doc%3AD-1',
    )
  })
})

describe('the folder tree', () => {
  const folders = [
    { name: 'B', title: 'Bancos', parent_folder: null, count: 2 },
    { name: 'A', title: 'Archivo muerto', parent_folder: null, count: 0 },
    { name: 'B1', title: 'Santander', parent_folder: 'B', count: 5 },
    { name: 'B2', title: 'BBVA', parent_folder: 'B', count: 1 },
    { name: 'B1a', title: 'Estados', parent_folder: 'B1', count: 3 },
  ]
  it('nests children under their parent, sorted by name', () => {
    const tree = folderTree(folders)
    expect(tree.map((f) => f.name)).toEqual(['A', 'B'])
    expect(tree[1].children.map((f) => f.title)).toEqual(['BBVA', 'Santander'])
    expect(tree[1].children[1].children[0].name).toBe('B1a')
  })
  it('shows a folder whose parent is hidden or loops instead of losing it', () => {
    const orphan = folderTree([
      { name: 'X', title: 'Suelta', parent_folder: 'GONE' },
      { name: 'L1', title: 'Ciclo 1', parent_folder: 'L2' },
      { name: 'L2', title: 'Ciclo 2', parent_folder: 'L1' },
    ])
    expect(orphan.map((f) => f.name).sort()).toEqual(['L1', 'L2', 'X'])
  })
  it('flattens only what is open, with its depth', () => {
    const tree = folderTree(folders)
    const closed = flattenFolders(tree, new Set())
    expect(closed.map((f) => f.name)).toEqual(['A', 'B'])
    expect(closed[1].hasChildren).toBe(true)
    const open = flattenFolders(tree, new Set(['B']))
    expect(open.map((f) => f.name)).toEqual(['A', 'B', 'B2', 'B1'])
    expect(open[3].depth).toBe(1)
    expect(flattenFolders(tree, null)).toHaveLength(5)
  })
  it('walks a folder up to its root so it is never moved inside itself', () => {
    expect(folderLine(folders, 'B1a').map((f) => f.name)).toEqual([
      'B',
      'B1',
      'B1a',
    ])
    expect(folderLine(folders, 'missing')).toEqual([])
  })
})

describe('what a file is called, in the worker words', () => {
  it('names every type, channel and sort the server can send', () => {
    for (const kind of BROWSE_KINDS) expect(browseKindLabel(kind)).toBeTruthy()
    for (const channel of BROWSE_CHANNELS)
      expect(channelLabel(channel)).toBeTruthy()
    for (const sort of SORTS) expect(sortLabel(sort.value)).toBeTruthy()
    expect(browseKindLabel('factura')).toBe('Invoices')
    expect(channelLabel('correo')).toBe('Mail')
    expect(channelLabel('')).toBe('')
    expect(sortLabel('nonsense')).toBe('Newest first')
    expect(browseKindIcon('foto')).toBe('image')
    expect(browseKindIcon('whatever')).toBe('file')
  })
  it('turns a month key into a month a person reads', () => {
    expect(monthLabel('2026-10', 'en')).toMatch(/2026/)
    expect(monthLabel('2026-10', 'en')[0]).toBe(
      monthLabel('2026-10', 'en')[0].toUpperCase(),
    )
    expect(monthLabel('nonsense', 'en')).toBe('nonsense')
  })
  it('names a group row by its view', () => {
    expect(groupLabel('tipo', { key: 'ticket' })).toBe('Receipts')
    expect(groupLabel('canal', { key: 'sat' })).toBe('SAT')
    expect(groupLabel('mes', { key: '2026-10' }, 'en')).toMatch(/2026/)
    expect(
      groupLabel('contacto', { key: 'Supplier::ACME', label: 'Acme SA' }),
    ).toBe('Acme SA')
  })
  it('picks the icon the preview deserves', () => {
    expect(previewIcon('image')).toBe('image')
    expect(previewIcon('pdf')).toBe('file-text')
    expect(previewIcon('xml')).toBe('code')
    expect(previewIcon('none', 'estado_cuenta')).toBe('credit-card')
  })
  it('says where a file lives, preferring its folder', () => {
    expect(whereLabel(doc())).toBe('Contratos')
    expect(
      whereLabel(
        doc({
          folder_title: null,
          links: [
            { doctype: 'Purchase Invoice', name: 'PINV-1', title: 'PINV-1' },
          ],
        }),
      ),
    ).toBe('PINV-1')
    expect(whereLabel(attachment())).toBe('Acme SA')
    expect(whereLabel(null)).toBe('')
  })
  it('only lets a managed document be moved or trashed', () => {
    expect(canManageItem(doc())).toBe(true)
    expect(canManageItem(doc({ can_edit: false }))).toBe(false)
    // An attachment belongs to its record; Archivos never edits it in place.
    expect(canManageItem(attachment())).toBe(false)
  })
})

describe('picking rows', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  it('shift-click takes everything between the two rows, in either order', () => {
    expect(selectionRange(ids, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(selectionRange(ids, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(selectionRange(ids, 'c', 'c')).toEqual(['c'])
  })
  it('without an anchor only the row clicked is taken', () => {
    expect(selectionRange(ids, '', 'c')).toEqual(['c'])
    expect(selectionRange(ids, 'b', 'missing')).toEqual([])
  })
})

describe('reading a file without downloading it', () => {
  it('parses a CSV with quotes, and caps the rows', () => {
    const rows = parseCsv('a,b\n"uno, dos",3\n"con ""comillas""",4')
    expect(rows).toEqual([
      ['a', 'b'],
      ['uno, dos', '3'],
      ['con "comillas"', '4'],
    ])
    expect(parseCsv('x\n1\n2\n3', 2)).toHaveLength(2)
    expect(parseCsv('')).toEqual([])
  })
  it('finds the separator a bank export really used', () => {
    expect(parseCsv('fecha;concepto;monto\n01/10;luz;120')[1]).toEqual([
      '01/10',
      'luz',
      '120',
    ])
    expect(parseCsv('a\tb\n1\t2')[0]).toEqual(['a', 'b'])
  })
  it('lays XML out so a person can read it', () => {
    const pretty = prettyXml(
      '<cfdi:Comprobante Total="100"><cfdi:Emisor Rfc="AAA" /></cfdi:Comprobante>',
    )
    expect(pretty.split('\n')).toEqual([
      '<cfdi:Comprobante Total="100">',
      '  <cfdi:Emisor Rfc="AAA" />',
      '</cfdi:Comprobante>',
    ])
    expect(prettyXml('')).toBe('')
  })
})

// --------------------------------------------------------------- components

function mounter() {
  let app, root
  return {
    async mount(component, props) {
      root = document.createElement('div')
      document.body.append(root)
      app = createApp({ render: () => h(component, props) })
      app.config.globalProperties.__ = globalThis.__
      app.mount(root)
      for (let i = 0; i < 10; i++) {
        await Promise.resolve()
        await nextTick()
        await new Promise((done) => setTimeout(done, 0))
      }
      return root
    },
    get root() {
      return root
    },
    unmount() {
      app?.unmount()
      root?.remove()
      app = root = undefined
    },
  }
}

describe('the browse list', () => {
  const page = mounter()
  afterEach(() => {
    page.unmount()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows each file with where it lives, its size and its channel', async () => {
    const root = await page.mount(ArchivosBrowser, {
      view: 'recientes',
      data: {
        items: [doc(), attachment()],
        crumbs: [],
        has_more: false,
      },
      locale: 'en',
    })
    expect(root.textContent).toContain('Factura luz')
    expect(root.textContent).toContain('Contratos')
    // A bare file name is not a title: the row reads its kind, the file name
    // stays in the title attribute.
    expect(root.querySelector('[title="ine.jpg"]')).not.toBeNull()
    expect(root.textContent).not.toContain('ine.jpg')
    expect(root.textContent).toContain('Acme SA')
    expect(root.textContent).toContain('2 KB')
    expect(root.textContent).toContain('WhatsApp')
    // The image row carries a lazy thumbnail, the PDF row an icon.
    const img = root.querySelector('img')
    expect(img.getAttribute('src')).toBe('/private/files/ine.jpg')
    expect(img.getAttribute('loading')).toBe('lazy')
  })

  it('a group view shows clickable rows with their counts', async () => {
    const onNavigate = vi.fn()
    const root = await page.mount(ArchivosBrowser, {
      view: 'tipo',
      data: {
        items: [],
        groups: [
          { view: 'tipo', key: 'factura', label: 'factura', count: 12 },
          { view: 'tipo', key: 'foto', label: 'foto', count: 3 },
        ],
        crumbs: [],
        has_more: false,
      },
      onNavigate,
    })
    expect(root.textContent).toContain('Invoices')
    expect(root.textContent).toContain('Photos')
    expect(root.textContent).toContain('12')
    const row = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Invoices'),
    )
    row.click()
    expect(onNavigate).toHaveBeenCalledWith({ view: 'tipo', key: 'factura' })
  })

  it('an empty folder says what to do next, in Spanish-ready copy', async () => {
    const onUpload = vi.fn()
    const root = await page.mount(ArchivosBrowser, {
      view: 'carpeta',
      currentKey: 'FOL-1',
      data: { items: [], folders: [], crumbs: [], has_more: false },
      onUpload,
    })
    expect(root.textContent).toContain('This folder is empty')
    expect(root.textContent).toContain(
      'Upload a file here, or create a folder inside.',
    )
    const upload = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Upload a file',
    )
    upload.click()
    expect(onUpload).toHaveBeenCalled()
  })

  it('the trash explains itself and never offers an upload', async () => {
    const root = await page.mount(ArchivosBrowser, {
      view: 'papelera',
      data: { items: [], folders: [], crumbs: [], has_more: false },
    })
    expect(root.textContent).toContain('The trash is empty')
    expect(
      [...root.querySelectorAll('button')].some(
        (b) => b.textContent.trim() === 'Upload a file',
      ),
    ).toBe(false)
  })

  it('child folders are listed before the loose files', async () => {
    const root = await page.mount(ArchivosBrowser, {
      view: 'carpeta',
      data: {
        items: [doc()],
        folders: [
          {
            name: 'FOL-2',
            title: 'Manuales',
            count: 4,
            visibility: 'Company',
            can_manage: true,
          },
        ],
        crumbs: [{ view: 'carpeta', key: 'FOL-1', label: 'Contratos' }],
        has_more: false,
      },
    })
    const text = root.textContent
    expect(text.indexOf('Manuales')).toBeLessThan(text.indexOf('Factura luz'))
    expect(text).toContain('4 files')
    // The breadcrumb names the open folder next to the view it belongs to.
    expect(text).toContain('Folders')
    expect(text).toContain('Contratos')
  })

  it('picking rows offers moving, trashing and downloading', async () => {
    const onTrash = vi.fn(),
      onDownload = vi.fn()
    const root = await page.mount(ArchivosBrowser, {
      view: 'recientes',
      data: { items: [doc(), attachment()], crumbs: [], has_more: false },
      onTrash,
      onDownload,
    })
    const boxes = root.querySelectorAll('input[type="checkbox"]')
    boxes[0].click()
    boxes[1].click()
    await nextTick()
    expect(root.textContent).toContain('2 selected')
    const trash = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Send to trash',
    )
    trash.click()
    // Only the managed document may go to the trash; the attachment may not.
    expect(onTrash).toHaveBeenCalledTimes(1)
    expect(onTrash.mock.calls[0][0].map((i) => i.name)).toEqual(['DOC-1'])
    const download = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Download',
    )
    download.click()
    expect(onDownload.mock.calls[0][0]).toHaveLength(2)
  })

  it('«Cargar más» only shows when the server says there is more', async () => {
    const onMore = vi.fn()
    const root = await page.mount(ArchivosBrowser, {
      view: 'recientes',
      data: { items: [doc()], crumbs: [], has_more: true },
      onMore,
    })
    const more = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Load more',
    )
    expect(more).toBeTruthy()
    more.click()
    expect(onMore).toHaveBeenCalled()
  })

  it('a refusal shows the server sentence with a way out, never an empty list', async () => {
    const root = await page.mount(ArchivosBrowser, {
      view: 'recientes',
      problemState: {
        code: 'permission',
        message: 'No tienes acceso a esta empresa.',
        actions: [{ label: 'Reintentar', kind: 'retry' }],
      },
      data: { items: [], crumbs: [], has_more: false },
    })
    expect(root.textContent).toContain('No tienes acceso a esta empresa.')
    expect(root.textContent).toContain('Reintentar')
  })
})

describe('the navigation', () => {
  const page = mounter()
  afterEach(() => page.unmount())

  it('shows both groups and the folder tree with its counts', async () => {
    const onSelect = vi.fn()
    const root = await page.mount(ArchivosNav, {
      view: 'carpeta',
      currentKey: 'B1',
      counts: { por_clasificar: 2, ayuda: 0 },
      summary: { total: 40, trash: 3 },
      folders: [
        {
          name: 'B',
          title: 'Bancos',
          parent_folder: null,
          count: 1,
          visibility: 'Company',
          can_manage: true,
        },
        {
          name: 'B1',
          title: 'Santander',
          parent_folder: 'B',
          count: 7,
          visibility: 'Company',
          can_manage: false,
        },
      ],
      onSelect,
    })
    const text = root.textContent
    expect(text).toContain('Inbox')
    expect(text).toContain('To classify (2)')
    expect(text).toContain('Explore')
    expect(text).toContain('Trash')
    expect(text).toContain('Bancos')
    // The open folder's parents are expanded so it is reachable.
    expect(text).toContain('Santander')
    expect(text).toContain('7')
    expect(text).toContain('New folder')
    const santander = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Santander'),
    )
    santander.click()
    expect(onSelect).toHaveBeenCalledWith({ view: 'carpeta', key: 'B1' })
  })

  it('on a phone the same lists fit in one control', async () => {
    const onSelect = vi.fn()
    const root = await page.mount(ArchivosNav, {
      mobile: true,
      view: 'recientes',
      folders: [{ name: 'B', title: 'Bancos', parent_folder: null, count: 1 }],
      onSelect,
    })
    const select = root.querySelector('select')
    expect(
      [...select.querySelectorAll('optgroup')].map((g) => g.label),
    ).toEqual(['Inbox', 'Explore', 'Folders'])
    select.value = 'carpeta:B'
    select.dispatchEvent(new Event('change'))
    expect(onSelect).toHaveBeenCalledWith({ view: 'carpeta', key: 'B' })
  })
})

describe('the preview pane', () => {
  const page = mounter()
  afterEach(() => {
    page.unmount()
    vi.unstubAllGlobals()
  })
  /** The browse endpoint answers with `item`; the file bytes answer with `body`. */
  function serve(item, body = '') {
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        if (String(url).includes('/api/method/')) {
          calls.push([
            String(url).split('/api/method/')[1],
            JSON.parse(init.body),
          ])
          return {
            ok: true,
            status: 200,
            json: async () => ({ message: item }),
          }
        }
        calls.push([String(url), null])
        return { ok: true, status: 200, text: async () => body }
      }),
    )
    return calls
  }

  it('an image is shown, and asks the browse index for the row first', async () => {
    const calls = serve(attachment())
    const root = await page.mount(ArchivoPreview, {
      company: 'Doco MX',
      id: 'file:F-1',
    })
    expect(calls[0]).toEqual([
      'doco.docoutils.documents.browse.file',
      { company: 'Doco MX', id: 'file:F-1' },
    ])
    const img = root.querySelector('img')
    expect(img.getAttribute('src')).toBe('/private/files/ine.jpg')
    expect(root.textContent).toContain('Acme SA')
    // An attachment belongs to its record: it is saved, never edited in place.
    expect(root.textContent).toContain('Save to Archivos')
    expect(root.textContent).not.toContain('Send to trash')
  })

  it('a PDF opens in a frame with its own actions', async () => {
    serve(doc())
    const root = await page.mount(ArchivoPreview, {
      company: 'Doco MX',
      id: 'doc:DOC-1',
    })
    expect(root.querySelector('iframe').getAttribute('src')).toBe(
      '/private/files/luz.pdf',
    )
    const buttons = [...root.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    )
    expect(buttons).toContain('Rename')
    expect(buttons).toContain('Move')
    expect(buttons).toContain('Send to trash')
    expect(buttons).toContain('Share with the company')
    expect(buttons).toContain('Classify in the inbox')
  })

  it('a CSV becomes a table read from the file itself', async () => {
    serve(
      doc({
        preview: 'text',
        media_type: 'text/csv',
        file_name: 'movimientos.csv',
        file_url: '/private/files/movimientos.csv',
      }),
      'fecha,concepto\n01/10/2026,Pago CFE',
    )
    const root = await page.mount(ArchivoPreview, {
      company: 'Doco MX',
      id: 'doc:DOC-1',
    })
    const cells = [...root.querySelectorAll('td')].map((td) =>
      td.textContent.trim(),
    )
    expect(cells).toEqual(['fecha', 'concepto', '01/10/2026', 'Pago CFE'])
  })

  it('a SAT XML attached to its record is laid out as text', async () => {
    serve(
      attachment({
        id: 'file:F-9',
        name: 'F-9',
        preview: 'xml',
        media_type: 'application/xml',
        file_name: 'cfdi.xml',
        file_url: '/private/files/cfdi.xml',
      }),
      '<cfdi:Comprobante Total="100"><cfdi:Emisor Rfc="AAA" /></cfdi:Comprobante>',
    )
    const root = await page.mount(ArchivoPreview, {
      company: 'Doco MX',
      id: 'file:F-9',
    })
    const pre = root.querySelector('pre')
    expect(pre.textContent).toContain('<cfdi:Comprobante Total="100">')
    expect(pre.textContent).toContain('  <cfdi:Emisor Rfc="AAA" />')
  })

  it('an XML document gets the CFDI card instead of raw text', async () => {
    const calls = serve(
      doc({
        preview: 'xml',
        media_type: 'application/xml',
        file_name: 'cfdi.xml',
        file_url: '/private/files/cfdi.xml',
      }),
      '<cfdi:Comprobante Total="100"></cfdi:Comprobante>',
    )
    await page.mount(ArchivoPreview, { company: 'Doco MX', id: 'doc:DOC-1' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls.some(([path]) => String(path).endsWith('.card'))).toBe(true)
  })

  it('a file nobody can preview offers the download instead', async () => {
    serve(
      doc({
        preview: 'none',
        media_type: 'application/zip',
        file_name: 'respaldo.zip',
      }),
    )
    const root = await page.mount(ArchivoPreview, {
      company: 'Doco MX',
      id: 'doc:DOC-1',
    })
    expect(root.textContent).toContain(
      'This file cannot be shown here. Download it to open it.',
    )
    expect(
      [...root.querySelectorAll('a')].some(
        (a) => a.textContent.trim() === 'Download',
      ),
    ).toBe(true)
  })

  it('an old version hands the newest one back to the page', async () => {
    serve({ redirect: 'doc:DOC-9' })
    const onRedirect = vi.fn()
    await page.mount(ArchivoPreview, {
      company: 'Doco MX',
      id: 'doc:DOC-1',
      onRedirect,
    })
    expect(onRedirect).toHaveBeenCalledWith('doc:DOC-9')
  })

  it('a refusal keeps the server sentence instead of an empty pane', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          exc_type: 'PermissionError',
          guard: {
            code: 'no_record',
            message: 'Pide acceso al registro al que pertenece.',
            actions: [{ label: 'Reintentar', kind: 'retry' }],
          },
        }),
      })),
    )
    const root = await page.mount(ArchivoPreview, {
      company: 'Doco MX',
      id: 'file:F-9',
    })
    expect(root.textContent).toContain(
      'Pide acceso al registro al que pertenece.',
    )
  })
})

describe('every word the file manager shows has a Spanish one', () => {
  it("lists Explorar's own keys in Alt+H, in Spanish, without asking the shell to run them", () => {
    const po = readFileSync(
      resolve(__dirname, '../../../crm/locale/es.po'),
      'utf8',
    )
    for (const shortcut of EXPLORAR_KEYS) {
      expect(shortcut.run).toBeUndefined()
      expect(po).toMatch(
        new RegExp(`msgid "${shortcut.description}"\\nmsgstr "[^"]+"`),
      )
    }
    expect(EXPLORAR_KEYS.map((s) => s.keys[0])).toEqual([
      'space',
      'delete',
      'f2',
    ])
  })

  it('names every view, type, channel and sort in the catalog', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const catalog = new Map()
    for (const m of po.matchAll(
      /^msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
    ))
      catalog.set(m[1], m[2])
    const strings = [
      ...BROWSE_KINDS.map(browseKindLabel),
      ...BROWSE_CHANNELS.map(channelLabel),
      ...SORTS.map((s) => sortLabel(s.value)),
    ]
    expect(strings.length).toBeGreaterThan(10)
    for (const text of strings) expect(catalog.get(text), text).toBeTruthy()
  })

  it('has an es entry for every string the new panes show', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const catalog = new Map()
    for (const m of po.matchAll(
      /^msgid "((?:[^"\\]|\\.)*)"\nmsgstr "((?:[^"\\]|\\.)*)"/gm,
    ))
      catalog.set(m[1], m[2])
    const strings = []
    for (const file of [
      '../../src/components/archivos/ArchivosNav.vue',
      '../../src/components/archivos/ArchivosBrowser.vue',
      '../../src/components/archivos/ArchivoPreview.vue',
      '../../src/components/archivos/MoveDialog.vue',
      '../../src/components/archivos/FolderDialog.vue',
    ]) {
      const source = readFileSync(resolve(here, file), 'utf8')
      strings.push(
        ...[...source.matchAll(/__\(\s*(['"])((?:(?!\1).)+)\1/gs)].map(
          (m) => m[2],
        ),
      )
    }
    expect(strings.length).toBeGreaterThan(40)
    for (const text of strings) expect(catalog.get(text), text).toBeTruthy()
  })
})
