<script setup>
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { roomName, roundLabel } from '@/lib/schedule'

/**
 * The schedule on the projector, in the same dark palette as the proposal and
 * voting stages -- it used to drop a white table onto the navy screen, which
 * looked like a different application.
 *
 * What it shows is the organizer's call, carried on sessions.display_round:
 * null for the overview, or a round index to put one round up large. The
 * projector has no controls of its own; that laptop is usually behind the stage.
 *
 * FILLING THE SCREEN: every card is `flex-1`, so the rooms divide whatever
 * height is left and the screen is always full.
 *
 * SIZING THE TYPE: each card is a size container, and the text is measured in
 * `cqh`/`cqw` -- percentages of the card itself. This replaced a lookup table
 * keyed on the room count, which could only guess: it knew four rooms meant
 * shortish cards, but not that an overview column is a third of the width, so
 * the same guess was too small in one layout and too big in the other. Taking
 * the smaller of a height-derived and a width-derived size means a card that is
 * short gets small text, a card that is narrow gets small text, and a card with
 * room in both directions gets large text -- without anything having to know
 * which layout it is in.
 */
const session = useSessionStore()
const results = useResultsStore()

const rounds = computed(() => session.row?.rounds ?? 0)
const rooms = computed(() => session.row?.rooms ?? 0)
const focused = computed(() => session.row?.display_round ?? null)

function cell(round, room) {
  return results.assignments.find((a) => a.round_index === round && a.room_index === room)
}
</script>

<template>
  <!-- One round, large: what the room needs at the moment a round starts. -->
  <div v-if="focused !== null" class="flex min-h-0 flex-1 flex-col gap-4">
    <h3 class="shrink-0 text-5xl font-bold text-teal">{{ roundLabel(session.row, focused) }}</h3>
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <div
        v-for="m in rooms"
        :key="m"
        class="sched-card flex min-h-0 flex-1 flex-col justify-center rounded-2xl bg-white/10 px-10"
      >
        <p class="sched-room font-semibold tracking-wide text-light-pink uppercase">
          {{ roomName(session.row, m - 1) }}
        </p>
        <p v-if="cell(focused, m - 1)" class="sched-title font-semibold text-white">
          {{ cell(focused, m - 1).topics?.title }}
        </p>
        <p v-else class="sched-title italic text-white/40">open — grab it</p>
      </div>
    </div>
  </div>

  <!-- Overview: every round side by side, so people can plan their afternoon. -->
  <div
    v-else
    class="grid min-h-0 flex-1 gap-5"
    :style="{
      gridTemplateColumns: `repeat(${Math.max(rounds, 1)}, minmax(0, 1fr))`,
      gridTemplateRows: '1fr',
    }"
  >
    <div v-for="r in rounds" :key="r" class="flex min-h-0 flex-col gap-3">
      <h3 class="shrink-0 text-3xl font-bold text-teal">{{ roundLabel(session.row, r - 1) }}</h3>
      <div
        v-for="m in rooms"
        :key="m"
        class="sched-card flex min-h-0 flex-1 flex-col justify-center rounded-2xl bg-white/10 px-6"
      >
        <p class="sched-room font-semibold tracking-wide text-light-pink uppercase">
          {{ roomName(session.row, m - 1) }}
        </p>
        <p v-if="cell(r - 1, m - 1)" class="sched-title font-semibold text-white">
          {{ cell(r - 1, m - 1).topics?.title }}
        </p>
        <p v-else class="sched-title italic text-white/40">open — grab it</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * `size` (not `inline-size`) so both cqh and cqw are available: the cards get
 * their height from flex, so measuring it is safe and does not create a
 * circular dependency.
 */
.sched-card {
  container-type: size;
  overflow: hidden;
}

/*
 * min() of a height-derived and a width-derived size. Whichever dimension is
 * tighter wins, so text never outgrows its box in either direction. The clamp
 * bounds keep it readable at the small end and stop a nearly-empty grid from
 * turning into a billboard.
 *
 * 30cqh is the ceiling, found by measurement rather than taste: at 34 a long
 * title wraps to a third line in the narrow overview columns and gets clipped.
 * The width term is what lets a tall, narrow card (two rooms in the overview)
 * grow past the height its own proportions would suggest, since the extra lines
 * have somewhere to go.
 */
.sched-title {
  font-size: clamp(1rem, min(30cqh, 9cqw), 4rem);
  line-height: 1.15;
  margin-top: 0.35em;
}

.sched-room {
  font-size: clamp(0.65rem, min(12cqh, 3.2cqw), 2rem);
  line-height: 1.2;
}
</style>
