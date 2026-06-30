<template>
  <ActivityHeader
    v-model="tabIndex"
    v-model:showWhatsappTemplates="showWhatsappTemplates"
    v-model:showFilesUploader="showFilesUploader"
    v-model:emailBox="emailBox"
    :tabs="tabs"
    :title="title"
    :conv-is-messenger="convIsMessenger"
    :active-channel-tab="activeChannelTab"
    :doc="doc"
    :whatsappBox="whatsappBox"
    :modalRef="modalRef"
  />
  <FadedScrollableDiv class="flex flex-col h-full overflow-y-auto">
    <div
      v-if="all_activities?.loading"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-xl font-medium text-ink-gray-4"
    >
      <LoadingIndicator class="h-6 w-6" />
      <span>{{ __('Loading...') }}</span>
    </div>
    <div v-else-if="title == 'Events'" class="h-full activity">
      <EventArea :doctype="doctype" :docname="docname" />
    </div>
    <div
      v-else-if="
        activities?.length ||
        (title == 'WhatsApp' && (whatsappEnabled || availableChannels.length))
      "
      class="activities"
    >
      <!-- channel tabs: WhatsApp | Messenger | … — only when 2+ channels have msgs -->
      <div
        v-if="title == 'WhatsApp' && availableChannels.length > 1"
        class="mx-3 mb-2 mt-1 flex gap-1.5 px-1 sm:mx-10"
      >
        <button
          v-for="ch in availableChannels"
          :key="ch.id"
          type="button"
          class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold"
          :class="
            activeChannelTab === ch.id
              ? 'border-transparent text-white'
              : 'border-outline-gray-2 bg-surface-gray-1 text-ink-gray-7 hover:bg-surface-gray-2'
          "
          :style="activeChannelTab === ch.id ? `background:${ch.color}` : ''"
          @click="selectChannelTab(ch.id)"
        >
          <span class="h-1.5 w-1.5 rounded-full" :style="`background:${activeChannelTab === ch.id ? '#fff' : ch.color}`" />
          {{ ch.label }}
          <span class="text-[10px] opacity-70">{{ ch.count }}</span>
        </button>
      </div>

      <!-- Messenger (PSID) conversation -->
      <div v-if="title == 'WhatsApp' && activeChannelTab === 'messenger'">
        <MessengerArea :messages="messengerThreadItems" />
      </div>
      <div v-else-if="title == 'WhatsApp'">
        <!-- Multi-Contact tab strip: one tab per Contact attached to the Deal/Lead.
             Hidden when there's only one contact (header alone is enough). -->
        <div
          v-if="(whatsappContacts.data || []).length > 1"
          class="mx-3 mb-2 flex gap-1 overflow-x-auto px-1 sm:mx-10"
        >
          <button
            v-for="(c, i) in whatsappContacts.data"
            :key="c.phone"
            type="button"
            class="whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium"
            :class="
              activeWhatsappContactIdx === i
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                : 'border-transparent bg-surface-gray-1 text-ink-gray-7 hover:bg-surface-gray-2'
            "
            @click="activeWhatsappContactIdx = i"
          >
            {{ c.name }}
            <span class="ml-1 font-mono text-[10px] opacity-60">{{ c.phone_display }}</span>
          </button>
        </div>
        <!-- WhatsApp presence (whatsapp_state from get_deal_whatsapp_contacts):
             'no'  = operator unchecked "Es WhatsApp" on the deal/lead and there's
                     no exchange → definitive red notice.
             'unknown' = never contacted and no operator flag (pre-migration) → amber
                     nudge. 'yes' = no banner. Guarded so it never flashes while the
             contact list is still loading. -->
        <div
          v-if="waBannerState === 'no'"
          class="mx-3 mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-surface-red-1 px-3 py-2 dark:border-red-900/40 sm:mx-10"
        >
          <FeatherIcon name="slash" class="mt-0.5 size-4 shrink-0 text-ink-red-3" />
          <div class="text-xs leading-snug text-ink-gray-7 dark:text-ink-gray-6">
            <span class="font-semibold text-ink-red-3">{{ __('Este número no tiene WhatsApp.') }}</span>
            {{ __('Marcado como sin WhatsApp al crear el trato.') }}
          </div>
        </div>
        <div
          v-else-if="waBannerState === 'unknown'"
          class="mx-3 mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-surface-amber-1 px-3 py-2 dark:border-amber-900/40 sm:mx-10"
        >
          <FeatherIcon name="alert-triangle" class="mt-0.5 size-4 shrink-0 text-ink-amber-3" />
          <div class="text-xs leading-snug text-ink-gray-7 dark:text-ink-gray-6">
            <span class="font-semibold text-ink-gray-8 dark:text-ink-gray-7">{{ __('Sin WhatsApp para este número.') }}</span>
            {{ __('No hay conversación de WhatsApp con este número todavía — inicia con una plantilla.') }}
          </div>
        </div>
        <!-- Supervised sends awaiting approval for THIS conversation (scoped by
             deal/lead + the active contact's phone). One-tap Enviar/Cancelar here so
             a reviewer never has to leave the chat for the Aprobaciones queue. -->
        <ConversationReviewStrip
          v-if="['CRM Deal', 'CRM Lead'].includes(doctype)"
          class="mx-3 mb-2 sm:mx-10"
          :reference-doctype="doctype"
          :reference-name="docname"
          :phone="activeWhatsappContact?.phone"
          @changed="whatsappMessages.reload()"
        />
        <!-- pending auto-acuse for THIS conversation → review with full context -->
        <ConversationAutoAckStrip v-if="['CRM Deal', 'CRM Lead'].includes(doctype)" />
        <!-- unified customer thread toggle: appears when the phone has >1 deal/RO -->
        <div v-if="contactDealCount > 1" class="mx-3 mb-1.5 sm:mx-10">
          <button
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            :class="unifiedThread ? 'bg-surface-green-2 text-ink-green-3' : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'"
            @click="toggleUnified"
          >
            🔗
            {{ unifiedThread
              ? __('Viendo toda la conversación · {0} tratos', [contactDealCount])
              : __('Ver toda la conversación del cliente · {0} tratos', [contactDealCount]) }}
          </button>
        </div>
        <!-- catalog intent: the customer asked about a price/item → one-tap catalog search -->
        <div v-if="catalogSuggest.data?.suggest" class="mx-3 mb-1.5 sm:mx-10">
          <button
            class="inline-flex items-center gap-1.5 rounded-full bg-surface-amber-1 px-2.5 py-1 text-[11px] font-semibold text-ink-amber-3 hover:bg-surface-amber-2"
            @click="onWaCatalog(catalogSuggest.data.query)"
          >
            💡 {{ __("Buscar '{0}' en catálogo · {1}", [catalogSuggest.data.query, catalogSuggest.data.count]) }}
          </button>
        </div>
        <WhatsAppArea
          v-model="whatsappMessages"
          v-model:reply="replyMessage"
          class="px-3 sm:px-10"
          :messages="threadItems"
          :contact="activeWhatsappContact"
          :pinned-notes="pinnedNotes"
          :more-notes="moreNotes"
          @open-note="(n) => modalRef.showNote(n)"
          @unpin-note="unpinNote"
          @open-notes="() => changeTabTo('notes')"
        />
      </div>
      <div
        v-else-if="title == 'Notes'"
        class="grid grid-cols-1 gap-4 px-3 pb-3 sm:px-10 sm:pb-5 lg:grid-cols-2 xl:grid-cols-3"
      >
        <div
          v-for="note in activities"
          :key="note.name"
          @click="modalRef.showNote(note)"
        >
          <NoteArea v-model="all_activities" :note="note" />
        </div>
      </div>
      <div v-else-if="title == 'Comments'" class="pb-5">
        <div v-for="(comment, i) in activities" :key="comment.name">
          <div
            class="activity grid grid-cols-[30px_minmax(auto,_1fr)] gap-2 px-3 sm:gap-4 sm:px-10"
          >
            <div
              class="z-0 relative flex justify-center before:absolute before:left-[50%] before:-z-[1] before:top-0 before:border-l before:border-outline-gray-modals"
              :class="
                i != activities.length - 1 ? 'before:h-full' : 'before:h-4'
              "
            >
              <div
                class="flex h-8 w-7 items-center justify-center bg-surface-white"
              >
                <CommentIcon class="text-ink-gray-8" />
              </div>
            </div>
            <CommentArea
              class="mb-4"
              :activity="comment"
              @reload="all_activities.reload()"
            />
          </div>
        </div>
      </div>
      <div v-else-if="title == 'Tasks'" class="px-3 pb-3 sm:px-10 sm:pb-5">
        <TaskArea :modalRef="modalRef" :tasks="activities" :doctype="doctype" />
      </div>
      <div v-else-if="title == 'Calls'" class="activity">
        <div v-for="(call, i) in activities" :key="call.name">
          <div
            class="activity grid grid-cols-[30px_minmax(auto,_1fr)] gap-4 px-3 sm:px-10"
          >
            <div
              class="z-0 relative flex justify-center before:absolute before:left-[50%] before:-z-[1] before:top-0 before:border-l before:border-outline-gray-modals"
              :class="
                i != activities.length - 1 ? 'before:h-full' : 'before:h-4'
              "
            >
              <div
                class="flex h-8 w-7 items-center justify-center bg-surface-white text-ink-gray-8"
              >
                <MissedCallIcon
                  v-if="call.status == 'No Answer'"
                  class="text-ink-red-4"
                />
                <DeclinedCallIcon v-else-if="call.status == 'Busy'" />
                <component
                  :is="
                    call.type == 'Incoming' ? InboundCallIcon : OutboundCallIcon
                  "
                  v-else
                />
              </div>
            </div>
            <CallArea class="mb-4" :activity="call" />
          </div>
        </div>
      </div>
      <div
        v-else-if="title == 'Attachments'"
        class="px-3 pb-3 sm:px-10 sm:pb-5"
      >
        <AttachmentArea
          :attachments="activities"
          @reload="all_activities.reload() && scroll()"
        />
      </div>
      <template v-else>
        <div
          v-for="(activity, i) in activities"
          :key="activity.name"
          class="activity px-3 sm:px-10"
          :class="
            ['Activity', 'Emails'].includes(title)
              ? 'grid grid-cols-[30px_minmax(auto,_1fr)] gap-2 sm:gap-4'
              : ''
          "
        >
          <div
            v-if="['Activity', 'Emails'].includes(title)"
            class="z-0 relative flex justify-center before:absolute before:left-[50%] before:-z-[1] before:top-0 before:border-l before:border-outline-gray-modals"
            :class="[
              i != activities.length - 1 ? 'before:h-full' : 'before:h-4',
            ]"
          >
            <div
              class="flex h-7 w-7 items-center justify-center bg-surface-white"
              :class="{
                'mt-2.5': ['communication'].includes(activity.activity_type),
                'bg-surface-white': ['added', 'removed', 'changed'].includes(
                  activity.activity_type,
                ),
                'h-8': [
                  'comment',
                  'communication',
                  'incoming_call',
                  'outgoing_call',
                ].includes(activity.activity_type),
              }"
            >
              <UserAvatar
                v-if="activity.activity_type == 'communication'"
                :user="activity.data.sender"
                size="md"
              />
              <MissedCallIcon
                v-else-if="
                  ['incoming_call', 'outgoing_call'].includes(
                    activity.activity_type,
                  ) && activity.status == 'No Answer'
                "
                class="text-ink-red-4"
              />
              <DeclinedCallIcon
                v-else-if="
                  ['incoming_call', 'outgoing_call'].includes(
                    activity.activity_type,
                  ) && activity.status == 'Busy'
                "
              />
              <component
                :is="activity.icon"
                v-else
                :class="
                  ['added', 'removed', 'changed'].includes(
                    activity.activity_type,
                  )
                    ? 'text-ink-gray-4'
                    : 'text-ink-gray-8'
                "
              />
            </div>
          </div>
          <div
            v-if="activity.activity_type == 'communication'"
            class="pb-5 mt-px"
          >
            <EmailArea :activity="activity" :emailBox="emailBox" />
          </div>
          <div
            v-else-if="activity.activity_type == 'comment'"
            :id="activity.name"
            class="mb-4"
          >
            <CommentArea
              :activity="activity"
              @reload="all_activities.reload()"
            />
          </div>
          <div
            v-else-if="activity.activity_type == 'attachment_log'"
            :id="activity.name"
            class="mb-4 flex flex-col gap-2 py-1.5"
          >
            <div class="flex items-center justify-stretch gap-2 text-base">
              <div
                class="inline-flex items-center flex-wrap gap-1.5 text-ink-gray-8 font-medium"
              >
                <span class="font-medium">{{ activity.owner_name }}</span>
                <span class="text-ink-gray-5">{{
                  __(activity.data.type)
                }}</span>
                <a
                  v-if="activity.data.file_url"
                  :href="activity.data.file_url"
                  target="_blank"
                >
                  <span>{{ activity.data.file_name }}</span>
                </a>
                <span v-else>{{ activity.data.file_name }}</span>
                <FeatherIcon
                  v-if="activity.data.is_private"
                  name="lock"
                  class="size-3"
                />
              </div>
              <div class="ml-auto whitespace-nowrap">
                <Tooltip :text="formatDate(activity.creation)">
                  <div class="text-sm text-ink-gray-5">
                    {{ __(timeAgo(activity.creation)) }}
                  </div>
                </Tooltip>
              </div>
            </div>
          </div>
          <div
            v-else-if="
              activity.activity_type == 'incoming_call' ||
              activity.activity_type == 'outgoing_call'
            "
            class="mb-4"
          >
            <CallArea :activity="activity" />
          </div>
          <div v-else class="mb-4 flex flex-col gap-2 py-1.5">
            <div class="flex items-center justify-stretch gap-2 text-base">
              <div
                v-if="activity.other_versions"
                class="inline-flex flex-wrap gap-1.5 text-ink-gray-8 font-medium"
              >
                <span>{{
                  activity.show_others ? __('Hide') : __('Show')
                }}</span>
                <span> +{{ activity.other_versions.length + 1 }} </span>
                <span>{{ __('changes from') }}</span>
                <span>{{ activity.owner_name }}</span>
                <Button
                  class="!size-4"
                  variant="ghost"
                  :icon="SelectIcon"
                  @click="activity.show_others = !activity.show_others"
                />
              </div>
              <div
                v-else
                class="inline-flex items-center flex-wrap gap-1 text-ink-gray-5"
              >
                <span class="font-medium text-ink-gray-8">
                  {{ activity.owner_name }}
                </span>
                <span v-if="activity.type">{{ __(activity.type) }}</span>
                <span
                  v-if="activity.data?.field_label"
                  class="max-w-xs truncate font-medium text-ink-gray-8"
                >
                  {{ __(activity.data.field_label) }}
                </span>
                <span v-if="activity.value">{{ __(activity.value) }}</span>
                <span
                  v-if="activity.data?.old_value"
                  class="max-w-xs font-medium text-ink-gray-8"
                >
                  <div
                    v-if="activity.options == 'User'"
                    class="flex items-center gap-1"
                  >
                    <UserAvatar :user="activity.data.old_value" size="xs" />
                    {{ getUser(activity.data.old_value).full_name }}
                  </div>
                  <div v-else class="truncate">
                    {{ activity.data.old_value }}
                  </div>
                </span>
                <span v-if="activity.to">{{ __('to') }}</span>
                <span
                  v-if="activity.data?.value"
                  class="max-w-xs font-medium text-ink-gray-8"
                >
                  <div
                    v-if="activity.options == 'User'"
                    class="flex items-center gap-1"
                  >
                    <UserAvatar :user="activity.data.value" size="xs" />
                    {{ getUser(activity.data.value).full_name }}
                  </div>
                  <div v-else class="truncate">
                    {{ activity.data.value }}
                  </div>
                </span>
              </div>

              <div class="ml-auto whitespace-nowrap">
                <Tooltip :text="formatDate(activity.creation)">
                  <div class="text-sm text-ink-gray-5">
                    {{ __(timeAgo(activity.creation)) }}
                  </div>
                </Tooltip>
              </div>
            </div>
            <div
              v-if="activity.other_versions && activity.show_others"
              class="flex flex-col gap-0.5"
            >
              <div
                v-for="a in sortByCreation([
                  activity,
                  ...activity.other_versions,
                ])"
                :key="a.creation"
                class="flex items-start justify-stretch gap-2 py-1.5 text-base"
              >
                <div class="inline-flex flex-wrap gap-1 text-ink-gray-5">
                  <span
                    v-if="a.data?.field_label"
                    class="max-w-xs truncate text-ink-gray-5"
                  >
                    {{ __(a.data.field_label) }}
                  </span>
                  <FeatherIcon
                    name="arrow-right"
                    class="mx-1 h-4 w-4 text-ink-gray-5"
                  />
                  <span v-if="a.type">
                    {{ startCase(__(a.type)) }}
                  </span>
                  <span
                    v-if="a.data?.old_value"
                    class="max-w-xs font-medium text-ink-gray-8"
                  >
                    <div
                      v-if="a.options == 'User'"
                      class="flex items-center gap-1"
                    >
                      <UserAvatar :user="a.data.old_value" size="xs" />
                      {{ getUser(a.data.old_value).full_name }}
                    </div>
                    <div v-else class="truncate">
                      {{ a.data.old_value }}
                    </div>
                  </span>
                  <span v-if="a.to">{{ __('to') }}</span>
                  <span
                    v-if="a.data?.value"
                    class="max-w-xs font-medium text-ink-gray-8"
                  >
                    <div
                      v-if="a.options == 'User'"
                      class="flex items-center gap-1"
                    >
                      <UserAvatar :user="a.data.value" size="xs" />
                      {{ getUser(a.data.value).full_name }}
                    </div>
                    <div v-else class="truncate">
                      {{ a.data.value }}
                    </div>
                  </span>
                </div>

                <div class="ml-auto whitespace-nowrap">
                  <Tooltip :text="formatDate(a.creation)">
                    <div class="text-sm text-ink-gray-5">
                      {{ __(timeAgo(a.creation)) }}
                    </div>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
    <div v-else-if="title == 'Data'" class="h-full flex flex-col px-3 sm:px-10">
      <DataFields
        :doctype="doctype"
        :docname="docname"
        @beforeSave="(data) => emit('beforeSave', data)"
        @afterSave="(data) => emit('afterSave', data)"
      />
    </div>
    <EmptyState
      v-else
      :title="emptyText"
      :description="emptyTextDescription"
      :icon="emptyTextIcon"
      :top="top"
    />
  </FadedScrollableDiv>
  <div>
    <CommunicationArea
      v-if="['Emails', 'Comments', 'Activity'].includes(title)"
      ref="emailBox"
      v-model="doc"
      v-model:reload="reload_email"
      :doctype="doctype"
      @scroll="scroll"
    />
    <WhatsappTemplateReview
      v-if="title == 'WhatsApp' && reviewTemplate"
      :doctype="doctype"
      :docname="docname"
      :template="reviewTemplate"
      :sending="templateSending"
      @send="confirmSendTemplate"
      @cancel="reviewTemplate = null"
    />
    <MessengerBox
      v-if="title == 'WhatsApp' && activeChannelTab === 'messenger'"
      :doctype="doctype"
      :docname="docname"
      :window24h="messengerWindow"
      @sending="onMsgrSending"
      @sent="onMsgrSent"
      @failed="onMsgrFailed"
      @catalog="onMsgrCatalog"
    />
    <WhatsAppBox
      v-if="title == 'WhatsApp' && activeChannelTab === 'whatsapp'"
      ref="whatsappBox"
      v-model="doc"
      v-model:reply="replyMessage"
      v-model:whatsapp="whatsappMessages"
      :doctype="doctype"
      :to-override="activeWhatsappContact?.phone || ''"
      @scroll="scroll"
      @pick-template="(t) => openTemplateReview(t)"
      @activity="() => all_activities.reload()"
      @sending="onWaSending"
      @sent="onWaSent"
      @failed="onWaFailed"
      @catalog="onWaCatalog"
    />
    <CatalogPicker v-if="catalogOpen" @sent="onCatalogSent" />
  </div>
  <WhatsappTemplateSelectorModal
    v-if="whatsappEnabled"
    v-model="showWhatsappTemplates"
    :doctype="doctype"
    @send="(t) => openTemplateReview(t)"
  />
  <AllModals
    ref="modalRef"
    v-model="all_activities"
    :doctype="doctype"
    :doc="doc"
  />
  <FilesUploader
    v-model="showFilesUploader"
    :doctype="doctype"
    :docname="docname"
    @after="
      () => {
        all_activities.reload()
        changeTabTo('attachments')
      }
    "
  />
