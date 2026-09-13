<script setup>
import { computed } from 'vue'
import { WALL_COLUMNS, ITEM_SIZE, heroSizeClass, splitFeed } from '@/lib/wall'

/**
 * The projector's topic wall.
 *
 * The newest idea is the hero: large, pink, front and centre. That is the moment
 * that matters -- someone has just typed a thought and wants to see it land in
 * front of the room. Everything proposed sits below it in a fixed three-column
 * grid, newest first, filling left to right.
 *
 * Two decisions worth not undoing:
 *
 *   GRID, NOT MULTI-COLUMN. This was CSS `columns-N` masonry, which balances
 *   content by height -- so every arriving topic re-flowed the whole wall, cards
 *   hopped between columns and the last column visibly broke. A grid places each
 *   card in a cell and leaves it there.
 *
 *   NO AUTO-SCROLL. The wall scrolls under human control, from the machine
 *   driving the screen. An automatic crawl competes with the person running the
 *   room, and there is no speed that suits both someone reading the list and
 *   someone waiting to see their own topic appear.
 */
const props = defineProps({
  topics: { type: Array, required: true },
})

const feed = computed(() => splitFeed(props.topics))
</script>

<template>
  <div class="flex min-h-0 flex-col gap-6">
    <!-- Hero: the newest idea, and the only pink thing on the screen. -->
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
        sheared off by the clip above.
      -->
      <p
        data-test="hero"
        class="pb-2 leading-[1.15] font-extrabold text-pink"
        :class="heroSizeClass(feed.hero.title)"
      >
        {{ feed.hero.title }}<span v-if="feed.hero.source === 'mic'" class="ml-3 opacity-60">🎤</span>
      </p>
    </div>

    <div v-if="feed.items.length" class="h-px shrink-0 bg-white/10" />

    <!--
      Takes whatever height is left and scrolls inside it. min-h-0 is what lets a
      flex child shrink below its content size; without it this grows and pushes
      the footer off the screen. overflow-y-auto keeps it scrollable by whoever
      is driving the display.
    -->
    <div ref="wallEl" data-test="wall" class="min-h-0 flex-1 overflow-y-auto">
      <div
        class="grid gap-5"
        :style="{ gridTemplateColumns: `repeat(${WALL_COLUMNS}, minmax(0, 1fr))` }"
      >
        <div
          v-for="t in feed.items"
          :key="t.id"
          class="rounded-2xl bg-white/10 px-6 py-5 font-semibold text-white"
          :class="ITEM_SIZE"
        >
          {{ t.title }}<span v-if="t.source === 'mic'" class="ml-2 opacity-60">🎤</span>
        </div>
      </div>
    </div>
  </div>
</template>
