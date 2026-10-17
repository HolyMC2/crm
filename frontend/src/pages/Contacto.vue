<template>
  <ContactosLayout :segments="segments" @select="goList">
    <!-- A phone gets one bar, as a contacts app: up to the list and the pencil.
         The name is the page's own headline, so the bar carries no title. -->
    <AppBar
      v-if="isPhone"
      :back="backTarget"
      :back-label="backLabel"
      title=""
      data-testid="contacto-appbar"
    >
      <template #actions>
        <button
          v-if="record?.capabilities?.write"
          type="button"
          class="flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
          :aria-label="
            record.source === 'address' ? 'Editar dirección' : 'Editar datos'
          "
          @click="editIdentity"
        >
          <span class="lucide-pencil size-6" aria-hidden="true" />
        </button>
      </template>
    </AppBar>
    <header v-else class="c-record-heading">
      <Button
        :label="backLabel"
        icon-left="arrow-left"
        variant="ghost"
        @click="back"
      /><span v-if="record" class="c-origin">{{
        sourceLabel(selectedSource?.doctype || record.doctype || record.source)
      }}</span
      ><!-- Phones edit from the top bar, as a contacts app does. -->
      <Button
        v-if="record?.capabilities?.write"
        class="c-heading-edit"
        :label="
          record.source === 'address' ? 'Editar dirección' : 'Editar datos'
        "
        icon="edit-2"
        variant="ghost"
        @click="editIdentity"
      />
    </header>
    <RecoveryMessage
      :error="error || bootError"
      action="ver y editar este registro"
      @retry="reload"
      @compare="reload"
      @reload="reload"
    />
    <div v-if="loading && !record" class="c-loading" role="status">
      Abriendo ficha…
    </div>
    <template v-if="record">
      <div class="c-record-title">
        <div
          class="c-avatar c-avatar-large"
          :class="{ company: record.kind === 'company' }"
        >
          <span
            v-if="record.source !== 'address' && recordInitials"
            class="text-xl font-semibold"
            >{{ recordInitials }}</span
          >
          <FeatherIcon
            v-else
            :name="record.source === 'address' ? 'map-pin' : 'user'"
            class="h-6 w-6"
          />
        </div>
        <div>
          <h1>{{ record.title || record.name }}</h1>
          <p>
            {{ identityTypeLabel(record)
            }}<span v-if="record.fields?.designation">
              · {{ record.fields.designation }}</span
            >
          </p>
        </div>
        <Button
          v-if="record.capabilities?.write && !isPhone"
          class="c-title-edit"
          :label="
            record.source === 'address' ? 'Editar dirección' : 'Editar datos'
          "
          icon-left="edit-2"
          @click="editIdentity"
        />
      </div>
      <!-- «Pregúntale a Muelle»: this record is the sheet's context, and what
           the customer owes is its one suggestion (SHELL-S2.3). -->
      <AssistantSuggestion
        screen="contacto"
        :record="record"
        :refs="refs"
        class="my-3"
      />
      <!-- On a phone the actions read like a phone's contact card: the
           follow-up spans the row, the quick actions sit under it as equal
           tonal pills with the label below (Google Contacts, HubSpot). -->
      <div class="c-record-actions">
        <Button
          v-if="canFollowup"
          class="c-followup-cta"
          :label="
            nextTask
              ? `Seguimiento ${dueLabel(nextTask, boot?.today).toLowerCase()}`
              : 'Añadir seguimiento'
          "
          variant="solid"
          icon-left="check-circle"
          @click="editFollowup(nextTask)"
        />
        <!-- Llamar · Mensaje · Correo · Agendar always sit in the same place;
             one without data greys out instead of disappearing. -->
        <component
          :is="phone ? 'a' : 'span'"
          :href="phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : undefined"
          class="c-action-link"
          :class="{ [GREYED]: !phone }"
          :aria-disabled="!phone || undefined"
          :title="phone ? undefined : 'Sin teléfono registrado'"
          data-action="call"
          ><span class="c-action-icon"
            ><FeatherIcon name="phone" class="h-4 w-4" /></span
          >Llamar</component
        >
        <button
          type="button"
          class="c-action-link"
          :class="{ [GREYED]: !canMessage }"
          :aria-disabled="!canMessage || undefined"
          :title="canMessage ? undefined : messageHint"
          data-action="message"
          @click="openComposer"
        >
          <span class="c-action-icon"
            ><FeatherIcon name="message-circle" class="h-4 w-4" /></span
          >Mensaje
        </button>
        <component
          :is="email ? 'a' : 'span'"
          :href="email ? `mailto:${encodeURIComponent(email)}` : undefined"
          class="c-action-link"
          :class="{ [GREYED]: !email }"
          :aria-disabled="!email || undefined"
          :title="email ? undefined : 'Sin correo registrado'"
          data-action="email"
          ><span class="c-action-icon"
            ><FeatherIcon name="mail" class="h-4 w-4" /></span
          >Correo</component
        >
        <button
          type="button"
          class="c-action-link"
          :class="{ [GREYED]: !scheduleOptions.length }"
          :aria-disabled="!scheduleOptions.length || undefined"
          :title="
            scheduleOptions.length ? undefined : 'La agenda no está disponible'
          "
          data-action="schedule"
          @click="openSchedule"
        >
          <span class="c-action-icon"
            ><FeatherIcon name="calendar" class="h-4 w-4" /></span
          >Agendar
        </button>
        <!-- A supplier's quote or invoice becomes a draft order or bill. -->
        <CapturarDocumentoButton
          v-if="record.source === 'supplier' && record.name"
          :targets="['Purchase Order', 'Purchase Invoice']"
          :supplier="record.name"
          :return-label="record.title || record.name"
        />
      </div>
      <div v-if="refs.length > 1" class="c-source-chooser">
        <FormControl
          :model-value="selectedKey"
          type="select"
          label="Registro que estás viendo"
          :options="
            refs.map((r) => ({
              value: r.doctype + ':' + r.name,
              label: `${r.title || r.name} (${sourceLabel(r.doctype)})`,
            }))
          "
          @update:model-value="selectSource"
        />
        <p>
          Esta persona o empresa tiene varios registros. Cada cambio se guarda
          en el registro que elijas.
        </p>
      </div>
      <p
        v-if="record.source === 'address' && addressTargets.length === 1"
        class="c-chooser-single"
      >
        Dirección de
        <strong>{{ addressTargets[0].title || addressTargets[0].name }}</strong>
      </p>
      <div v-else-if="record.source === 'address'" class="c-source-chooser">
        <FormControl
          v-model="addressTargetKey"
          type="select"
          label="Registro vinculado para editar o crear otra dirección"
          :options="[
            { value: '', label: 'Selecciona el registro de destino' },
            ...addressTargets.map((r) => ({
              value: `${r.doctype}:${r.name}`,
              label: `${r.title || r.name} (${sourceLabel(r.doctype)})`,
            })),
          ]"
        />
        <p>
          Selecciona el registro al que pertenece el cambio. Si el alcance
          compartido no puede revisarse, crea otra dirección para este destino.
        </p>
      </div>
      <RouterLink
        v-if="customers.length === 1"
        :to="contactoRoute(customers[0])"
        class="c-chooser-single flex min-h-11 items-center gap-2 rounded-lg hover:bg-surface-gray-2"
        data-testid="contacto-account-link"
      >
        <FeatherIcon name="briefcase" class="h-4 w-4" />
        <span v-if="sameName(customers[0])"
          >Cuenta de cliente con el mismo nombre</span
        ><span v-else
          >Cuenta de cliente
          <strong>{{ customers[0].title || customers[0].name }}</strong></span
        >
        <FeatherIcon name="chevron-right" class="ml-auto h-4 w-4" />
      </RouterLink>
      <div v-else-if="customers.length > 1" class="c-source-chooser">
        <FormControl
          v-model="selectedCustomer"
          type="select"
          label="Cuenta de cliente para las secciones comerciales"
          :options="[
            { value: '', label: 'Selecciona una cuenta' },
            ...customers.map((r) => ({
              value: r.name,
              label: r.title || r.name,
            })),
          ]"
        />
        <p>
          La persona representante y la cuenta que recibe facturas pueden ser
          distintas.
        </p>
      </div>
      <div v-if="panelContacts.length > 1" class="c-source-chooser">
        <FormControl
          v-model="selectedPanelContact"
          type="select"
          label="Persona para revisar el historial"
          :options="[
            { value: '', label: 'Selecciona la persona' },
            ...panelContacts.map((r) => ({
              value: r.name,
              label: r.title || r.name,
            })),
          ]"
        />
      </div>
      <div class="c-record-grid">
        <section
          class="c-record-section c-identity-section"
          :style="sectionStyle('identity')"
        >
          <div class="c-section-heading">
            <h2>Datos</h2>
            <Button
              v-if="record.capabilities?.write"
              label="Editar"
              variant="ghost"
              @click="editIdentity"
            />
          </div>
          <dl class="c-values">
            <template v-for="field in shownFields" :key="field.fieldname"
              ><dt>{{ field.label || field.fieldname }}</dt>
              <dd>
                {{ formatted(field, record.fields?.[field.fieldname]) }}
              </dd></template
            >
          </dl>
          <Button
            v-if="emptyFieldCount"
            class="c-inline-action"
            variant="ghost"
            :label="
              showEmptyFields
                ? 'Ocultar campos sin dato'
                : `Mostrar ${emptyFieldCount} ${emptyFieldCount === 1 ? 'campo' : 'campos'} sin dato`
            "
            @click="showEmptyFields = !showEmptyFields"
          />
          <div v-if="phoneRows.length" class="c-detail-channels">
            <h3>Teléfonos</h3>
            <a
              v-for="(row, index) in phoneRows"
              :key="index"
              :href="`tel:${String(row.phone).replace(/[^+\d]/g, '')}`"
              >{{ row.phone }}
              <small v-if="row.is_primary_phone || row.is_primary_mobile_no"
                >Principal</small
              ></a
            >
          </div>
          <div v-if="emailRows.length" class="c-detail-channels">
            <h3>Correos</h3>
            <a
              v-for="(row, index) in emailRows"
              :key="index"
              :href="`mailto:${encodeURIComponent(row.email_id)}`"
              >{{ row.email_id }}
              <small v-if="row.is_primary">Principal</small></a
            >
          </div>
          <p v-if="record.conflicts?.length" class="c-hint">
            Hay datos distintos entre los orígenes. Selecciona cada origen para
            revisar sus valores.
          </p>
          <template v-if="(record.tags || []).length">
            <div class="c-section-heading">
              <h3>Etiquetas</h3>
              <Button
                v-if="record.capabilities?.write"
                label="Editar etiquetas"
                variant="ghost"
                @click="tagsOpen = true"
              />
            </div>
            <div class="c-tags">
              <span v-for="tag in record.tags" :key="tag">{{ tag }}</span>
            </div>
          </template>
          <Button
            v-else-if="record.capabilities?.write"
            class="c-inline-action"
            label="Añadir etiqueta"
            icon-left="tag"
            variant="ghost"
            @click="tagsOpen = true"
          />
          <Button
            v-if="
              record.source === 'contact' &&
              (capabilities.sources?.customer?.create ||
                capabilities.sources?.supplier?.create)
            "
            class="c-inline-action"
            label="Hacer cliente o proveedor"
            icon-left="plus"
            variant="ghost"
            @click="roleOpen = true"
          />
          <RouterLink
            v-if="customerExtraLink"
            :to="customerExtraLink"
            class="c-action-link c-extra-account-link"
            data-act="open-account-extra"
            ><FeatherIcon name="list" class="h-4 w-4" />{{
              __('Extra details are on the client account · Open')
            }}</RouterLink
          >
        </section>
        <ExtraFieldsPanel
          v-if="showExtra"
          :style="sectionStyle('extra')"
          :record="record"
          :capabilities="capabilities"
          @saved="applySaved"
          @defined="reload({ freshBoot: true })"
          @reload="reload({ freshBoot: true })"
          @open-section="openSection"
          @open-fields="openFieldSettings"
        />
        <section
          class="c-record-section c-followup-section"
          :style="sectionStyle('followups')"
        >
          <div class="c-section-heading">
            <h2>Seguimientos</h2>
            <Button
              v-if="canFollowup"
              label="Añadir"
              icon-left="plus"
              variant="ghost"
              @click="editFollowup()"
            />
          </div>
          <RecoveryMessage
            :error="taskError"
            action="editar mi seguimiento"
            @retry="refreshFollowups"
            @compare="refreshFollowups"
            @reload="refreshFollowups"
          />
          <article
            v-for="task in followups"
            :key="task.name"
            class="c-followup"
          >
            <span
              class="c-due"
              :class="{ overdue: dueLabel(task, boot?.today) === 'Vencido' }"
              >{{ dueLabel(task, boot?.today) }}</span
            >
            <h3>{{ plainText(task.description) }}</h3>
            <p>
              {{ formatDay(task.date || task.due_date) || 'Sin fecha' }} ·
              {{ task.allocated_to || 'Mi seguimiento' }}
            </p>
            <div v-if="task.status === 'Open'" class="c-actions">
              <Button label="Reprogramar" @click="editFollowup(task)" /><Button
                label="Hecho"
                @click="complete(task)"
              /><Button
                label="Hecho y siguiente"
                @click="complete(task, true)"
              />
            </div>
          </article>
          <p v-if="!followups.length" class="c-muted">
            No tienes seguimientos pendientes para este registro.
          </p>
          <Button
            v-if="taskMore"
            label="Cargar más seguimientos"
            @click="loadTasks(true)"
          />
          <!-- Done and cancelled work folds away under the open list (Tasks). -->
          <div v-if="doneTasks.length || doneMore" class="mt-2">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-2 text-sm font-medium text-ink-gray-7"
              :aria-expanded="doneOpen"
              data-testid="followups-done-toggle"
              @click="doneOpen = !doneOpen"
            >
              <FeatherIcon
                :name="doneOpen ? 'chevron-down' : 'chevron-right'"
                class="h-4 w-4"
              />
              Completados ({{ doneTasks.length }}{{ doneMore ? '+' : '' }})
            </button>
            <template v-if="doneOpen">
              <article
                v-for="task in doneTasks"
                :key="task.name"
                class="c-followup text-ink-gray-6"
              >
                <h3>{{ plainText(task.description) }}</h3>
                <p>
                  {{ task.status === 'Cancelled' ? 'Cancelado' : 'Completado' }}
                  ·
                  {{ formatDay(task.date || task.due_date) || 'Sin fecha' }}
                </p>
                <Button
                  v-if="task.status === 'Cancelled'"
                  label="Reabrir"
                  variant="ghost"
                  @click="reopen(task)"
                />
              </article>
            </template>
          </div>
        </section>
        <section
          class="c-record-section c-notes-section"
          :style="sectionStyle('notes')"
        >
          <div class="c-section-heading">
            <h2>Notas</h2>
            <span v-if="refs.length > 1" class="c-muted">{{
              sourceLabel(selectedSource?.doctype || record.doctype)
            }}</span>
          </div>
          <RecoveryMessage
            :error="noteError"
            action="añadir una nota al origen seleccionado"
            @retry="saveNote"
          />
          <Button
            v-if="capabilities.notes?.create"
            class="c-inline-action"
            label="Añadir nota"
            icon-left="plus"
            variant="ghost"
            data-testid="contacto-add-note"
            @click="noteOpen = true"
          />
          <BottomSheet
            v-model:open="noteOpen"
            title="Añadir nota"
            :dismissible="!noteDraft.text.trim()"
          >
            <FormControl
              v-model="noteDraft.text"
              type="textarea"
              label="Nota"
              placeholder="Contexto útil para el próximo contacto"
            />
            <template #actions>
              <Button label="Cancelar" @click="noteOpen = false" />
              <Button
                variant="solid"
                label="Guardar nota"
                :disabled="!noteDraft.text.trim()"
                :loading="noteSaving"
                @click="saveNote"
              />
            </template>
          </BottomSheet>
          <article
            v-for="note in record.notes?.rows || []"
            :key="note.name"
            class="c-note"
          >
            <p>{{ plainText(note.content || note.comment || note.text) }}</p>
            <small
              >{{ note.comment_by || note.owner }} ·
              {{ formatMoment(note.creation) }}</small
            >
          </article>
          <p v-if="!(record.notes?.rows || []).length" class="c-muted">
            {{
              record.notes?.available === false
                ? 'No tienes permiso para consultar las notas de este registro.'
                : 'Aún no hay notas en este registro.'
            }}
          </p>
        </section>
        <section
          class="c-record-section c-address-section"
          :style="sectionStyle('addresses')"
        >
          <div class="c-section-heading">
            <h2>Direcciones</h2>
            <Button
              v-if="capabilities.sources?.address?.create"
              label="Añadir"
              icon-left="plus"
              variant="ghost"
              @click="editAddress()"
            />
          </div>
          <article
            v-for="address in record.addresses || []"
            :key="address.name"
            class="c-address"
          >
            <h3>{{ address.fields?.address_title || address.name }}</h3>
            <p>
              {{ address.fields?.address_line1
              }}<br v-if="address.fields?.address_line2" />{{
                address.fields?.address_line2
              }}
            </p>
            <p>
              {{
                [
                  address.fields?.city,
                  address.fields?.state,
                  address.fields?.pincode,
                  address.fields?.country,
                ]
                  .filter(Boolean)
                  .join(', ')
              }}
            </p>
            <span v-if="address.shared" class="c-type">Compartida</span
            ><Button
              v-if="address.capabilities?.write"
              label="Editar dirección"
              variant="ghost"
              @click="editAddress(address)"
            />
          </article>
          <div v-if="record.addresses_guard" class="c-recovery" role="status">
            <p>{{ record.addresses_guard.message }}</p>
            <div class="c-actions">
              <Button
                v-for="action in record.addresses_guard.actions || []"
                :key="action.kind + action.label"
                :label="action.label"
                @click="runAddressGuard(action)"
              />
            </div>
            <p v-if="addressGuardNote">{{ addressGuardNote }}</p>
          </div>
          <p v-else-if="!(record.addresses || []).length" class="c-muted">
            No hay direcciones vinculadas.
          </p>
        </section>
        <section
          class="c-record-section c-relations-section"
          :style="sectionStyle('relations')"
        >
          <div class="c-section-heading">
            <h2>Relaciones</h2>
            <Button
              v-if="record.capabilities?.write"
              label="Vincular"
              icon-left="link"
              variant="ghost"
              @click="relationOpen = true"
            />
          </div>
          <article
            v-for="relation in record.relations || []"
            :key="
              relation.name ||
              `${relation.kind}:${relation.left?.name}:${relation.right?.name}`
            "
            class="c-relation"
          >
            <span class="c-type">{{
              relationLabels[relation.kind] || relation.kind
            }}</span>
            <!-- A link reads as the other end, one row you can open; both
                 names only when neither end is this record. -->
            <button
              v-if="otherEnd(relation)"
              class="c-link flex min-h-11 w-full items-center gap-2 text-left"
              @click="openRelated(otherEnd(relation))"
            >
              <span class="min-w-0 flex-1"
                ><small>{{ sourceLabel(otherEnd(relation).doctype) }}</small
                >{{ otherEnd(relation).title || otherEnd(relation).name }}</span
              ><FeatherIcon name="chevron-right" class="h-4 w-4 flex-none" />
            </button>
            <div v-else class="c-relation-endpoints">
              <button class="c-link" @click="openRelated(relation.left)">
                <small>{{ sourceLabel(relation.left?.doctype) }}</small
                >{{ relation.left?.title || relation.left?.name }}</button
              ><button class="c-link" @click="openRelated(relation.right)">
                <small>{{ sourceLabel(relation.right?.doctype) }}</small
                >{{ relation.right?.title || relation.right?.name }}
              </button>
            </div>
            <Button
              v-if="record.capabilities?.write && !relation.native"
              class="c-inline-action"
              label="Desvincular"
              variant="ghost"
              @click="unlinkTarget = relation"
            />
          </article>
          <p v-if="!(record.relations || []).length" class="c-muted">
            Sin relaciones confirmadas. Compartir nombre o teléfono no une
            registros.
          </p>
        </section>
      </div>
      <ArchivosRegistroPanel
        v-if="archivosDoctype && nativeRoute.name"
        class="c-archivos-panel"
        :doctype="archivosDoctype"
        :name="nativeRoute.name"
        :return-to="'/crm' + route.fullPath"
        :return-label="record.title || record.name"
      />
      <section
        v-if="contactName && contactTabs.length"
        class="c-provider-section"
      >
        <Segmented
          v-if="tabOptions.length <= 4"
          v-model="activeTab"
          :options="tabOptions"
          label="Secciones del registro"
        />
        <FilterChips
          v-else
          v-model="activeTab"
          :chips="tabOptions"
          :deselectable="false"
          label="Secciones del registro"
        />
        <ContactTabPanel
          v-if="activePanel"
          :key="contactName + ':' + activePanel.name + ':' + selectedCustomer"
          :component="activePanel.component"
          :docname="contactName"
          :selected-customer="selectedCustomer"
        />
      </section>
      <RecoveryMessage
        v-if="sections.error"
        :error="sections.error"
        action="ver las secciones opcionales"
        @retry="sections.reload"
      />
      <div
        v-if="boot?.optional_sections?.contact360?.available === false"
        class="c-provider-recovery"
      >
        <p>
          {{
            boot.optional_sections.contact360.reason ||
            'Las secciones comerciales requieren Doco Marketing.'
          }}
          Los datos, notas y seguimientos siguen disponibles.
        </p>
        <Button
          label="Copiar solicitud de configuración"
          variant="ghost"
          @click="copyConfiguration"
        />
        <p v-if="configurationCopied" role="status">
          Solicitud copiada para el responsable de la tienda.
        </p>
      </div>
      <p
        v-else-if="
          !contactName && (record.kind === 'company' || refs.length > 0)
        "
        class="c-provider-recovery"
      >
        Las secciones del historial necesitan una persona vinculada autorizada.
        Revisa Relaciones para abrir su ficha; los datos de esta cuenta siguen
        disponibles aquí.
      </p>
      <IdentityEditor
        v-if="identityOpen"
        v-model="identityOpen"
        :source="selectedSource || record"
        @saved="reload"
      />
      <IdentityEditor
        v-if="roleOpen"
        v-model="roleOpen"
        :defaults="{
          source: 'contact',
          fields: record.fields,
          phones: phoneRows,
          emails: emailRows,
          party_source: capabilities.sources?.customer?.create
            ? 'customer'
            : 'supplier',
          candidate_decision: 'link_role',
          existing_key: `contact:${record.name}`,
        }"
        @saved="reload"
      />
      <TagEditor
        v-if="tagsOpen"
        v-model="tagsOpen"
        :source="record"
        :tags="record.tags || []"
        @saved="reload"
      />
      <AddressEditor
        v-if="addressOpen"
        v-model="addressOpen"
        :source="addressSource || selectedSource || record"
        :address="selectedAddress"
        @saved="reload"
      />
      <FollowupEditor
        v-if="followupOpen"
        v-model="followupOpen"
        :source="selectedSource || record"
        :followup="selectedFollowup"
        @saved="refreshFollowups"
      />
      <RelationEditor
        v-if="relationOpen"
        v-model="relationOpen"
        :source="selectedSource || record"
        :kind="record.kind"
        @saved="reload"
      />
      <Dialog
        :model-value="!!unlinkTarget"
        :options="{ title: 'Revisar desvinculación' }"
        @update:model-value="
          (v) => {
            if (!v) unlinkTarget = null
          }
        "
        ><template #body-content
          ><div class="c-editor">
            <p>
              {{
                unlinkTarget?.kind?.startsWith('same_')
                  ? 'Los registros dejarán de agruparse por este vínculo. Otras relaciones confirmadas pueden mantener la agrupación.'
                  : 'El vínculo dejará de aparecer entre los dos registros.'
              }}
              Los registros nativos y sus datos se conservan.
            </p>
            <RecoveryMessage
              :error="relationError"
              @retry="unlink"
              @compare="reload"
              @reload="reload"
            /><Button
              label="Confirmar desvinculación"
              @click="unlink"
            /></div></template
      ></Dialog>
      <ChannelComposer
        v-if="composerOpen && canMessage"
        v-model="composerOpen"
        doctype="Contact"
        :docname="contactName"
        :phone="phone"
        :contact-name="record.title || record.name"
      />
      <BottomSheet v-model:open="scheduleOpen" title="Agendar" flush>
        <ListRow
          v-for="option in scheduleOptions"
          :key="option.key"
          :icon="option.icon"
          :title="option.label"
          :subtitle="option.hint"
          :to="option.to"
          @click="scheduleOpen = false"
        />
      </BottomSheet>
      <div v-if="doneMessage" class="c-success" role="status">
        {{ doneMessage
        }}<Button label="Volver a la lista" variant="ghost" @click="back" />
      </div>
    </template>
  </ContactosLayout>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  AppBar,
  BottomSheet,
  FilterChips,
  ListRow,
  Segmented,
} from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { initials } from '@/utils/display'
import CapturarDocumentoButton from '@/components/captura/CapturarDocumentoButton.vue'
import ContactosLayout from '@/components/contactos/ContactosLayout.vue'
import IdentityEditor from '@/components/contactos/IdentityEditor.vue'
import AddressEditor from '@/components/contactos/AddressEditor.vue'
import FollowupEditor from '@/components/contactos/FollowupEditor.vue'
import RelationEditor from '@/components/contactos/RelationEditor.vue'
import TagEditor from '@/components/contactos/TagEditor.vue'
import RecoveryMessage from '@/components/contactos/RecoveryMessage.vue'
import AssistantSuggestion from '@/components/assistant/AssistantSuggestion.vue'
import ExtraFieldsPanel from '@/components/contactos/ExtraFieldsPanel.vue'
import ContactTabPanel from '@/components/doco/contact/ContactTabPanel.vue'
import { useContact360Tabs } from '@/components/doco/contact/useContact360Tabs'
import { ArchivosRegistroPanel } from '@/components/archivos'
import { shellBoot } from '@/composables/muelleShell'
import { agendaCreateRoute } from '@/composables/useAgenda'
import { safeReturnPath } from '@/utils/ventasDocs'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import {
  contactosApi,
  readRecord,
  useContactosBootstrap,
  useContactosDraft,
} from '@/composables/useContactos'
import {
  contactoRoute,
  dueLabel,
  accessLost,
  formatDay,
  formatMoment,
  mergeTaskPage,
  optionLabel,
  nextFollowup,
  sourceRef,
  sourceLabel,
  identityTypeLabel,
  SOURCE_TYPES,
} from '@/utils/contactos'
import {
  accountExtraRoute,
  coreFields,
  extraFields,
  sectionPosition,
} from '@/utils/extraFields'
const ChannelComposer = defineAsyncComponent(
  () => import('@/components/doco/channel/ChannelComposer.vue'),
)
const route = useRoute(),
  router = useRouter()
