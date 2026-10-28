<!-- Height + fade for content that opens in place (search panels, filter
     rows): the rows below slide instead of jumping. Respects reduced motion. -->
<template>
  <Transition :css="false" @enter="enter" @leave="leave">
    <slot />
  </Transition>
</template>

<script setup>
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function run(el, frames, duration, done) {
  if (reduced() || !el.animate) return done()
  el.style.overflow = 'hidden'
  const anim = el.animate(frames, { duration, easing: EASE })
  anim.onfinish = anim.oncancel = () => {
    el.style.overflow = ''
    done()
  }
}

function enter(el, done) {
  const h = el.scrollHeight
  run(
    el,
    [
      { height: '0px', opacity: 0, transform: 'translateY(-4px)' },
      { height: `${h}px`, opacity: 1, transform: 'none' },
    ],
    220,
    done,
  )
}

function leave(el, done) {
  const h = el.offsetHeight
  run(
    el,
    [
      { height: `${h}px`, opacity: 1 },
      { height: '0px', opacity: 0 },
    ],
    160,
    done,
  )
}
</script>
