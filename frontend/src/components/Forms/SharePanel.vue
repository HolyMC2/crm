<template>
  <div class="flex flex-col gap-6">
    <div
      v-if="!b.savedPublished.value"
      class="flex items-start gap-2 rounded-md bg-surface-amber-2 p-3 text-p-sm text-ink-gray-8"
    >
      <LucideTriangleAlert class="mt-0.5 size-4 shrink-0 text-ink-amber-6" />
      {{
        __(
          'This form is a draft. The link only works for you until you publish it.',
        )
      }}
    </div>

    <!-- the link + QR, side by side: the two things people actually share -->
    <section class="flex flex-col gap-4 sm:flex-row">
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <div class="text-base font-semibold text-ink-gray-9">
            {{ __('Link') }}
          </div>
          <div class="text-p-sm text-ink-gray-6">
            {{ __('Anyone with it can fill in the form. No login needed.') }}
          </div>
        </div>
        <TextInput
          readonly
          :model-value="qrTarget.url"
          :aria-label="__('Link')"
        >
          <template #suffix>
            <button
              class="flex text-ink-gray-5 hover:text-ink-gray-8"
              :aria-label="__('Copy link')"
              @click="copy(qrTarget.url, 'link')"
            >
              <LucideCopy class="size-4" />
            </button>
          </template>
        </TextInput>
        <div class="flex flex-wrap gap-2">
          <Button
            :label="__('Copy link')"
            icon-left="copy"
            @click="copy(qrTarget.url, 'link')"
          />
          <a :href="qrTarget.url" target="_blank" rel="noopener">
            <Button :label="__('Open link')" icon-left="external-link" />
          </a>
          <a
            :href="whatsappShareUrl(shareText, qrTarget.url)"
            target="_blank"
            rel="noopener"
          >
            <Button :label="__('Share on WhatsApp')">
              <template #prefix><WhatsAppIcon class="size-4" /></template>
            </Button>
          </a>
          <Button
            v-if="canNativeShare"
            :label="__('Share…')"
            icon-left="share-2"
            @click="nativeShare"
          />
        </div>
        <p v-if="qrTarget.key !== 'plain'" class="text-p-sm text-ink-gray-6">
          {{ __('Tagged for {0}.', [qrTarget.label]) }}
          <button class="underline" @click="qrKey = 'plain'">
            {{ __('Use the plain link') }}
          </button>
        </p>
      </div>
      <div class="flex flex-col items-center gap-2">
        <div
          class="flex size-44 items-center justify-center rounded-lg border border-outline-gray-2 bg-white p-2"
        >
          <img
            v-if="qrSrc"
            :src="qrSrc"
            :alt="__('QR code for {0}', [qrTarget.label])"
            class="size-full"
          />
          <LoadingIndicator v-else class="size-5 text-ink-gray-5" />
        </div>
        <div class="flex gap-1.5">
          <Button
            size="sm"
            :label="__('PNG')"
            icon-left="download"
            :disabled="!qrSvg"
            @click="downloadPng"
          />
          <Button
            size="sm"
            :label="__('SVG')"
            icon-left="download"
            :disabled="!qrSvg"
            @click="downloadSvg"
          />
        </div>
      </div>
    </section>

    <!-- chat channels (doco_marketing addon) -->
    <template v-if="chatChannels">
      <WhatsAppFlowCard />
      <ChatShareCard />
    </template>

    <!-- per-channel links -->
    <section class="flex flex-col gap-3">
      <div>
        <div class="text-base font-semibold text-ink-gray-9">
          {{ __('A link for each place you share it') }}
        </div>
        <div class="text-p-sm text-ink-gray-6">
          {{
            __(
              'Each link tags where the visitor came from, so every submission shows its source.',
            )
          }}
        </div>
      </div>
      <div
        class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
      >
        <div
          v-for="c in channels"
          :key="c.key"
          class="flex items-center gap-3 px-3 py-2.5"
        >
          <div class="min-w-0 flex-1">
            <div class="text-base text-ink-gray-9">{{ c.label }}</div>
            <div class="truncate text-p-sm text-ink-gray-5">{{ c.hint }}</div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon="copy"
            :aria-label="__('Copy {0} link', [c.label])"
            @click="copy(c.url, c.key)"
          />
          <Button
            size="sm"
            :variant="qrKey === c.key ? 'subtle' : 'ghost'"
            :aria-label="__('Show the QR code for {0}', [c.label])"
            :aria-pressed="qrKey === c.key"
            @click="qrKey = c.key"
          >
            <template #icon><LucideQrCode class="size-4" /></template>
          </Button>
        </div>
      </div>
    </section>

    <!-- embed -->
    <section class="flex flex-col gap-3">
      <div>
        <div class="text-base font-semibold text-ink-gray-9">
          {{ __('Put it on your website') }}
        </div>
        <div class="text-p-sm text-ink-gray-6">
          {{ __('Paste this code where the form should appear.') }}
        </div>
      </div>
      <div class="relative">
        <textarea
          readonly
          rows="3"
          :aria-label="__('Embed code')"
          class="w-full resize-none rounded-md border border-outline-gray-2 bg-surface-gray-1 py-2 pl-3 pr-10 font-mono text-xs text-ink-gray-7 focus:border-outline-gray-4 focus:outline-none focus:ring-0"
          :value="snippet"
        />
        <button
          class="absolute right-2 top-2 flex text-ink-gray-5 hover:text-ink-gray-8"
          :aria-label="__('Copy embed code')"
          @click="copy(snippet, 'iframe')"
        >
          <LucideCopy class="size-4" />
        </button>
      </div>
      <FormControl
        type="textarea"
        :rows="2"
        :label="__('Websites allowed to show it')"
        placeholder="https://www.example.com"
        :model-value="b.form.allowed_embedding_domains"
        @update:model-value="
          (v) => ((b.form.allowed_embedding_domains = v), b.markDirty())
        "
      />
      <p
        class="-mt-1 text-p-sm"
        :class="badDomains.length ? 'text-ink-red-5' : 'text-ink-gray-5'"
      >
        {{
          badDomains.length
            ? __('Not a valid address, will be ignored: {0}', [
                badDomains.join(', '),
              ])
            : __(
                'One per line. Browsers block the form on sites not listed here.',
              )
        }}
      </p>
    </section>
  </div>
