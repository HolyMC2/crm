<!-- Inbox left pane (286px): search + channel pills + conversation rows. handoff §5.1 -->
<template>
  <div
    class="flex flex-col bg-surface-base"
    :class="isMobile ? 'min-h-0 w-full flex-1' : 'w-[286px] flex-none border-r border-outline-gray-1'"
  >
    <div class="flex-none px-3.5 pb-2.5 pt-3.5">
      <div class="mb-3 flex items-center justify-between">
        <div class="text-[15px] font-bold text-ink-gray-9">{{ __('Mi bandeja') }}</div>
        <div class="flex items-center gap-2">
          <button
            class="text-ink-gray-4 hover:text-ink-gray-9"
            :title="__('Buscar mensajes')"
            :aria-label="__('Buscar mensajes')"
            @click="showGlobalSearch = true"
          >
            <LucideSearch class="h-4 w-4" />
          </button>
          <button
            :class="soundEnabled ? 'text-ink-green-7' : 'text-ink-gray-4'"
            :title="soundEnabled ? __('Sonido de notificación activado') : __('Activar sonido de notificación')"
            :aria-label="__('Sonido de notificación')"
            :aria-pressed="soundEnabled"
            @click="toggleSound"
          >
            <LucideVolume2 v-if="soundEnabled" class="h-4 w-4" />
            <LucideVolumeX v-else class="h-4 w-4" />
          </button>
          <!-- Web Push toggle (spec 1.1) — was mobile-sidebar-only; desktop operators
               couldn't subscribe at all. Hidden when unsupported/unconfigured. -->
          <button
            v-if="!['unsupported', 'unconfigured'].includes(pushState)"
            :class="pushState === 'on' ? 'text-ink-green-7' : 'text-ink-gray-4'"
            :disabled="pushBusy || pushState === 'denied'"
            :title="
              pushState === 'denied'
                ? __('Notificaciones bloqueadas en el navegador')
                : pushState === 'on'
                  ? __('Notificaciones push activadas')
                  : __('Activar notificaciones push')
            "
            :aria-label="__('Notificaciones push')"
            :aria-pressed="pushState === 'on'"
            @click="togglePush"
          >
            <LucideBellRing v-if="pushState === 'on'" class="h-4 w-4" />
            <LucideBellOff v-else class="h-4 w-4" />
          </button>
          <span
            class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            :class="unattendedTotal ? 'text-ink-amber-7 bg-surface-amber-2' : 'text-ink-green-8 bg-surface-green-2'"
            :title="__('Cosas sin atender (sin asignar + vencidos + comentarios nuevos)')"
            :aria-label="__('Cosas sin atender') + ': ' + unattendedTotal"
          >
            {{ unattendedTotal }}
          </span>
          <button
            class="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white"
            style="background: var(--brand)"
            :aria-label="__('New Deal')"
            @click="newDeal"
          >
            + {{ __('Trato') }}
          </button>
          <button
            v-if="!isMobile"
            class="text-[13px] text-ink-gray-4 hover:text-ink-gray-9"
            :aria-label="__('Ocultar bandeja')"
            :title="__('Ocultar bandeja')"
            @click="queueCollapsed = true"
          >
            ⟨
          </button>
        </div>
      </div>
      <div
        class="mb-3 flex items-center gap-2 rounded-[9px] border border-outline-gray-2 px-2.5 py-[7px] focus-within:border-outline-gray-4 focus-within:ring-1 focus-within:ring-outline-gray-3"
      >
        <LucideSearch class="h-3.5 w-3.5 flex-none text-ink-gray-4" />
        <input
          ref="searchEl"
          :value="queueSearch"
          :aria-label="__('Buscar en la bandeja')"
          @input="onSearchInput($event.target.value)"
          @keydown.esc="clearQueueSearch"
          :placeholder="__('Buscar equipo, cliente…') + (isMobile ? '' : '  ( / )')"
          class="w-full border-0 bg-transparent text-[12.5px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
        />
        <button
          v-if="queueSearch"
          class="flex h-4 w-4 flex-none items-center justify-center rounded-full text-ink-gray-4 hover:bg-surface-gray-3 hover:text-ink-gray-7"
          :aria-label="__('Limpiar búsqueda')"
          :title="__('Limpiar búsqueda')"
          @click="clearQueueSearch"
        >
          <LucideX class="h-3 w-3" />
        </button>
      </div>
      <!-- omnichannel tabs (Meta-style): Todos | WhatsApp | Messenger | Comentarios -->
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="t in inboxTabs"
          :key="t.id"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :class="
            inboxTab === t.id
              ? 'bg-surface-green-2 text-ink-green-8'
              : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'
          "
          :aria-pressed="inboxTab === t.id"
          @click="setInboxTab(t.id)"
        >
          <span v-if="t.dot" class="h-1.5 w-1.5 rounded-full" :style="`background:${t.dot}`" />
          {{ t.label }}
          <span v-if="t.count != null" class="text-[10px] opacity-70">{{ t.count }}</span>
        </button>
      </div>
      <!-- record filters: estado del trato / lead / reparación + rango de fechas.
           Only on the conversation-list tabs — Vencidos, Comentarios and Por
           aprobar are separate surfaces with their own queries. -->
      <QueueFilters v-if="filterableTab" class="mt-2" />
      <!-- 🏷 etiqueta filter (spec 2.2) — one-line scrollable, tap toggles -->
      <div v-if="(conversationTags.data || []).length" class="mt-2 flex gap-1.5 overflow-x-auto">
        <button
          v-for="tg in conversationTags.data"
          :key="tg"
          class="press flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :class="queueTag === tg ? 'bg-surface-violet-2 text-ink-violet-8' : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'"
          :aria-pressed="queueTag === tg"
          @click="setQueueTag(tg)"
        >
          🏷 {{ tg }}
        </button>
      </div>
    </div>

    <!-- listbox: roving-tabindex rows (one tab stop), ↑/↓/Home/End move focus, Enter
      opens (native button). Selection is exposed via aria-selected, not colour alone. -->
    <div
      ref="listEl"
      role="listbox"
      :aria-label="__('Conversaciones')"
      class="scb flex-1 overflow-y-auto px-2 pb-2.5 pt-0.5"
      @keydown="onListKeydown"
      @touchstart="ptrStart"
      @touchmove="ptrMove"
      @touchend="ptrEnd"
      @touchcancel="ptrEnd"
    >
      <!-- pull-to-refresh indicator (mobile): grows with the drag, spins while loading -->
      <div
        v-if="ptrY > 0 || ptrRefreshing"
        class="flex items-center justify-center overflow-hidden"
        :style="`height:${ptrRefreshing ? 40 : Math.min(ptrY, 64)}px`"
        aria-hidden="true"
      >
        <LucideRefreshCw
          class="h-4.5 w-4.5 text-ink-gray-5"
          :class="ptrRefreshing ? 'animate-spin' : ''"
          :style="!ptrRefreshing ? `transform:rotate(${ptrY * 2.4}deg)` : ''"
        />
      </div>
      <!-- "Sin asignar": inbound WhatsApp from numbers with no Lead/Deal. Pinned
        above the deals so an unknown customer never goes unseen; clicking opens
        the orphan thread + Crear Lead/Trato. -->
      <div v-if="visibleUnassigned.length && inboxTab !== 'comments' && inboxTab !== 'snoozed' && !queueTag && !queueFilterCount" class="mb-1.5">
        <div class="flex items-center gap-1.5 px-1.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-amber-7">
          ⚠ {{ __('Sin asignar') }}
          <span class="rounded-full bg-surface-amber-1 px-1.5 text-[10px] text-ink-amber-7">{{ visibleUnassigned.length }}</span>
        </div>
        <button
          v-for="u in visibleUnassigned"
          :key="orphanKey(u)"
          role="option"
          :aria-selected="activeUnassigned === (u.last_channel === 'messenger' ? u.psid : u.phone)"
          :tabindex="rovingKey === orphanKey(u) ? 0 : -1"
          class="mb-1 block w-full rounded-[11px] p-[11px] text-left hover:bg-surface-gray-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-amber-4"
          :class="activeUnassigned === (u.last_channel === 'messenger' ? u.psid : u.phone) ? 'bg-surface-amber-1' : ''"
          :style="
            activeUnassigned === (u.last_channel === 'messenger' ? u.psid : u.phone)
              ? 'border-left:3px solid #f59e0b'
              : 'border-left:3px solid #f59e0b66'
          "
          @click="selectUnassigned(u.last_channel === 'messenger' ? u.psid : u.phone, u.last_channel)"
        >
          <div class="mb-1 flex items-center gap-2">
            <span class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-surface-amber-1 text-ink-amber-7">
              <LucideMessageCircleQuestion class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-semibold text-ink-gray-9">
                {{ u.contact_name || (u.last_channel === 'messenger' ? __('Messenger') + ' ' + (u.psid || '').slice(-6) : formatPhone(u.phone)) }}
              </div>
              <div class="truncate text-[11px] text-ink-gray-5">{{ u.last_channel === 'messenger' ? __('Messenger') : formatPhone(u.phone) }}</div>
            </div>
            <div class="flex-none text-right text-[10px] font-semibold text-ink-gray-4">
              {{ timeAgo(u.last_message_ts) }}
            </div>
          </div>
          <div class="flex items-center gap-1.5 text-[11.5px] text-ink-gray-6">
            <span
              class="inline-flex flex-none items-center font-semibold"
              :style="`color: ${u.last_channel === 'messenger' ? '#0084ff' : '#25d366'}`"
            >
              {{ u.last_channel === 'messenger' ? 'Msgr' : 'WA' }}
            </span>
            <span class="truncate">{{ u.last_message || '—' }}</span>
            <span v-if="u.count > 1" class="flex-none text-[10px] text-ink-gray-4">· {{ u.count }}</span>
          </div>
        </button>
        <div class="mx-1 mb-1 mt-0.5 border-b border-outline-gray-1" />
      </div>

      <!-- "Archivados": orphans the operator closed-but-kept (no lead/deal worth opening).
        Discreet collapsed toggle; loaded on demand. The thread stays reachable + replyable
        and a NEWER inbound auto-resurfaces it back into "Sin asignar". -->
      <!-- orphans carry no deal/lead/repair status, so a record filter must hide them —
           otherwise "Completado" still shows a wall of Sin-asignar numbers -->
      <div v-if="inboxTab !== 'comments' && inboxTab !== 'aprobar' && inboxTab !== 'snoozed' && !queueTag && !queueFilterCount" class="mb-1.5">
        <button
          class="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5 hover:bg-surface-gray-2"
          :aria-expanded="showArchived"
          @click="toggleArchived"
        >
          <LucideArchive class="h-3 w-3" />
          {{ __('Archivados') }}
          <span v-if="showArchived && visibleArchived.length" class="rounded-full bg-surface-gray-3 px-1.5 text-ink-gray-6">{{ visibleArchived.length }}</span>
          <LucideChevronDown class="ml-auto h-3.5 w-3.5 transition-transform" :class="showArchived ? 'rotate-180' : ''" />
        </button>
        <div v-if="showArchived" class="mt-0.5">
          <div v-if="archived.loading && !visibleArchived.length" class="px-2 py-3 text-center text-[11px] text-ink-gray-4">{{ __('Cargando…') }}</div>
          <div v-else-if="!visibleArchived.length" class="px-2 py-3 text-center text-[11px] text-ink-gray-4">{{ __('Nada archivado') }}</div>
          <button
            v-for="u in visibleArchived"
            :key="'arch:' + orphanKey(u)"
            class="mb-1 block w-full rounded-[11px] p-[11px] text-left opacity-75 hover:bg-surface-gray-2 hover:opacity-100"
            :class="activeUnassigned === (u.last_channel === 'messenger' ? u.psid : u.phone) ? 'bg-surface-gray-2 opacity-100' : ''"
            style="border-left: 3px solid #cbd5e1"
            @click="selectUnassigned(u.last_channel === 'messenger' ? u.psid : u.phone, u.last_channel, true)"
          >
            <div class="mb-1 flex items-center gap-2">
              <span class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-surface-gray-3 text-ink-gray-5">
                <LucideArchive class="h-3.5 w-3.5" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-[13px] font-semibold text-ink-gray-8">
                  {{ u.contact_name || (u.last_channel === 'messenger' ? __('Messenger') + ' ' + (u.psid || '').slice(-6) : formatPhone(u.phone)) }}
                </div>
                <div class="truncate text-[11px] text-ink-gray-5">{{ u.last_channel === 'messenger' ? __('Messenger') : formatPhone(u.phone) }}</div>
              </div>
              <div class="flex-none text-right text-[10px] font-semibold text-ink-gray-4">{{ timeAgo(u.last_message_ts) }}</div>
            </div>
            <div class="flex items-center gap-1.5 text-[11.5px] text-ink-gray-6">
              <span class="inline-flex flex-none items-center font-semibold" :style="`color: ${u.last_channel === 'messenger' ? '#0084ff' : '#25d366'}`">
                {{ u.last_channel === 'messenger' ? 'Msgr' : 'WA' }}
              </span>
              <span class="truncate">{{ u.last_message || '—' }}</span>
            </div>
          </button>
        </div>
        <div class="mx-1 mb-1 mt-0.5 border-b border-outline-gray-1" />
      </div>

      <!-- "Comentarios": comments on our Facebook posts. In the Comentarios TAB the
        status chips (Nuevos/Respondidos/Todos) let you review answered ones too. -->
      <!-- same reason as Sin asignar: a FB comment has no deal/lead/repair status, so
           it must not survive a record filter on the Todos tab -->
      <div v-if="inboxTab === 'comments' || (inboxTab === 'all' && commentGroups.length && !queueFilterCount)" class="mb-1.5">
        <div class="flex items-center gap-1.5 px-1.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-blue-9">
          <LucideFacebook class="h-3 w-3" /> {{ __('Comentarios') }}
          <span class="rounded-full bg-surface-blue-1 px-1.5 text-[10px] text-ink-blue-9">{{ commentGroups.length }}</span>
        </div>
        <!-- status sub-filter — answered comments stay reviewable, never lost -->
        <div v-if="inboxTab === 'comments'" class="mb-1.5 flex gap-1.5 px-1.5">
          <button
            v-for="s in commentStatusChips"
            :key="s.id"
            class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            :class="commentStatus === s.id ? 'bg-surface-blue-2 text-ink-blue-9' : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'"
            :aria-pressed="commentStatus === s.id"
            @click="setCommentStatus(s.id)"
          >
            {{ s.label }}<span v-if="s.count != null" class="ml-1 opacity-70">{{ s.count }}</span>
          </button>
        </div>
        <!-- search by commenter / text -->
        <div v-if="inboxTab === 'comments'" class="mb-1.5 flex items-center gap-2 rounded-[9px] border border-outline-gray-2 px-2.5 py-[6px] focus-within:border-outline-gray-4 focus-within:ring-1 focus-within:ring-outline-gray-3">
          <LucideSearch class="h-3.5 w-3.5 flex-none text-ink-gray-4" />
          <input
            :value="commentSearch"
            :aria-label="__('Buscar comentario o usuario')"
            @input="setCommentSearch($event.target.value)"
            @keydown.esc="clearCommentSearch"
            :placeholder="__('Buscar comentario o usuario…')"
            class="w-full border-0 bg-transparent text-[12px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
          />
          <button
            v-if="commentSearch"
            class="flex h-4 w-4 flex-none items-center justify-center rounded-full text-ink-gray-4 hover:bg-surface-gray-3 hover:text-ink-gray-7"
            :aria-label="__('Limpiar búsqueda')"
            :title="__('Limpiar búsqueda')"
            @click="clearCommentSearch"
          >
            <LucideX class="h-3 w-3" />
          </button>
        </div>
        <div v-if="inboxTab === 'comments' && commentPosts.error && !commentGroups.length" class="px-2 py-6 text-center text-xs text-ink-red-6">
          {{ __('No se pudieron cargar los comentarios.') }}
          <button class="ml-1 font-semibold underline hover:text-ink-red-7" @click="reloadComments">{{ __('Reintentar') }}</button>
        </div>
        <div v-else-if="inboxTab === 'comments' && !commentGroups.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
          {{ commentSearch ? __('Sin resultados') : __('Sin comentarios') }}
        </div>
        <!-- one row per POST (grouped) — opens the post + all its comments -->
        <button
          v-for="g in commentGroups"
          :key="g.post_id || g.latest_name"
          role="option"
          :aria-selected="activeCommentPost === (g.post_id || g.latest_name)"
          :tabindex="rovingKey === commentKey(g) ? 0 : -1"
          class="mb-1 block w-full rounded-[11px] p-[11px] text-left hover:bg-surface-gray-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-blue-4"
          :class="activeCommentPost === (g.post_id || g.latest_name) ? 'bg-surface-blue-1' : ''"
          :style="`border-left:3px solid ${(g.channel === 'IG' ? '#E4405F' : '#1877f2') + (activeCommentPost === (g.post_id || g.latest_name) ? '' : '66')}`"
          @click="selectCommentGroup(g.post_id || g.latest_name)"
        >
          <div class="mb-1 flex items-center gap-2">
            <span
              class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-white"
              :style="g.channel === 'IG' ? 'background: linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' : 'background: #1877f2'"
            >
              <LucideInstagram v-if="g.channel === 'IG'" class="h-3.5 w-3.5" />
              <LucideFacebook v-else class="h-3.5 w-3.5" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-semibold text-ink-gray-9">
                {{ g.channel === 'IG' ? __('Publicación de Instagram') : __('Publicación') }}
              </div>
              <div class="truncate text-[11px] text-ink-gray-5">
                {{ g.count }} {{ g.count === 1 ? __('comentario') : __('comentarios') }}
              </div>
            </div>
            <div class="flex-none text-right text-[10px] font-semibold text-ink-gray-4">{{ timeAgo(g.latest_ts) }}</div>
          </div>
          <div class="flex items-center gap-1.5 text-[11.5px] text-ink-gray-6">
            <span class="inline-flex flex-none items-center font-semibold text-ink-gray-8">{{ g.from_name || g.channel || 'FB' }}:</span>
            <span class="truncate">{{ g.message || '—' }}</span>
            <span v-if="g.lead" class="flex-none rounded px-1 text-[9px] font-semibold text-ink-violet-8 bg-surface-violet-2">{{ __('Lead') }}</span>
          </div>
        </button>
        <div class="mx-1 mb-1 mt-0.5 border-b border-outline-gray-1" />
      </div>

      <!-- "Por aprobar": review-gated auto-acuses (#22) swap the whole list for the
        approval panel — nothing here has been sent to a customer yet. -->
      <AutoAckReview v-if="inboxTab === 'aprobar'" />

      <template v-if="inboxTab !== 'comments' && inboxTab !== 'aprobar'">
      <!-- cold-start skeleton (no cached rows yet) — paints structure instantly -->
      <div v-if="queue.loading && !rows.length && !visibleUnassigned.length" aria-hidden="true" class="pt-0.5">
        <div v-for="i in 7" :key="'skel' + i" class="mb-1 flex items-center gap-2 rounded-[11px] p-[11px]">
          <span class="skel h-[30px] w-[30px] flex-none rounded-full" />
          <div class="min-w-0 flex-1">
            <div class="skel mb-1.5 h-3 rounded" :style="`width:${55 + ((i * 13) % 35)}%`" />
            <div class="skel h-2.5 rounded" :style="`width:${68 - ((i * 9) % 30)}%`" />
          </div>
          <span class="skel h-2.5 w-8 flex-none rounded" />
        </div>
      </div>
      <div v-else-if="listError && !rows.length && !visibleUnassigned.length" class="px-2 py-6 text-center text-xs text-ink-red-6">
        {{ __('No se pudo cargar la bandeja.') }}
        <button class="ml-1 font-semibold underline hover:text-ink-red-7" @click="retryList">{{ __('Reintentar') }}</button>
      </div>
      <div v-else-if="!rows.length && !visibleUnassigned.length" class="px-2 py-6 text-center text-xs text-ink-gray-4">
        {{ __('Sin conversaciones') }}
      </div>
      <div
        v-for="r in rows"
        :key="(r.ref_doctype || 'CRM Deal') + ':' + r.name"
        class="cv-row relative"
      >
      <!-- swipe-left action underlay (mobile, unread rows): «marcar respondido» -->
      <div
        v-if="swipeKey === convKey(r)"
        class="absolute inset-y-0 right-0 mb-1 flex w-[132px] items-center justify-end rounded-r-[11px] bg-surface-green-2 pr-4 text-[11px] font-bold text-ink-green-8"
        aria-hidden="true"
      >
        ✓ {{ __('Respondido') }}
      </div>
      <div
        role="option"
        :aria-selected="activeDeal === r.name && activeDealDoctype === (r.ref_doctype || 'CRM Deal')"
        :tabindex="rovingKey === convKey(r) ? 0 : -1"
        class="mb-1 block w-full cursor-pointer rounded-[11px] p-[11px] text-left hover:bg-surface-gray-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-green-4"
        :class="[
          activeDeal === r.name && activeDealDoctype === (r.ref_doctype || 'CRM Deal') ? 'bg-surface-green-2' : '',
          swipeKey === convKey(r) ? 'bg-surface-base' : '',
        ]"
        :style="
          (activeDeal === r.name && activeDealDoctype === (r.ref_doctype || 'CRM Deal')
            ? 'border-left:3px solid var(--brand);'
            : 'border-left:3px solid transparent;') + rowSwipeStyle(r)
        "
        @click="onRowClick(r)"
        @touchstart="rowTouchStart(r, $event)"
        @touchmove="rowTouchMove(r, $event)"
        @touchend="rowTouchEnd(r)"
        @touchcancel="rowTouchEnd(r, true)"
      >
        <div class="mb-1.5 flex items-center gap-2">
          <span
            class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-xs-semibold"
            :style="`background:${avatarColor(r.contact_name)[0]};color:${avatarColor(r.contact_name)[1]}`"
          >
            {{ initials(r.contact_name) }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13px] font-semibold text-ink-gray-9">
              {{ r.contact_name || r.mobile_no || __('Sin nombre') }}
            </div>
            <div class="truncate text-[11px] text-ink-gray-5">
              {{ r.device || r.mobile_no || '—' }}
            </div>
          </div>
          <div class="flex flex-none flex-col items-end gap-1">
            <div
              class="text-[10px] font-semibold"
              :class="r.sla_overdue ? 'text-ink-red-7' : 'text-ink-gray-4'"
            >
              {{ timeAgo(r.last_message_ts) }}
            </div>
            <!-- red unread dot: there's an inbound message newer than your last
              open. It's a READ marker — clears when you open the conversation,
              independent of the amber "Responder" chip (which clears on reply). -->
            <span
              v-if="r.unread_dot"
              class="h-2.5 w-2.5 rounded-full"
              style="background: #ef4444"
              :aria-label="__('Mensajes sin abrir')"
              :title="__('Mensajes nuevos sin abrir · desaparece al abrir la conversación (no es lo mismo que «Responder»)')"
            />
          </div>
        </div>
        <div class="flex items-center gap-1.5 text-[11.5px] text-ink-gray-6">
          <span
            v-if="r.last_channel"
            class="inline-flex flex-none items-center font-semibold"
            :style="`color:${chColor(r.last_channel)}`"
          >
            {{ chLabel(r.last_channel) }}
          </span>
          <span class="truncate">{{ r.last_message || '—' }}</span>
        </div>
        <div class="mt-[7px] flex flex-wrap gap-1.5">
          <!-- Lead vs Trato (Deal) — leads now share the queue -->
          <span
            v-if="r.ref_doctype === 'CRM Lead'"
            class="rounded px-1.5 py-px text-[9.5px] font-semibold text-ink-violet-8 bg-surface-violet-2"
          >
            {{ __('Lead') }}
          </span>
          <!-- "needs reply": last message was inbound (backend r.unread =
            direction=="in"). Labeled amber chip, distinct from the WhatsApp-green
            channel dot, so it reads as an action ("responder"), not decoration.
            Clears when you reply (last direction flips to outbound), not on open —
            it is not a read receipt. -->
          <span
            v-if="r.unread"
            class="inline-flex items-center gap-0.5 rounded py-px pl-1.5 pr-0.5 text-[9.5px] font-semibold text-ink-amber-7 bg-surface-amber-1"
            :title="__('El cliente escribió por última vez — falta tu respuesta. Desaparece cuando respondes o al completar el trato.')"
          >
            ↩ {{ __('Responder') }}<span v-if="r.waiting_secs != null" class="font-bold opacity-80"> · {{ formatWaiting(r.waiting_secs) }}</span>
            <button
              class="ml-0.5 flex h-3 w-3 items-center justify-center rounded-full leading-none hover:bg-surface-amber-2"
              :aria-label="__('Marcar como respondido')"
              :title="__('Marcar como respondido')"
              @click.stop="clearResponder(r.ref_doctype || 'CRM Deal', r.name)"
            >
              ×
            </button>
          </span>
          <span
            v-if="r.snoozed_until"
            class="rounded bg-surface-violet-2 px-1.5 py-px text-[9.5px] font-semibold text-ink-violet-8"
            :title="__('Pospuesta — reaparece sola')"
          >
            💤 {{ fmtSnooze(r.snoozed_until) }}
          </span>
          <span
            v-for="tg in (r.tags || []).slice(0, 2)"
            :key="tg"
            class="rounded bg-surface-gray-2 px-1.5 py-px text-[9.5px] font-semibold text-ink-gray-6"
          >
            🏷 {{ tg }}
          </span>
          <span
            v-if="r.status"
            class="inline-flex items-center gap-1 rounded bg-surface-gray-2 px-1.5 py-px text-[9.5px] font-semibold text-ink-gray-7"
          >
            <span class="h-1.5 w-1.5 flex-none rounded-full" :style="`background:${statusColor(r.status)}`" />
            {{ r.status }}
          </span>
          <span
            v-if="r.sla_overdue"
            class="rounded px-1.5 py-px text-[9.5px] font-semibold text-ink-red-8 bg-surface-red-1"
          >
            {{ __('SLA vencido') }}
          </span>
          <!-- 💰 outstanding on the deal's invoices (backend sends it only when
               the sales-docs flag is on and the deal owes something) -->
          <span
            v-if="r.saldo"
            class="rounded px-1.5 py-px text-[9.5px] font-semibold text-ink-amber-7 bg-surface-amber-1"
            :title="__('Saldo pendiente en facturas del trato')"
          >
            💰 {{ formatMoney(r.saldo) }}
          </span>
        </div>
      </div>
      </div>
      <!-- infinite-scroll: the observer loads the next page as this nears the viewport -->
      <div v-if="paginatable && queueHasMore" ref="sentinelEl" class="h-px w-full" aria-hidden="true" />
      <div v-if="paginatable && queueLoadingMore" class="px-2 py-3 text-center text-[11px] text-ink-gray-4">
        {{ __('Cargando más…') }}
      </div>
      </template>
    </div>

    <DealModal v-if="showDealModal" v-model="showDealModal" :redirect="{ name: 'Deal 360' }" />
    <GlobalSearch v-if="showGlobalSearch" @open="onGlobalSearchOpen" @close="showGlobalSearch = false" />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import LucideSearch from '~icons/lucide/search'