const record = ref(null),
  error = ref(null),
  loading = ref(false),
  selectedKey = ref(''),
  selectedCustomer = ref(''),
  identityOpen = ref(false),
  addressOpen = ref(false),
  followupOpen = ref(false),
  relationOpen = ref(false),
  selectedAddress = ref(null),
  selectedFollowup = ref(null),
  unlinkTarget = ref(null),
  relationError = ref(null),
  doneMessage = ref('')
const selectedPanelContact = ref(''),
  tagsOpen = ref(false),
  roleOpen = ref(false)
const configurationCopied = ref(false)
// An action without data stays in place, greyed (Google Contacts).
const GREYED = 'opacity-40 cursor-not-allowed'
const composerOpen = ref(false),
  scheduleOpen = ref(false),
  noteOpen = ref(false)
const recordInitials = computed(() =>
  initials(record.value?.title || record.value?.name || ''),
)
const addressTargetKey = ref(''),
  addressSource = ref(null)
const {
  boot,
  error: bootError,
  capabilities,
  reload: reloadBoot,
  ensure: ensureBoot,
} = useContactosBootstrap()
const { contactTabs, sections } = useContact360Tabs()
// `?tab=` lands a hand-off return (POS «Vender en caja») on the tab it left from.
const activeTab = ref(String(route.query.tab || ''))
watch(contactTabs, (tabs) => {
  if (!tabs.some((t) => t.name === activeTab.value))
    activeTab.value = tabs[0]?.name || ''
})
const tabOptions = computed(() =>
  contactTabs.value.map((t) => ({ value: t.name, label: t.label })),
)
const activePanel = computed(() =>
  contactTabs.value.find((t) => t.name === activeTab.value),
)
const segments = computed(
  () => boot.value?.segments?.rows || boot.value?.segments || [],
)
const refs = computed(() => record.value?.refs || [])
// «Agendar cita»: Agenda's staff booking with this contact, back here afterwards.
const citaRoute = computed(() => ({
  path: '/agenda',
  query: {
    new_cita: '1',
    contact: record.value?.name,
    contact_label: record.value?.title || record.value?.name,
    return_to: `${window.location.pathname}${window.location.search}`,
    return_label: record.value?.title || record.value?.name,
  },
}))
const selectedSource = computed(
  () =>
    refs.value.find((r) => `${r.doctype}:${r.name}` === selectedKey.value) ||
    record.value,
)
const relatedRefs = computed(() => [
  ...refs.value,
  ...(record.value?.relations || [])
    .flatMap((r) => [r.left, r.right])
    .filter(Boolean),
])
const uniqueRefs = (doctype) => [
  ...new Map(
    relatedRefs.value
      .filter((r) => r.doctype === doctype)
      .map((r) => [r.name, r]),
  ).values(),
]
const customers = computed(() => uniqueRefs('Customer'))
// A customer account named like the record needs no second copy of the name.
const sameName = (ref) =>
  String(ref?.title || ref?.name || '')
    .trim()
    .toLowerCase() ===
  String(record.value?.title || record.value?.name || '')
    .trim()
    .toLowerCase()
