<template>
  <!-- «Avisos del asistente» (doco assistant/ronda): what Muelle watches for
       each person and tells them each morning, with its cards. The owner
       switches it on for the business and picks the areas, the hour, quiet
       hours, the daily cap of urgent ones and the brain, and who receives;
       each person (a manager too) picks their own areas, hour, channels and
       quiet hours. A tap saves; a refusal puts it back. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col"
    data-asistente-avisos
  >
    <AppBar
      v-if="isPhone"
      back
      :back-label="__('More')"
      :title="__('Assistant notices')"
      :bell="false"
    />
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-3xl space-y-5 px-4 pb-28 pt-3 lg:px-6">
        <h1 v-if="!isPhone" class="text-2xl font-semibold text-ink-gray-9">
          {{ __('Assistant notices') }}
        </h1>
        <p
          v-if="problem"
          role="alert"
          class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          {{ problem }}
          <Button
            v-if="!page"
            class="ml-2 min-h-11"
            :label="__('Retry')"
            @click="load"
          />
        </p>
        <div v-if="!page && !problem" role="status" class="space-y-3">
          <div class="h-16 animate-pulse rounded-7 bg-surface-gray-2" />
          <div class="h-28 animate-pulse rounded-7 bg-surface-gray-2" />
        </div>

        <template v-else-if="page">
          <!-- The business (the owner) -->
          <ListGroup v-if="page.dueno" data-avisos-negocio>
            <div class="px-4 py-2">
              <Switch
                :model-value="page.negocio.activo"
                :label="__('Muelle speaks first')"
                :disabled="busy.has('activo')"
                data-avisos-activo
                @update:model-value="(v) => saveBusiness({ activo: v ? 1 : 0 })"
              />
              <p class="pb-1 text-sm text-ink-gray-6" data-avisos-estado>
                {{ businessLine }}
              </p>
            </div>
            <div v-if="page.negocio.activo" class="px-4 py-3">
              <ChipRow
                :label="__('What it watches')"
                :options="
                  page.negocio.areas.map((a) => ({
                    value: a.key,
                    label: areaLabel(a),
                  }))
                "
                :selected="
                  page.negocio.areas.filter((a) => a.on).map((a) => a.key)
                "
                multiple
                testid="avisos-area"
                @pick="(keys) => saveBusiness({ areas: keys })"
              />
              <ChipRow
                :label="__('Morning brief')"
                :options="
                  page.horas.map((h) => ({ value: h, label: hourLabel(h) }))
                "
                :selected="[page.negocio.hora]"
                testid="avisos-hora"
                @pick="(keys) => saveBusiness({ hora: keys[0] })"
              />
              <ChipRow
                :label="__('Quiet hours')"
                :options="quietOptions"
                :selected="[page.negocio.silencio]"
                testid="avisos-silencio"
                @pick="(keys) => saveBusiness({ silencio: keys[0] })"
              />
              <ChipRow
                :label="__('Urgent ones a day')"
                :options="
                  page.topes.map((n) => ({ value: n, label: String(n) }))
                "
                :selected="[page.negocio.tope]"
                testid="avisos-tope"
                @pick="(keys) => saveBusiness({ tope: keys[0] })"
              />
              <ChipRow
                :label="__('Brain')"
                :options="[
                  { value: 'economico', label: __('Economical') },
                  { value: 'asistente', label: __('The assistant’s own') },
                ]"
                :selected="[page.negocio.modelo]"
                testid="avisos-modelo"
                @pick="(keys) => saveBusiness({ modelo: keys[0] })"
              />
            </div>
          </ListGroup>

          <!-- Mine -->
          <ListGroup v-if="page.yo" data-avisos-yo>
            <div class="px-4 py-2">
              <Switch
                :model-value="page.yo.activo"
                :label="page.dueno ? __('I receive them') : __('My notices')"
                :disabled="busy.has('yo') || !page.negocio.activo"
                data-avisos-yo-activo
                @update:model-value="(v) => savePerson({ activo: v ? 1 : 0 })"
              />
              <p
                v-if="!page.negocio.activo && !page.dueno"
                class="pb-1 text-sm text-ink-gray-6"
              >
                {{ __('The owner has not switched them on yet.') }}
              </p>
            </div>
            <div v-if="page.yo.recibe || page.yo.activo" class="px-4 py-3">
              <ChipRow
                v-if="!page.dueno || page.yo.areas.length"
                :label="__('My areas')"
                :options="
                  page.yo.areas.map((a) => ({
                    value: a.key,
                    label: areaLabel(a),
                  }))
                "
                :selected="page.yo.areas.filter((a) => a.on).map((a) => a.key)"
                multiple
                testid="avisos-mis-areas"
                @pick="(keys) => savePerson({ areas: keys })"
              />
              <ChipRow
                :label="__('My hour')"
                :options="[
                  {
                    value: '',
                    label: __('Like the business ({0})', [
                      hourLabel(page.yo.hora_negocio),
                    ]),
                  },
                  ...page.horas.map((h) => ({ value: h, label: hourLabel(h) })),
                ]"
                :selected="[page.yo.hora || '']"
                testid="avisos-mi-hora"
                @pick="(keys) => savePerson({ hora: keys[0] || null })"
              />
              <ChipRow
                :label="__('Also on')"
                :options="
                  page.yo.canales.map((c) => ({
                    value: c.key,
                    label: c.linked
                      ? c.label
                      : __('{0} (not linked)', [c.label]),
                    disabled: !c.linked,
                  }))
                "
                :selected="
                  page.yo.canales.filter((c) => c.on).map((c) => c.key)
                "
                multiple
                allow-empty
                testid="avisos-canal"
                @pick="(keys) => savePerson({ canales: keys })"
              />
              <ChipRow
                v-if="!page.dueno"
                :label="__('My quiet hours')"
                :options="[
                  { value: '', label: __('Like the business') },
                  ...quietOptions,
                ]"
                :selected="[page.yo.silencio || '']"
                testid="avisos-mi-silencio"
                @pick="(keys) => savePerson({ silencio: keys[0] || null })"
              />
            </div>
          </ListGroup>

          <!-- Who receives (the owner) -->
          <ListGroup
            v-if="page.dueno && page.negocio.activo && page.personas.length"
            tag="ul"
            :aria-label="__('Who receives them')"
            data-avisos-personas
          >
            <li
              v-for="person in page.personas"
              :key="person.user"
              class="px-4 py-2"
              :data-avisos-persona="person.user"
            >
              <Switch
                :model-value="person.activo"
                :label="person.nombre"
                :disabled="busy.has(person.user)"
                @update:model-value="
                  (v) => savePerson({ activo: v ? 1 : 0 }, person.user)
                "
              />
              <ChipRow
                v-if="person.activo && person.areas.length > 1"
                :options="
                  person.areas.map((a) => ({
                    value: a.key,
                    label: areaLabel(a),
                  }))
                "
                :selected="person.areas.filter((a) => a.on).map((a) => a.key)"
                multiple
                :testid="`avisos-persona-area`"
                @pick="(keys) => savePerson({ areas: keys }, person.user)"
              />
              <p v-else-if="person.activo" class="pb-1 text-sm text-ink-gray-6">
                {{ person.areas.map((a) => areaLabel(a)).join(', ') }}
              </p>
            </li>
          </ListGroup>

          <!-- Silenced -->
          <ListGroup
            v-if="page.silenciados.length"
            tag="ul"
            :aria-label="__('Silenced')"
            data-avisos-silenciados
          >
            <li
              v-for="row in page.silenciados"
              :key="row.name"
              class="flex min-h-14 items-center gap-3 px-4 py-2"
            >
              <span
                class="lucide-bell-off size-4 flex-none text-ink-gray-6"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1">
                <span class="block break-words text-base text-ink-gray-9">{{
                  row.titulo
                }}</span>
                <span class="block text-sm text-ink-gray-6">{{
                  row.area
                }}</span>
              </span>
              <Button
                variant="ghost"
                class="min-h-11 flex-none"
                :label="__('Notify me again')"
                :loading="busy.has(row.name)"
                @click="reactivate(row)"
              />
            </li>
          </ListGroup>
        </template>
      </div>
    </div>
    <!-- The one filled action: today's brief now, as it would arrive. -->
    <Fab
      v-if="page?.yo && (page.negocio.activo || page.dueno)"
      :label="busy.has('probar') ? __('Sending…') : __('Send it to me')"
      icon="lucide-sparkles"
      dock="extended"
      data-avisos-probar
      @click="tryNow"
    />
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Button, call, toast } from 'frappe-ui'
import { AppBar, Fab, ListGroup, Switch } from '@/components/ui'
import ChipRow from '@/components/asistente/ChipRow.vue'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { errorText } from '@/utils/errorText'

