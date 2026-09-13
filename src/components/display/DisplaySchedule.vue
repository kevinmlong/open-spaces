<script setup>
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { roomName, roundLabel } from '@/lib/schedule'
import RoundPanel from '@/components/schedule/RoundPanel.vue'

/**
 * The schedule on the projector, in the same dark palette as the proposal and
 * voting stages -- it used to drop a white table onto the navy screen, which
 * looked like a different application.
 *
 * What it shows is the organizer's call, carried on sessions.display_round:
 * null for the overview, or a round index to put one round up large. The
 * projector has no controls of its own; that laptop is usually behind the stage.
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
  <div v-if="focused !== null" class="min-h-0 flex-1 overflow-y-auto">
    <RoundPanel :round="focused" tone="dark" size="xl" />
  </div>

  <!-- Overview: every round side by side, so people can plan their afternoon. -->
  <div v-else class="min-h-0 flex-1 overflow-y-auto">
    <div
      class="grid gap-5"
      :style="{ gridTemplateColumns: `repeat(${Math.max(rounds, 1)}, minmax(0, 1fr))` }"
    >
      <div v-for="r in rounds" :key="r" class="space-y-3">
        <h3 class="text-3xl font-bold text-teal">{{ roundLabel(session.row, r - 1) }}</h3>
        <div
          v-for="m in rooms"
          :key="m"
          class="rounded-2xl bg-white/10 px-5 py-4"
        >
          <p class="text-sm font-semibold tracking-wide text-light-pink uppercase">
            {{ roomName(session.row, m - 1) }}
          </p>
          <p v-if="cell(r - 1, m - 1)" class="mt-1 text-2xl font-semibold text-white">
            {{ cell(r - 1, m - 1).topics?.title }}
          </p>
          <p v-else class="mt-1 text-xl italic text-white/40">open — grab it</p>
        </div>
      </div>
    </div>
  </div>
</template>
