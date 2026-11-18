# Dinero en orden: books that agree with the bank, budgets and plans, for any tenant

Status: program plan, 2026-11-16 (Marco: «my accounts are a mess and have diffs, we need the tooling and
intelligence to fix this, set budgets, plans, all accounting, money related, agent aware, data dense,
empower the user»). Lane 1 (Cuadre) is built in lane `cuadre` (crm + doco). Times are America/Mazatlán.

Every piece is built for any tenant. Nothing names a shop, bank, account or person. Each piece has three
parts: the general code, its setting (if it needs one) in the /crm SPA, and the setup on Marco's shops
(lab first, then a prod kit for his go).

## 1. What the owner needs, and what it costs today

| Job | Today (steps) | Target |
|---|---|---|
| Know the real money in each account | Open each account and subtract the grey «En el banco» line from the book balance by hand (2 taps and a subtraction per account) | Each card says «Cuadra con el banco» or «No cuadra por $X» (0 taps) |
| Know why an account does not agree | Not possible in the app. On doco it took a whole developer session with console kits (Amex 11-11, BBVA 11-12) | «¿Cuadra con el banco?» sheet: the difference split into reasons with amounts (1 tap) |
| Link what is already on both sides | Open each movement, read the suggestion, tap «Conciliar» (3 taps × each movement) | «Revisar y ligar» lists the pairs, one tap links them all (2 taps) |
| Register what the bank has and the books do not | Contador review per movement, or the bot's `banco_por_explicar` | From the sheet: «Ver movimientos» or «Que me ayude el asistente» (1 tap to start) |
| Find book entries the bank never saw | Not possible without the GL | Books view, «Sin banco» filter (1 tap from the sheet) |
| Fix history before the feed (opening balance, missing statements) | Developer console kit | Lane 3 below |
| Budgets | `/crm/gastos/presupuesto` (exists) | Lane 8: fed by explained bank movements |
| Plans (card payments, cash) | `flujo_de_caja` in the bot only | Lanes 7 and 9 |

## 2. What doco's books showed on 2026-11-16 (read-only)

- BBVA Débito: bank $4,663.09, books −$2,082.00 (−$755.00 without an entry dated 11-17). The bank's
  movements in Muelle are a March–April statement, then nothing from 04-19 to 09-01, then the Syncfy feed
  since 09-02. Of the book entries since 09-02, the ones that match a bank movement are mostly POS sales
  paid by transfer and purchase invoices paid from the account. Neither ERPNext's matcher (as crm calls
  it) nor Contador's links those, so they stay «sin conciliar» forever (lane 2).
- BBVA Oro: bank owes $6,647.69; the ledger has no entries at all.
- Amex Platinum: bank owes $103,547.32; books $32,492.00 (12 entries); 361 bank movements, none reconciled.
- Mercado Pago Débito: books −$27,824.49, impossible for a wallet; MercadoPago Clearing holds $43,495.00,
  which should net to zero at each payout. Payouts are not being settled (lane 6).
- Corte de Caja: −$8,516.00 (negative cash).

## 3. Lanes