const panelContacts = computed(() => uniqueRefs('Contact'))
const addressTargets = computed(() => [
  ...new Map(
    (record.value?.relations || [])
      .filter((r) => r.kind === 'address_for')
      .flatMap((r) => [r.left, r.right])
      .filter((r) => r && r.doctype !== 'Address')
      .map((r) => [`${r.doctype}:${r.name}`, r]),
  ).values(),
])
// A single possible account, person or address owner needs no choice: select it
// and show it as text, so the record opens ready to use.
watch(
  [customers, panelContacts, addressTargets],
  () => {
    if (!selectedCustomer.value && customers.value.length === 1)
      selectedCustomer.value = customers.value[0].name
    if (
      !selectedPanelContact.value &&
      record.value?.source !== 'contact' &&
      panelContacts.value.length === 1
    )
      selectedPanelContact.value = panelContacts.value[0].name
    if (!addressTargetKey.value && addressTargets.value.length === 1) {
      const [target] = addressTargets.value
      addressTargetKey.value = `${target.doctype}:${target.name}`
    }
  },
  { immediate: true },
)
const contactName = computed(() =>
  selectedPanelContact.value &&
  panelContacts.value.some((r) => r.name === selectedPanelContact.value)
    ? selectedPanelContact.value
    : record.value?.source === 'contact'
      ? record.value.name
      : '',
)
// «Datos» shows the record's own fields; the shop's extra ones live in «Más datos».
const displayFields = computed(() =>
  coreFields(record.value?.editor_meta?.fields).filter(
    (f) =>
      ![
        'Table',
        'Table MultiSelect',
        'Section Break',
        'Column Break',
        'Tab Break',
        'HTML',
        'Button',
        'Image',
      ].includes(f.fieldtype) &&
      record.value?.fields?.[f.fieldname] !== undefined,
  ),
)
const phoneRows = computed(() => record.value?.fields?.phone_nos || []),
  emailRows = computed(() => record.value?.fields?.email_ids || [])
