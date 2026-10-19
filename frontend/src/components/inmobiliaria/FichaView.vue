<template>
  <!-- One inmobiliaria record (INMO-SH, shell SPEC §6 DD4): name as the title,
       status and the amount as the hero, one filled «siguiente paso», the other
       actions tonal, then the sections and the connections. Everything here is
       what inmobiliaria.api.shell.ficha decided. -->
  <article class="flex flex-col gap-5" data-testid="inmo-ficha">
    <div
      v-if="ficha.fotos?.length"
      class="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1"
      aria-label="Fotos"
      data-testid="inmo-fotos"
    >
      <a
        v-for="foto in ficha.fotos"
        :key="foto.url"
        :href="foto.url"
        target="_blank"
        rel="noopener"
        class="relative w-[85%] max-w-md shrink-0 snap-start overflow-hidden rounded-2xl bg-surface-gray-2 sm:w-80"
      >
        <img
          :src="foto.url"
          :alt="foto.titulo || ficha.titulo"
          loading="lazy"
          class="aspect-[4/3] w-full object-cover"
        />
        <span
          v-if="foto.titulo"
          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-sm text-white"
          >{{ foto.titulo }}</span
        >
      </a>
    </div>

    <header class="flex flex-col gap-1">
      <p class="text-sm text-ink-gray-6">{{ ficha.tipo_label }}</p>
      <h1
        class="break-words text-2xl font-semibold text-ink-gray-9"
        data-testid="inmo-ficha-titulo"
      >
        {{ ficha.titulo }}
      </h1>
      <p v-if="ficha.subtitulo" class="break-words text-base text-ink-gray-7">
        {{ ficha.subtitulo }}
      </p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <StatusChip
          v-if="ficha.estatus"
          :label="ficha.estatus.label"
          :tone="ficha.estatus.tone"
        />
      </div>
      <div v-if="ficha.hero" class="mt-3">
        <p class="text-sm text-ink-gray-6">{{ ficha.hero.label }}</p>
        <p
          class="text-3xl font-semibold tabular-nums text-ink-gray-9"
          data-testid="inmo-ficha-hero"
        >
          {{ valueText(ficha.hero) }}
        </p>
      </div>
    </header>

    <section v-if="acciones.length" class="flex flex-col gap-3">
      <template v-if="primary">
        <component
          :is="
            primary.url && primary.habilitada
              ? linkTag(primary.url)
              : NativeButton
          "
          v-bind="
            primary.url && primary.habilitada
              ? linkProps(primary.url)
              : { type: 'button' }
          "
          :class="[FILLED, !primary.habilitada && DISABLED]"
          :aria-disabled="!primary.habilitada || undefined"
          data-testid="inmo-siguiente-paso"
          @click="(e) => act(primary, e)"
        >
          {{ primary.etiqueta }}
        </component>
        <Blocked :accion="primary" />
      </template>
      <div v-if="secondary.length" class="flex flex-wrap gap-2">
        <component
          :is="a.url && a.habilitada ? linkTag(a.url) : NativeButton"
          v-for="a in secondary"
          :key="a.id"
          v-bind="a.url && a.habilitada ? linkProps(a.url) : { type: 'button' }"
          :class="[
            TONAL,
            a.tipo === 'danger' && 'text-ink-red-7',
            !a.habilitada && DISABLED,
          ]"
          :aria-disabled="!a.habilitada || undefined"
          :title="a.habilitada ? undefined : a.motivo"
          :data-accion="a.id"
          @click="(e) => act(a, e)"
        >
          <span
            v-if="a.id === 'whatsapp'"
            class="lucide-message-circle size-5"
            aria-hidden="true"
          />
          {{ a.etiqueta }}
        </component>
      </div>
      <p
        v-for="a in secondary.filter((x) => !x.habilitada && x.motivo)"
        :key="`m-${a.id}`"
        class="text-sm text-ink-gray-6"
      >
        {{ a.etiqueta }}: {{ a.motivo }}
      </p>
    </section>

    <section
      v-for="seccion in ficha.secciones"
      :key="seccion.titulo"
      class="flex flex-col"
    >
      <h2 class="mb-1 text-lg font-semibold text-ink-gray-9">
        {{ seccion.titulo }}
      </h2>
      <dl v-if="seccion.filas" class="divide-y divide-outline-gray-1">
        <div
          v-for="fila in seccion.filas"
          :key="fila.label"
          class="flex min-h-12 flex-col justify-center py-2"
        >
          <dt class="text-sm text-ink-gray-6">{{ fila.label }}</dt>
          <dd
            class="break-words text-base text-ink-gray-9"
            :class="TONE_TEXT[fila.tone]"
          >
            <component
              :is="linkTag(fila.url)"
              v-if="fila.url"
              v-bind="linkProps(fila.url)"
              class="underline decoration-outline-gray-3 underline-offset-4"
              >{{ valueText(fila) }}</component
            >
            <template v-else>{{ valueText(fila) }}</template>
          </dd>
        </div>
      </dl>
      <div v-else-if="seccion.lista" class="-mx-4 flex flex-col">
        <ListRow
          v-for="(item, i) in seccion.lista"
          :key="i"
          :title="item.title?.tipo ? valueText(item.title) : item.title"
          :subtitle="item.detail || ''"
          :subtitle-tone="item.tone === 'danger' ? 'danger' : undefined"
          :meta="item.meta ? valueText(item.meta) : ''"
          v-bind="item.url ? linkProps(item.url, 'row') : {}"
        >
          <template v-if="item.estatus" #trailing>
            <StatusChip :label="item.estatus.label" :tone="item.estatus.tone" />
          </template>
        </ListRow>
      </div>
      <ul
        v-else-if="seccion.documentos"
        class="flex flex-col divide-y divide-outline-gray-1"
        data-testid="inmo-documentos"
      >
        <li
          v-for="d in seccion.documentos"
          :key="d.name"
          class="flex flex-col gap-2 py-3"
        >
          <div class="flex items-start gap-3">
            <span
              :class="[
                DOC_ICON[d.estatus?.tone] || 'lucide-circle',
                'mt-0.5 size-5 shrink-0',
                TONE_TEXT[d.estatus?.tone],
              ]"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="break-words text-base text-ink-gray-9">
                {{ d.etiqueta
                }}<span v-if="!d.obligatorio" class="text-ink-gray-6">
                  · opcional</span
                >
              </p>
              <p v-if="d.notas" class="break-words text-sm text-ink-gray-6">
                {{ d.notas }}
              </p>
              <a
                v-if="d.archivo"
                :href="d.archivo"
                target="_blank"
                rel="noopener"
                class="text-sm text-ink-gray-7 underline underline-offset-4"
                >Ver archivo</a
              >
            </div>
            <StatusChip
              v-if="d.estatus"
              :label="d.estatus.label"
              :tone="d.estatus.tone"
            />
          </div>
          <div v-if="d.subir || d.verificar" class="flex flex-wrap gap-2 pl-8">
            <button
              v-if="d.subir"
              type="button"
              :class="TONAL"
              :data-documento="d.requisito"
              @click="openSheet(subirDocumento(d))"
            >
              <span class="lucide-camera size-5" aria-hidden="true" />
              {{ d.archivo ? 'Cambiar' : 'Subir' }}
            </button>
            <button
              v-if="d.verificar"
              type="button"
              :class="TONAL"
              @click="openSheet(verificarDocumento(d, true))"
            >
              Verificar
            </button>
            <button
              v-if="d.verificar"
              type="button"
              :class="[TONAL, 'text-ink-red-7']"
              @click="openSheet(verificarDocumento(d, false))"
            >
              Rechazar
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="ficha.conexiones?.length" class="flex flex-col">
      <h2 class="mb-1 text-lg font-semibold text-ink-gray-9">Conexiones</h2>
      <div class="-mx-4 flex flex-col">
        <ListRow
          v-for="c in ficha.conexiones"
          :key="c.etiqueta + c.url"
          :title="c.etiqueta"
          :subtitle="c.detalle || ''"
          :icon="c.icono || 'lucide-link'"
          v-bind="linkProps(c.url, 'row')"
        />
      </div>
    </section>

    <a
      v-if="desktop && ficha.desk"
      :href="ficha.desk"
      class="self-start text-sm text-ink-gray-6 underline underline-offset-4"
      >Abrir en escritorio</a
    >

    <AccionSheet
      v-model:open="sheetOpen"
      :accion="sheetAccion"
      :doctype="ficha.doctype"
      :name="ficha.name"
      :subtitle="ficha.titulo"
      @done="done"
    />
  </article>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { ListRow, StatusChip } from '@/components/ui'