| # | Lane | What | State |
|---|---|---|---|
| 1 | Cuadre | crm `bancos_cuadre` (pure arithmetic + API), sheet in Bancos, card line, books «Sin banco» filter, bulk «Ligar»; doco `cuadre_cuenta` bot tool, `saldo_cuentas` says what does not agree | in flight (lane `cuadre`) |
| 2 | Ligar ventas y compras | Link a bank movement to a POS Sales Invoice paid into the account or a paid Purchase Invoice. ERPNext's `reconcile_vouchers` takes them; crm `MATCHABLE` and Contador `VOUCHERS` both stop at Payment Entry and Journal Entry | planned (crm + emc) |
| 3 | Saldo inicial y estados que faltan | From the «Antes del …» line: «Ajustar saldo inicial» (a review card that drafts a Journal Entry on the day before the bank's run, against an opening account the owner picks once in settings) and «Subir estado de cuenta» for each empty month (Contador `upload_statement`) | planned |
| 4 | Era de otra cuenta | From a books-only entry: move a payment to the right bank or cash account (cancel and amend, as kit `pagos-bbva-20261112` did by console) as a review card | planned |
| 5 | Cuentas imposibles | A health read over every money account: negative cash or debit balance, clearing accounts that do not net to zero (apps declare them through a `muelle_clearing_accounts` hook: mercadopago_connector, payment_terminals), card ledgers with no entries while the bank says something is owed. Shown in Bancos, Hoy and Avisos; the bot reads it | planned |
| 6 | Mercado Pago | Wallet through Syncfy (one source: `emc.guard_wallet`); catch up the Point payouts so Clearing nets to zero; the app keeps Point | planned (setup + mercadopago_connector) |
| 7 | Plan de pagos de tarjetas | Per card: cut and due dates, how much to pay and when to avoid interest, months-without-interest plans; a calendar row in Hoy and a bot read | planned |
| 8 | Presupuesto con bancos | Budget consumption fed by explained bank movements (`explicar_movimientos` classifications), so the month's budget reflects real spending | planned (extends `doco/books/presupuesto.py`) |
| 9 | Resumen del dinero | Morning digest: what does not agree, what waits to be explained, budgets at risk, card payments due; review-gated sends | planned |

## 3b. Debt first, then three months of expenses (Marco, 2026-11-16)

Marco: «First i need to pay my debt, its higher that my savings, them save 3 months at least of
expenses». Then: budgets, savings, «donde va cada dinero», and what happens «cuando se llega a
las metas». The order below follows his: debt, then the cushion, then everything else.

What doco shows today (read-only, 11-16 09:37):
- The connected cards owe $110,195 (Amex $103,547, BBVA Oro $6,648).
- BBVA Débito holds $4,663. The Mercado Pago wallet and the cash boxes aren't connected, and their
  book balances can't be trusted until Cuadre lanes 2–4 are done.
- No Presupuesto is set yet.
- Monthly expenses are unknown: most bank movements are still unexplained. «Three months of
  expenses» needs the categories (D3) first.

| Job (the owner's words) | Today | Target |
|---|---|---|
| «¿Cuánto debo y a quién?» | Read each card in Bancos | One «Deudas» list: what each card or loan owes (the bank's figure), rate, minimum, cut and due day |
| «¿En cuánto tiempo la pago si abono X?» | A spreadsheet by hand | A payoff plan: monthly amount → payoff date per card, the interest paid and saved, highest rate first by default (or smallest first, the owner chooses) |
| «Pagar la tarjeta» | A transfer in the bank app, then a journal entry by hand | The transfer from the bank movement is recognised as a card payment (Registrar traspaso), and counts toward the plan |
| «¿A dónde se va el dinero?» | Not possible; most movements unexplained | Every peso out in a category (fixed costs, inventory, payroll, debt interest, debt principal, taxes, personal withdrawals), month by month, business vs personal |
| «Un colchón de 3 meses» | Nothing | A savings goal of N months (default 3) of essential expenses, from the categories, with the accounts the owner marks as savings and a monthly contribution |
| «Cuando se llega a la meta» | Nothing | A card at zero: a notice, and its payment rolls to the next card. Each month of cushion reached: a notice. Last goal reached: the plan proposes the next one, never moves money by itself |

Lanes (in this order):

| # | Lane | What | Builds on |
|---|---|---|---|
| D1 | Deudas | Settings per card or loan (rate as CAT, minimum, cut day, due day, months-without-interest plans) on its Bank Account; a «Deudas» view in Bancos: owed (bank figure), next payment, interest last month; bot read `deudas` | Cuadre's bank figure, Syncfy |
| D2 | Plan de pago | Monthly amount → schedule per card (avalanche default, snowball option), payoff dates, interest saved; a card payment found in the bank counts toward the plan; bot «¿cuándo termino si abono X?» | D1, Hojas forecasts (§9 of docs/HOJAS.md) |
| D3 | ¿A dónde va el dinero? | Categories on accounts (fixed, variable, inventory, payroll, debt, taxes, personal), a monthly view and trend, business vs personal; fed by explained bank movements (`explicar_movimientos`) and expenses | Cuadre lanes 2–4, Presupuesto |
| D4 | Colchón | Savings goal in months of essential expenses (from D3), savings accounts marked, progress and monthly contribution; Presupuesto gains kinds «Deuda» and «Ahorro» so the month's plan reads: fixed costs → card minimums → extra to the priority card → cushion → inventory → withdrawals | D3, Presupuesto |
| D5 | Metas de dinero | Goals reached (a card at zero, each month of cushion): notice in chat and bell, the payment rolls to the next goal, a proposal for the next one; money never moves by itself; the morning money brief (§3 lane 9) carries progress | Presupuesto alerts, lane 9 |

State on 2026-11-17: D1–D3 landed (not deployed); D4 built in lane `colchon`. D4 reads the month's
plan from «Plan de Dinero» (the debt's and the cushion's monthly amounts) and this month's Presupuesto
(goods) instead of adding «Deuda» and «Ahorro» kinds to Presupuesto: each amount has one home, and the
budget keeps measuring purchases, expenses and sales.

Settings: each card's rate, minimum and days; the payoff order; the cushion's months (default 3)
and which accounts count as savings; category per account. All per tenant; the bot can fill them
from a statement the owner shares.

Setup on Marco's shops: enter the rate (CAT), minimum, cut and due day for Amex, BBVA Oro, Ualá,
Nu and Mercado Pago credit (from their statements); connect the Mercado Pago wallet; mark which
accounts are savings. Until Cuadre's lanes 2–4 explain the bank movements, D3's expense figure
will run low.

## 3c. For every tenant, not only Marco (Marco, 2026-11-16: «for me and my tenants, so make it great»)

The same plan serves a phone repair shop in Culiacán, a clinic, a real-estate office and Marco.
What makes it work for all of them:

- **Two books, one plan.** A business's debts, budget and cushion live in its company. The
  owner's own (a personal card, a car loan) live in their Libro Personal (doco
  `books/personal_book.py`: a separate company only its holder reads). «Mi dinero» shows both,
  each labelled; the business's numbers never include the personal ones. Where there is no
  personal book, the plan is the business's only, and «Separar lo personal» offers to make one.
- **Who sees what.** The business plan follows the Accounts roles; the personal one only its
  holder (the existing fence). Workers never see the owner's debt or cushion. The team's goals
  (doco `metas`, Equipo › Metas) are a different thing and stay there.
- **Any bank, any country.**
  - A connected bank (Syncfy, Muelle's account) gives the balance by itself. Without one, a
    statement photo or PDF, or a number typed in, does.
  - Labels come from the country: «CAT» in Mexico, «tasa anual» elsewhere.
  - Amounts are in the book's currency.
- **Ready in a few taps («Pon en orden tu dinero»).**
  1. The cards and loans Muelle already sees are listed. The owner adds the rest, or shares a
     statement and the assistant fills rate, minimum, cut day and due day.
  2. The order: highest rate first (recommended, with the interest it saves next to it) or
     smallest first.
  3. How much goes to debt each month: suggested from last months' income minus fixed costs.
  4. The cushion: 3 months by default.
- **Safe by default.** Nothing moves money. Notices go to the owner only, in chat and the bell.
  Every number says where it comes from (the bank, the books, typed).
- **The assistant is a full door** (Bots: one door). Tools `deudas`, `plan_de_pago`,
  `a_donde_va`, `colchon` (reads) and `fijar_deuda`, `fijar_plan` (cards for the owner to
  confirm), with worked examples and the playbook `money-plan.md`: «¿cuándo termino de pagar si
  abono 15 mil?», «¿puedo retirar 10 mil este mes?», «¿en qué se me fue el dinero en octubre?».
- **Numbers the owner keeps:** the debt-free date, the interest saved against paying minimums,
  months of cushion, and where each peso of income went (percent per category).

## 3d. Por explicar: the books catch up with the bank, and Muelle asks for cash (Marco, 2026-11-17)

Marco: «lets reconcile and make better tooling and make the system bug me for expenses, now with
syncfy it would be way easier, i just need to register cash». On doco the books said the house safe
held $125,556; it held $11,000. The shop's cash bags reached the safe in the books, but what left it
never did: 17 cash deposits at BBVA since 09-01 ($134,950) and the owner's cash spending (food,
travel, parts, payroll, a remodel). Since 08-01 Syncfy brought 53 BBVA withdrawals ($150.5k) and
150 Amex charges ($157.6k) that nobody explained.

| Job | Today (steps) | Target |
|---|---|---|
| Say what a card or bank charge was | Contador › Bancos: open the month, the movement, pick the use, the expense account, prepare the draft, register it (≈6 taps each; 220 waiting ≈ 1,300 taps). Not in the SPA; elsewhere only the Desk | Bancos › Por explicar: grouped by merchant with the answer suggested; «Sí, es eso» books the whole group (1 tap per merchant). The next charges of that merchant arrive with the same answer suggested |
| A card paid from the bank | Two movements to explain by hand, one per account | Seen as one pair (same amount, leaving one own account and arriving at another within 5 days): one tap books both with one entry |
| Cash taken to the bank | Not possible without the Desk | Suggested «Entre mis cuentas» from the off-site cash account of the safes (posawesome `POS Cash Safe.offsite_cash_account`) |
| Register cash spent | Gastos takes supplier bills; a cash expense without a bill needs the Desk or the books bot | Lane 2: «Gasté en efectivo» (amount, what, done: 3 taps) |
| Know the safe is right | Nobody counts it; the books drifted $114k | Lane 2: «Cuenta tu caja fuerte»: the count, the difference, «¿en qué se fue?» |
| Be reminded | Nothing reminds | Lane 2: an evening notice to the owner (bell and chat): «12 movimientos por explicar · $3,000 de efectivo sin explicar» → the page |

Lane 1 `por-explicar` (doco + crm): pure `books/explicar.py` (groups, pairs, the guess from how the
same merchant was explained before, the journal lines); `books/por_explicar.py` books one submitted
Journal Entry per movement (one per pair) with the person's rights and links it through the site's
engine: Contador's classify + audited link where it owns bank review, ERPNext's
`reconcile_vouchers` elsewhere; a refused movement rolls back alone; «Deshacer» unlinks and cancels.
Answers: gasto (expense account), personal (equity: the owner's account), traspaso (an own bank,
cash or card account, or one already used that way, e.g. a deferred-purchase plan), ingreso. No new
doctype and no setting: the memory is the books themselves. Page `/bancos/por-explicar` (in the
«Tu dinero» route); the Bancos chip «N movimientos por explicar» and a Tu dinero row open it.

Lane 2 `efectivo` (doco + crm): «Tu efectivo» on the same page (each cash account, its book
balance, the last count), «Gasté en efectivo» (amount, what, which cash, today or yesterday: one
entry) and «Contar caja» (the difference booked with the person's answer, so the books say what is
there); the daily reminder (doco `books/recordatorio.py`, hourly, once a day from the owner's hour:
the movements still unexplained and the cash not counted in N days, in the owners' chat and the
bell) and Hoy's «Por explicar» card. Settings in «Plan de Dinero» (on by default, 20 h, count every
7 days), set from the bell in the page's bar. The money pages now follow «Ve el dinero del
negocio» (a person the owner keeps the money from gets none of them). Transfers may go to a
liability, so a card's deferred-purchase plan («Meses en automático») has a home.

Lane 3 `ya-registrado` (doco + crm), Marco 2026-11-17: «make sure if i send the expense and
ticket/factura/transferencia it picks it up and handles it accordingly, the accounts reconcile with
syncfy and other input methods». Every way money reaches the books (a chat or Desk capture, Gastos'
«Pagar», the till's sales, an entry typed by hand) now meets the bank movement before anything is
booked:
- «Ya están en tus libros»: a movement whose entry is already on its ledger and linked to no
  movement (crm Cuadre's `unlinked_entries`, same amount, at most 7 days apart, closest first) leaves
  the merchant groups; «Ligar los N» links them through the site's engine (Cuadre's `ligar`).
  Sales and purchases the engine cannot link yet show «no lo registres otra vez» (lane 2 above).
- «Facturas por pagar»: a charge for exactly what an open supplier invoice still owes (or a deposit
  for a customer's), the invoice dated up to 90 days before or 3 after: «Registrar los N pagos»
  makes the payment from that account (crm `crear_pago` + `confirmar_pago`) and links it. A
  factura sent by chat is that open invoice until its charge arrives.
- One view (`por_explicar.vista`) feeds the page, the reminder («N ya están en tus libros o pagan
  una factura: un toque los liga») and Hoy. Undo unlinks, and cancels the payments it made.

Etiquetas (same lane; Marco: «add other good tags for a business erp and my context … so the agents
organize the shop better»): a tag says what the money was for (the account says what it was): a part
of the business, a project or the owner's own. Doctype «Etiqueta de Dinero» (kind, the words that
suggest it); the entries carry the native Frappe tag (Tag Link), so Desk filters and reports read it.
Suggested per group from the merchant's past tags on that account, then from the words; the explain
sheet and «Gasté en efectivo» take tags (a new one typed joins the catalog); the tag icon in Por
explicar lists them and offers a starter set from the tenant's own records (its stores or till
profiles, Taller where the repair module is, Recargas where Saldo is, Remodelación, Equipo y
mobiliario, Publicidad, Vehículo, Viajes de trabajo, Casa). The assistant reads `para_que_fue_el_dinero`
(«¿cuánto llevo en la remodelación?»). Marco's own set with words from his charges is a kit:
`~/muelle-releases/etiquetas-doco-20261117/`.

Lane 4 `ligar-capturas` (Marco 2026-11-18: «go do them all»): a document meets its movement.
«Adjuntar ticket o factura» (the paperclip on a movement in Por explicar) sends the file through the
ONE capture engine with the movement it explains (Captura Contable `intent_bank_transaction`): the
draft pays from that movement's account (a factura stays an open invoice), and when its entry is
submitted doco `books/ligar_aviso.py` links it (a factura: the payment from that account, linked).
A capture sent by chat whose entry is submitted, or a new bank movement whose capture is already
booked, gets a card in the owner's chat only when exactly one movement fits («Este documento parece
ser el cargo PETROPLAZAS por $479.80 del jue 6 nov en Amex Platinum. ¿Lo ligo?»: «Sí, lígalo» /
«No, ese no»; system cards in books/action_cards, 3 days to answer). Anything else waits in Por
explicar.