import LucideX from '~icons/lucide/x'
import LucideMessageCircleQuestion from '~icons/lucide/message-circle-question'
import LucideFacebook from '~icons/lucide/facebook'
import LucideInstagram from '~icons/lucide/instagram'
import LucideArchive from '~icons/lucide/archive'
import LucideChevronDown from '~icons/lucide/chevron-down'
import LucideVolume2 from '~icons/lucide/volume-2'
import LucideVolumeX from '~icons/lucide/volume-x'
import LucideRefreshCw from '~icons/lucide/refresh-cw'
import { statusesStore } from '@/stores/statuses'
import { soundEnabled, toggleSound } from '@/composables/notificationSound'
import { pushState, pushBusy, refreshPushState, enablePush, disablePush } from '@/composables/push'
import { isMobile } from '@/composables/breakpoint'
import { formatMoney } from '@/composables/crmFormat'
import DealModal from '@/components/Modals/DealModal.vue'
import AutoAckReview from '@/components/doco/inbox/AutoAckReview.vue'
import GlobalSearch from '@/components/doco/inbox/GlobalSearch.vue'
import QueueFilters from '@/components/doco/inbox/QueueFilters.vue'
import {
  queue,
  unassigned,
  archived,
  showArchived,
  toggleArchived,
  commentPosts,
  commentCounts,
  channelCounts,
  overdue,
  unattendedTotal,
  autoAckCount,
  queueRows,
  snoozedCount,
  conversationTags,
  queueTag,
  setQueueTag,
  queueFilterCount,
  queueHasMore,
  queueLoadingMore,
  loadMoreQueue,
  messengerEnabled,
  inboxTab,
  commentStatus,
  commentSearch,
  reloadComments,
  setCommentSearch,
  clearCommentSearch,
  queueSearch,
  clearQueueSearch,
  queueCollapsed,
  activeDeal,
  activeDealDoctype,
  activeUnassigned,
  activeUnassignedChannel,
  activeCommentPost,
  selectDeal,
  selectUnassigned,
  selectCommentGroup,
  setInboxTab,
  setCommentStatus,
  onSearchInput,
  reloadQueue,
  reloadUnassigned,
  clearResponder,
  avatarColor,
  initials,
  timeAgo,
  CHANNEL_META,
} from '@/composables/inbox'