</template>
<script setup>
import ActivityHeader from '@/components/Activities/ActivityHeader.vue'
import EmailArea from '@/components/Activities/EmailArea.vue'
import CommentArea from '@/components/Activities/CommentArea.vue'
import CallArea from '@/components/Activities/CallArea.vue'
import NoteArea from '@/components/Activities/NoteArea.vue'
import TaskArea from '@/components/Activities/TaskArea.vue'
import AttachmentArea from '@/components/Activities/AttachmentArea.vue'
import DataFields from '@/components/Activities/DataFields.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import ActivityIcon from '@/components/Icons/ActivityIcon.vue'
import EmailIcon from '@/components/Icons/EmailIcon.vue'
import DetailsIcon from '@/components/Icons/DetailsIcon.vue'
import CalendarIcon from '@/components/Icons/CalendarIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import AttachmentIcon from '@/components/Icons/AttachmentIcon.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import EventArea from '@/components/Activities/EventArea.vue'
import WhatsAppArea from '@/components/Activities/WhatsAppArea.vue'
import WhatsAppBox from '@/components/Activities/WhatsAppBox.vue'
import MessengerArea from '@/components/Activities/MessengerArea.vue'
import MessengerBox from '@/components/Activities/MessengerBox.vue'
import CatalogPicker from '@/components/doco/inbox/CatalogPicker.vue'
import { catalogOpen, openCatalog } from '@/composables/inbox'
import LoadingIndicator from '@/components/Icons/LoadingIndicator.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import LeadsIcon from '@/components/Icons/LeadsIcon.vue'
import DealsIcon from '@/components/Icons/DealsIcon.vue'
import DotIcon from '@/components/Icons/DotIcon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import SelectIcon from '@/components/Icons/SelectIcon.vue'
import MissedCallIcon from '@/components/Icons/MissedCallIcon.vue'
import DeclinedCallIcon from '@/components/Icons/DeclinedCallIcon.vue'
import InboundCallIcon from '@/components/Icons/InboundCallIcon.vue'
import OutboundCallIcon from '@/components/Icons/OutboundCallIcon.vue'
import FadedScrollableDiv from '@/components/FadedScrollableDiv.vue'
import CommunicationArea from '@/components/CommunicationArea.vue'
import WhatsappTemplateSelectorModal from '@/components/Modals/WhatsappTemplateSelectorModal.vue'
import WhatsappTemplateReview from '@/components/Activities/WhatsappTemplateReview.vue'
import ConversationReviewStrip from '@/components/doco/ConversationReviewStrip.vue'
import ConversationAutoAckStrip from '@/components/doco/inbox/ConversationAutoAckStrip.vue'
import AllModals from '@/components/Activities/AllModals.vue'
import FilesUploader from '@/components/FilesUploader/FilesUploader.vue'
import { timeAgo, formatDate, startCase } from '@/utils'
import { globalStore } from '@/stores/global'
import { usersStore } from '@/stores/users'
import { whatsappEnabled } from '@/composables/whatsapp'
import { useDocument } from '@/data/document'
import { useTelemetry } from 'frappe-ui/frappe'
import { Button, Tooltip, createResource, toast } from 'frappe-ui'
import { useElementVisibility, useStorage } from '@vueuse/core'
import {
  ref,
  computed,
  h,
  markRaw,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from 'vue'
import { useRoute } from 'vue-router'

const { $socket } = globalStore()
const { getUser } = usersStore()
const { capture } = useTelemetry()

const props = defineProps({
  doctype: { type: String, default: 'CRM Lead' },
  docname: { type: String, default: '' },
  tabs: { type: Array, default: () => [] },
})

const emit = defineEmits(['beforeSave', 'afterSave'])

const route = useRoute()

const reload = defineModel('reload', { type: Boolean, default: false })
const tabIndex = defineModel('tabIndex', { type: Number, default: 0 })

const { document: _document } = useDocument(props.doctype, props.docname)

const doc = computed(() => _document.doc || {})

const reload_email = ref(false)
const modalRef = ref(null)
const showFilesUploader = ref(false)

const title = computed(() => props.tabs?.[tabIndex.value]?.name || 'Activity')

const changeTabTo = (tabName) => {
  const tabNames = props.tabs?.map((tab) => tab.name?.toLowerCase())
  const index = tabNames?.indexOf(tabName)
  if (index == -1) return
  tabIndex.value = index
}

const all_activities = createResource({
  url: 'crm.api.activities.get_activities',
  params: { name: props.docname },
  cache: ['activity', props.docname],
  auto: true,
  transform: ([versions, calls, notes, tasks, attachments]) => {
    return { versions, calls, notes, tasks, attachments }
  },
  onSuccess: () => nextTick(() => scroll()),
})

// exposed as a model so an external trigger (e.g. an inbox macro) can open the
// WhatsApp template review; defaults to local false when no parent binds it.
const showWhatsappTemplates = defineModel('showWhatsappTemplates', { type: Boolean, default: false })

// Multi-Contact-per-Deal scoping: pull every Contact attached to the Deal/Lead
// with their normalized mobile_no. Each Contact becomes one chat tab.
const whatsappContacts = createResource({
  url: 'whatsapp_chat.api.deal_contacts.get_deal_whatsapp_contacts',
  cache: ['whatsapp_deal_contacts', props.doctype, props.docname],
  params: { doctype: props.doctype, name: props.docname },
  auto: true,
})

const activeWhatsappContactIdx = ref(0)

const activeWhatsappContact = computed(() => {
  const list = whatsappContacts.data || []
  return list[activeWhatsappContactIdx.value] || list[0] || null
})

// WhatsApp-presence banner: 'no' (operator marked not-WhatsApp) | 'unknown' (never
// contacted, no flag) | null (on WhatsApp → no banner). Uses the backend
// whatsapp_state, falling back to the legacy has_whatsapp boolean if absent.
const waBannerState = computed(() => {
  const c = activeWhatsappContact.value
  if (!c) return null
  if (c.whatsapp_state) return c.whatsapp_state === 'yes' ? null : c.whatsapp_state
  return c.has_whatsapp === false ? 'unknown' : null
})

// Filter messages to the active Contact's phone (compare normalized digits).
const filteredWhatsappMessages = computed(() => {
  const all = whatsappMessages.data || []
  const c = activeWhatsappContact.value
  if (!c || (whatsappContacts.data || []).length <= 1) return all
  const target = String(c.phone || '').replace(/\D/g, '')
  if (!target) return all
  return all.filter((m) => {
    const from = String(m.from || '').replace(/\D/g, '')
    const to = String(m.to || '').replace(/\D/g, '')
    return from.endsWith(target) || target.endsWith(from) ||
           to.endsWith(target) || target.endsWith(to)
  })
})

// Internal comments (same as the Comments tab) rendered inline in the thread.
const threadComments = computed(() => {
  const versions = all_activities.data?.versions || []
  return versions
    .filter((a) => a.activity_type === 'comment')
    .map((c) => ({
      _kind: 'comment',
      name: c.name,
      owner: c.owner,
      owner_name: getUser(c.owner)?.full_name || c.owner,
      content: c.content,
      creation: c.creation,
    }))
})

// Unified CUSTOMER thread: a customer with 2 repair orders has 2 deals, but inbound
// auto-links to the newest only → the conversation is split. When the phone appears on
// >1 deal, offer a toggle that merges all their WhatsApp into one thread (backend tags
// each bubble with its source deal). Deal-scoped by default.
const contactRefs = createResource({ url: 'doco_marketing.api.inbox.get_contact_refs', auto: false })
const unifiedMessages = createResource({ url: 'doco_marketing.api.inbox.get_contact_thread', auto: false })
// Catalog intent: if the customer's last inbound looks like a price/item question, offer
// a one-tap "buscar en catálogo" chip pre-filled with the extracted terms (never auto-sends).
const catalogSuggest = createResource({ url: 'doco_marketing.api.catalog.suggest', auto: false })
const unifiedThread = ref(false)
const contactDealCount = computed(() => contactRefs.data?.count || 1)
const baseWaMessages = computed(() =>
  unifiedThread.value ? unifiedMessages.data || [] : filteredWhatsappMessages.value || [],
)
function toggleUnified() {
  unifiedThread.value = !unifiedThread.value
  if (unifiedThread.value && props.docname)
    unifiedMessages.submit({ reference_doctype: props.doctype, reference_name: props.docname })
  nextTick(() => scroll())
}
watch(
  () => props.docname,
  () => {
    unifiedThread.value = false
    if (props.docname && ['CRM Deal', 'CRM Lead'].includes(props.doctype)) {
      contactRefs.submit({ reference_doctype: props.doctype, reference_name: props.docname })
      catalogSuggest.submit({ reference_doctype: props.doctype, reference_name: props.docname })
    }
  },
  { immediate: true },
)

// WhatsApp messages + inline comments interleaved by time, then optimistic pending
// bubbles (#21) pinned last — a just-sent message is always newest, so append after the
// sort instead of relying on a client timestamp that may not match the server tz.
const threadItems = computed(() => {
  const msgs = baseWaMessages.value.map((m) => ({
    ...m,
    _kind: 'whatsapp',
  }))
  const base = [...msgs, ...threadComments.value].sort(
    (a, b) => new Date(a.creation) - new Date(b.creation),
  )
  return [...base, ...optimisticWaItems.value]
})

// Notes pinned to the top of the conversation. Pinned by default; dismissing
// one stores its name per-record in localStorage (no backend / no migrate).
const unpinnedNotes = useStorage(
  `wa-unpinned-notes-${props.doctype}-${props.docname}`,
  [],
)
const PINNED_NOTES_LIMIT = 3

const visibleNotes = computed(() => {
  const notes = all_activities.data?.notes || []
  return sortByModified(notes).filter(
    (n) => !unpinnedNotes.value.includes(n.name),
  )
})

const pinnedNotes = computed(() =>
  visibleNotes.value.slice(0, PINNED_NOTES_LIMIT),
)
const moreNotes = computed(() =>
  Math.max(0, visibleNotes.value.length - PINNED_NOTES_LIMIT),
)

function unpinNote(note) {
  if (!unpinnedNotes.value.includes(note.name)) {
    unpinnedNotes.value = [...unpinnedNotes.value, note.name]
  }
}

// No-reset scroll (#21): an INCOMING reload while the user has scrolled up to read
// history must not yank them to the bottom. onWhatsappRealtime sets this when the last
// message wasn't near the viewport before the reload; onSuccess then skips that scroll.
// Own sends + initial load are unaffected (they leave the flag false → scroll runs).
let _waSuppressScroll = false
function _waAtBottom() {
  const e = document.getElementsByClassName('activity')
  const el = e[e.length - 1]
  if (!el) return true
  return el.getBoundingClientRect().top < window.innerHeight + 160
}

const whatsappMessages = createResource({
  url: 'crm.api.whatsapp.get_whatsapp_messages',
  cache: ['whatsapp_messages', props.docname],
  params: {
    reference_doctype: props.doctype,
    reference_name: props.docname,
  },
  auto: false,
  transform: (data) => sortByCreation(data),
  onSuccess: () =>
    nextTick(() => {
      if (_waSuppressScroll) {
        _waSuppressScroll = false
        return
      }
      scroll()
    }),
  // A failed reload must not leave the suppress latch stuck true (it would swallow the
  // next own-send scroll).
  onError: () => {
    _waSuppressScroll = false
  },
})

watch(
  whatsappEnabled,
  (enabled) => {
    if (enabled) whatsappMessages.fetch()
  },
  { immediate: true },
)

// ── Messenger (PSID) conversation — unified inbox thread (Phase D follow-on) ──
// A conversation surfaces as Messenger when it has Messenger Message rows AND no
// WhatsApp ones (a PSID and a phone never coincide). Reuses the same get_communications
// the omnichannel inbox already serves, filtered to channel='messenger'.
const messengerThread = createResource({
  url: 'doco_marketing.api.inbox.get_communications',
  params: {
    reference_doctype: props.doctype,
    reference_name: props.docname,
    channel: 'messenger',
  },
  auto: false,
})
const messengerMessages = computed(() => messengerThread.data?.messages || [])
const convIsMessenger = computed(
  () => messengerMessages.value.length > 0 && (whatsappMessages.data || []).length === 0,
)
// Live Messenger 24h policy window: free RESPONSE until 24h after the last INBOUND
// message, else outbound needs a HUMAN_AGENT tag. Mirrors DealHeader's waWindow so
// the composer note reflects reality instead of always warning. null = unknown.
const messengerWindow = computed(() => {
  const mm = messengerMessages.value
  let ts = null
  for (let i = mm.length - 1; i >= 0; i--) {
    if (mm[i].direction !== 'out') { ts = mm[i].timestamp || mm[i].creation; break }
  }
  if (!ts) return null
  const left = 24 - (Date.now() - new Date(String(ts).replace(' ', 'T')).getTime()) / 3600000
  return left > 0 ? { open: true, hoursLeft: Math.max(1, Math.floor(left)) } : { open: false }
})

// ── Optimistic reply (#21) ───────────────────────────────────────────────────
// Pending out-bubbles live HERE in the parent (never in the composers — those only
// emit a lifecycle keyed by a client token). Reconciled against the real thread by
// serverId (the created message name); a content+timestamp consume-once FALLBACK
// covers the echo-before-resolve race (the after_commit realtime reload can render the
// committed row before the create promise resolves, when serverId isn't known yet).
// Render-time HIDE (no key swap → no remount/flicker). A never-matched bubble ages out
// so a hung send can't leave a ghost. Failed sends drop the bubble (composer kept text).
const optimisticWa = ref([])
const optimisticMsgr = ref([])
const OPT_MAX_AGE = 120000

function _optAdd(list, p) {
  list.value = [...list.value, { ...p, ts: Date.now(), serverId: null }]
  // Timer-driven age-out: a hung send (never matched, never re-rendered in a quiet
  // thread) is dropped from the source ref so it can't ghost or grow the array unbounded.
  const token = p.clientToken
  setTimeout(() => _optDrop(list, token), OPT_MAX_AGE)
}
function _optMarkSent(list, clientToken, serverId) {
  list.value = list.value.map((o) => (o.clientToken === clientToken ? { ...o, serverId } : o))
}
function _optDrop(list, clientToken) {
  list.value = list.value.filter((o) => o.clientToken !== clientToken)
}
function _tsMs(t) {
  return t ? new Date(String(t).replace(' ', 'T')).getTime() : 0
}
// Survivors = optimistic bubbles with no matching real row yet. Match by serverId
// (deterministic) OR — for the echo-before-resolve race where serverId isn't known yet
// — by an out row with the SAME content whose id is NEW (absent from the snapshot taken
// at send time). The id-snapshot is timezone-proof (no clock compare across browser/site
// tz) and precise: it can only match a row that appeared AFTER the send. consume-once so
// two identical messages can't both collapse onto the same real row.
function _reconcile(optimistic, real, { idOf, contentOf, attachOf, isOut }) {
  const now = Date.now()
  const consumed = new Set()
  const survivors = []
  for (const o of optimistic) {
    if (now - o.ts > OPT_MAX_AGE) continue
    let i = -1
    if (o.serverId) i = real.findIndex((r, idx) => !consumed.has(idx) && idOf(r) === o.serverId)
    if (i < 0) {
      i = real.findIndex(
        (r, idx) =>
          !consumed.has(idx) &&
          isOut(r) &&
          !o.knownIds.has(idOf(r)) &&
          (contentOf(r) || '') === (o.content || '') &&
          (attachOf(r) || '') === (o.attach || ''),
      )
    }
    if (i >= 0) consumed.add(i)
    else survivors.push(o)
  }
  return survivors
}

// On a multi-contact deal each contact is its own chat tab (filteredWhatsappMessages);
// a pending bubble belongs ONLY to the contact it was sent to, so scope it the same way
// — else switching tabs mid-send shows contact A's bubble in contact B's thread.
const _scopedOptimisticWa = computed(() => {
  const multi = (whatsappContacts.data || []).length > 1
  const target = String(activeWhatsappContact.value?.phone || '').replace(/\D/g, '')
  if (!multi || !target) return optimisticWa.value
  return optimisticWa.value.filter((o) => {
    const t = String(o.to || '').replace(/\D/g, '')
    return !t || t.endsWith(target) || target.endsWith(t)
  })
})
const optimisticWaItems = computed(() =>
  _reconcile(_scopedOptimisticWa.value, filteredWhatsappMessages.value || [], {
    idOf: (r) => r.name,
    contentOf: (r) => r.message,
    attachOf: (r) => r.attach,
    isOut: (r) => (r.type || '').toLowerCase() === 'outgoing',
  }).map((o) => ({
    _kind: 'whatsapp',
    _optimistic: true,
    name: o.clientToken,
    type: 'Outgoing',
    message: o.content,
    attach: o.attach || '',
    content_type: o.content_type || 'text',
    creation: new Date(o.ts).toISOString().slice(0, 19).replace('T', ' '),
    status: '',
  })),
)
const optimisticMsgrItems = computed(() =>
  _reconcile(optimisticMsgr.value, messengerMessages.value, {
    idOf: (r) => r.id,
    contentOf: (r) => r.content,
    attachOf: (r) => r.attach,
    isOut: (r) => r.direction === 'out',
  }).map((o) => ({
    id: o.clientToken,
    _optimistic: true,
    channel: 'messenger',
    direction: 'out',
    content: o.content,
    content_type: 'text',
    attach: null,
    timestamp: new Date(o.ts).toISOString(),
  })),
)
// Messenger render list = real thread (time-sorted) + pending bubbles pinned last
// (a just-sent message is always the newest — append after sort, no tz-fragile compare).
const messengerThreadItems = computed(() => {
  const base = [...messengerMessages.value].sort((a, b) => _tsMs(a.timestamp) - _tsMs(b.timestamp))
  return [...base, ...optimisticMsgrItems.value]
})

// composer lifecycle → optimistic list. Snapshot the real ids present NOW so the
// content fallback can only ever match a row that arrives afterwards.
function onWaSending(p) {
  const knownIds = new Set((filteredWhatsappMessages.value || []).map((r) => r.name))
  _optAdd(optimisticWa, { ...p, knownIds })
  nextTick(() => scroll()) // own send → scroll to the new bubble
}
function onWaSent(p) {
  _optMarkSent(optimisticWa, p.clientToken, p.serverId)
}
function onWaFailed(p) {
  _optDrop(optimisticWa, p.clientToken)
}
function onMsgrSending(p) {
  const knownIds = new Set(messengerMessages.value.map((r) => r.id))
  _optAdd(optimisticMsgr, { ...p, knownIds })
}
function onMsgrSent(p) {
  if (p?.clientToken) _optMarkSent(optimisticMsgr, p.clientToken, p.serverId)
  messengerThread.reload()
}
function onMsgrFailed(p) {
  _optDrop(optimisticMsgr, p.clientToken)
}

// /cat or 📦 from a composer → open the catalog picker scoped to this conversation.
function onWaCatalog(q) {
  openCatalog(
    { reference_doctype: props.doctype, reference_name: props.docname, channel: 'whatsapp', to: activeWhatsappContact.value?.phone || doc.value.mobile_no },
    q,
  )
}
function onMsgrCatalog(q) {
  openCatalog({ reference_doctype: props.doctype, reference_name: props.docname, channel: 'messenger', to: null }, q)
}
function onCatalogSent() {
  whatsappMessages.reload()
  messengerThread.reload()
}

// ── Channel tabs ────────────────────────────────────────────────────────────
// A deal/lead can carry BOTH WhatsApp and Messenger threads (and more channels
// later). Expose every channel that has messages as a tab instead of the old
// binary messenger-only swap. `channels` is the single source of truth — append
// to it (SMS, Instagram, …) and the strip + content + composer follow.
const channels = computed(() => {
  const out = []
  const wa = whatsappMessages.data || []
  if (wa.length) out.push({ id: 'whatsapp', label: 'WhatsApp', color: '#25d366', count: wa.length, ts: wa[wa.length - 1]?.creation })
  const mm = messengerMessages.value
  if (mm.length) out.push({ id: 'messenger', label: 'Messenger', color: '#0084ff', count: mm.length, ts: mm[mm.length - 1]?.timestamp || mm[mm.length - 1]?.creation })
  return out
})
const availableChannels = computed(() => channels.value)
const activeChannelTab = ref('whatsapp')
const userPickedTab = ref(false) // honor an explicit click; otherwise auto-follow latest
function selectChannelTab(id) {
  activeChannelTab.value = id
  userPickedTab.value = true
}
// New conversation → forget the explicit pick so the next one auto-defaults.
watch(
  () => props.docname,
  () => {
    userPickedTab.value = false
  },
)
// Auto-select the channel with the LATEST message — and keep re-evaluating as
// threads load in (WhatsApp + Messenger fetch independently, so the first to land
// must not pin the tab). An explicit user click freezes the choice until the
// conversation changes.
watch(
  channels,
  (chs) => {
    if (!chs.length) {
      activeChannelTab.value = 'whatsapp'
      return
    }
    if (userPickedTab.value && chs.some((c) => c.id === activeChannelTab.value)) return
    const latest = [...chs].sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))[0]
    activeChannelTab.value = latest?.id || chs[0].id
  },
  { immediate: true },
)
// Load the messenger thread whenever the conversation tab is shown.
watch(
  () => [title.value, props.docname],
  () => {
    if (title.value === 'WhatsApp' && props.docname) messengerThread.fetch()
  },
  { immediate: true },
)
function onMessengerRealtime(data) {
  const ref = data?.reference_name || data?.deal
  if (ref === props.docname) messengerThread.reload()
}

