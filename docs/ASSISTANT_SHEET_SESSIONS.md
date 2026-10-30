# «Pregúntale a Muelle»: sessions, agenda, autocomplete and the Lienzo (S40a)

Lane `bot-sessions-s40-20261029` (crm) with `bot-sessions-s40-doco-20261029` (doco), 2026-10-29;
not deployed. Program: `~/muelle-host/asistente-program/briefs/S40-bot-as-worker-program.md`.
Code: `frontend/src/components/assistant/`, server `doco.docoutils.assistant.shell_api`.

Marco, 2026-10-29: «the bot is lacking a better session management, /clear is kinda slow and buggy,
we need workspaces sessions timers snooze reminders task linking […] one click settle, better
integration with its workspace for html graphs and stuff, autocomplete on / cmds @ other user».

## Worker chain

1. The sheet's header holds one island of four: **Agenda**, **Abierto**, **Conversaciones** and
   **Nueva conversación** (the island rule: two to four). Agenda and Abierto carry a count.
2. **Nueva conversación = Liquidar.** One tap empties the chat at once, closes the conversation
   into «Conversaciones», archives finished conversations older than 7 days (pinned ones stay),
   and leaves one line: «Liquidado. Archivé 2 conversaciones terminadas. Sigue abierto: 1 cambio
   esperando tu sí, 3 encargos en la agenda (1 hoy).» «Deshacer» brings the archived ones back and
   continues the closed one (`conversation_continue`: the generation contract never makes an old
   stretch current again). A second tap finds nothing to close or archive.
3. **Agenda.** The person's encargos (`shell_api.encargos`): Hoy (overdue too, its time in red),
   Próximos, Esperando. Each row: title, when (the server's es-MX words), «cada semana» when it
   repeats, and the record it is about (its shell screen when it has one, else the Desk form).
   Actions: «Hecho», «Posponer» (En 1 hora, Mañana 9:00, Lunes 9:00, or a time), and the bin,
   which turns into «Cancelarlo» in place. A timer is an encargo at a time, a reminder the same
   with a «recuérdame», a snooze is «Posponer».
4. **Composer.** «/» as the first word lists doco's command registry (`assistant/comandos.py`
   through `shell_api.autocompletar(q, 'comando')`); «@» after a space lists coworkers
   (`autocompletar(q, 'persona')`) and inserts `@Nombre Apellido`. ↑/↓ move, Enter or Tab picks,
   Esc closes the list (not the sheet), a tap picks on a phone. A `client` command runs in the
   sheet (`/nueva`, `/abierto`, `/sesiones`, `/lienzo`); a `say` command sends its text; one with
   a template stays in the composer and goes out expanded («/recuerdame mañana a las 9 …» →
   «Recuérdame mañana a las 9 …», as `comandos.expand`). A typed command is looked up when sent.
5. **Lienzo.** A file or chart the turn writes to the Lienzo (`canvas.py`; html, png, jpg, pdf)
   shows under the answer it came with, with «Descargar» and «Abrir en Lienzo»; the Lienzo view
   lists every file and opens one in the same viewer.

## Contract

- **Reset without a turn.** `shell_api.new_conversation` and `shell_api.liquidar` call
  `books.context.clear_chat` directly (conversations.close records the stretch, the epoch moves,
  `doco_assistant_reset` goes out after commit) instead of queueing «/clear» behind the running
  turn. The conductor queue is kept: a message sent before the reset is still answered, in the
  conversation it was asked in (doco's `turn_at` fence: no live event, left out of the live
  history, shown in that earlier conversation; a reload, another tab and the phone agree).
- **No stale message.** `useAssistant.retireConversation` empties the log before the call returns
  and retires the old conversation's client ids and message ids: the old turn's reply, its edits
  and its typing are dropped; a history read that started before the reset is discarded; our own
  reset's echo (same cutoff) changes nothing, another tab's reset empties the log. A refused reset
  puts the conversation back (`restoreConversation`).
- **Lienzo safety (Session 12 rules).** Model HTML never enters the page: an `<iframe sandbox="">`
  (no scripts, no same-origin) loads `canvas.preview`, which sends `Content-Security-Policy:
  default-src 'none'; img-src data:; style-src 'unsafe-inline'`. Live, the `doco_assistant_canvas`
  event (published when the turn commits, so usually after its answer) puts the file under the
  answer on screen, or under the one still to come while the turn runs; after a reload a file goes
  under the answer of the turn it was written in (the first answer after the person's last
  message before it).
- **Older servers.** No `liquidar`: the plain reset. No `encargos`: the Agenda button goes away.
  No Lienzo: no inline files.

Tests: `tests/unit/assistantSessions.test.js`, `assistantAgenda.test.js`,
`assistantAutocomplete.test.js`, `assistantCanvas.test.js`; doco
`assistant/test_shell_api.py`. Lease proof and shots:
`~/muelle-host/asistente-program/evidence/S40a/`.
