// Each custody step the shell offers, as the sheet that asks for it (Shell-S14).
// A step = { sheet: 'conteo' | 'paso', props for that sheet, submit(values) }.
// submit sends one instruction (oneInstruction keeps its request ID across a
// retry) and rethrows the server's sentence, never a traceback.
import {
  assignRequest,
  authorizePosting,
  cancelTransfer,
  custody,
  declineRequest,
  dispatchTransfer,
  errorText,
  fromMinor,
  fundSources,
  money,
  oneInstruction,
  prepareTransfer,
  uploadPhoto,
  who,
} from './efectivo'

function guarded(fn) {
  const one = oneInstruction()
  return async (values) => {
    try {
      return await one.send((id) => fn(values, id))
    } catch (error) {
      throw new Error(errorText(error), { cause: error })
    }
  }
}

async function attach(name, photo) {
  if (!photo || !name) return null
  // The bag is sealed either way; a photo that fails is added again from the bag.
  return uploadPhoto('POS Cash Bag', name, photo).catch(() => null)
}

export function sealBag(safe) {
  return {
    sheet: 'conteo',
    props: {
      mode: 'prepare',
      title: 'Sellar una bolsa',
      subtitle: safe.title,
      currency: safe.currency,
      custody: `Sale del efectivo suelto de ${safe.title}. Queda sellada en la caja fuerte a tu cargo hasta que otra persona la cuente.`,
      confirmLabel: 'Sellar bolsa',
    },
    submit: guarded(async (v, id) => {
      const result = await custody(
        'prepare',
        safe,
        {
          count: v.count,
          seal: v.seal || undefined,
          purpose: v.purpose,
          note: v.note,
        },
        id,
      )
      await attach(result?.bag, v.photo)
      return { ...result, toast: `Bolsa ${result?.seal || ''} sellada` }
    }),
  }
}

export function verifyBag(bag, safe, people) {
  return {
    sheet: 'conteo',
    props: {
      mode: 'verify',
      title: `Contar la bolsa ${bag.seal}`,
      subtitle: 'Cuenta sin ver lo que dice la etiqueta',
      currency: safe.currency,
      custody: `La selló ${who(bag.prepared_by, people)}. Si tu conteo cuadra queda verificada en la caja fuerte; si no, queda con diferencia para que la revise otra persona.`,
      confirmLabel: 'Guardar conteo',
    },
    submit: guarded(async (v, id) => {
      const result = await custody(
        'verify',
        safe,
        { bag: bag.name, count: v.count, note: v.note },
        id,
      )
      await attach(bag.name, v.photo)
      return {
        ...result,
        toast:
          result?.state === 'Disputed'
            ? 'No cuadró: la bolsa queda con diferencia'
            : 'Bolsa verificada',
      }
    }),
  }
}

export function countSafe(safe) {
  return {
    sheet: 'conteo',
    props: {
      mode: 'count_safe',
      title: 'Contar la caja fuerte',
      subtitle: safe.title,
      currency: safe.currency,
      custody:
        'Cuenta todo el efectivo de la caja fuerte, también el de las bolsas selladas. El dinero en el banco no cuenta.',
      confirmLabel: 'Guardar arqueo',
    },
    submit: guarded(async (v, id) => {
      const result = await custody(
        'count_safe',
        safe,
        { count: v.count, note: v.note },
        id,
      )
      return {
        ...result,
        toast:
          result?.state === 'Exception'
            ? 'No cuadró: el arqueo queda para revisión'
            : 'Arqueo guardado: cuadra',
      }
    }),
  }
}

export function dispatchBag(bag, safe, people, me) {
  return {
    sheet: 'paso',
    props: {
      title: `Llevar ${bag.seal} al banco`,
      amount: bag.amount,
      currency: safe.currency,
      custody: `Sale de la caja fuerte contigo (${who(me, people)}). Hasta que registren la ficha del banco, la bolsa está a tu cargo.`,
      fields: [
        {
          key: 'note',
          label: 'A qué banco y quién la lleva',
          kind: 'reason',
          placeholder: 'BBVA sucursal centro, la lleva Karla',
        },
      ],
      confirmLabel: 'Salgo al banco',
    },
    submit: guarded(async (v, id) => ({
      ...(await custody('dispatch', safe, { bag: bag.name, note: v.note }, id)),
      toast: 'Bolsa en camino al banco',
    })),
  }
}

export function confirmDeposit(bag, safe, people) {
  return {
    sheet: 'paso',
    props: {
      title: `Depósito de ${bag.seal}`,
      amount: bag.amount,
      currency: safe.currency,
      custody: `La lleva ${who(bag.holder?.user || bag.dispatched_by, people) || 'quien salió al banco'}; con la ficha queda en el banco y sale de su cargo.`,
      fields: [
        {
          key: 'reference',
          label: 'Número de la ficha de depósito',
          kind: 'text',
          placeholder: 'Folio o referencia del banco',
        },
      ],
      confirmLabel: 'Registrar depósito',
    },
    submit: guarded(async (v, id) => ({
      ...(await custody(
        'confirm_bank',
        safe,
        { bag: bag.name, reference: v.reference },
        id,
      )),
      toast: 'Depósito registrado',
    })),
  }
}