// Named handler so off() removes ONLY this instance's listener. The previous
// blanket `$socket.off('whatsapp_message')` removed every listener for the event
// — so switching deals (each remount) silently killed realtime for sibling
// subscribers (the inbox queue, other Activities), and inbound messages stopped
// refreshing until a full reload (F5).
function onWhatsappRealtime(data) {
  if (
    data.reference_doctype === props.doctype &&
    data.reference_name === props.docname
  ) {
    // Don't yank a reader who's scrolled up; own sends happen at the bottom → scroll.
    if (!_waAtBottom()) _waSuppressScroll = true
    whatsappMessages.reload()
    if (unifiedThread.value) unifiedMessages.reload()
    if (props.docname) catalogSuggest.reload()
  }
}

onBeforeUnmount(() => {
  $socket.off('whatsapp_message', onWhatsappRealtime)
  $socket.off('whatsapp_status', onWhatsappRealtime)
  $socket.off('messenger_message', onMessengerRealtime)
  $socket.off('doco_marketing:thread_update', onMessengerRealtime)
})

onMounted(() => {
  $socket.on('whatsapp_message', onWhatsappRealtime)
  // delivery-receipt updates (sent→delivered→read) so the ✓/✓✓ refresh live
  $socket.on('whatsapp_status', onWhatsappRealtime)
  // Messenger inbound (webhook → publish_thread_update) + our own sends
  $socket.on('messenger_message', onMessengerRealtime)
  $socket.on('doco_marketing:thread_update', onMessengerRealtime)

  nextTick(() => {
    const hash = route.hash.slice(1) || null
    let tabNames = props.tabs?.map((tab) => tab.name)
    if (!tabNames?.includes(hash)) {
      scroll(hash)
    }
  })
})