const { getDealStatus } = statusesStore()

// the doco DealModal — deal + repair-order intake fields (not the generic doctype
// modal, which only creates a bare deal)
const showDealModal = ref(false)
function newDeal() {
  showDealModal.value = true
}

// 🔍 global message search (spec 2.6+2.7): the modal owns its own state; a row tap
// emits open(reference_doctype, reference_name) → selectDeal (already imported).
const showGlobalSearch = ref(false)
function onGlobalSearchOpen(refDoctype, refName) {
  showGlobalSearch.value = false
  selectDeal(refName, refDoctype || 'CRM Deal')
}

// Vencidos tab swaps the row source to the server-ranked overdue list (most-overdue
// first, across all conversations — an overdue thread buried by recency is the point);
// every other tab shows the normal recency queue.
const rows = computed(() => (inboxTab.value === 'vencidos' ? overdue.data?.conversations || [] : queueRows.value))
// Record filters ride the queue query, so they're offered only on the tabs that
// render that query (Vencidos/Comentarios/Por aprobar have their own endpoints).
const filterableTab = computed(() => ['all', 'whatsapp', 'messenger', 'snoozed'].includes(inboxTab.value))

function fmtSnooze(ts) {
  try {
    return new Date(String(ts).replace(' ', 'T')).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch (e) {
    return ts
  }
}

// ── row swipe (mobile): left-swipe an unread row → «marcar respondido» ─────────
// Follow-finger translate with the green underlay behind; fires clearResponder
// past the threshold. Vertical intent cancels immediately so scrolling never fights.
const swipeKey = ref(null)
const swipeX = ref(0)
let _sw = null
// audit M4: browsers usually suppress the synthesized click after a real swipe
// (tap-slop), but that's convention, not contract — guard it explicitly.
let _swMoved = false
function onRowClick(r) {
  if (_swMoved) {
    _swMoved = false
    return
  }
  selectDeal(r.name, r.ref_doctype || 'CRM Deal')
}
function rowSwipeStyle(r) {
  if (swipeKey.value !== convKey(r)) return ''
  const drag = _sw?.active
  return `transform:translateX(${swipeX.value}px);transition:${drag ? 'none' : 'transform .18s ease'}`
}
function rowTouchStart(r, e) {
  _swMoved = false
  if (!isMobile.value || !r.unread) return
  const t = e.touches[0]
  _sw = { key: convKey(r), x: t.clientX, y: t.clientY, active: false }
}
function rowTouchMove(r, e) {
  if (!_sw) return
  const t = e.touches[0]
  const dx = t.clientX - _sw.x
  const dy = t.clientY - _sw.y
  if (!_sw.active) {
    if (Math.abs(dy) > 14) {
      _sw = null // vertical scroll wins
      return
    }
    if (dx > -14) return // only a left swipe arms
    _sw.active = true
    _swMoved = true // suppress the synthesized click after this gesture (M4)
    swipeKey.value = _sw.key
  }
  e.preventDefault()
  swipeX.value = Math.max(-132, Math.min(0, dx))
}
function rowTouchEnd(r, cancel = false) {
  if (!_sw) return
  const fire = !cancel && _sw.active && swipeX.value <= -96
  _sw = null
  if (fire) {
    try {
      navigator.vibrate?.(15) // tactile confirm (Android; iOS has no vibrate API)
    } catch (e) {}
    clearResponder(r.ref_doctype || 'CRM Deal', r.name)
  }
  swipeX.value = 0 // rowSwipeStyle now has a transition → animates back
  setTimeout(() => {
    swipeKey.value = null
  }, 200)
}

// ── pull-to-refresh (mobile): drag down from the top of the list ──────────────
const ptrY = ref(0)
const ptrRefreshing = ref(false)
let _ptr = null
function ptrStart(e) {
  if (!isMobile.value || ptrRefreshing.value) return
  if ((listEl.value?.scrollTop || 0) > 0) return
  _ptr = { y: e.touches[0].clientY, armed: false }
}
function ptrMove(e) {
  if (!_ptr) return
  const dy = e.touches[0].clientY - _ptr.y
  if (dy < 0 || (listEl.value?.scrollTop || 0) > 0) {
    _ptr = null
    ptrY.value = 0
    return
  }
  if (dy > 8) {
    _ptr.armed = true
    e.preventDefault() // the drag is ours, not the scroller's
    ptrY.value = Math.min(90, dy * 0.5) // rubber-band resistance
  }
}
async function ptrEnd() {
  if (!_ptr) return
  const fire = _ptr.armed && ptrY.value >= 48
  _ptr = null
  ptrY.value = 0
  if (!fire) return
  ptrRefreshing.value = true
  try {
    navigator.vibrate?.(10)
  } catch (e) {}
  try {
    await Promise.all([reloadQueue(), reloadUnassigned()])
  } catch (e) {
    /* network hiccup — the stale list stays, user can pull again */
  }
  ptrRefreshing.value = false
}
// A failed list load must not read as an empty inbox — surface the resource error + retry.
const listError = computed(() => (inboxTab.value === 'vencidos' ? overdue.error : queue.error))
function retryList() {
  if (inboxTab.value === 'vencidos') overdue.fetch()
  else reloadQueue()
}
const unassignedRows = computed(() => unassigned.data || [])
// Server-grouped: one entry per post {post_id, count, latest_ts, from_name, message, lead}.
const commentGroups = computed(() => commentPosts.data || [])

// Orphans visible in the current tab: both on Todos, channel-scoped on WhatsApp/Messenger,
// none on Vencidos (orphans have no record → no response SLA).
// The queue search applies here too (client-side — the orphan list is small and
// already loaded): searching a customer must not leave unrelated pinned orphans
// shouting above the filtered results.
const visibleUnassigned = computed(() => {
  if (inboxTab.value === 'vencidos' || inboxTab.value === 'aprobar') return []
  let rows = unassignedRows.value
  if (inboxTab.value === 'whatsapp') rows = rows.filter((u) => u.last_channel !== 'messenger')
  else if (inboxTab.value === 'messenger') rows = rows.filter((u) => u.last_channel === 'messenger')
  const q = queueSearch.value.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((u) =>
    [u.contact_name, u.phone, u.psid, u.last_message].some((f) => f && String(f).toLowerCase().includes(q)),
  )
})

// Archived orphans, same channel-scoping as the live list.
const archivedRows = computed(() => archived.data || [])
const visibleArchived = computed(() => {
  if (inboxTab.value === 'whatsapp') return archivedRows.value.filter((u) => u.last_channel !== 'messenger')
  if (inboxTab.value === 'messenger') return archivedRows.value.filter((u) => u.last_channel === 'messenger')
  return archivedRows.value
})

// ── a11y: listbox roving tabindex + arrow-key nav (#26) ──────────────────────
// Per-row identity, shared by the v-for, the roving tab stop, and selection detection.
const listEl = ref(null)
function orphanKey(u) {
  return u.last_channel === 'messenger' ? 'm:' + u.psid : 'w:' + u.phone
}
function commentKey(g) {
  return 'c:' + (g.post_id || g.latest_name)
}
function convKey(r) {
  return (r.ref_doctype || 'CRM Deal') + ':' + r.name
}
// The key of the currently-selected row, whatever its kind.
const selectedRowKey = computed(() => {
  if (activeUnassigned.value)
    return (activeUnassignedChannel.value === 'messenger' ? 'm:' : 'w:') + activeUnassigned.value
  if (activeCommentPost.value) return 'c:' + activeCommentPost.value
  if (activeDeal.value) return activeDealDoctype.value + ':' + activeDeal.value
  return null
})
// Keys of the rows actually rendered, in DOM order (orphans → comments → conversations).
const renderedKeys = computed(() => {
  const ks = []
  for (const u of visibleUnassigned.value) ks.push(orphanKey(u))
  const commentsShown = inboxTab.value === 'comments' || (inboxTab.value === 'all' && commentGroups.value.length)
  if (commentsShown) for (const g of commentGroups.value) ks.push(commentKey(g))
  if (inboxTab.value !== 'comments' && inboxTab.value !== 'aprobar') for (const r of rows.value) ks.push(convKey(r))
  return ks
})
// The single tab stop: the selected row when it's on screen, else the first row — so
// Tab always lands on exactly one row and arrows take over from there.
const rovingKey = computed(() => {
  if (selectedRowKey.value && renderedKeys.value.includes(selectedRowKey.value)) return selectedRowKey.value
  return renderedKeys.value[0] || null
})

function onListKeydown(e) {
  // Enter/Space activate the focused option — the main queue row is a <div>
  // (a nested clear-responder button forbids button-in-button, a11y S-4), so
  // activation no longer comes free from a native button.
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.getAttribute('role') === 'option') {
    e.preventDefault()
    document.activeElement.click()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
  const opts = Array.from(listEl.value?.querySelectorAll('[role="option"]') || [])
  if (!opts.length) return
  e.preventDefault()
  const cur = opts.indexOf(document.activeElement)
  let next
  if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = opts.length - 1
  else if (e.key === 'ArrowDown') next = cur < 0 ? 0 : Math.min(cur + 1, opts.length - 1)
  else next = cur < 0 ? 0 : Math.max(cur - 1, 0)
  opts[next]?.focus()
}

// ── infinite-scroll (#28) ────────────────────────────────────────────────────
// Only the recency queue pages (Vencidos = its own ranked list; Comentarios/Por-aprobar
// are separate surfaces). An IntersectionObserver on a bottom sentinel pulls the next
// page as it nears the viewport — no scroll-event polling, no extra dependency.
const sentinelEl = ref(null)
// 'all' + the channel tabs page: the backend applies the channel filter BEFORE the
// page slice (queue.py wa_ts/mm_ts aggregates), so a full page-of-50 ⟺ more exists
// holds per channel too. Vencidos/Comentarios/Por-aprobar are separate surfaces.
const paginatable = computed(() => ['all', 'whatsapp', 'messenger'].includes(inboxTab.value))
let _io = null
// The sentinel is v-if'd (only while more pages exist) — (re)observe as it comes
// and goes. Top-level watch (not inside onMounted) so its disposal on unmount is
// explicit, not reliant on hook-scope binding (audit M3).
const stopSentinelWatch = watch(sentinelEl, (el, old) => {
  if (old) _io?.unobserve(old)
  if (el) _io?.observe(el)
})
onMounted(() => {
  _io = new IntersectionObserver(
    (entries) => {
      if (paginatable.value && entries.some((e) => e.isIntersecting)) loadMoreQueue()
    },
    { root: listEl.value, rootMargin: '300px' },
  )
  if (sentinelEl.value) _io.observe(sentinelEl.value)
})
onBeforeUnmount(() => {
  stopSentinelWatch()
  _io?.disconnect()
})

// ── "/" focuses search (Slack/Gmail convention) ──────────────────────────────
// Global while the inbox is mounted; ignored when the user is already typing
// somewhere (input/textarea/contenteditable) so message drafts keep their "/".
const searchEl = ref(null)
function onGlobalKeydown(e) {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  e.preventDefault()
  searchEl.value?.focus()
}
onMounted(() => document.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown))