const phone = computed(
  () =>
    record.value?.fields?.mobile_no ||
    record.value?.fields?.phone ||
    phoneRows.value[0]?.phone ||
    '',
)
const email = computed(
  () => record.value?.fields?.email_id || emailRows.value[0]?.email_id || '',
)
const followups = ref([]),
  openTasks = ref([]),
  taskStatus = ref('Open'),
  taskError = ref(null),
  taskMore = ref(false),
  taskCursor = ref(null)
const nextTask = computed(() => nextFollowup(openTasks.value))
// Done and cancelled follow-ups, folded under the open list.
const doneTasks = ref([]),
  doneMore = ref(false),
  doneOpen = ref(false)
let doneGeneration = 0
async function loadDone() {
  const own = ++doneGeneration
  const source = sourceRef(selectedSource.value || nativeRoute.value)
  try {
    const pages = await Promise.all(
      ['Closed', 'Cancelled'].map((status) =>
        contactosApi('list_followups', { ...source, status }),
      ),
    )
    if (own !== doneGeneration) return
    const rows = pages.flatMap((page) =>
      page.available === false ? [] : page.rows || [],
    )
    doneTasks.value = rows.sort((a, b) =>
      String(b.modified || '').localeCompare(String(a.modified || '')),
    )
    doneMore.value = pages.some((page) => page.has_more)
  } catch {
    // The open list is what the worker acts on; a failed history stays folded.
    if (own === doneGeneration) doneTasks.value = []
  }
}
const canFollowup = computed(() => capabilities.value.followups?.create)
const noteError = ref(null),
  noteSaving = ref(false)
