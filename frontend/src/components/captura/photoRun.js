// «Tomar fotos»: products under the camera one after another (Fotos de lo que
// llega). Pure: the camera sheet keeps one of these and asks it what to show.
//
// The shutter files the product on screen and moves to the next one; «Saltar»
// moves on without a photo; «Repetir» goes back to the last product shot and,
// once shot again, returns to where the walk was. The run is over when the
// walk passes the last product.

/** A run over `items` ([{ key, title, detail? }]), at the first one. */
export function createRun(items = []) {
  return {
    items: [...items],
    index: 0,
    // where the walk goes back to after «Repetir», or null
    resume: null,
    // the index of the last product shot (what «Repetir» retakes), or null
    last: null,
    shot: [],
    skipped: [],
  }
}

export function current(run) {
  return run.items[run.index] || null
}

export function finished(run) {
  return run.index >= run.items.length
}

/** Whether the product on screen was shot already: the shutter replaces it. */
export function retaking(run) {
  const item = current(run)
  return Boolean(item && run.shot.includes(item.key))
}

function advance(run) {
  if (run.resume !== null) {
    run.index = run.resume
    run.resume = null
  } else {
    run.index += 1
  }
}

/** The shutter: the product on screen has its photo; on to the next one. */
export function shoot(run) {
  const item = current(run)
  if (!item) return run
  if (!run.shot.includes(item.key)) run.shot.push(item.key)
  run.skipped = run.skipped.filter((key) => key !== item.key)
  run.last = run.index
  advance(run)
  return run
}

/** «Saltar»: on to the next product, this one without a photo. */
export function skip(run) {
  const item = current(run)
  if (!item) return run
  if (!run.shot.includes(item.key) && !run.skipped.includes(item.key))
    run.skipped.push(item.key)
  advance(run)
  return run
}

/** «Repetir»: back to the last product shot; the walk resumes after it. */
export function retake(run) {
  if (run.last === null || run.last === run.index) return run
  run.resume = run.index
  run.index = run.last
  return run
}

/** «2 de 5»: where the walk is, counted from one. */
export function position(run) {
  return {
    at: Math.min(run.index + 1, run.items.length),
    of: run.items.length,
  }
}

export function summary(run) {
  return {
    shot: run.shot.length,
    skipped: run.skipped.length,
    left: Math.max(run.items.length - run.shot.length - run.skipped.length, 0),
  }
}