// Web Push (desktop surface — same flow as MobileSidebar)
onMounted(refreshPushState)
function togglePush() {
  if (pushState.value === 'on') disablePush()
  else enablePush() // user gesture — permission prompt allowed here
}

// Compact "time waited" for the response-SLA chip: 45s / 12m / 3h / 5d.
function formatWaiting(secs) {
  const s = Number(secs) || 0
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

// Pretty-print a raw WhatsApp number (e.g. 5216691530561 / 526691530561) as
// +52 669 153 0561 — strip the country code + the MX mobile "1", group the rest.
function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  let n = d
  if (n.startsWith('521')) n = n.slice(3)
  else if (n.startsWith('52')) n = n.slice(2)
  if (n.length === 10) return `+52 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  return raw ? `+${d}` : '—'
}

// Omnichannel tabs (Meta-style). Counts are REAL per-channel totals across all
// conversations (api.inbox.get_channel_counts), not the loaded/channel-filtered page —
// otherwise the inactive channel always read 0. Comentarios = new comments.
const inboxTabs = computed(() => [
  { id: 'all', label: __('Todos'), count: channelCounts.data?.all ?? null },
  { id: 'whatsapp', label: 'WhatsApp', dot: CHANNEL_META.whatsapp?.[1] || '#25d366', count: channelCounts.data?.whatsapp ?? null },
  // Messenger tab only when the channel is enabled (Marketing Settings.enable_messenger);
  // a WhatsApp-only tenant shouldn't see a dead Messenger tab.
  ...(messengerEnabled.value ? [{ id: 'messenger', label: 'Messenger', dot: CHANNEL_META.messenger?.[1] || '#0084ff', count: channelCounts.data?.messenger ?? null }] : []),
  { id: 'comments', label: __('Comentarios'), dot: '#1877f2', count: commentCounts.data?.new ?? null },
  { id: 'vencidos', label: __('Vencidos'), dot: '#dc2626', count: overdue.data?.count || null },
  // 💤 Pospuestas: snoozed conversations waiting for their wake time (hidden at 0)
  ...((snoozedCount.data || 0) > 0 ? [{ id: 'snoozed', label: __('Pospuestas'), dot: '#8b5cf6', count: snoozedCount.data }] : []),
  // Por aprobar: review-gated auto-acuses awaiting a human OK. Only shown when the
  // feature has ever drafted something (count > 0) — a clean tenant sees no dead tab.
  ...((autoAckCount.data || 0) > 0 ? [{ id: 'aprobar', label: __('Por aprobar'), dot: 'var(--brand)', count: autoAckCount.data }] : []),
])
// Comentarios status sub-filter chips (review answered comments).
const commentStatusChips = computed(() => [
  { id: 'New', label: __('Nuevos'), count: commentCounts.data?.new },
  { id: 'answered', label: __('Respondidos'), count: commentCounts.data?.answered },
  { id: 'all', label: __('Todos'), count: commentCounts.data?.all },
])

function chColor(key) {
  return CHANNEL_META[key]?.[1] || '#9aa2ae'
}
function chLabel(key) {
  return key === 'whatsapp' ? 'WA' : key === 'messenger' ? 'Msgr' : key === 'instagram' ? 'IG' : CHANNEL_META[key]?.[0] || key
}
// status hue as a small dot only; the label rides a theme-aware ink color so it
// stays readable in dark (the stored status .color can be a dark hex or a color
// name like "black"/"gray" — using it as text rendered black-on-black in dark).
function statusColor(status) {
  return getDealStatus(status)?.color || '#9aa2ae'
}
</script>
