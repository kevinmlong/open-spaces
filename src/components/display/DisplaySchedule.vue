<script setup>
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { roomName, roundLabel } from '@/lib/schedule'
import { vFitText } from '@/composables/useFitText'

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
 * SIZING THE TYPE: each card is a size container, and the title is measured in
 * `cqh`/`cqw` -- percentages of the card itself. Taking the smaller of a
 * height-derived and a width-derived size means a short card gets small text, a
 * narrow card gets small text, and a card with room in both gets large text,
 * without anything needing to know which layout it is in.
 *
 * CSS cannot see how many lines the text wrapped to, though, so `v-fit-text`
 * measures and shrinks anything that would otherwise fill its card edge to edge.
 * That replaced a title-length heuristic, which could not know the column width:
 * at three rounds a 42-character title fits on one line and was being shrunk for
 * nothing, while at four rounds a 30-character title wrapped and was not.
 *
 * The room label sits outside all of that on purpose: same size, same place, top
 * of every card. It is what an attendee scans down a column for, so it must not
 * move or resize because a neighbouring title happened to be long.
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
        v-fit-text
        class="sched-card min-h-0 flex-1 overflow-hidden rounded-2xl bg-white/10"
      >
        <div data-fit-inner class="sched-inner flex h-full flex-col">
          <p class="sched-room shrink-0 font-semibold tracking-wide text-light-pink uppercase">
            {{ roomName(session.row, m - 1) }}
          </p>
          <div data-fit-box class="flex min-h-0 flex-1 items-center">
            <p v-if="cell(focused, m - 1)" class="sched-title font-semibold text-white">
              {{ cell(focused, m - 1).topics?.title }}
            </p>
            <p v-else class="sched-title italic text-white/40">open — grab it</p>
          </div>
        </div>
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
        v-fit-text
        class="sched-card min-h-0 flex-1 overflow-hidden rounded-2xl bg-white/10"
      >
        <div data-fit-inner class="sched-inner flex h-full flex-col">
          <p class="sched-room shrink-0 font-semibold tracking-wide text-light-pink uppercase">
            {{ roomName(session.row, m - 1) }}
          </p>
          <div data-fit-box class="flex min-h-0 flex-1 items-center">
            <p v-if="cell(r - 1, m - 1)" class="sched-title font-semibold text-white">
              {{ cell(r - 1, m - 1).topics?.title }}
            </p>
            <p v-else class="sched-title italic text-white/40">open — grab it</p>
          </div>
        </div>
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
}

/*
 * Padding lives on an inner element, not on the card, and that is deliberate:
 * cq units resolve against the container's CONTENT box, so cq-unit padding on
 * the container itself would be defined in terms of a box its own value
 * determines. On a child it is simply a percentage of the card.
 *
 * Vertical scales with the card's height, horizontal with its width -- each axis
 * against the dimension it actually sits in. One value for all four sides looked
 * starved sideways: 11px of side inset on a 600px-wide card reads as cramped
 * even though the same 11px is generous against a 134px height.
 */
.sched-inner {
  padding: clamp(0.5rem, 8cqh, 1.75rem) clamp(1.25rem, 4cqw, 3rem);
}

/*
 * Fixed to the card's own proportions and deliberately NOT scaled by --fit.
 * Every room label in a column is therefore the same size in the same place,
 * which is what makes the column scannable; one that shifted or resized because
 * a neighbouring title was long would be much harder to read down.
 */
.sched-room {
  font-size: clamp(0.6rem, min(12cqh, 3.2cqw), 2rem);
  line-height: 1.2;
  margin-bottom: 0.35em;
}

/*
 * min() of a height-derived and a width-derived size: whichever dimension is
 * tighter wins. --fit is layered on top by v-fit-text, and only ever shrinks.
 */
.sched-title {
  font-size: clamp(0.75rem, calc(min(30cqh, 8.5cqw) * var(--fit, 1)), 4rem);
  line-height: 1.15;
}
</style>