Next: ¿A dónde va? by tag from a movement (the capture runs with the movement as
context, so its entry lands on the right account); the chat answers a confirmed capture with the
movement it matches; the bot reads `por_explicar` on every site (today `banco_por_explicar` needs
Contador). Setup on Marco's shops after the roll: explain the backlog
since 08-01 on doco prod with the page (his taps), count the safe, then let the reminder run.

## 3e. «¿Ya llegó?»: a customer's transfer, checked with Banxico (Marco, 2026-11-17)

Marco: «each time i get a spei transfer employees tell me about it and ask for confirmation».
Today the cashier messages the owner, the owner opens the bank app, looks, and answers: two
people and about five steps per transfer, the sale waiting, and a doctored receipt passes a glance.
RO-00706's $500 transfer was recorded nowhere.

| Job | Today (steps) | Target |
|---|---|---|
| Know a transfer arrived before handing over | Message the owner, wait, the owner checks the bank app (2 people, ≈5 steps, minutes) | Register: photo of the receipt (or its tracking key and bank), Banxico answers in seconds (1 person, 1 to 3 taps) |
| A fake or wrong receipt | Caught only if the owner looks closely | «No coincide» (sent to another account) or «No aparece» after 30 minutes, with the owner told in the bell |
| The same receipt shown twice | Nothing stops it | One tracking key pays one sale: the second sale is refused |
| BBVA to BBVA (not SPEI) | Same as above | Syncfy is asked for the account's movements at once; the deposit settles the check |
| A deposit nobody charged | Found weeks later, if ever | Bancos › Transferencias «Sin venta»: each incoming SPEI with the payer's name, from Banxico |