const API = 'doco.docoutils.assistant.ronda.api.'
const page = ref(null)
const problem = ref('')
const busy = reactive(new Set())

const AREA_WORDS = {
  dinero: __('Money'),
  ventas: __('Sales'),
  inventario: __('Stock and purchases'),
  operacion: __('Operations'),
  taller: __('Workshop'),
  personal: __('People'),
  conexiones: __('Connections'),
}
function areaLabel(area) {
  return AREA_WORDS[area.key] || area.label
}
function hourLabel(hhmm) {
  return String(hhmm || '').replace(/^0/, '')
}
const quietOptions = computed(() => [
  { value: '21:00-08:00', label: '21:00 – 8:00' },
  { value: '22:00-07:00', label: '22:00 – 7:00' },
  { value: '20:00-09:00', label: '20:00 – 9:00' },
  { value: 'sin', label: __('No quiet hours') },
])
const businessLine = computed(() => {
  const n = page.value?.negocio
  if (!n) return ''
  if (!n.activo) return __('Off: Muelle only answers when asked.')
  return __('Every morning at {0}, and only what cannot wait during the day.', [
    hourLabel(n.hora),
  ])
})

async function load() {
  problem.value = ''
  try {
    page.value = await call(API + 'pagina')
  } catch (error) {
    problem.value = errorText(
      error,
      __('The notices could not open. Try again.'),
    )
  }
}
onMounted(load)