// Step 1: open the review panel in the composer (no send yet) — from a quick chip
// or the template selector modal. Step 2: confirmSendTemplate fires the real,
// still-compliant template with the reviewed/edited variable values (body_param).
const reviewTemplate = ref(null)
const templateSending = ref(false)

function openTemplateReview(template) {
  showWhatsappTemplates.value = false
  reviewTemplate.value = template
}

function confirmSendTemplate({ template, body_param }) {
  templateSending.value = true
  capture('send_whatsapp_template', { doctype: props.doctype })
  createResource({
    url: 'crm.api.whatsapp.send_whatsapp_template',
    params: {
      reference_doctype: props.doctype,
      reference_name: props.docname,
      to: activeWhatsappContact.value?.phone || doc.value.mobile_no,
      template,
      body_param: body_param ? JSON.stringify(body_param) : undefined,
    },
    auto: true,
    onError: (error) => {
      templateSending.value = false
      toast.error(error.messages?.[0] || __('Failed to send WhatsApp template'))
    },
    onSuccess: () => {
      templateSending.value = false
      reviewTemplate.value = null
      whatsappMessages.reload()
    },
  })
}

const replyMessage = ref({})

function get_activities() {
  if (!all_activities.data?.versions) return []
  if (!all_activities.data?.calls.length)
    return all_activities.data.versions || []
  return [...all_activities.data.versions, ...all_activities.data.calls]
}