How it works (doco `docoutils/spei/`, endpoints `doco.workspaces.transferencias`):
- Banxico's CEP (`cep.py`) is asked the way its public form asks: date, tracking key (or the 7-digit
  numeric reference), both banks, the shop's CLABE and the amount. Proven 2026-11-17 on two real
  incoming transfers into doco's BBVA débito; no captcha (Banxico's `overrideCaptcha` is read every
  day and the check falls back to the bank when it turns on). Banxico answers about ten queries in a
  burst and then refuses for some 20 seconds per address, so the bench keeps a shared budget
  (20 a minute, bank movements last) and pauses every site after a refusal.
- A check («Transferencia Recibida») is a state machine (`estado.py`): Buscando → Llegó, No
  coincide (another account or amount), No aparece (30 minutes; the owner is told; it keeps looking
  every hour for 72 hours and a late arrival tells the owner too). Banxico is asked at 0, 8, 16, 25…
  seconds while the customer waits. The owner may confirm by hand, retry or discard.
- The receiving account is any company Bank Account with a valid CLABE (its CLABE field, or an
  18-digit account number); a register method maps to it through its Mode of Payment's account.
- A bank deposit (`Bank Transaction` on submit) settles the check it fits: BBVA's «SPEI RECIBIDO…
  / folio, sender bank, reference» line by reference, otherwise one amount within the dates. An
  incoming SPEI no one checked is read at Banxico (payer, RFC, account, tracking key) and kept as an
  arrived check «Sin venta»; the payer's name also goes on the movement for reconciliation.
