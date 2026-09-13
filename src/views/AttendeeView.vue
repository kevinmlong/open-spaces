<script setup>
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useTopicsStore } from '@/stores/topics'
import { useBallotStore } from '@/stores/ballot'
import { useAuthStore } from '@/stores/auth'
import { useResultsStore } from '@/stores/results'
import { useSessionChannel } from '@/composables/useSessionChannel'
import { roomName, roundLabel } from '@/lib/schedule'

import BrandHeader from '@/components/shared/BrandHeader.vue'
import ConnectionBadge from '@/components/shared/ConnectionBadge.vue'
import CountdownTimer from '@/components/shared/CountdownTimer.vue'
import TopicCard from '@/components/shared/TopicCard.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ErrorNote from '@/components/shared/ErrorNote.vue'
import TopicForm from '@/components/attendee/TopicForm.vue'
import BallotPicker from '@/components/attendee/BallotPicker.vue'
import ResultsList from '@/components/attendee/ResultsList.vue'
import AttendeeSchedule from '@/components/attendee/AttendeeSchedule.vue'

const session = useSessionStore()
const topics = useTopicsStore()
const ballot = useBallotStore()
const auth = useAuthStore()
const results = useResultsStore()

const { status } = useSessionChannel({ trackPresence: true })

/** The rooms for the topics you personally voted for. */
const myTopicIds = computed(() => ballot.myVotes.map((v) => v.topic_id))
const mySessions = computed(() =>
  results.assignments.filter((a) => myTopicIds.value.includes(a.topic_id)),
)
</script>

<template>
  <div class="pb-16">
    <BrandHeader />

    <main class="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <!-- Anonymous sign-in failing is the #1 launch risk; say so plainly rather
           than leaving a spinner on screen. -->
      <ErrorNote v-if="auth.bootstrapError" :error="auth.bootstrapError" />

      <div class="flex items-center justify-between">
        <p class="text-sm text-slate-500">{{ session.row?.name }}</p>
        <ConnectionBadge :status="status" />
      </div>

      <!-- draft -->
      <EmptyState
        v-if="session.phase === 'draft' || !session.phase"
        title="Open Spaces starts soon"
        body="Keep this page open — it updates by itself."
      />

      <!-- proposals_open -->
      <template v-else-if="session.phase === 'proposals_open'">
        <CountdownTimer label="left to propose" />
        <!--
          The server already refuses late proposals, but leaving the form up
          invites someone to type a topic and get a raw policy error for their
          trouble. Admins keep their own entry point on /admin/run.
        -->
        <div v-if="session.expired" class="rounded-xl bg-navy p-5 text-center text-white">
          <p class="text-lg font-bold">Time's up</p>
          <p class="mt-1 text-sm text-white/70">
            Proposals are closed. Voting opens shortly — stay on this page.
          </p>
        </div>
        <TopicForm v-else />
        <section class="space-y-2">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {{ topics.activeList.length }} topics so far
          </h2>
          <TopicCard v-for="t in topics.pending" :key="t.localId" :topic="t" pending />
          <TopicCard v-for="t in topics.activeList" :key="t.id" :topic="t" />
          <EmptyState
            v-if="!topics.activeList.length && !topics.pending.length"
            title="No topics yet"
            body="Be the first — anything you'd want to talk about counts."
          />
        </section>
      </template>

      <!-- proposals_closed -->
      <template v-else-if="session.phase === 'proposals_closed'">
        <div class="rounded-xl bg-navy p-5 text-center text-white">
          <p class="text-lg font-bold">Proposals are closed</p>
          <p class="mt-1 text-sm text-white/70">Voting opens shortly — stay on this page.</p>
        </div>
        <TopicCard v-for="t in topics.activeList" :key="t.id" :topic="t" />
      </template>

      <!-- voting_open -->
      <template v-else-if="session.phase === 'voting_open'">
        <CountdownTimer label="left to vote" />
        <div
          v-if="session.expired && !ballot.hasVoted"
          class="rounded-xl bg-navy p-5 text-center text-white"
        >
          <p class="text-lg font-bold">Time's up</p>
          <p class="mt-1 text-sm text-white/70">Voting has closed. Results are on the way.</p>
        </div>
        <BallotPicker v-else />
      </template>

      <!-- voting_closed -->
      <template v-else-if="session.phase === 'voting_closed'">
        <div class="rounded-xl bg-gradient-to-br from-teal to-pink p-5 text-center text-white">
          <p class="text-lg font-bold">Results are in</p>
          <p class="mt-1 text-sm text-white/80">The schedule is being built now.</p>
        </div>
        <ResultsList />
      </template>

      <!-- scheduled -->
      <template v-else-if="session.phase === 'scheduled'">
        <section v-if="mySessions.length" class="space-y-2">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your picks made it
          </h2>
          <ul class="space-y-2">
            <li
              v-for="a in mySessions"
              :key="a.id"
              class="rounded-xl border-2 border-pink bg-pink/5 p-4"
            >
              <p class="font-semibold text-navy">{{ a.topics?.title }}</p>
              <p class="text-sm text-slate-600">
                {{ roundLabel(session.row, a.round_index) }}
                ·
                {{ roomName(session.row, a.room_index) }}
              </p>
            </li>
          </ul>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Schedule
          </h2>
          <AttendeeSchedule :highlight-topic-ids="myTopicIds" />
        </section>
      </template>

      <!-- archived -->
      <EmptyState
        v-else
        title="That's a wrap"
        body="Thanks for taking part in Open Spaces."
      />
    </main>
  </div>
</template>