const activities = computed(() => {
  let _activities = []
  if (title.value == 'Activity') {
    _activities = get_activities()
  } else if (title.value == 'Emails') {
    if (!all_activities.data?.versions) return []
    _activities = all_activities.data.versions.filter(
      (activity) => activity.activity_type === 'communication',
    )
  } else if (title.value == 'Comments') {
    if (!all_activities.data?.versions) return []
    _activities = all_activities.data.versions.filter(
      (activity) => activity.activity_type === 'comment',
    )
  } else if (title.value == 'Calls') {
    if (!all_activities.data?.calls) return []
    return sortByCreation(all_activities.data.calls)
  } else if (title.value == 'Tasks') {
    if (!all_activities.data?.tasks) return []
    return sortByModified(all_activities.data.tasks)
  } else if (title.value == 'Notes') {
    if (!all_activities.data?.notes) return []
    return sortByModified(all_activities.data.notes)
  } else if (title.value == 'Attachments') {
    if (!all_activities.data?.attachments) return []
    return sortByModified(all_activities.data.attachments)
  }

  _activities.forEach((activity) => {
    activity.icon = timelineIcon(activity.activity_type, activity.is_lead)

    if (
      activity.activity_type == 'incoming_call' ||
      activity.activity_type == 'outgoing_call' ||
      activity.activity_type == 'communication'
    )
      return

    update_activities_details(activity)

    if (activity.other_versions) {
      activity.show_others = false
      activity.other_versions.forEach((other_version) => {
        update_activities_details(other_version)
      })
    }
  })
  return sortByCreation(_activities)
})