export function returnFromBank(bag, safe, people) {
  return {
    sheet: 'paso',
    props: {
      title: `${bag.seal} regresó sin depositar`,
      amount: bag.amount,
      currency: safe.currency,
      custody: `Vuelve a la caja fuerte desde ${who(bag.holder?.user || bag.dispatched_by, people) || 'quien la llevó'}. Otra persona la cuenta de nuevo antes de volver a salir.`,
      fields: [
        { key: 'note', label: 'Por qué no se depositó', kind: 'reason' },
      ],
      confirmLabel: 'Regresa a la caja fuerte',
    },
    submit: guarded(async (v, id) => ({
      ...(await custody(
        'return_bank',
        safe,
        { bag: bag.name, note: v.note },
        id,
      )),
      toast: 'Bolsa de vuelta en la caja fuerte',
    })),
  }
}

export function unpackBag(bag, safe) {
  return {
    sheet: 'paso',
    props: {
      title: `Abrir ${bag.seal}`,
      amount: bag.amount,
      currency: safe.currency,
      custody:
        'El efectivo vuelve a estar suelto en la caja fuerte y la bolsa se cierra.',
      fields: [{ key: 'note', label: 'Por qué se abre', kind: 'reason' }],
      confirmLabel: 'Abrir la bolsa',
      danger: true,
    },
    submit: guarded(async (v, id) => ({
      ...(await custody('unpack', safe, { bag: bag.name, note: v.note }, id)),
      toast: 'Bolsa abierta',
    })),
  }
}

/**
 * The whole bag, sealed and unopened, leaves the store for the safe's off-site
 * ledger (the owner's or the head office's cash). Nothing is counted here: the
 * amount and the destination are the server's, and an unverified bag leaves
 * still marked unverified.
 */
export function sendOffsite(bag, safe, people) {
  const destination = safe.offsite || 'el efectivo fuera de la tienda'
  const unverified = !bag.verified_by
  return {
    sheet: 'paso',
    props: {
      title: `Sacar ${bag.seal} de la tienda`,
      amount: bag.amount,
      currency: safe.currency,
      custody: `Sale completa de la caja fuerte a ${destination}. Deja de estar a cargo de la tienda.`,
      message: unverified
        ? `Nadie la ha verificado: sale solo con el conteo de ${who(bag.prepared_by, people)} y sigue marcada sin verificar.`
        : `La verificó ${who(bag.verified_by, people)}.`,
      guard: safe.can?.transfer_safe ? '' : safe.transfer_blocker || '',
      fields: [
        {
          key: 'note',
          label: 'Quién se la lleva y a dónde',
          kind: 'reason',
          placeholder: 'Se la lleva el dueño a la matriz',
        },
        {
          key: 'confirmed',
          label: `La bolsa completa, sellada y sin abrir, ya salió hacia ${destination}.`,
          kind: 'confirm',
        },
      ],
      confirmLabel: 'Sacar de la tienda',
    },
    submit: guarded(async (v, id) => ({
      ...(await custody(
        'transfer_safe',
        safe,
        { bag: bag.name, note: v.note },
        id,
      )),
      toast: 'La bolsa salió de la tienda',
    })),
  }
}

/**
 * Outside money into the safe: the owner's cash, a bank withdrawal, a loan or
 * a capital contribution. Counted by face like every cash that moves; the
 * source account is the server's list, revalidated on the write.
 */
export function fundSafe(safe) {
  return {
    sheet: 'conteo',
    props: {
      mode: 'fund',
      title: 'Ingresar efectivo',
      subtitle: safe.title,
      currency: safe.currency,
      custody: `Entra suelto a ${safe.title}, a tu cargo. Cuenta lo que metes; el sistema registra de dónde viene.`,
      confirmLabel: 'Ingresar',
      fetchSources: async () => {
        try {
          return await fundSources(safe)
        } catch (error) {
          throw new Error(errorText(error), { cause: error })
        }
      },
    },
    submit: guarded(async (v, id) => ({
      ...(await custody(
        'fund',
        safe,
        { count: v.count, source_account: v.source, note: v.note },
        id,
      )),
      toast: 'Efectivo ingresado a la caja fuerte',
    })),
  }
}