const nativeRoute = computed(() => ({
  source: String(route.params.source || route.query.source || 'contact'),
  name: String(
    route.params.name || route.query.name || route.params.contactId || '',
  ),
}))
// «Agendar»: a new Agenda event linked to this record, the contact invited, back here after.
const agendaLink = computed(() => {
  const doctype = SOURCE_TYPES[nativeRoute.value.source]
  if (!record.value || !doctype || !moduleEnabled(shellBoot.value, 'agenda'))
    return ''
  const label = record.value.title || record.value.name
  const here = `/crm/contactos/${encodeURIComponent(nativeRoute.value.source)}/${encodeURIComponent(nativeRoute.value.name)}`
  return agendaCreateRoute({
    reference: { doctype, name: nativeRoute.value.name, label },
    attendee:
      doctype === 'Contact'
        ? { doctype: 'Contact', name: nativeRoute.value.name, label }
        : null,
    returnTo: here,
    returnLabel: label,
  })
})
// Files on this record come from Archivos when the worker has it; unsupported
// doctypes still list their native attachments there.
const archivosDoctype = computed(() =>
  moduleEnabled(shellBoot.value, 'archivos')
    ? SOURCE_TYPES[nativeRoute.value.source] || ''
    : '',
)
const {
  draft: noteDraft,
  id: noteId,
  clear: clearNote,
} = useContactosDraft(
  () => `note:${nativeRoute.value.source}:${nativeRoute.value.name}`,
  { text: '' },
)
const { id } = useContactosDraft(
  () => `record-actions:${nativeRoute.value.source}:${nativeRoute.value.name}`,
)
// «Mensaje»: the authorised channels for this person (the composer asks
// which one and the worker confirms the send).
const canMessage = computed(() => !!(phone.value && contactName.value))
const messageHint = computed(() =>
  phone.value
    ? 'Los mensajes se envían desde la ficha de la persona'
    : 'Sin teléfono registrado',
)
function openComposer() {
  if (canMessage.value) composerOpen.value = true
}
// «Agendar»: one action; a sheet offers the appointment or the calendar event.
const scheduleOptions = computed(() =>
  [
    record.value?.source === 'contact' && {
      key: 'cita',
      icon: 'lucide-clock',
      label: 'Cita',
      hint: 'Reservar un horario con esta persona',
      to: citaRoute.value,
    },
    agendaLink.value && {
      key: 'evento',
      icon: 'lucide-calendar',
      label: 'Evento en la agenda',
      hint: 'Una llamada, visita o recordatorio',
      to: agendaLink.value,
    },
  ].filter(Boolean),
)
function openSchedule() {
  if (scheduleOptions.value.length === 1)
    router.push(scheduleOptions.value[0].to)
  else if (scheduleOptions.value.length) scheduleOpen.value = true
}
// The end of a relation that is not the record on screen (null when neither is).
function otherEnd(relation) {
  const self = (end) =>
    end?.name === record.value?.name &&
    (!end?.doctype ||
      !record.value?.doctype ||
      end.doctype === record.value.doctype)
  if (self(relation.left)) return relation.right
  if (self(relation.right)) return relation.left
  return null
}
const relationLabels = {
  same_person: 'Misma persona',
  same_company: 'Misma empresa',
  represents: 'Representa a',
  payer_for: 'Paga por',
  native_role: 'Cuenta vinculada',
  primary_contact: 'Contacto principal',
  representative: 'Representante',
  crm_deal: 'Trato',
}
// Sections a saved order does not list yet («Más datos» for older orders) go last.
const sectionStyle = (key) => ({
  order: sectionPosition(boot.value?.configuration?.section_order, key),
})
// «Más datos» on clientes: whenever the shop has extra fields, and for whoever
// can add one (the owner) or ask for one (a manager).
const showExtra = computed(
  () =>
    record.value?.source === 'customer' &&
    (extraFields(record.value?.editor_meta?.fields).length > 0 ||
      !!capabilities.value.fields?.define ||
      !!capabilities.value.manager),
)
// A person whose client account holds the extra details: open it, and come back.
const customerExtraLink = computed(() =>
  accountExtraRoute(
    record.value,
    selectedCustomer.value,
    (boot.value?.extra_fields || []).length,
  ),
)
/** A save from «Más datos» updates the record in place (no reload, same scroll). */
function applySaved(result) {
  if (!result?.name || result.name !== record.value?.name) return reload()
  record.value = result
  openTasks.value = result.followups?.rows || openTasks.value
}
function openSection(key) {
  if (key === 'identity' && record.value?.capabilities?.write) editIdentity()
}
function openFieldSettings() {
  router.push({ name: 'Contactos', query: { customize: 'fields' } })
}
let generation = 0,
  taskGeneration = 0
