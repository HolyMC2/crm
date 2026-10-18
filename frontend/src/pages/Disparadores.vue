<template>
  <div class="flex h-full flex-col overflow-y-auto">
    <!-- Más › Configuración › Disparadores (Shell Wave D, DD8). -->
    <AppBar
      v-if="isPhone"
      back
      back-label="Más"
      title="Disparadores"
      :loading="loading"
    />
    <div class="mx-auto w-full max-w-5xl space-y-4 px-4 pb-24 pt-3">
      <header v-if="!isPhone" class="flex flex-wrap items-center gap-3">
        <h1 class="flex-1 text-xl font-semibold text-ink-gray-9">
          Disparadores
        </h1>
        <!-- Desk only: custom flows live in the desk-only Automatizaciones. -->
        <RouterLink
          v-if="isDesk"
          :to="{ path: '/automations' }"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-2"
        >
          <span class="lucide-workflow size-4" aria-hidden="true" />
          Flujos a la medida en Automatizaciones
        </RouterLink>
      </header>
      <p class="text-base text-ink-gray-7">
        Avisos automáticos para tu equipo cuando algo pasa en la tienda. Llegan
        a Avisos; al cliente no se le escribe desde aquí.
      </p>
      <p
        v-if="!manager && !loading && recipes.length"
        class="text-sm text-ink-gray-6"
      >
        Solo un encargado puede encenderlos o cambiar quién los recibe.
      </p>

      <EmptyState
        v-if="loading && !recipes.length"
        state="loading"
        title="Cargando disparadores…"
      />
      <EmptyState
        v-else-if="error && !recipes.length"
        state="error"
        title="No se pudieron cargar los disparadores"
        :message="error"
        action="Reintentar"
        @action="load"
      />

      <ul class="grid gap-3 lg:grid-cols-2">
        <li v-for="recipe in recipes" :key="recipe.key">
          <RecipeCard
            :recipe="recipe"
            :can-edit="manager"
            :busy="busy === recipe.key"
            @toggle="(value) => save(recipe, { enabled: value ? 1 : 0 })"
            @days="(value) => save(recipe, { days: value })"
            @recipients="editing = recipe"
          />
        </li>
      </ul>
    </div>

    <RecipientsSheet
      v-if="editing"
      :open="Boolean(editing)"
      :recipe="editing"
      :saving="busy === editing.key"
      @update:open="(value) => !value && (editing = null)"
      @save="(changes) => save(editing, changes, true)"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import { toast } from 'frappe-ui'
import { AppBar, EmptyState } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import RecipeCard from '@/components/disparadores/RecipeCard.vue'
import {
  errorText,
  guardarReceta,
  recetas,
} from '@/components/documentos/avisame'

const RecipientsSheet = defineAsyncComponent(
  () => import('@/components/disparadores/RecipientsSheet.vue'),
)

const { width } = useWindowSize()
const isDesk = computed(() => width.value >= 1024)
const loading = ref(false)
const error = ref('')
const manager = ref(false)
const recipes = ref([])
const busy = ref('')
const editing = ref(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await recetas()
    manager.value = Boolean(data?.manager)
    recipes.value = data?.recipes || []
  } catch (failure) {
    error.value = errorText(failure, 'Revisa tu conexión e intenta de nuevo.')
  } finally {
    loading.value = false
  }
}

async function save(recipe, changes, closeSheet = false) {
  if (!recipe || !manager.value) return
  busy.value = recipe.key
  const index = recipes.value.findIndex((row) => row.key === recipe.key)
  const before = recipes.value[index]
  if ('enabled' in changes)
    recipes.value[index] = { ...before, enabled: Boolean(changes.enabled) }
  try {
    recipes.value[index] = await guardarReceta(recipe.key, changes)
    if (closeSheet) editing.value = null
    if ('enabled' in changes)
      toast.success(
        changes.enabled
          ? `Encendido: ${recipe.title.toLowerCase()}.`
          : 'Apagado.',
      )
  } catch (failure) {
    recipes.value[index] = before
    toast.error(errorText(failure))
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>
