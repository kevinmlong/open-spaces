<script setup>
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { useBallotStore } from '@/stores/ballot'
import { useTopicsStore } from '@/stores/topics'

const route = useRoute()
const session = useSessionStore()
const results = useResultsStore()
const ballot = useBallotStore()
const topics = useTopicsStore()

const PHASE_COPY = {
  draft: 'Open Spaces has not started yet.',
  proposals_open: 'Proposals are open.',
  proposals_closed: 'Proposals are closed.',
  voting_open: 'Voting is open.',
  voting_closed: 'Voting is closed. Results are in.',
  scheduled: 'The schedule is published.',
  archived: 'This session has ended.',
}

/**
 * One watcher drives every phase-dependent fetch in the app. The server says
 * `voting_open`, and every device in the room switches -- no route guards on
 * phase, no per-component polling.
 */
watch(
  () => session.phase,
  async (next, prev) => {
    if (!next || next === prev) return
    try {
      if (next === 'voting_closed' || next === 'scheduled') await results.fetchRankings()
      if (next === 'scheduled') await results.fetchAssignments()
      if (next === 'proposals_open' || next === 'voting_open') await session.syncClock()
      if (next === 'voting_open') await ballot.checkVoted()
      ballot.reconcile(topics.ballotList.map((t) => t.id))
    } catch {
      /* the channel's resync will retry */
    }
  },
)
</script>

<template>
  <div :class="route.meta.bare ? '' : 'min-h-dvh bg-slate-50'">
    <RouterView />
    <!-- Phase changes are announced for screen readers; the visual change is
         obvious, the audible one is not. -->
    <p class="sr-only" role="status" aria-live="polite">{{ PHASE_COPY[session.phase] }}</p>
  </div>
</template>