- A register sale names its checks (`doco_transferencias` on Sales Invoice and POS Invoice); the
  sale's submit refuses a check that pays another sale; cancelling the sale frees it. A Payment
  Entry is linked after the charge and keeps the tracking key in `posa_bank_reference`.
- Books' captured receipts use the same client (EMC's `fiscal/banking/cep.py` is no longer read);
  a masked account resolves to the one CLABE Muelle already keeps that fits it.

Screens: the register's «¿Ya llegó la transferencia?» panel under the tenders (posawesome
`CobroTransferCheck.vue`; its reason joins the one charge rule) and, at the corte, «Banxico confirmó
$X (n)» under each transfer method with «Usar» to count it; crm Bancos › Transferencias
(`/bancos/transferencias`, in the Tu dinero route) with the period's totals, views, the list as a
table on desktop, a check's detail with the sale it paid or the ones it could, and the settings;
«Revisar una transferencia» in the ⌘K palette (`?revisar=1`); Hoy's «Transferencias» card when one
waits, did not arrive or has no sale. Who the owner keeps the money from sees only the checks they
made. A shop with no bank account adds the one customers pay into from the settings (name and
CLABE: the ledger, the Bank Account, and the register's bank methods that pay nowhere yet).

## 4. Settings and the owner's switches

- Cuadre needs no setting: it reads Bancos' own permissions. «Ligar» follows the reconciliation engine
  of the site (Contador's audited service where it owns reconciliation, ERPNext's tool elsewhere).
- The bot's write tools (`conciliar`, `explicar_movimientos`, `registrar_conocidos`) stay off by default
  (DD17). The owner switches them on in «Herramientas del asistente».
- Lane 3 adds one setting: the opening-balance account, chosen once.
- «Ajustes de Transferencias» (§3e), on by default: check transfers; if one has not arrived when
  the register charges, «Cobrar y avisarme» (default) or «Esperar a que llegue»; tell the owner
  when one does not arrive. The CLABE of each receiving account is added in the same sheet.

## 5. Setup on Marco's shops (each prod step is a kit for his go)

1. Lab: prove lane 1 on doco-mirror (it is quarantined since 11-15; `lab recover` first).
2. doco prod, after the roll that carries lane 1: open each bank card, read its Cuadre, link the pairs.
3. Decisions for Marco: the opening balance of BBVA Débito, BBVA Oro and Amex, and its counter-account
   (the Amex plan in `~/muelle-releases/amex-books-20261111/README.md` already waits on the same answer);
   upload BBVA Débito statements for May–August 2026; connect the Mercado Pago wallet through Syncfy.
4. Switch on the bot's bank write tools on doco if he wants the assistant to do the linking.
5. «¿Ya llegó?» (§3e) on doco after the roll: nothing to set. BBVA Débito already carries its
   CLABE and «Wire Transfer» and «Transferencia SPEI» pay into it, so the register asks for the
   receipt on those tenders. Kit `~/muelle-releases/ya-llego-20261117/` reads the setup back.

## 6. Manuals

Marco, 2026-11-16: every app gets its manual as part of the SaaS: picture guides and PDFs in easy words,
starting from what the worker needs and adding complexity step by step, for each audience (Muelle's own
team, its staff, tenants, shop employees). Lane work loses knowledge (architecture, why, what is done,
what is next). The guides program (`~/muelle-host/guias-program`) already sets the guide standard and
pipeline; the manuals sessions extend it once the screens of these lanes are in, and the Cuadre sheet is
one of its first guides («¿Por qué no me cuadra el banco?»).

## Sources

- crm `crm/bancos_cuadre.py`, `crm/api/bancos_cuadre.py`, `frontend/src/components/bancos/CuadreSheet.vue`
- doco `doco/docoutils/assistant/herramientas/bancos.py` (`cuadre_cuenta`)
- Prod reads through the read-only doco MCP, 2026-11-16 12:30–13:10
