<template>
  <!-- One inmobiliaria record (INMO-SH, shell SPEC §6 DD4): the figure as the
       hero with one filled «siguiente paso» under it, the steps that move it on
       beside it, every action behind the bolt, then the sections as label and
       value and the connections (beside the record on a desktop page).
       Everything here is what inmobiliaria.api.shell.ficha decided. -->
  <article
    class="gap-6"
    :class="
      wide
        ? 'grid grid-cols-[minmax(0,1fr)_18rem] items-start gap-x-10'
        : 'flex flex-col'
    "
    data-testid="inmo-ficha"
  >
    <div
      v-if="ficha.fotos?.length"
      class="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1"
      :class="wide && 'col-span-2'"
      aria-label="Fotos"
      data-testid="inmo-fotos"
    >
      <a
        v-for="foto in ficha.fotos"
        :key="foto.url"
        :href="foto.url"
        target="_blank"
        rel="noopener"
        class="relative w-[85%] max-w-md shrink-0 snap-start overflow-hidden rounded-8 bg-surface-gray-2 sm:w-80"
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

    <div class="flex min-w-0 flex-col gap-6">
      <!-- In a pane (the queue's split) the record names itself, WhatsApp-style:
         the name with its state and kind under it, the island on the right.
         On its own page the shell's bar carries all of that (InmobiliariaFicha). -->
      <header v-if="header" class="flex items-start gap-2">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <h1
            class="title-face break-words text-2xl font-semibold leading-tight text-ink-gray-9 [text-wrap:balance]"
            data-testid="inmo-ficha-titulo"
          >
            {{ ficha.titulo }}
          </h1>
          <p class="flex min-w-0 items-center gap-2">
            <StatusChip
              v-if="ficha.estatus"
              :label="ficha.estatus.label"
              :tone="ficha.estatus.tone"
            />
            <span class="truncate text-sm text-ink-gray-6">{{
              ficha.tipo_label
            }}</span>
          </p>
        </div>
        <RecordIsland
          :reach="ficha.reach || {}"
          :who="ficha.reach?.who || ficha.titulo"
          :mail="ficha.reach?.email ? { allowed: true, reason: '' } : null"
          :groups="boltGroups"
          :subtitle="ficha.titulo"
          @mail="writeMail"
          @pick="onBolt"
          @tools="toolsOpen = true"
        />
      </header>

      <!-- The hero: what the record is about, its figure, and the one next step. -->
      <section class="flex flex-col gap-3" data-testid="inmo-ficha-hero-block">
        <p
          v-if="ficha.subtitulo"
          class="break-words text-base leading-snug text-ink-gray-7"
        >
          {{ ficha.subtitulo }}
        </p>
        <div v-if="ficha.hero" class="flex flex-col gap-0.5">
          <p class="text-sm text-ink-gray-6">{{ ficha.hero.label }}</p>
          <p
            class="num text-4xl font-semibold leading-none text-ink-gray-9"
            data-testid="inmo-ficha-hero"
          >
            {{ valueText(ficha.hero) }}
          </p>
        </div>
        <template v-if="primary">
          <component
            :is="
              primary.url && primary.habilitada
                ? linkTag(primary.url)
                : NativeButton
            "
            v-bind="
              primary.url && primary.habilitada
                ? actionProps(primary)
                : { type: 'button' }
            "
            :class="[FILLED, !primary.habilitada && DISABLED]"
            :aria-disabled="!primary.habilitada || undefined"
            :aria-busy="running === primary.id || undefined"
            data-testid="inmo-siguiente-paso"
            @click="(e) => act(primary, e)"
          >
            <span
              v-if="running === primary.id"
              class="lucide-loader-circle size-5 animate-spin"
              aria-hidden="true"
            />
            {{ primary.etiqueta }}
          </component>
          <Blocked :accion="primary" />
        </template>
        <!-- Beside it, the other steps that move the record on (at most two);
           every action, and the ones that cancel, wait behind the bolt. -->
        <div v-if="inline.length" class="flex flex-wrap gap-2">
          <component
            :is="a.url && a.habilitada ? linkTag(a.url) : NativeButton"
            v-for="a in inline"
            :key="a.id"
            v-bind="a.url && a.habilitada ? actionProps(a) : { type: 'button' }"
            :class="[TONAL, !a.habilitada && DISABLED]"
            :aria-disabled="!a.habilitada || undefined"
            :title="a.habilitada ? undefined : a.motivo"
            :data-accion="a.id"
            @click="(e) => act(a, e)"
          >
            <span
              v-if="running === a.id"
              class="lucide-loader-circle size-5 animate-spin"
              aria-hidden="true"
            />
            <span
              v-else-if="a.id === 'whatsapp'"
              class="lucide-message-circle size-5"
              aria-hidden="true"
            />
            {{ a.etiqueta }}
          </component>
        </div>
        <Blocked
          v-for="a in inline.filter((x) => !x.habilitada)"
          :key="`m-${a.id}`"
          :accion="a"
          secundaria
        />
        <!-- An action that failed: the worker stays here, reads why, and tries
           again or carries on with the record. -->
        <div
          v-if="actionProblem"
          class="flex flex-col gap-2 rounded-6 bg-surface-red-1 px-3 py-2 text-base text-ink-red-7"
          role="alert"
          data-testid="inmo-accion-problema"
        >
          <p>
            <span class="font-medium">{{ actionProblem.etiqueta }}:</span>
            {{ actionProblem.texto }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-if="actionProblem.reintentar"
              type="button"
              :class="TONAL"
              @click="act(actionProblem.accion)"
            >
              Reintentar
            </button>
            <button v-else type="button" :class="TONAL" @click="refreshFicha">
              Actualizar la ficha
            </button>
            <button type="button" :class="TONAL" @click="actionProblem = null">
              Entendido
            </button>
          </div>
        </div>
      </section>

      <section
        v-for="seccion in ficha.secciones"
        :key="seccion.titulo"
        class="flex flex-col"
      >
        <h2 class="mb-1 text-lg font-semibold text-ink-gray-9">
          {{ seccion.titulo }}
        </h2>
        <dl v-if="seccion.filas" class="flex flex-col">
          <div
            v-for="fila in seccion.filas"
            :key="fila.label"
            class="flex min-h-11 border-b border-outline-gray-1 py-2.5 last:border-b-0"
            :class="
              stacks(fila)
                ? 'flex-col justify-center gap-0.5'
                : 'items-baseline justify-between gap-4'
            "
          >
            <dt class="flex-none text-base text-ink-gray-6">
              {{ fila.label }}
            </dt>
            <dd
              class="min-w-0 break-words text-base text-ink-gray-9"
              :class="[
                TONE_TEXT[fila.tone],
                FIGURE.has(fila.tipo) && 'num',
                !stacks(fila) && 'text-right',
              ]"
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
              <StatusChip
                :label="item.estatus.label"
                :tone="item.estatus.tone"
              />
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
            <div
              v-if="d.subir || d.verificar"
              class="flex flex-wrap gap-2 pl-8"
            >
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
    </div>
    <section
      v-if="ficha.conexiones?.length"
      class="flex flex-col"
      :class="wide && 'sticky top-4'"
    >
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

    <!-- «⋯»: the record's tools (reload, link, mail, the Desk form for an
         administrator). Mounts on its first open. -->
    <BottomSheet
      v-if="toolsUsed"
      v-model:open="toolsOpen"
      title="Herramientas"
      :subtitle="ficha.titulo"
      flush
    >
      <AccionesPanel :groups="toolGroups" @pick="onTool" />
    </BottomSheet>

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
import { computed, defineAsyncComponent, h, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { ListRow, StatusChip } from '@/components/ui'
import AccionSheet from '@/components/inmobiliaria/AccionSheet.vue'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import {
  NativeButton,
  SIN_METODO,
  accionOf,
  boltGroupsOf,
  externalLinkOf,
  inmobiliariaApi,
  linkOf,
  problemText,
  valueText,
} from '@/composables/useInmobiliaria'

const BottomSheet = defineAsyncComponent(
  () => import('@/components/ui/BottomSheet.vue'),
)
const AccionesPanel = defineAsyncComponent(
  () => import('@/components/documentos/AccionesPanel.vue'),
)

const props = defineProps({
  ficha: { type: Object, required: true },
  /** Query to carry into the next record (the way back). */
  carry: { type: Object, default: () => ({}) },
  /** false: the page's bar names the record and holds its island. */
  header: { type: Boolean, default: true },
  /** Desktop page: the record on the left, its connections beside it. */
  wide: { type: Boolean, default: false },
})
const emit = defineEmits(['changed'])
const route = useRoute()
const router = useRouter()

const FILLED =
  'press flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-surface-gray-10 px-5 text-base-medium text-ink-base hover:bg-surface-gray-9 active:bg-surface-gray-8 sm:w-auto sm:self-start sm:min-w-56'
const TONAL =
  'press inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base-medium text-ink-gray-8 hover:bg-surface-gray-3'
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
// Beside the next step: the other steps of this state, a blocked one with its
// reason under it. The way back and the ones that cancel wait behind the bolt,
// which lists every action.
const inline = computed(() =>
  acciones.value.filter(
    (a) =>
      a !== primary.value &&
      a.tipo !== 'danger' &&
      !String(a.id).startsWith('volver'),
  ),
)
const boltGroups = computed(() => boltGroupsOf(props.ficha))

// Figures read as figures (`.num`); a long text stacks under its label.
const FIGURE = new Set(['money', 'date', 'percent'])
function stacks(fila) {
  return !FIGURE.has(fila.tipo) && valueText(fila).length > 26
}

// A blocked action says why (`motivo`) and what to do next (`solucion`). When
// the way forward is a screen (`abrir`, a path) the next step is its link. An
// older app sends `solucion` as `{ etiqueta, url }`.
function wayForward(a) {
  const s = a.solucion
  if (s && typeof s === 'object')
    return {
      texto: String(s.etiqueta || ''),
      url: typeof s.url === 'string' ? s.url : '',
    }
  const abrir =
    typeof a.abrir === 'string' &&
    a.abrir.startsWith('/') &&
    !a.abrir.startsWith('//')
      ? a.abrir
      : ''
  return { texto: typeof s === 'string' ? s : '', url: abrir }
}
const LINK = 'font-medium underline underline-offset-4'
function linkNode(url, text) {
  const link = linkOf(url)
  if (link.to)
    return h(RouterLink, { to: withCarry(link.to), class: LINK }, () => text)
  if (link.href) return h('a', { href: link.href, class: LINK }, text)
  return h('span', text)
}
const Blocked = (p) => {
  const a = p.accion
  if (a.habilitada) return null
  const salida = wayForward(a)
  if (!a.motivo && !salida.texto && !salida.url) return null
  const children = []
  // Beside the other actions the note names the one it explains.
  if (p.secundaria)
    children.push(h('span', { class: 'font-medium' }, `${a.etiqueta}: `))
  if (a.motivo) children.push(h('span', a.motivo))
  if (salida.url)
    children.push(' ', linkNode(salida.url, salida.texto || 'Resolver'))
  else if (salida.texto) children.push(' ', h('span', salida.texto))
  return h(
    'p',
    {
      class: p.secundaria
        ? 'text-sm text-ink-gray-7'
        : 'rounded-6 bg-surface-amber-1 px-3 py-2 text-base text-ink-gray-8',
      role: 'note',
      'data-bloqueo': a.id,
    },
    children,
  )
}
Blocked.props = {
  accion: { type: Object, required: true },
  secundaria: { type: Boolean, default: false },
}

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
// An action's link. One the app marks `external` (the SAT portal) opens in a
// new tab and the record stays here; any other keeps linkProps.
function actionProps(a) {
  const external = externalLinkOf(a)
  return external.href ? external : linkProps(a.url)
}

const sheetOpen = ref(false)
const sheetAccion = ref(null)
const running = ref('')
// The last action that failed here: { accion, etiqueta, texto, reintentar }.
const actionProblem = ref(null)
watch(
  () => props.ficha,
  () => (actionProblem.value = null),
)
function openSheet(accion) {
  actionProblem.value = null
  sheetAccion.value = accion
  sheetOpen.value = true
}
function refreshFicha() {
  actionProblem.value = null
  emit('changed')
}

// The bolt (here or in the page's bar) picks an action by its id: a link is
// followed, anything else runs as its button would.
function run(accion) {
  if (!accion?.habilitada) return
  if (accion.url) {
    const external = externalLinkOf(accion)
    if (external.href) return window.open(external.href, '_blank', 'noopener')
    const link = linkOf(accion.url)
    if (link.to) return router.push(withCarry(link.to))
    if (link.href) return window.location.assign(link.href)
    return
  }
  act(accion)
}
function onBolt({ key }) {
  run(accionOf(props.ficha, key))
}

function writeMail() {
  const email = props.ficha.reach?.email
  if (email) window.location.href = `mailto:${email}`
}
const toolsOpen = ref(false)
const toolsUsed = ref(false)
watch(toolsOpen, (open) => open && (toolsUsed.value = true))
const toolGroups = computed(() => {
  const items = [
    {
      key: 'actualizar',
      label: 'Actualizar',
      icon: 'lucide-refresh-cw',
      hint: 'Vuelve a leer la ficha',
      allowed: true,
    },
    {
      key: 'enlace',
      label: 'Copiar enlace',
      icon: 'lucide-link',
      hint: 'Para mandarlo a un compañero',
      allowed: true,
    },
  ]
  const email = props.ficha.reach?.email
  if (email)
    items.push({
      key: 'correo',
      label: `Escribir a ${props.ficha.reach?.who || props.ficha.titulo}`,
      icon: 'lucide-mail',
      hint: email,
      allowed: true,
    })
  // The Desk form: an administrator's escape, never routine work.
  if (props.ficha.desk)
    items.push({
      key: 'escritorio',
      label: 'Abrir en escritorio',
      icon: 'lucide-external-link',
      hint: 'El formulario completo, para administradores',
      allowed: true,
    })
  return [{ key: 'herramientas', title: 'Esta ficha', items }]
})
async function onTool({ key }) {
  toolsOpen.value = false
  if (key === 'actualizar') return refreshFicha()
  if (key === 'correo') return writeMail()
  if (key === 'escritorio' && props.ficha.desk)
    return window.location.assign(props.ficha.desk)
  if (key === 'enlace') {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar el enlace.')
    }
  }
}
defineExpose({
  run,
  onBolt,
  writeMail,
  openTools: () => (toolsOpen.value = true),
})