async function reload({ freshBoot = false } = {}) {
  const own = ++generation
  loading.value = true
  error.value = null
  try {
    // The record does not depend on the boot: both are asked for at once.
    const [result] = await Promise.all([
      readRecord(nativeRoute.value, { fresh: freshBoot }),
      freshBoot ? reloadBoot() : ensureBoot(),
    ])
    if (own !== generation) return
    record.value = result
    openTasks.value = result.followups?.rows || []
    selectedKey.value = `${result.doctype || result.refs?.find((r) => r.name === result.name)?.doctype}:${result.name}`
    if (
      selectedCustomer.value &&
      !customers.value.some((c) => c.name === selectedCustomer.value)
    )
      selectedCustomer.value = ''
    // get_record already carries this record's open follow-ups page.
    if (taskStatus.value === 'Open' && result.followups) {
      taskGeneration++
      try {
        applyTasks(result.followups, false)
      } catch (e) {
        taskFailed(e)
      }
    } else await loadTasks()
    loadDone()
  } catch (e) {
    if (own === generation) {
      error.value = e
      record.value = null
      followups.value = []
    }
  } finally {
    if (own === generation) loading.value = false
  }
}
async function selectSource(value) {
  const ref = refs.value.find((r) => `${r.doctype}:${r.name}` === value)
  if (!ref) return
  router.push(contactoRoute(ref))
}
async function loadTasks(more = false) {
  const own = ++taskGeneration
  try {
    const result = await contactosApi('list_followups', {
      ...sourceRef(selectedSource.value || nativeRoute.value),
      status: taskStatus.value,
      cursor: more ? taskCursor.value : null,
    })
    if (own !== taskGeneration) return
    applyTasks(result, more)
  } catch (e) {
    if (own === taskGeneration) taskFailed(e)
  }
}
function applyTasks(result, more) {
  if (result.available === false)
    throw Object.assign(
      new Error(
        result.reason ||
          'No tienes permiso para leer tus seguimientos. Pide acceso al responsable.',
      ),
      { unavailable: true },
    )
  followups.value = mergeTaskPage(followups.value, result.rows || [], more)
  taskCursor.value = result.next_cursor
  taskMore.value = !!result.has_more
  taskError.value = null
  if (taskStatus.value === 'Open') openTasks.value = followups.value
}
function taskFailed(e) {
  taskError.value = e
  followups.value = []
  // Lost access must not leave a protected task on the next-action card.
  if (accessLost(e)) openTasks.value = []
}
// After a follow-up is created, reprogrammed or completed the current list and
// the next-action card are replaced, never appended (an event payload is not a
// «load more» request).
async function refreshFollowups() {
  loadDone()
  await loadTasks(false)
  if (taskStatus.value === 'Open') return
  try {
    const open = await contactosApi('list_followups', {
      ...sourceRef(selectedSource.value || nativeRoute.value),
      status: 'Open',
    })
    openTasks.value = open.available === false ? [] : open.rows || []
  } catch (e) {
    taskError.value = e
    if (accessLost(e)) openTasks.value = []
  }
}

