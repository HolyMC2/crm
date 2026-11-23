<template>
  <!-- Fidelidad's «Premios» and «Retos»: two open sections, each with its one
       create button, its rows and a friendly empty line. On desktop they are
       the board's sections (HoySection); on a phone, the «Premios» view. The
       customers see them under «Premios» in their app. -->
  <div data-testid="fidelidad-premios-retos">
    <p
      v-if="error"
      role="alert"
      class="text-sm text-ink-red-7"
      :class="desk ? 'px-5 pb-3' : 'px-4 pt-3'"
    >
      {{ error }}
    </p>
    <p
      v-if="board?.denied"
      class="text-sm text-ink-gray-6"
      :class="desk ? 'px-5 pb-3' : 'px-4 pt-3'"
      role="note"
    >
      {{ board.denied }}
    </p>

    <PremiosSeccion
      id="fidelidad-premios"
      :title="__('Rewards', null, CTX)"
      icon="lucide-gift"
      :desk="desk"
      :class="desk ? '' : 'pt-4'"
    >
      <div class="flex items-center gap-2" :class="desk ? 'px-5 pb-2' : 'px-4'">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-ink-gray-6">
            {{
              programActive
                ? __(
                    'Products your customers take with their points.',
                    null,
                    CTX,
                  )
                : __(
                    'Rewards are paid with points: create your points program first.',
                    null,
                    CTX,
                  )
            }}
          </p>
        </div>
        <button
          v-if="board?.can_edit && programActive"
          type="button"
          :class="BTN.tonal"
          class="press flex-none"
          data-testid="fidelidad-nuevo-premio"
          @click="$emit('new-reward')"
        >
          <span class="lucide-plus size-4" aria-hidden="true" />
          {{ __('New reward', null, CTX) }}
        </button>
      </div>
      <PremiosLista
        v-if="rewards.length"
        class="mt-1"
        :rows="rewards"
        @open="(row) => $emit('open-reward', row)"
      />
      <p
        v-else-if="programActive"
        class="py-3 text-sm text-ink-gray-6"
        :class="desk ? 'px-5' : 'px-4'"
        data-testid="fidelidad-premios-vacio"
      >
        {{
          __(
            'No rewards yet. A product for points brings customers back.',
            null,
            CTX,
          )
        }}
      </p>
    </PremiosSeccion>

    <PremiosSeccion
      id="fidelidad-retos"
      :title="__('Challenges', null, CTX)"
      icon="lucide-target"
      :desk="desk"
      :class="desk ? 'mt-6' : 'pt-6'"
    >
      <div class="flex items-center gap-2" :class="desk ? 'px-5 pb-2' : 'px-4'">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'A stamp card or a spend goal that gives a coupon or bonus points.',
                null,
                CTX,
              )
            }}
          </p>
        </div>
        <button
          v-if="board?.can_edit"
          type="button"
          :class="BTN.tonal"
          class="press flex-none"
          data-testid="fidelidad-nuevo-reto"
          @click="$emit('new-challenge')"
        >
          <span class="lucide-plus size-4" aria-hidden="true" />
          {{ __('New challenge', null, CTX) }}
        </button>
      </div>
      <RetosLista
        v-if="challenges.length"
        class="mt-1"
        :rows="challenges"
        :currency="currency"
        @open="(row) => $emit('open-challenge', row)"
      />
      <p
        v-else
        class="py-3 text-sm text-ink-gray-6"
        :class="desk ? 'px-5' : 'px-4'"
        data-testid="fidelidad-retos-vacio"
      >
        {{
          __(
            'No challenges yet. «Your third purchase has a gift» works well.',
            null,
            CTX,
          )
        }}
      </p>
    </PremiosSeccion>

    <p
      class="text-sm text-ink-gray-6"
      :class="desk ? 'px-5 pt-3' : 'px-4 pt-5'"
    >
      {{
        __('Your customers see them under «Rewards» in their app.', null, CTX)
      }}
      <RouterLink
        :to="{ name: 'AppClientes' }"
        class="font-medium text-ink-gray-8 underline underline-offset-2"
        data-testid="fidelidad-premios-app"
        >{{ __('Your customers’ app', null, CTX) }}</RouterLink
      >
    </p>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { BTN } from '@/documentos/tools'
import PremiosLista from './PremiosLista.vue'
import PremiosSeccion from './PremiosSeccion.vue'
import RetosLista from '@/components/fidelidad/retos/RetosLista.vue'
import { CTX, byState } from './view'

const props = defineProps({
  /** doco.fidelidad.premios_api.get_premios */
  board: { type: Object, default: null },
  currency: { type: String, default: 'MXN' },
  error: { type: String, default: '' },
  /** The desktop board's sections (HoySection) instead of the phone view. */
  desk: { type: Boolean, default: false },
})
defineEmits(['open-reward', 'open-challenge', 'new-reward', 'new-challenge'])

const programActive = computed(() => !!props.board?.program?.active)
const rewards = computed(() => byState(props.board?.rewards || []))
const challenges = computed(() => byState(props.board?.challenges || []))
</script>
