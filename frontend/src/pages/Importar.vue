<template>
  <!-- «Importar productos» / «Importar clientes»: the sheet the shop already
       has, from the phone or the desktop. Pick the file, check the columns
       and the first rows, see which rows have errors, import, undo. -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" data-importar>
    <AppBar
      v-if="phone"
      :back="backTo"
      :back-label="__('Back to {0}', [backLabel], CTX)"
      :title="title"
    />
    <div v-else class="w-full px-4 sm:px-6">
      <PageHeader
        class="mx-auto max-w-2xl !px-0"
        :title="title"
        :subtitle="subtitle"
        :level="1"
      >
        <template #actions>
          <RouterLink
            :to="backTo"
            class="press inline-flex min-h-11 items-center gap-1.5 rounded-5 px-3 text-base text-ink-gray-8 hover:bg-surface-gray-2 sm:min-h-8"
            data-importar-volver
          >
            <span class="lucide-arrow-left size-4" aria-hidden="true" />
            {{ __('Back to {0}', [backLabel], CTX) }}
          </RouterLink>
        </template>
      </PageHeader>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
      <div class="mx-auto w-full max-w-2xl space-y-6">
        <p v-if="phone" class="pt-1 text-sm text-ink-gray-6">{{ subtitle }}</p>

        <p
          v-if="!opciones && !loadProblem"
          role="status"
          class="flex items-center gap-2 py-6 text-sm text-ink-gray-6"
        >
          <span
            class="lucide-loader-circle size-4 animate-spin"
            aria-hidden="true"
          />
          {{ __('Loading…', null, CTX) }}
        </p>
        <section
          v-else-if="loadProblem"
          role="alert"
          class="space-y-3 py-6"
          data-importar-error-carga
        >
          <p class="text-base text-ink-gray-8">{{ loadProblem }}</p>
          <Button
            class="min-h-11 sm:min-h-8"
            :label="__('Retry', null, CTX)"
            @click="loadOpciones"
          />
        </section>
        <section
          v-else-if="!opciones.puede"
          role="status"
          class="space-y-3 py-6"
          data-importar-sin-permiso
        >
          <h2 class="text-lg font-semibold">
            {{
              opciones.disponible
                ? __('You cannot import here', null, CTX)
                : __('Importing is not available yet', null, CTX)
            }}
          </h2>
          <p class="text-base text-ink-gray-7">{{ opciones.motivo }}</p>
        </section>

        <!-- 3. The import: progress while it runs, then what it did. -->
        <section v-else-if="estado" class="space-y-5" data-importar-estado>
          <div v-if="!estado.terminada" role="status" class="space-y-3 pt-2">
            <h2 class="text-lg font-semibold">
              {{ __('Importing «{0}»…', [estado.archivo], CTX) }}
            </h2>
            <div class="h-2 overflow-hidden rounded-full bg-surface-gray-2">
              <div
                class="h-full rounded-full bg-surface-gray-7 transition-[width] motion-reduce:transition-none"
                :style="{ width: progress.pct + '%' }"
              />
            </div>
            <p class="num text-sm text-ink-gray-7">{{ progress.text }}</p>
            <p class="text-sm text-ink-gray-6">
              {{
                __(
                  'You can leave this screen: the import goes on and its result waits here.',
                  null,
                  CTX,
                )
              }}
            </p>
          </div>
          <template v-else>
            <div class="space-y-1 pt-2" role="status">
              <h2 class="text-xl font-semibold" data-importar-resumen>
                {{ summary.titulo }}
              </h2>
              <p class="text-sm text-ink-gray-6">«{{ estado.archivo }}»</p>
            </div>
            <ul
              v-if="summary.lineas.length"
              class="divide-y divide-outline-gray-1 border-y border-outline-gray-1"
            >
              <li
                v-for="line in summary.lineas"
                :key="line"
                class="py-2.5 text-base"
              >
                {{ line }}
              </li>
            </ul>
            <p v-if="estado.por_que" class="text-sm text-ink-amber-8">
              {{ estado.por_que }}
            </p>
            <ul
              v-if="estado.existencia?.length"
              class="space-y-1 rounded-6 bg-surface-amber-1 p-3"
              data-importar-existencia
            >
              <li
                v-for="line in estado.existencia"
                :key="line"
                class="text-sm text-ink-amber-8"
              >
                {{ line }}
              </li>
            </ul>
            <!-- After «Deshacer» the page says what was taken back; the rows
                 that failed and the notes belonged to the import itself. -->
            <div v-if="estado.fallas?.length && !undone" class="space-y-2">
              <h3 class="text-base font-medium">
                {{ __('Rows that failed', null, CTX) }}
              </h3>
              <ul class="divide-y divide-outline-gray-1">
                <li
                  v-for="falla in estado.fallas"
                  :key="falla.fila"
                  class="flex gap-3 py-2 text-sm"
                >
                  <span class="num w-16 shrink-0 text-ink-gray-6">{{
                    __('Row {0}', [falla.fila], CTX)
                  }}</span>
                  <span class="min-w-0 flex-1">{{ falla.motivo }}</span>
                </li>
              </ul>
            </div>
            <ul v-if="estado.notas?.length && !undone" class="space-y-1">
              <li
                v-for="nota in estado.notas"
                :key="nota.texto"
                class="text-sm text-ink-gray-7"
              >
                {{
                  nota.filas > 1
                    ? __('{0} ({1} rows)', [nota.texto, nota.filas], CTX)
                    : nota.texto
                }}
              </li>
            </ul>
            <div
              v-if="estado.inventario && !estado.inventario.confirmado"
              class="space-y-2 rounded-6 bg-surface-gray-1 p-3"
              data-importar-inventario
            >
              <p class="text-sm">
                {{
                  __(
                    'The stock went into a draft opening stock. Check it and confirm it so the stock counts.',
                    null,
                    CTX,
                  )
                }}
              </p>
              <RouterLink
                v-if="inventarioTo"
                :to="inventarioTo"
                class="press inline-flex min-h-11 items-center text-base font-medium text-ink-gray-9 underline sm:min-h-8 sm:text-sm"
              >
                {{ __('Check the opening stock', null, CTX) }}
              </RouterLink>
            </div>
            <!-- «Deshacer»: two taps in place, never a dialog. -->
            <div
              v-if="estado.deshacible"
              class="space-y-2"
              data-importar-deshacer
            >
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  v-if="!confirmUndo"
                  class="min-h-11 sm:min-h-8"
                  :label="__('Undo the import', null, CTX)"
                  @click="confirmUndo = true"
                >
                  <template #prefix>
                    <span class="lucide-undo-2 size-4" aria-hidden="true" />
                  </template>
                </Button>
                <template v-else>
                  <Button
                    class="min-h-11 sm:min-h-8"
                    theme="red"
                    :label="undoLabel"
                    :loading="busy === 'deshacer'"
                    data-importar-deshacer-si
                    @click="undo"
                  />
                  <Button
                    class="min-h-11 sm:min-h-8"
                    variant="ghost"
                    :label="__('Cancel', null, CTX)"
                    :disabled="busy === 'deshacer'"
                    @click="confirmUndo = false"
                  />
                </template>
              </div>
              <p v-if="confirmUndo" class="text-sm text-ink-gray-6">
                {{
                  __(
                    'What the import added is deleted, or turned off where it is already in use; what it changed goes back to how it was.',
                    null,
                    CTX,
                  )
                }}
              </p>
            </div>
          </template>
          <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
            {{ problem }}
          </p>
        </section>

        <!-- Before the first products: Abordo's catalog questions, each on the
             answer recommended for the business (as Hoy's «Agregar producto»). -->
        <section
          v-else-if="opciones.preguntas"
          class="space-y-5 pt-2"
          data-importar-preguntas
        >
          <div class="space-y-1">
            <h2 class="text-lg font-semibold">
              {{
                __(
                  'First, how you keep your products. Once you sell, it does not change.',
                  null,
                  CTX,
                )
              }}
            </h2>
            <p class="text-sm text-ink-gray-6">
              {{
                __(
                  'The answer recommended for your business is already chosen.',
                  null,
                  CTX,
                )
              }}
            </p>
          </div>
          <p
            v-if="decisionsLoading"
            role="status"
            class="flex items-center gap-2 text-sm text-ink-gray-6"
          >
            <span
              class="lucide-loader-circle size-4 animate-spin"
              aria-hidden="true"
            />
            {{ __('Loading…', null, CTX) }}
          </p>
          <div
            v-for="(decision, index) in decisions"
            :key="decision.decision_key"
            role="group"
            :aria-labelledby="`importar-decision-${index}`"
            class="space-y-2"
            data-decision
          >
            <p
              :id="`importar-decision-${index}`"
              class="text-base font-medium text-ink-gray-9"
            >
              {{ decision.question }}
            </p>
            <ChipGroup
              v-model="picked[decision.decision_key]"
              :options="decisionChoices(decision)"
              :clear-value="picked[decision.decision_key]"
            />
            <p class="text-sm text-ink-gray-6">{{ decision.why }}</p>
          </div>
          <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
            {{ problem }}
          </p>
        </section>

        <!-- 2. The review: columns, first rows, rows with errors. -->
        <section v-else-if="review" class="space-y-6" data-importar-revision>
          <div class="flex items-start gap-3 pt-2">
            <span
              class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-gray-2"
              aria-hidden="true"
              ><span class="lucide-file-spreadsheet size-5 text-ink-gray-6"
            /></span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-base font-medium">{{ review.archivo }}</p>
              <p class="num text-sm text-ink-gray-6">
                {{
                  review.hoja
                    ? __('{0} rows in «{1}»', [review.filas, review.hoja], CTX)
                    : __('{0} rows', [review.filas], CTX)
                }}
              </p>
            </div>
            <span
              v-if="busy === 'revisar'"
              class="lucide-loader-circle mt-2 size-4 animate-spin text-ink-gray-6"
              :aria-label="__('Checking…', null, CTX)"
            />
          </div>

          <div
            v-if="review.bloqueos.length"
            role="alert"
            class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
          >
            <p v-for="line in review.bloqueos" :key="line">{{ line }}</p>
          </div>

          <template v-else>
            <p
              v-if="review.ya_importado"
              role="status"
              class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
            >
              {{
                __(
                  'This same file was imported before. The rows that already exist are left as they are.',
                  null,
                  CTX,
                )
              }}
            </p>

            <!-- What the mapper could not decide, as one tap each. -->
            <div
              v-for="question in questionList"
              :key="question.key"
              class="space-y-2"
              data-importar-duda
            >
              <p class="text-base font-medium">{{ question.text }}</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="option in question.options"
                  :key="`${option.campo}-${option.columna}`"
                  type="button"
                  :class="chipClass(false)"
                  :disabled="!!busy"
                  @click="choose(option.campo, option.columna)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div v-if="counts.length" class="space-y-2">
              <h2 class="text-base font-semibold">
                {{ __('Review', null, CTX) }}
              </h2>
              <ul class="space-y-1" data-importar-cuentas>
                <li
                  v-for="line in counts"
                  :key="line.key"
                  class="flex items-baseline gap-2 text-base"
                  :data-cuenta="line.key"
                >
                  <span
                    class="num min-w-12 text-right font-semibold"
                    :class="line.tone === 'warn' ? 'text-ink-amber-8' : ''"
                    >{{ line.value.toLocaleString() }}</span
                  >
                  <span class="text-ink-gray-8">{{ line.text }}</span>
                </li>
              </ul>
              <label
                v-if="review.cuentas.existentes || review.cuentas.actualizar"
                class="flex min-h-11 cursor-pointer items-center gap-3 text-base sm:min-h-8"
              >
                <input
                  type="checkbox"
                  class="size-5 rounded-4 sm:size-4"
                  :checked="existentes === 'actualizar'"
                  :disabled="!!busy"
                  data-importar-actualizar
                  @change="toggleUpdate"
                />
                {{
                  review.que === 'productos'
                    ? __(
                        'Update the name, group and barcode of those that already exist',
                        null,
                        CTX,
                      )
                    : __(
                        'Update the name and RFC of those that already exist',
                        null,
                        CTX,
                      )
                }}
              </label>
            </div>

            <div v-if="samples.length" class="space-y-2">
              <h2 class="text-base font-semibold">
                {{ __('First rows', null, CTX) }}
              </h2>
              <ul
                class="divide-y divide-outline-gray-1 border-y border-outline-gray-1"
                data-importar-muestra
              >
                <li v-for="row in samples" :key="row.fila" class="py-2.5">
                  <p class="flex items-baseline gap-2 text-base">
                    <span class="min-w-0 flex-1 truncate">{{
                      row.titulo
                    }}</span>
                    <span class="num shrink-0 text-xs text-ink-gray-5">{{
                      __('Row {0}', [row.fila], CTX)
                    }}</span>
                  </p>
                  <p v-if="row.detalle" class="text-sm text-ink-gray-6">
                    {{ row.detalle }}
                  </p>
                  <p v-if="row.actualiza" class="text-sm text-ink-gray-6">
                    {{ __('Already exists: it is updated', null, CTX) }}
                  </p>
                </li>
              </ul>
            </div>

            <!-- What happens on import besides the counts (groups created,
                 series, the draft opening stock…), before the rows left out. -->
            <div
              v-if="review.notas.length || review.avisos.length"
              class="space-y-2"
              data-importar-avisos
            >
              <h2 class="text-base font-semibold">
                {{ __('Keep in mind', null, CTX) }}
              </h2>
              <ul
                class="divide-y divide-outline-gray-1 border-y border-outline-gray-1"
              >
                <li
                  v-for="aviso in review.avisos"
                  :key="aviso"
                  class="py-2.5 text-sm text-ink-gray-8"
                >
                  {{ aviso }}
                </li>
                <li
                  v-for="nota in review.notas"
                  :key="nota.texto"
                  class="py-2.5 text-sm text-ink-gray-8"
                >
                  {{
                    nota.filas > 1
                      ? __('{0} ({1} rows)', [nota.texto, nota.filas], CTX)
                      : nota.texto
                  }}
                </li>
              </ul>
            </div>

            <div v-if="review.errores.length" class="space-y-2">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 class="flex-1 text-base font-semibold">
                  {{ __('Rows with errors', null, CTX) }}
                </h2>
                <a
                  v-if="review.vista"
                  :href="erroresHref(review.vista)"
                  class="press inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-gray-8 sm:min-h-8"
                  download
                  data-importar-descargar-errores
                >
                  <span class="lucide-download size-4" aria-hidden="true" />
                  {{ __('Download the rows with errors', null, CTX) }}
                </a>
              </div>
              <div
                v-if="offersNameAsCode(review)"
                class="flex flex-wrap items-center gap-x-3 gap-y-2"
                data-importar-sin-codigo
              >
                <p class="text-sm text-ink-gray-8">
                  {{
                    review.sin_codigo === 1
                      ? __('1 product has no code.', null, CTX)
                      : __(
                          '{0} products have no code.',
                          [review.sin_codigo.toLocaleString()],
                          CTX,
                        )
                  }}
                </p>
                <button
                  type="button"
                  :class="chipClass(false)"
                  :disabled="!!busy"
                  @click="useNameAsCode"
                >
                  {{ __('My products have no code: use the name', null, CTX) }}
                </button>
              </div>
              <p class="text-sm text-ink-gray-6">
                {{
                  __(
                    'These rows are not imported. Fix them in your sheet and upload it again: the rows already in Muelle are left as they are.',
                    null,
                    CTX,
                  )
                }}
              </p>
              <ul class="divide-y divide-outline-gray-1" data-importar-errores>
                <li
                  v-for="error in shownErrors"
                  :key="error.fila"
                  class="flex gap-3 py-2 text-sm"
                >
                  <span class="num w-16 shrink-0 text-ink-gray-6">{{
                    __('Row {0}', [error.fila], CTX)
                  }}</span>
                  <span class="min-w-0 flex-1">{{ error.motivo }}</span>
                </li>
              </ul>
              <button
                v-if="moreErrors"
                type="button"
                class="press min-h-11 text-sm font-medium text-ink-gray-8 sm:min-h-8"
                @click="allErrors = true"
              >
                {{ moreErrorsLabel(review) }}
              </button>
              <p
                v-if="
                  allErrors && review.errores.length < review.cuentas.errores
                "
                class="text-sm text-ink-gray-6"
              >
                {{
                  __(
                    'The other {0} are in the download of the rows with errors.',
                    [
                      (
                        review.cuentas.errores - review.errores.length
                      ).toLocaleString(),
                    ],
                    CTX,
                  )
                }}
              </p>
            </div>

            <!-- The columns: folded once every required one is found; open
                 while one is missing. -->
            <details
              class="group border-t border-outline-gray-1 pt-1"
              :open="columnsOpen"
              data-importar-columnas
              @toggle="columnsOpen = $event.target.open"
            >
              <summary
                class="fold-summary press flex min-h-11 cursor-pointer list-none items-center gap-2 text-base font-semibold text-ink-gray-9"
              >
                <span
                  class="lucide-chevron-right size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  aria-hidden="true"
                />
                <span class="flex-1">{{ __('Columns', null, CTX) }}</span>
                <span class="num text-sm font-normal text-ink-gray-6">{{
                  __('{0} of {1} found', [foundFields, fields.length], CTX)
                }}</span>
              </summary>
              <div class="space-y-2 pt-1">
                <p class="text-sm text-ink-gray-6">
                  {{
                    __(
                      'Each piece of data reads the column chosen for it. Change one if it is wrong.',
                      null,
                      CTX,
                    )
                  }}
                </p>
                <ul class="divide-y divide-outline-gray-1">
                  <li
                    v-for="field in fields"
                    :key="field.campo"
                    class="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                    :data-campo="field.campo"
                  >
                    <div class="min-w-0 sm:w-44 sm:shrink-0">
                      <p class="text-base">
                        {{ field.etiqueta
                        }}<span
                          v-if="field.obligatorio"
                          class="text-ink-gray-5"
                          >{{ __(' (required)', null, CTX) }}</span
                        >
                      </p>
                      <p
                        v-if="field.ejemplo && !field.falta"
                        class="break-words text-sm text-ink-gray-6"
                      >
                        {{ __('For example: {0}', [field.ejemplo], CTX) }}
                      </p>
                    </div>
                    <div class="min-w-0 flex-1 space-y-1">
                      <p
                        v-if="
                          field.campo === 'item_code' &&
                          review.nombre_como_codigo
                        "
                        class="flex min-h-11 flex-wrap items-center gap-x-3 text-sm sm:min-h-8"
                      >
                        <span>{{ __('The name is the code', null, CTX) }}</span>
                        <button
                          type="button"
                          class="press min-h-11 font-medium text-ink-gray-8 underline sm:min-h-8"
                          :disabled="!!busy"
                          @click="dropNameCode"
                        >
                          {{ __('Choose a code column', null, CTX) }}
                        </button>
                      </p>
                      <template v-else>
                        <select
                          class="h-11 w-full rounded-6 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:border-outline-gray-4 focus:ring-0 sm:h-10"
                          :class="
                            field.falta
                              ? 'border-outline-red-3'
                              : 'border-transparent'
                          "
                          :value="field.value"
                          :aria-label="field.etiqueta"
                          :disabled="!!busy"
                          @change="
                            (event) => choose(field.campo, event.target.value)
                          "
                        >
                          <option
                            v-for="option in columnOptions(review, field)"
                            :key="option.value"
                            :value="option.value"
                            :disabled="option.value === ''"
                          >
                            {{ option.label }}
                          </option>
                        </select>
                        <p v-if="field.falta" class="text-sm text-ink-red-7">
                          {{
                            __(
                              'No column says {0}. Choose the one that has it.',
                              [field.etiqueta],
                              CTX,
                            )
                          }}
                        </p>
                        <button
                          v-if="field.campo === 'item_code' && field.falta"
                          type="button"
                          :class="chipClass(false)"
                          :disabled="!!busy"
                          data-importar-nombre-codigo
                          @click="useNameAsCode"
                        >
                          {{
                            __(
                              'My products have no code: use the name',
                              null,
                              CTX,
                            )
                          }}
                        </button>
                      </template>
                    </div>
                  </li>
                </ul>
              </div>
            </details>
          </template>
          <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
            {{ problem }}
          </p>
        </section>

        <!-- 1. The start: the file, the template, the last imports. -->
        <section v-else class="space-y-6" data-importar-inicio>
          <div
            class="rounded-7 border border-dashed border-outline-gray-3 p-5 text-center"
            :class="dropping ? 'bg-surface-gray-2' : ''"
            data-importar-soltar
            @dragover.prevent="dropping = true"
            @dragleave="dropping = false"
            @drop.prevent="onDrop"
          >
            <span
              class="lucide-upload mx-auto block size-7 text-ink-gray-6"
              aria-hidden="true"
            />
            <p class="mt-2 text-base font-medium">
              {{
                que === 'productos'
                  ? __('Your products sheet', null, CTX)
                  : __('Your customers sheet', null, CTX)
              }}
            </p>
            <p class="mt-1 text-sm text-ink-gray-6">
              {{
                __(
                  'Excel (.xlsx or .xls) or .csv, up to {0} MB and {1} rows. Its columns can be in any order.',
                  [opciones.limite_mb, opciones.limite_filas.toLocaleString()],
                  CTX,
                )
              }}
            </p>
            <label
              :class="[
                'press mt-3 cursor-pointer',
                BTN.filled,
                busy ? 'pointer-events-none opacity-50' : '',
              ]"
            >
              <span
                :class="[
                  busy ? 'lucide-loader-circle animate-spin' : 'lucide-upload',
                  'size-5',
                ]"
                aria-hidden="true"
              />
              {{
                busy === 'subir'
                  ? __('Uploading…', null, CTX)
                  : busy === 'revisar'
                    ? __('Reading the sheet…', null, CTX)
                    : __('Choose the file', null, CTX)
              }}
              <input
                type="file"
                class="sr-only"
                :accept="ACCEPT"
                :disabled="!!busy"
                data-importar-archivo
                @change="onPick"
              />
            </label>
          </div>
          <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
            {{ problem }}
          </p>
          <div class="space-y-1">
            <a
              :href="plantillaHref(que)"
              class="press inline-flex min-h-11 items-center gap-2 text-base font-medium text-ink-gray-8 sm:min-h-8 sm:text-sm"
              download
              data-importar-plantilla
            >
              <span class="lucide-download size-4" aria-hidden="true" />
              {{ __('Download the template', null, CTX) }}
            </a>
            <p class="text-sm text-ink-gray-6">
              {{
                __(
                  'No sheet yet? Fill in the template: one row per {0}.',
                  [
                    que === 'productos'
                      ? __('product', null, CTX)
                      : __('customer', null, CTX),
                  ],
                  CTX,
                )
              }}
            </p>
          </div>
          <div v-if="opciones.recientes.length" class="space-y-1">
            <h2 class="text-base font-semibold">
              {{ __('Your last imports', null, CTX) }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li v-for="row in opciones.recientes" :key="row.registro">
                <ListRow
                  :title="row.archivo"
                  :subtitle="recentLine(row)"
                  :subtitle-lines="2"
                  icon="lucide-file-spreadsheet"
                  @click="openImport(row.registro)"
                />
              </li>
            </ul>
          </div>
          <RouterLink
            v-if="otherTo"
            :to="otherTo"
            class="press inline-flex min-h-11 items-center text-base font-medium text-ink-gray-8 underline sm:min-h-8 sm:text-sm"
            data-importar-otro
          >
            {{
              opciones.tambien === 'clientes'
                ? __('Import your customers too', null, CTX)
                : __('Import your products too', null, CTX)
            }}
          </RouterLink>
        </section>
      </div>
    </div>

    <footer
      v-if="footer"
      class="shrink-0 border-t border-outline-gray-2 bg-surface-base px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6"
    >
      <div class="mx-auto w-full max-w-2xl space-y-2">
        <!-- An unreadable file already says why above: its one way on is
             another file. -->
        <p
          v-if="footer === 'revision' && blocker && !unreadable"
          class="text-sm text-ink-gray-7"
          data-importar-espera
        >
          {{ blocker }}
        </p>
        <p
          v-if="footer === 'revision' && !blocker && review.en_segundo_plano"
          class="text-sm text-ink-gray-6"
        >
          {{
            __(
              'They are imported in the background; you can leave this screen.',
              null,
              CTX,
            )
          }}
        </p>
        <div
          class="flex items-center gap-2"
          :class="footer === 'preguntas' ? 'justify-end' : 'justify-between'"
        >
          <Button
            v-if="footer === 'preguntas'"
            class="min-h-11 w-full sm:min-h-8 sm:w-auto"
            variant="solid"
            :label="__('Save answers', null, CTX)"
            :loading="busy === 'respuestas'"
            :disabled="!decisions.length"
            data-importar-respuestas
            @click="saveDecisions"
          />
          <Button
            v-else-if="footer === 'revision' && unreadable"
            class="min-h-11 w-full sm:min-h-8 sm:w-auto"
            variant="solid"
            :label="__('Choose another file', null, CTX)"
            data-importar-otro-archivo
            @click="startOver"
          />
          <template v-else-if="footer === 'revision'">
            <Button
              class="min-h-11 sm:min-h-8"
              :label="__('Another file', null, CTX)"
              :disabled="busy === 'importar'"
              @click="startOver"
            />
            <Button
              class="min-h-11 flex-1 sm:min-h-8 sm:flex-none"
              variant="solid"
              :label="importLabel(review)"
              :loading="busy === 'importar'"
              :disabled="!!blocker || busy === 'revisar' || !review.vista"
              data-importar-importar
              @click="runImport"
            />
          </template>
          <template v-else>
            <Button
              class="min-h-11 sm:min-h-8"
              :label="__('Import another file', null, CTX)"
              @click="startOver"
            />
            <Button
              class="min-h-11 flex-1 sm:min-h-8 sm:flex-none"
              variant="solid"
              :label="doneLabel"
              data-importar-listo
              @click="router.push(doneTo)"
            />
          </template>
        </div>
      </div>
    </footer>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import {
  AppBar,
  ChipGroup,
  ListRow,
  PageHeader,
  chipClass,
} from '@/components/ui'
import { isMobile as phone } from '@/composables/breakpoint'
import { shellBoot } from '@/composables/muelleShell'
import { BTN } from '@/documentos/tools'
import { documentRoute } from '@/documentos/registry'
import { formatDate } from '@/utils/display'
import { errorText } from '@/utils/errorText'
import {
  defaultReturnLabel,
  safeReturn,
  sanitizeReturnLabel,
} from '@/vendor/muelle-shell/contracts'
import {
  ACCEPT,
  chooseColumn,
  choicesOf,
  columnOptions,
  countsOf,
  dropNameAsCode,
  erroresHref,
  fieldRows,
  fileProblem,
  importBlocker,
  importLabel,
  importarApi,
  moreErrorsLabel,
  nameAsCode,
  offersNameAsCode,
  plantillaHref,
  progressOf,
  questions,
  sampleRows,
  statusLabel,
  summaryOf,
  uploadSheet,
} from '@/components/importar/importar'
import {
  answerDecisions,
  decisionAnswers,
  decisionDraft,
  loadCatalogPending,
} from '@/components/primeros/primerosPasos'

const props = defineProps({
  que: { type: String, required: true },
})

const CTX = 'Importar'
const SHOWN_ERRORS = 10
const POLL_MS = 1500
const route = useRoute()
const router = useRouter()

const opciones = ref(null)
const loadProblem = ref('')
const review = ref(null)
const choices = ref({})
const existentes = ref('omitir')
const archivo = ref('')
const estado = ref(null)
const busy = ref('')
const problem = ref('')
const dropping = ref(false)
const allErrors = ref(false)
const confirmUndo = ref(false)
const decisions = ref([])
const picked = ref({})
const decisionsLoading = ref(false)
let ticket = 0
let timer = 0

const productos = computed(() => props.que === 'productos')
const listPath = computed(() => (productos.value ? '/productos' : '/contactos'))
const title = computed(() =>
  productos.value
    ? __('Import products', null, CTX)
    : __('Import customers', null, CTX),
)
const subtitle = computed(() =>
  productos.value
    ? __(
        'From the Excel you already have: codes, names, prices, cost and stock.',
        null,
        CTX,
      )
    : __(
        'From the Excel you already have: names, RFC, phones and emails.',
        null,
        CTX,
      ),
)

// The way back (shell return protocol), else the list the page belongs to.
const back = computed(() => {
  const to =
    typeof route.query.return_to === 'string'
      ? safeReturn(route.query.return_to, ['/crm/'])
      : null
  return to
    ? {
        to: to.slice(4),
        label:
          sanitizeReturnLabel(route.query.return_label) ||
          defaultReturnLabel(to),
      }
    : null
})
const backTo = computed(() => back.value?.to || listPath.value)
const backLabel = computed(
  () =>
    back.value?.label ||
    (productos.value ? __('Products', null, CTX) : __('Contacts', null, CTX)),
)
const doneTo = computed(() => back.value?.to || listPath.value)
const doneLabel = computed(() =>
  back.value
    ? __('Back to {0}', [back.value.label], CTX)
    : productos.value
      ? __('See the products', null, CTX)
      : __('See the contacts', null, CTX),
)
const otherTo = computed(() => {
  const other = opciones.value?.tambien
  if (!other) return null
  const path =
    other === 'clientes' ? '/contactos/importar' : '/productos/importar'
  return { path, query: back.value ? { ...returnQuery() } : {} }
})
function returnQuery() {
  const out = {}
  for (const key of ['return_to', 'return_label'])
    if (typeof route.query[key] === 'string') out[key] = route.query[key]
  return out
}

const fields = computed(() => fieldRows(review.value))
const foundFields = computed(
  () => fields.value.filter((field) => field.value !== '').length,
)
// Folded once the required columns are found; a missing one opens it.
const columnsOpen = ref(false)
watch(
  () => review.value?.faltan?.length,
  (missing) => {
    if (missing) columnsOpen.value = true
  },
)
const questionList = computed(() => questions(review.value))
const samples = computed(() => sampleRows(review.value))
const counts = computed(() => countsOf(review.value))
const blocker = computed(() => importBlocker(review.value))
// A file with nothing to read (no titles, no rows): no import to wait for.
const unreadable = computed(() => !!review.value?.bloqueos?.length)
const undone = computed(() => estado.value?.estado === 'Deshecho')
const shownErrors = computed(() =>
  allErrors.value
    ? review.value?.errores || []
    : (review.value?.errores || []).slice(0, SHOWN_ERRORS),
)
const moreErrors = computed(
  () => !allErrors.value && (review.value?.errores?.length || 0) > SHOWN_ERRORS,
)
const progress = computed(() => progressOf(estado.value))
const summary = computed(() => summaryOf(estado.value))
const inventarioTo = computed(() =>
  estado.value?.inventario?.documento
    ? documentRoute('Stock Reconciliation', estado.value.inventario.documento, {
        boot: shellBoot.value,
      })
    : null,
)
const undoLabel = computed(() => {
  const n = (estado.value?.creadas || 0) + (estado.value?.actualizadas || 0)
  return n === 1
    ? __('Yes, undo 1 row', null, CTX)
    : __('Yes, undo {0} rows', [n], CTX)
})
const footer = computed(() => {
  if (!opciones.value?.puede) return ''
  if (estado.value) return estado.value.terminada ? 'hecho' : ''
  if (opciones.value.preguntas) return decisions.value.length ? 'preguntas' : ''
  return review.value ? 'revision' : ''
})

function recentLine(row) {
  const parts = [statusLabel(row.estado)]
  if (row.cuando) parts.push(formatDate(row.cuando))
  if (row.creadas)
    parts.push(
      productos.value
        ? __('{0} new products', [row.creadas], CTX)
        : __('{0} new customers', [row.creadas], CTX),
    )
  return parts.filter(Boolean).join(', ')
}

async function loadOpciones() {
  loadProblem.value = ''
  try {
    opciones.value = await importarApi('opciones', { que: props.que })
  } catch (error) {
    loadProblem.value = errorText(
      error,
      __('The importer did not load.', null, CTX),
    )
    return
  }
  if (opciones.value?.puede && opciones.value.preguntas) loadDecisions()
}

// ── Abordo's catalog questions (only the owner answers them) ───────────────

function decisionChoices(decision) {
  return (decision.options || []).map((option, index) => ({
    value: String(index),
    label: option.label,
  }))
}

async function loadDecisions() {
  decisionsLoading.value = true
  problem.value = ''
  try {
    const pending = await loadCatalogPending()
    decisions.value = Array.isArray(pending) ? pending : []
    picked.value = decisionDraft(decisions.value)
  } catch {
    decisions.value = []
    problem.value = __(
      'Before the first products, the owner answers how the shop keeps them. Ask them to open this screen.',
      null,
      CTX,
    )
  } finally {
    decisionsLoading.value = false
  }
}

async function saveDecisions() {
  if (busy.value) return
  const answers = decisionAnswers(decisions.value, picked.value)
  if (!answers) {
    problem.value = __('Choose an answer for each question.', null, CTX)
    return
  }
  busy.value = 'respuestas'
  problem.value = ''
  try {
    await answerDecisions(answers)
    decisions.value = []
    await loadOpciones()
  } catch (error) {
    problem.value = errorText(
      error,
      __('Your answers were not saved. Try again.', null, CTX),
    )
  } finally {
    busy.value = ''
  }
}

// ── the file and its review ─────────────────────────────────────────────────

function onPick(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  send(file)
}
function onDrop(event) {
  dropping.value = false
  send(event.dataTransfer?.files?.[0])
}

async function send(file) {
  if (busy.value) return
  problem.value = fileProblem(file, opciones.value)
  if (problem.value) return
  busy.value = 'subir'
  try {
    archivo.value = await uploadSheet(file)
  } catch (error) {
    busy.value = ''
    problem.value = error.message
    return
  }
  choices.value = {}
  existentes.value = 'omitir'
  allErrors.value = false
  await check()
}

async function check() {
  const mine = ++ticket
  busy.value = 'revisar'
  problem.value = ''
  try {
    const answer = await importarApi('revisar', {
      archivo: archivo.value,
      que: props.que,
      columnas: Object.keys(choices.value).length
        ? JSON.stringify(choices.value)
        : '',
      existentes: existentes.value,
    })
    if (mine !== ticket) return
    review.value = answer
    choices.value = choicesOf(answer)
  } catch (error) {
    if (mine === ticket)
      problem.value = errorText(
        error,
        __('The sheet could not be read. Try again.', null, CTX),
      )
  } finally {
    if (mine === ticket) busy.value = ''
  }
}

function choose(campo, columna) {
  const next = chooseColumn(choices.value, campo, columna)
  if (JSON.stringify(next) === JSON.stringify(choices.value)) return
  choices.value = next
  check()
}
function useNameAsCode() {
  choices.value = nameAsCode(choices.value)
  check()
}
function dropNameCode() {
  choices.value = dropNameAsCode(choices.value)
  check()
}
function toggleUpdate(event) {
  existentes.value = event.target.checked ? 'actualizar' : 'omitir'
  check()
}

function startOver() {
  clearTimeout(timer)
  ticket += 1
  review.value = null
  estado.value = null
  archivo.value = ''
  choices.value = {}
  problem.value = ''
  busy.value = ''
  confirmUndo.value = false
  if (route.query.registro) {
    const query = { ...route.query }
    delete query.registro
    router.replace({ query })
  }
  loadOpciones()
}

// ── the import ──────────────────────────────────────────────────────────────

async function runImport() {
  if (busy.value || !review.value?.vista) return
  busy.value = 'importar'
  problem.value = ''
  try {
    const answer = await importarApi('importar', { vista: review.value.vista })
    show(answer)
    router.replace({ query: { ...route.query, registro: answer.registro } })
  } catch (error) {
    problem.value = errorText(
      error,
      __('The import did not start. Try again.', null, CTX),
    )
  } finally {
    busy.value = ''
  }
}

function show(answer) {
  estado.value = answer
  review.value = null
  clearTimeout(timer)
  if (!answer.terminada) timer = setTimeout(poll, POLL_MS)
}

async function poll() {
  const registro = estado.value?.registro
  if (!registro) return
  try {
    const answer = await importarApi('estado', { registro })
    if (estado.value?.registro === registro) show(answer)
  } catch {
    // A missed read: the next one says how it goes.
    timer = setTimeout(poll, POLL_MS * 2)
  }
}

async function openImport(registro) {
  problem.value = ''
  try {
    show(await importarApi('estado', { registro }))
    router.replace({ query: { ...route.query, registro } })
  } catch (error) {
    problem.value = errorText(
      error,
      __('That import could not be opened.', null, CTX),
    )
  }
}

async function undo() {
  if (busy.value) return
  busy.value = 'deshacer'
  problem.value = ''
  try {
    show(await importarApi('deshacer', { registro: estado.value.registro }))
    toast.success(__('Import undone', null, CTX))
  } catch (error) {
    problem.value = errorText(
      error,
      __('It could not be undone. Try again.', null, CTX),
    )
  } finally {
    busy.value = ''
    confirmUndo.value = false
  }
}

watch(
  () => props.que,
  () => startOver(),
)

onMounted(async () => {
  await loadOpciones()
  const registro = route.query.registro
  if (typeof registro === 'string' && registro && opciones.value?.puede)
    openImport(registro)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>
