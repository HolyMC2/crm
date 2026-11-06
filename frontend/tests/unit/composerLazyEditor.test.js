// A composer mounts its editor core the first time it opens, keeps it afterwards,
// and tells its caller when the TipTap instance is there.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue'

const state = vi.hoisted(() => ({ coreLoads: 0 }))

vi.mock('@/components/editor/composerParts.js', () => {
  state.coreLoads++
  const passthrough = (name) =>
    defineComponent({
      name,
      setup:
        (_, { slots }) =>
        () =>
          h('div', { class: name }, slots.default?.()),
    })
  const ComposerEditor = defineComponent({
    name: 'ComposerEditor',
    props: [
      'editable',
      'placeholder',
      'doctype',
      'docname',
      'mentions',
      'email',
    ],
    setup(props, { expose, slots }) {
      const editor = ref(null)
      onMounted(() => {
        editor.value = {
          mentions: props.mentions?.(),
          commands: { focus: () => {} },
        }
      })
      expose({ editor })
      return () => h('div', { class: 'composer-core' }, slots.default?.())
    },
  })
  return {
    ComposerEditor,
    ComposerToolbar: passthrough('ComposerToolbar'),
    EditorContent: passthrough('EditorContent'),
    EditorTableMenu: passthrough('EditorTableMenu'),
  }
})
vi.mock('@/components/IconPicker.vue', () => ({
  default: { inheritAttrs: false, template: '<span />' },
}))
vi.mock('@/components/AttachmentItem.vue', () => ({
  default: { inheritAttrs: false, template: '<span />' },
}))
vi.mock('@/utils', () => ({ submitShortcutLabel: 'Ctrl+Enter' }))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: {
      data: {
        crmUsers: [{ name: 'ana@example.test', full_name: 'Ana', enabled: 1 }],
      },
    },
  }),
}))
vi.mock('@framework/ui', () => ({
  useTelemetry: () => ({ capture: () => {} }),
}))
vi.mock('frappe-ui', () => ({
  FileUploader: { inheritAttrs: false, template: '<span />' },
  Button: { inheritAttrs: false, template: '<button />' },
}))

import CommentBox from '@/components/CommentBox.vue'

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

// The lazy chunk resolves through the module loader: poll for the mount.
const until = async (probe) => {
  for (let i = 0; i < 100; i++) {
    if (probe()) return
    await flush()
  }
}

let app
let root

afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('CommentBox editor core', () => {
  it('loads on the first open, stays after closing, and reports the instance', async () => {
    const editable = ref(false)
    const box = ref(null)
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () =>
        h(CommentBox, {
          ref: box,
          editable: editable.value,
          modelValue: { name: 'CRM-DEAL-0001' },
          doctype: 'CRM Deal',
        }),
    })
    // Globals the app registers: the translation helper and the auto-imported Button.
    app.config.globalProperties.__ = globalThis.__
    app.component('Button', { inheritAttrs: false, template: '<button />' })
    app.mount(root)
    await flush()
    expect(state.coreLoads).toBe(0)
    expect(root.querySelector('.composer-core')).toBeNull()

    editable.value = true
    const ready = box.value.editorReady()
    await until(() => root.querySelector('.composer-core'))
    expect(state.coreLoads).toBe(1)
    expect(root.querySelector('.composer-core')).not.toBeNull()
    const editor = await ready
    expect(editor.mentions).toEqual([{ id: 'ana@example.test', label: 'Ana' }])
    expect(box.value.editor).toBe(editor)

    editable.value = false
    await flush()
    expect(root.querySelector('.composer-core')).not.toBeNull()
    expect(state.coreLoads).toBe(1)
  })
})