function sortByCreation(list) {
  return list.sort((a, b) => new Date(a.creation) - new Date(b.creation))
}
function sortByModified(list) {
  return list.sort((b, a) => new Date(a.modified) - new Date(b.modified))
}

function update_activities_details(activity) {
  activity.owner_name = getUser(activity.owner).full_name
  activity.type = ''
  activity.value = ''
  activity.to = ''

  if (activity.activity_type == 'creation') {
    activity.type = activity.data
  } else if (activity.activity_type == 'added') {
    activity.type = 'added'
    activity.value = 'as'
  } else if (activity.activity_type == 'removed') {
    activity.type = 'removed'
    activity.value = 'value'
  } else if (activity.activity_type == 'changed') {
    activity.type = 'changed'
    activity.value = 'from'
    activity.to = 'to'
  }
}

const top = computed(() => {
  if (['Activity', 'Emails', 'Comments'].includes(title.value)) {
    return '32.3%'
  }
  return '30%'
})

const emptyText = computed(() => {
  let text = 'No Activities Found'
  if (title.value == 'Emails') {
    text = 'No Emails Found'
  } else if (title.value == 'Comments') {
    text = 'No Comments Found'
  } else if (title.value == 'Data') {
    text = 'No Data Fields Added Yet'
  } else if (title.value == 'Calls') {
    text = 'No Call History'
  } else if (title.value == 'Notes') {
    text = 'No Notes Found'
  } else if (title.value == 'Tasks') {
    text = 'No Tasks Found'
  } else if (title.value == 'Attachments') {
    text = 'No Attachments Found'
  } else if (title.value == 'WhatsApp') {
    text = 'No WhatsApp Messages Found'
  }
  return text
})

