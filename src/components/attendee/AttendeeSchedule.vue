<script setup>
import { ref, computed, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { roundLabel } from '@/lib/schedule'
import RoundPanel from '@/components/schedule/RoundPanel.vue'

/**
 * The schedule on a phone.
 *
 * One round at a time, because the only question an attendee is asking is
 * "where do I go next" -- and a rounds x rooms table answers that badly on a
 * 400px screen.
 *
 * The round the organizer is showing on the projector leads, so someone glancing
 * up at the big screen and down at their phone sees the same thing.
 */
const props = defineProps({
  highlightTopicIds: { type: Array, default: () => [] },
})

const session = useSessionStore()
const results = useResultsStore()

const rounds = computed(() => session.row?.rounds ?? 0)
const selected = ref(session.row?.display_round ?? 0)

// Follow the projector when the organizer changes it, but never yank the page
// out from under someone who has deliberately tapped another round.
const touched = ref(false)
watch(
  () => session.row?.display_round,
  (r) => {
    if (!touched.value && typeof r === 'number') selected.value = r
  },
)

function pick(i) {
  touched.value = true
  selected.value = i
}

/** Rooms in this round where a topic the attendee voted for is scheduled. */
const myRoomsThisRound = computed(() =>
  results.assignments.filter(
    (a) => a.round_index === selected.value && props.highlightTopicIds.includes(a.topic_id),
  ),
)
</script>

<template>
  <div class="space-y-4">
    <!-- Round picker. Horizontal scroll rather than wrapping, so three or four
         rounds stay on one line at phone width. -->
    <div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button
        v-for="i in rounds"
        :key="i"
        class="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition"
        :class="
          selected === i - 1
            ? 'bg-navy text-white'
            : 'border border-slate-300 bg-white text-slate-600'
        "
        @click="pick(i - 1)"
      >
        {{ roundLabel(session.row, i - 1) }}
      </button>
    </div>

    <p
      v-if="myRoomsThisRound.length"
      class="rounded-xl bg-pink/10 px-4 py-2 text-sm font-medium text-pink"
    >
      One of your picks is in this round.
    </p>

    <RoundPanel :round="selected" :highlight-topic-ids="highlightTopicIds" />

    <p class="text-center text-xs text-slate-400">
      Highlighted rooms are topics you voted for.
    </p>
  </div>
</template>
