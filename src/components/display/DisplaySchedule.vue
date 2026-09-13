<script setup>
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { roomName, roundLabel } from '@/lib/schedule'
import { scheduleTitleClass, scheduleRoomClass } from '@/lib/displayScale'

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
 * height is left after the header and footer and the screen is always full. CSS
 * handles the height; it cannot pick a font size to match, so the type scale in
 * displayScale.js does that from the room count -- otherwise three rooms leave
 * half-empty boxes with small text marooned in them.
 */
const session = useSessionStore()
const results = useResultsStore()

const rounds = computed(() => session.row?.rounds ?? 0)
const rooms = computed(() => session.row?.rooms ?? 0)
const focused = computed(() => session.row?.display_round ?? null)

const wide = computed(() => focused.value !== null)
const titleClass = computed(() => scheduleTitleClass(rooms.value, wide.value))
const roomClass = computed(() => scheduleRoomClass(rooms.value, wide.value))

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
        class="flex min-h-0 flex-1 flex-col justify-center rounded-2xl bg-white/10 px-10"
      >
        <p class="font-semibold tracking-wide text-light-pink uppercase" :class="roomClass">
          {{ roomName(session.row, m - 1) }}
        </p>
        <p
          v-if="cell(focused, m - 1)"
          class="mt-2 font-semibold text-white"
          :class="titleClass"
        >
          {{ cell(focused, m - 1).topics?.title }}
        </p>
        <p v-else class="mt-2 italic text-white/40" :class="titleClass">open — grab it</p>
      </div>
    </div>
  </div>

  <!-- Overview: every round side by side, so people can plan their afternoon. -->
  <div
    v-else
    class="grid min-h-0 flex-1 gap-5"
    :style="{ gridTemplateColumns: `repeat(${Math.max(rounds, 1)}, minmax(0, 1fr))` }"
  >
    <div v-for="r in rounds" :key="r" class="flex min-h-0 flex-col gap-3">
      <h3 class="shrink-0 text-3xl font-bold text-teal">{{ roundLabel(session.row, r - 1) }}</h3>
      <div
        v-for="m in rooms"
        :key="m"
        class="flex min-h-0 flex-1 flex-col justify-center rounded-2xl bg-white/10 px-6"
      >
        <p class="font-semibold tracking-wide text-light-pink uppercase" :class="roomClass">
          {{ roomName(session.row, m - 1) }}
        </p>
        <p v-if="cell(r - 1, m - 1)" class="mt-1 font-semibold text-white" :class="titleClass">
          {{ cell(r - 1, m - 1).topics?.title }}
        </p>
        <p v-else class="mt-1 italic text-white/40" :class="titleClass">open — grab it</p>
      </div>
    </div>
  </div>
</template>
