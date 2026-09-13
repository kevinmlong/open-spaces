<script setup>
import { ref, computed } from 'vue'
import { columnsFor, heroSizeClass, itemSizeClass, splitFeed } from '@/lib/wall'
import { useAutoScroll } from '@/composables/useAutoScroll'

/**
 * The projector's topic wall.
 *
 * The newest idea is the hero: large, pink, front and centre. That is the moment
 * that matters -- someone has just typed a thought and wants to see it land in
 * front of the room. Everything proposed before it sits below in a masonry grid
 * that scrolls gently when it outgrows the screen.
 *
 * Masonry is CSS multi-column rather than a grid library: titles are variable
 * length, and columns pack them by height for free. `break-inside-avoid` is what
 * stops a card being sliced across a column boundary.
 */
const props = defineProps({
  topics: { type: Array, required: true },
})

const feed = computed(() => splitFeed(props.topics))
const columns = computed(() => columnsFor(feed.value.items.length))

const wallEl = ref(null)
// Reset the scroll whenever a topic arrives, so a new one is never left sitting
// below the fold.
useAutoScroll(
  wallEl,
  computed(() => props.topics.length),
)

const COLUMN_CLASS = { 1: 'columns-1', 2: 'columns-2', 3: 'columns-3', 4: 'columns-4' }
</script>

<template>
  <div class="flex min-h-0 flex-col gap-6">
    <!--
      Hero: the newest idea, and the only pink thing on the screen.
      Capped at 40% of the available height so a very long title can never
      squeeze the wall below it out of existence.
    -->
    <div
      v-if="feed.hero"
      data-test="hero-block"
      class="max-h-[40%] shrink-0 overflow-hidden text-center"
    >
      <p class="mb-3 text-sm font-semibold tracking-[0.3em] text-white/40 uppercase">
        Just proposed
      </p>
      <!--
        leading-[1.15] + pb-2: Tailwind's big type steps ship line-height 1, so
        the line box is exactly the cap height and descenders (q, y, g, p) get
        sheared off by the clip above. Measured at 7px on text-7xl.
      -->
      <p
        data-test="hero"
        class="pb-2 leading-[1.15] font-extrabold text-pink"
        :class="heroSizeClass(feed.hero.title)"
      >
        {{ feed.hero.title }}
        <span v-if="feed.hero.source === 'mic'" class="opacity-60">🎤</span>
      </p>
    </div>

    <div v-if="feed.items.length" class="h-px shrink-0 bg-white/10" />

    <!--
      The wall takes whatever height is left and scrolls inside it. min-h-0 is
      what lets a flex child actually shrink below its content size -- without
      it this grows and pushes the footer off the screen.
    -->
    <div ref="wallEl" data-test="wall" class="min-h-0 flex-1 overflow-y-hidden">
      <div :class="COLUMN_CLASS[columns]" class="gap-6">
        <div
          v-for="t in feed.items"
          :key="t.id"
          class="mb-6 break-inside-avoid rounded-2xl bg-white/10 px-6 py-5 font-semibold text-white"
          :class="itemSizeClass(columns)"
        >
          {{ t.title }}
          <span v-if="t.source === 'mic'" class="opacity-60">🎤</span>
        </div>
      </div>
    </div>
  </div>
</template>
