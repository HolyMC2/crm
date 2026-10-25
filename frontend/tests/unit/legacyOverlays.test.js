import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { scan } from '../../scripts/codemods/check-legacy-overlays.mjs'

// frappe-ui 1.0.2 drops these beta.29 surfaces silently (docs/FRAPPE_UI_1.md §6);
// the scanner keeps them from creeping back. The fixture proves it still bites.
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-overlays-'))
afterAll(() => fs.rmSync(fixtureDir, { recursive: true, force: true }))

describe('legacy frappe-ui overlay surfaces', () => {
  it('finds none under src/', () => {
    const found = scan([path.resolve(__dirname, '../../src')])
    expect(found.map((f) => `${f.file}:${f.line} ${f.what}`)).toEqual([])
  })

  it('still flags each beta.29 surface in a fixture', () => {
    fs.writeFileSync(
      path.join(fixtureDir, 'Legacy.vue'),
      `<template>
  <Dialog ref="dlg" :options="{ title: 'x' }" :disableOutsideClickToClose="busy">
    <template #body-content>hi</template>
  </Dialog>
  <Popover placement="bottom-end" v-model:show="open">
    <template #target="{ togglePopover }"><button @click="togglePopover" /></template>
  </Popover>
  <Tooltip text="t" placement="right" :hover-delay="1"><span /></Tooltip>
  <HoverCard :hover-delay="0.5"><span /></HoverCard>
  <Dropdown :options="[]" placement="right" />
  <DatePicker v-model="d"><template #suffix="{ togglePopover }"><i /></template></DatePicker>
  <Link doctype="X"><template #target="{ togglePopover }"><b /></template></Link>
</template>
<script setup>
function closeIt() { dlg.value.close() }
</script>
`,
    )
    const what = scan([fixtureDir]).map((f) => f.what)
    expect(what).toEqual([
      'Dialog :options → flat props',
      'Dialog disableOutsideClickToClose → dismissible',
      'Dialog #body-content (legacy slot)',
      'Popover placement → side / align',
      'Popover v-model:show → v-model:open',
      'Popover #target (legacy slot)',
      'Popover #target reads { togglePopover } (1.0.2 passes { open, close, setOpen })',
      'Tooltip placement → side / align',
      'Tooltip hover-delay 1 is in seconds (1.0.2 takes ms)',
      'HoverCard hover-delay 0.5 is in seconds (1.0.2 takes ms)',
      'Dropdown placement → side / align',
      'DatePicker #suffix reads { togglePopover } (1.0.2 passes { open, close, setOpen })',
      'Dialog ref dlg.close() (1.0.2 exposes nothing; drive v-model:open)',
    ])
  })
})