/** A count that did not match (bag, safe or drawer): the reviewer books the difference. */
export function reviewCount(count, safe, people) {
  const diff = Number(count.difference)
  const sentence =
    count.expected_amount === null || count.expected_amount === undefined
      ? ''
      : `Se esperaban ${money(count.expected_amount, safe.currency)} y ${who(count.counted_by, people)} contó ${money(count.amount, safe.currency)}.`
  return {
    sheet: 'paso',
    props: {
      title:
        diff < 0
          ? 'Faltante por revisar'
          : diff > 0
            ? 'Sobrante por revisar'
            : 'Diferencia por revisar',
      amount: Math.abs(diff) || count.amount,
      currency: safe.currency,
      message: sentence,
      custody:
        'Al resolverla, el conteo queda como lo correcto y la diferencia se registra en la cuenta de diferencias de la caja fuerte.',
      fields: [{ key: 'note', label: 'Qué pasó', kind: 'reason' }],
      confirmLabel: 'Resolver diferencia',
    },
    submit: guarded(async (v, id) => ({
      ...(await custody(
        'review',
        safe,
        { cash_count: count.name, note: v.note },
        id,
      )),
      toast: 'Diferencia resuelta',
    })),
  }
}

export function approveChange(request, safe, people) {
  return {
    sheet: 'paso',
    props: {
      title: `Cambio para ${request.register_label || 'una caja'}`,
      amount: fromMinor(request.amount_minor),
      currency: safe.currency,
      message: `Lo pide ${who(request.requested_by, people)}.`,
      custody:
        'Sale de la caja fuerte: después cuentas y entregas el cambio, y la caja lo recibe en el POS.',
      confirmLabel: 'Aprobar desde la caja fuerte',
    },
    submit: guarded(async (_v, id) => ({
      ...(await assignRequest(request, id)),
      toast: 'Cambio aprobado: prepara el traslado',
    })),
  }
}

export function declineChange(request, safe, people) {
  return {
    sheet: 'paso',
    props: {
      title: 'No dar el cambio',
      amount: fromMinor(request.amount_minor),
      currency: safe.currency,
      message: `${who(request.requested_by, people)} verá el motivo en su caja.`,
      fields: [{ key: 'reason', label: 'Motivo', kind: 'reason' }],
      confirmLabel: 'No dar el cambio',
      danger: true,
    },
    submit: guarded(async (v, id) => ({
      ...(await declineRequest(request, v.reason, id)),
      toast: 'Solicitud rechazada',
    })),
  }
}

/** A safe-sourced traslado: count what leaves, seal it and hand it to the caja. */
export function handTransfer(transfer, safe) {
  return {
    sheet: 'conteo',
    props: {
      mode: 'transfer',
      title: `Traslado a ${transfer.destination_label || 'una caja'}`,
      subtitle: transfer.declared_minor
        ? `Piden ${money(fromMinor(transfer.declared_minor), safe.currency)}`
        : '',
      currency: safe.currency,
      custody:
        'Sale de la caja fuerte contigo; la caja lo cuenta al recibirlo en el POS y desde ese momento es suyo.',
      confirmLabel: 'Sellar y entregar',
    },
    submit: guarded(async (v, id) => {
      let row = transfer
      if (row.state === 'Draft')
        row = await prepareTransfer(row, v.rows, `${id}-p`)
      const sent = await dispatchTransfer(row, v.rows, `${id}-d`)
      return { ...sent, toast: 'Traslado entregado' }
    }),
  }
}

export function cancelHand(transfer, safe) {
  return {
    sheet: 'paso',
    props: {
      title: 'Cancelar el traslado',
      currency: safe.currency,
      fields: [{ key: 'reason', label: 'Motivo', kind: 'reason' }],
      confirmLabel: 'Cancelar traslado',
      danger: true,
    },
    submit: guarded(async (v, id) => ({
      ...(await cancelTransfer(transfer, v.reason, id)),
      toast: 'Traslado cancelado',
    })),
  }
}

export function authorize(row, people, currency = 'MXN') {
  const verb = row.event === 'cancel' ? 'cancelar' : 'registrar'
  return {
    sheet: 'paso',
    props: {
      title: `Autorizar ${verb} ${row.title || row.document_name}`,
      amount: fromMinor(row.amount_minor),
      currency,
      message: `${who(row.requested_by, people)} lo pide: «${row.request_reason || 'sin motivo'}». Mueve el efectivo de una caja o de la caja fuerte, por eso necesita tu firma.`,
      fields: [
        { key: 'reason', label: 'Por qué lo autorizas', kind: 'reason' },
        {
          key: 'password',
          label: 'Tu contraseña',
          kind: 'password',
          hint: 'Firma la autorización. Vale una hora y una sola vez.',
        },
      ],
      confirmLabel: 'Autorizar',
    },
    submit: async (v) => {
      try {
        const result = await authorizePosting(row, v.reason, v.password)
        return { ...result, toast: 'Autorizado por una hora' }
      } catch (error) {
        throw new Error(errorText(error), { cause: error })
      }
    },
  }
}