import AccionSheet from '@/components/inmobiliaria/AccionSheet.vue'
import {
  NativeButton,
  inmobiliariaApi,
  linkOf,
  problemText,
  valueText,
} from '@/composables/useInmobiliaria'
import { useWindowSize } from '@vueuse/core'

const props = defineProps({
  ficha: { type: Object, required: true },
  /** Query to carry into the next record (the way back). */
  carry: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['changed'])
const route = useRoute()
const router = useRouter()
const { width } = useWindowSize()
const desktop = computed(() => width.value >= 1024)

const FILLED =
  'flex min-h-12 w-full items-center justify-center rounded-full bg-surface-gray-10 px-5 text-base font-medium text-ink-base hover:bg-surface-gray-9 active:bg-surface-gray-8'
const TONAL =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-8'
const DISABLED = 'cursor-not-allowed opacity-50'
const TONE_TEXT = {
  danger: 'text-ink-red-7',
  success: 'text-ink-green-8',
  warning: 'text-ink-amber-9',
}
const DOC_ICON = {
  success: 'lucide-circle-check',
  warning: 'lucide-clock',
  danger: 'lucide-circle-alert',
  info: 'lucide-circle-dot',
  neutral: 'lucide-circle',
}

const acciones = computed(() => props.ficha.acciones || [])
const primary = computed(
  () => acciones.value.find((a) => a.tipo === 'primary') || null,
)
const secondary = computed(() =>
  acciones.value
    .filter((a) => a !== primary.value)
    .sort((a, b) => (a.tipo === 'danger') - (b.tipo === 'danger')),
)

// A disabled next step says why, and offers the way forward when there is one.
const Blocked = (p) => {
  const a = p.accion
  if (a.habilitada || !a.motivo) return null
  const children = [h('span', a.motivo)]
  if (a.solucion?.url) {
    const link = linkOf(a.solucion.url)
    children.push(
      ' ',
      link.to
        ? h(
            RouterLink,
            { to: link.to, class: 'font-medium underline underline-offset-4' },
            () => a.solucion.etiqueta,
          )
        : h(
            'a',
            {
              href: link.href,
              class: 'font-medium underline underline-offset-4',
            },
            a.solucion.etiqueta,
          ),
    )
  }
  return h(
    'p',
    {
      class:
        'rounded-lg bg-surface-amber-1 px-3 py-2 text-base text-ink-gray-8',
      role: 'note',
    },
    children,
  )
}
Blocked.props = ['accion']

// «Identificación oficial» → «identificación oficial», but «CURP» stays CURP.
function enFrase(texto) {
  const t = String(texto || '')
  return /^\p{Lu}\p{Ll}/u.test(t) ? t[0].toLowerCase() + t.slice(1) : t
}
function withCarry(to) {
  if (!to) return to
  const [path, search = ''] = to.split('?')
  const query = Object.fromEntries(new URLSearchParams(search))
  // Another module (Cobranza, Documentos) comes back to this record; inside
  // Inmobiliaria the worker's own way back travels on (Hoy → apartado → venta).
  if (path !== '/inmobiliaria' && !path.startsWith('/inmobiliaria/'))
    return {
      path,
      query: {
        return_to: `/crm${route.fullPath}`,
        return_label: props.ficha.titulo || '',
        ...query,
      },
    }
  if (!props.carry || !Object.keys(props.carry).length) return to
  return { path, query: { ...props.carry, ...query } }
}
function linkTag(url) {
  return linkOf(url).to ? RouterLink : 'a'
}
function linkProps(url, kind) {
  const link = linkOf(url)
  if (kind === 'row') return link.to ? { to: withCarry(link.to) } : link
  return link.to ? { to: withCarry(link.to) } : { href: link.href }
}

const sheetOpen = ref(false)
const sheetAccion = ref(null)
const running = ref('')
function openSheet(accion) {
  sheetAccion.value = accion
  sheetOpen.value = true
}

async function act(accion, event) {
  if (!accion.habilitada) {
    event?.preventDefault()
    return
  }
  if (accion.url) return // a link: the router or the browser follows it
  if (accion.campos?.length || accion.confirmar) return openSheet(accion)
  if (!accion.metodo || running.value) return
  running.value = accion.id
  try {
    const answer = await inmobiliariaApi(accion.metodo, accion.args || {})
    done({ accion, answer })
  } catch (e) {
    toast.error(problemText(e))
  } finally {
    running.value = ''
  }
}

function done({ accion, answer }) {
  if (accion.externo && answer?.[accion.externo]) {
    window.open(answer[accion.externo], '_blank', 'noopener')
    return
  }
  const next = accion.abrir && answer?.[accion.abrir]
  if (accion.exito) toast.success(accion.exito)
  if (next) {
    const link = linkOf(next)
    if (link.to) return router.push(withCarry(link.to))
    if (link.href) return window.location.assign(link.href)
  }
  emit('changed')
}

function subirDocumento(d) {
  return {
    id: `subir-${d.name}`,
    etiqueta: `Subir ${enFrase(d.etiqueta)}`,
    tipo: 'primary',
    habilitada: true,
    metodo: 'inmobiliaria.api.acciones.subir_documento_expediente',
    args: { expediente: props.ficha.name, requisito: d.requisito },
    campos: [
      {
        fieldname: 'archivo',
        label: 'Foto o archivo',
        fieldtype: 'Attach',
        reqd: true,
      },
      {
        fieldname: 'vence_el',
        label: 'Vence el',
        fieldtype: 'Date',
        descripcion:
          'Solo si el documento tiene vigencia (identificación, comprobante).',
      },
    ],
    exito: 'Documento enviado a revisión.',
  }
}
function verificarDocumento(d, aprobado) {
  const spec = props.ficha.verificar || {}
  return {
    id: `${aprobado ? 'verificar' : 'rechazar'}-${d.name}`,
    etiqueta: aprobado ? `Verificar ${enFrase(d.etiqueta)}` : 'Rechazar',
    tipo: aprobado ? 'primary' : 'danger',
    habilitada: true,
    metodo: spec.metodo,
    args: {
      ...(spec.args || {}),
      row_name: d.name,
      aprobado: aprobado ? 1 : 0,
    },
    campos: aprobado
      ? []
      : [
          {
            fieldname: 'notas',
            label: '¿Por qué se rechaza?',
            fieldtype: 'Small Text',
            reqd: true,
          },
        ],
    confirmar: aprobado ? 'El documento queda verificado.' : null,
    exito: aprobado ? 'Documento verificado.' : 'Documento rechazado.',
  }
}
</script>