async function act(accion, event) {
  if (!accion.habilitada) {
    event?.preventDefault()
    return
  }
  if (accion.url) return // a link: the router or the browser follows it
  if (accion.campos?.length || accion.confirmar) return openSheet(accion)
  if (running.value) return
  actionProblem.value = null
  if (!accion.metodo) {
    actionProblem.value = {
      accion,
      etiqueta: accion.etiqueta,
      texto: SIN_METODO,
      reintentar: false,
    }
    return
  }
  running.value = accion.id
  try {
    const answer = await inmobiliariaApi(accion.metodo, accion.args || {})
    done({ accion, answer })
  } catch (e) {
    actionProblem.value = {
      accion,
      etiqueta: accion.etiqueta,
      texto: problemText(e),
      reintentar: true,
    }
  } finally {
    running.value = ''
  }
}

function done({ accion, answer }) {
  if (accion.externo && answer?.[accion.externo]) {
    window.open(answer[accion.externo], '_blank', 'noopener')
    advise(answer, { externo: true })
    // Back from the other tab, the worker finds the record as it is now.
    return refreshFicha()
  }
  const next = accion.abrir && answer?.[accion.abrir]
  if (accion.exito) toast.success(accion.exito)
  advise(answer)
  if (next) {
    const link = linkOf(next)
    if (link.to) return router.push(withCarry(link.to))
    if (link.href) return window.location.assign(link.href)
  }
  emit('changed')
}

// What the app warns about in an action's answer, all of it and in its own
// words: each line of `avisos` (what a batch left out), the `advertencia` of a
// late correction, the `aviso_correo` of an email that did not go out. One
// notice with a line each, after «exito», that waits for the worker to close
// it (Desk shows them in a dialog). An outside step's `avisos` is no warning:
// the SAT file lists there the notices it carries.
function advise(answer, { externo = false } = {}) {
  const avisos = !externo && Array.isArray(answer?.avisos) ? answer.avisos : []
  const lines = [...avisos, answer?.advertencia, answer?.aviso_correo].filter(
    (t) => typeof t === 'string' && t.trim(),
  )
  if (!lines.length) return
  const notice = () =>
    h(
      'div',
      { class: 'flex flex-col gap-1' },
      lines.map((t) => h('p', t)),
    )
  toast.warning(notice, { duration: Infinity })
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