</template>

<script setup>
import { FORM_BUILDER } from './useFormBuilder'
import { FORM_CHANNELS } from './channels/useFormChannels'
import WhatsAppFlowCard from './channels/WhatsAppFlowCard.vue'
import ChatShareCard from './channels/ChatShareCard.vue'
import {
  Button,
  FormControl,
  LoadingIndicator,
  TextInput,
  call,
  toast,
} from 'frappe-ui'
import { useTelemetry } from 'frappe-ui/frappe'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import LucideCopy from '~icons/lucide/copy'
import LucideQrCode from '~icons/lucide/qr-code'
import LucideTriangleAlert from '~icons/lucide/triangle-alert'
import { copyToClipboard } from '@/utils'
import { computed, inject, ref, watch } from 'vue'
import {
  channelLinks,
  fillBusiness,
  iframeSnippet,
  invalidDomains,
  publicUrl,
  whatsappShareUrl,
} from './formModel'

// the builder model, shared with the page and the other panels
const b = inject(FORM_BUILDER)
const chatChannels = inject(FORM_CHANNELS, null)
const { capture } = useTelemetry()

const url = computed(() => publicUrl(window.location.origin, b.form.route))
const channels = computed(() => channelLinks(url.value, b.form.route))
const qrKey = ref('plain')
const qrTarget = computed(
  () =>
    channels.value.find((c) => c.key === qrKey.value) || {
      key: 'plain',
      label: __('the plain link'),
      url: url.value,
    },
)
const shareText = computed(() =>
  fillBusiness(b.form.title, b.options.data?.business),
)
const snippet = computed(() => iframeSnippet(url.value, b.form.title))
const badDomains = computed(() =>
  invalidDomains(b.form.allowed_embedding_domains),
)
const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share

function copy(text, kind) {
  copyToClipboard(text)
  capture('form_embed_copied', { embed_type: kind })
}
async function nativeShare() {
  try {
    await navigator.share({ title: shareText.value, url: qrTarget.value.url })
  } catch {
    // dismissing the share sheet is not an error
  }
}

const qrSvg = ref('')
const qrSrc = computed(() =>
  qrSvg.value
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg.value)}`
    : '',
)
let qrSeq = 0
watch(
  () => [b.form.name, qrTarget.value.url, b.savedPublished.value],
  async () => {
    const seq = ++qrSeq
    qrSvg.value = ''
    try {
      const svg = await call('crm.api.form.get_form_qr', {
        name: b.form.name,
        url: qrTarget.value.url,
      })
      if (seq === qrSeq) qrSvg.value = svg
    } catch (e) {
      if (seq === qrSeq)
        toast.error(e?.messages?.[0] || __('Could not make the QR code'))
    }
  },
  { immediate: true },
)

function fileBase() {
  return `${b.form.route || 'form'}-${qrTarget.value.key}-qr`
}
function download(href, filename) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}
function downloadSvg() {
  const blob = new Blob([qrSvg.value], { type: 'image/svg+xml' })
  const href = URL.createObjectURL(blob)
  download(href, `${fileBase()}.svg`)
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
// print-ready PNG: the SVG drawn onto a 1024px canvas
function downloadPng() {
  const img = new Image()
  img.onload = () => {
    const size = 1024
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, size, size)
    download(canvas.toDataURL('image/png'), `${fileBase()}.png`)
    capture('form_qr_downloaded', { channel: qrTarget.value.key })
  }
  img.src = qrSrc.value
}
</script>