async function saveBusiness(changes) {
  const key = Object.keys(changes)[0]
  const before = JSON.parse(JSON.stringify(page.value))
  if ('activo' in changes) page.value.negocio.activo = Boolean(changes.activo)
  busy.add(key)
  try {
    page.value = await call(API + 'guardar_negocio', { cambios: changes })
  } catch (error) {
    page.value = before
    toast.error(errorText(error, __('It was not saved. Try again.')))
  } finally {
    busy.delete(key)
  }
}

async function savePerson(changes, user) {
  const key = user || 'yo'
  const before = JSON.parse(JSON.stringify(page.value))
  busy.add(key)
  try {
    page.value = await call(API + 'guardar_persona', {
      cambios: changes,
      ...(user ? { persona: user } : {}),
    })
  } catch (error) {
    page.value = before
    toast.error(errorText(error, __('It was not saved. Try again.')))
  } finally {
    busy.delete(key)
  }
}

async function reactivate(row) {
  busy.add(row.name)
  try {
    page.value = await call(API + 'reactivar', { name: row.name })
    toast.success(__('Muelle will tell you about it again.'))
  } catch (error) {
    toast.error(errorText(error, __('It was not saved. Try again.')))
  } finally {
    busy.delete(row.name)
  }
}

async function tryNow() {
  if (busy.has('probar')) return
  busy.add('probar')
  try {
    const answer = await call(API + 'probar')
    toast.success(answer?.message || __('On its way to your conversation.'))
  } catch (error) {
    toast.error(errorText(error, __('It could not be sent. Try again.')))
  } finally {
    busy.delete('probar')
  }
}
</script>