const emptyTextDescription = computed(() => {
  let description =
    'There are no activities to display here. Go ahead and make some changes.'
  if (title.value == 'Emails') {
    description =
      'No emails found in your inbox. New messages will appear here soon.'
  } else if (title.value == 'Comments') {
    description = 'Be the first to add one.'
  } else if (title.value == 'Data') {
    description = 'No data fields have been added yet.'
  } else if (title.value == 'Calls') {
    description = 'No recent calls to display. Log a call or call someone now!'
  } else if (title.value == 'Notes') {
    description = 'Nothing here for now. Add a note to keep track of things.'
  } else if (title.value == 'Tasks') {
    description =
      'Nothing to do at the moment. Start organizing by adding one here.'
  } else if (title.value == 'Attachments') {
    description =
      'No files have been attached yet. Upload files to see them here.'
  } else if (title.value == 'WhatsApp') {
    description = 'Start a conversation now!'
  }
  return description
})

const emptyTextIcon = computed(() => {
  let icon = ActivityIcon
  if (title.value == 'Emails') {
    icon = EmailIcon
  } else if (title.value == 'Comments') {
    icon = CommentIcon
  } else if (title.value == 'Data') {
    icon = DetailsIcon
  } else if (title.value == 'Calls') {
    icon = PhoneIcon
  } else if (title.value == 'Notes') {
    icon = NoteIcon
  } else if (title.value == 'Tasks') {
    icon = TaskIcon
  } else if (title.value == 'Attachments') {
    icon = AttachmentIcon
  } else if (title.value == 'WhatsApp') {
    icon = WhatsAppIcon
  }
  return h(icon, { class: 'text-ink-gray-4' })
})