function editFollowup(task = null) {
  selectedFollowup.value = task
  followupOpen.value = true
}
const addressGuardNote = ref('')
// Protected address links: the server's guard offers a new address (when
// native create is allowed) or an access request; nothing is left blocked.
async function runAddressGuard(action) {
  if (action.kind === 'call' && action.target?.endsWith('.get_editor_meta'))
    return editAddress()
  if (action.kind === 'retry') return reload({ freshBoot: true })
  const text = `Solicito acceso para consultar las direcciones vinculadas de ${record.value?.title || record.value?.name} en Contactos.`
  try {
    await navigator.clipboard.writeText(text)
    addressGuardNote.value =
      'Solicitud copiada. Compártela con tu encargado y después recarga la ficha.'
  } catch {
    addressGuardNote.value = text
  }
}
function editAddress(address = null) {
  addressSource.value = null
  selectedAddress.value = address
  addressOpen.value = true
}
async function editIdentity() {
  if (record.value.source !== 'address') {
    identityOpen.value = true
    return
  }
  if (!addressTargets.value.length && record.value.address_info?.shared_safe) {
    identityOpen.value = true
    return
  }
  const target = addressTargets.value.find(
    (r) => `${r.doctype}:${r.name}` === addressTargetKey.value,
  )
  if (!target) {
    error.value = new Error(
      'Selecciona el registro vinculado al que quieres aplicar esta dirección.',
    )
    return
  }
  try {
    addressSource.value = await contactosApi('get_record', sourceRef(target))
    selectedAddress.value = record.value.address_info || {
      ...record.value,
      shared_safe: false,
      impact_editable: false,
      visible_links: addressTargets.value,
    }
    addressOpen.value = true
  } catch (e) {
    error.value = e
  }
}
async function complete(task, scheduleNext = false) {
  try {
    const payload = {
      name: task.name,
      modified: task.modified,
      status: 'Closed',
    }
    await contactosApi('update_followup', { payload, request_id: id(payload) })
    await refreshFollowups()
    doneMessage.value = 'Seguimiento completado.'
    if (scheduleNext) editFollowup(nextTask.value)
  } catch (e) {
    taskError.value = e
  }
}
async function reopen(task) {
  try {
    const payload = { name: task.name, modified: task.modified, status: 'Open' }
    await contactosApi('update_followup', { payload, request_id: id(payload) })
    taskStatus.value = 'Open'
    await refreshFollowups()
    doneMessage.value = 'Seguimiento reabierto.'
  } catch (e) {
    taskError.value = e
  }
}
async function saveNote() {
  noteSaving.value = true
  try {
    const payload = {
      ...sourceRef(selectedSource.value || record.value),
      content: noteDraft.value.text,
    }
    await contactosApi('add_note', { payload, request_id: noteId(payload) })
    clearNote()
    noteDraft.value.text = ''
    noteOpen.value = false
    await reload()
    noteError.value = null
  } catch (e) {
    noteError.value = e
  } finally {
    noteSaving.value = false
  }
}
async function unlink() {
  try {
    const payload = {
      name: unlinkTarget.value.name,
      modified: unlinkTarget.value.modified,
      confirmed: true,
    }
    await contactosApi('unlink_relation', { payload, request_id: id(payload) })
    unlinkTarget.value = null
    await reload()
  } catch (e) {
    relationError.value = e
  }
}
function openRelated(ref) {
  if (!ref) return
  if (ref.doctype === 'CRM Deal') {
    router.push({
      name: 'Deal',
      params: { dealId: ref.name },
      query: {
        return_to: `/crm/contactos/${encodeURIComponent(nativeRoute.value.source)}/${encodeURIComponent(nativeRoute.value.name)}`,
      },
    })
    return
  }
  router.push(contactoRoute(ref))
}
function goList(segment) {
  router.push({ name: 'Contactos', query: { segment } })
}
// The record's one back: to the caller's return_to when it sent one.
const returnPath = computed(() =>
  safeReturnPath(String(route.query.return_to || '')),
)
const backLabel = computed(() =>
  returnPath.value
    ? `Volver a ${String(route.query.return_label || '').slice(0, 40) || 'la página anterior'}`
    : 'Volver a la lista',
)
const backTarget = computed(() =>
  returnPath.value
    ? returnPath.value.replace(/^\/crm/, '') || '/'
    : { name: 'Contactos' },
)
function back() {
  if (returnPath.value)
    router.push(returnPath.value.replace(/^\/crm/, '') || '/')
  else router.push({ name: 'Contactos' })
}
function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, '')
}
async function copyConfiguration() {
  try {
    await navigator.clipboard.writeText(
      'Solicito revisar la instalación y permisos de Doco Marketing para las secciones comerciales de Contactos. No necesito cambiar los permisos de los registros nativos.',
    )
    configurationCopied.value = true
  } catch (e) {
    error.value = new Error(
      'No pudimos copiar la solicitud. Pide al responsable revisar la instalación de Doco Marketing para Contactos.',
    )
  }
}
// Like a contacts app, «Datos» lists what is known; empty fields wait behind
// one toggle (editing still offers every field).
const showEmptyFields = ref(false)
const hasValue = (field) => {
  const value = record.value?.fields?.[field.fieldname]
  if (field.fieldtype === 'Check') return !!value
  return !(value === '' || value == null)
}
// Datos does not repeat the headline or the channel rows: name parts already
// in the name, and a phone or e-mail listed under Teléfonos / Correos.
const NAME_PARTS = ['first_name', 'middle_name', 'last_name', 'full_name']
const CHANNEL_FIELDS = ['mobile_no', 'phone', 'email_id']
const norm = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\d@.+]/gu, '')
const repeated = (field) => {
  const value = norm(record.value?.fields?.[field.fieldname])
  if (!value) return false
  if (NAME_PARTS.includes(field.fieldname))
    return norm(record.value?.title || record.value?.name).includes(value)
  if (CHANNEL_FIELDS.includes(field.fieldname))
    return [
      ...phoneRows.value.map((r) => r.phone),
      ...emailRows.value.map((r) => r.email_id),
    ].some((v) => norm(v) === value)
  return false
}
const shownFields = computed(() =>
  (showEmptyFields.value
    ? displayFields.value
    : displayFields.value.filter(hasValue)
  ).filter((field) => !repeated(field)),
)
const emptyFieldCount = computed(
  () => displayFields.value.filter((f) => !hasValue(f)).length,
)
function formatted(field, value) {
  if (field.fieldtype === 'Check') return value ? 'Sí' : 'No'
  if (value && typeof value === 'object') return 'Revisar registro'
  if (value === '' || value == null) return 'Sin dato'
  // Gender and Salutation are Link fields, so they never reach the Select branch.
  const coded =
    field.fieldtype === 'Select' ||
    ['gender', 'salutation'].includes(field.fieldname)
  return coded ? optionLabel(value) : String(value)
}
watch(
  nativeRoute,
  () => {
    record.value = null
    selectedCustomer.value = ''
    selectedPanelContact.value = ''
    addressTargetKey.value = ''
    followups.value = []
    taskGeneration++
    identityOpen.value = false
    addressOpen.value = false
    followupOpen.value = false
    relationOpen.value = false
    tagsOpen.value = false
    roleOpen.value = false
    reload()
  },
  { immediate: true },
)
</script>