function timelineIcon(activity_type, is_lead) {
  let icon
  switch (activity_type) {
    case 'creation':
      icon = is_lead ? LeadsIcon : DealsIcon
      break
    case 'deal':
      icon = DealsIcon
      break
    case 'comment':
      icon = CommentIcon
      break
    case 'event':
      icon = CalendarIcon
      break
    case 'incoming_call':
      icon = InboundCallIcon
      break
    case 'outgoing_call':
      icon = OutboundCallIcon
      break
    case 'attachment_log':
      icon = AttachmentIcon
      break
    default:
      icon = DotIcon
  }

  return markRaw(icon)
}

const emailBox = ref(null)
const whatsappBox = ref(null)

watch([reload, reload_email], ([reload_value, reload_email_value]) => {
  if (reload_value || reload_email_value) {
    all_activities.reload()
    _document.reload()
    reload.value = false
    reload_email.value = false
  }
})

function scroll(hash) {
  if (['tasks', 'notes', 'events'].includes(route.hash?.slice(1))) return
  setTimeout(() => {
    let el
    if (!hash) {
      let e = document.getElementsByClassName('activity')
      el = e[e.length - 1]
    } else {
      el = document.getElementById(hash)
    }
    if (el && !useElementVisibility(el).value) {
      el.scrollIntoView({ behavior: 'smooth' })
      el.focus()
    }
  }, 500)
}

defineExpose({ emailBox, all_activities, changeTabTo })
</script>
