<script setup>
import { ref, computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useTopicsStore } from '@/stores/topics'
import { useResultsStore } from '@/stores/results'
import { useSessionChannel } from '@/composables/useSessionChannel'
import BrandHeader from '@/components/shared/BrandHeader.vue'
import AdminNav from '@/components/admin/AdminNav.vue'
import ConnectionBadge from '@/components/shared/ConnectionBadge.vue'
import CountdownTimer from '@/components/shared/CountdownTimer.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import ErrorNote from '@/components/shared/ErrorNote.vue'
import { roundLabel } from '@/lib/schedule'

const session = useSessionStore()
const topics = useTopicsStore()
const results = useResultsStore()
const { status } = useSessionChannel({ pollStats: true })

const minutes = ref(10)
const micTitle = ref('')
const error = ref(null)
const dialog = ref(null)

/**
 * Every transition names its consequence. The organizer is on stage in front of
 * a room; "Are you sure?" is not enough information to act on.
 */
const TRANSITIONS = {
  draft: {
    to: 'proposals_open',
    label: 'Open proposals',
    body: () => `Opens proposals for ${minutes.value} minutes. Everyone's phone switches immediately.`,
  },
  proposals_open: {
    to: 'proposals_closed',
    label: 'Close proposals',
    body: () =>
      `Locks the list at ${topics.activeList.length} topics. Nobody can add any more after this.`,
  },
  proposals_closed: {
    to: 'voting_open',
    label: 'Open voting',
    body: () =>
      `Opens voting on ${topics.activeList.length} topics for ${minutes.value} minutes. Merge duplicates first if you haven't.`,
  },
  voting_open: {
    to: 'voting_closed',
    label: 'Close voting',
    body: () =>
      `Ends voting after ${session.stats.ballotCount} ballots and reveals the results on every screen.`,
  },
}

const next = computed(() => TRANSITIONS[session.phase] ?? null)

function ask(action) {
  error.value = null
  dialog.value = action
}

async function run() {
  const action = dialog.value
  dialog.value = null
  try {
    await action.run()
  } catch (e) {
    error.value = e
  }
}

function confirmNext() {
  const t = next.value
  ask({
    title: t.label,
    body: t.body(),
    danger: t.to === 'proposals_closed' || t.to === 'voting_closed',
    confirmLabel: t.label,
    run: () =>
      session.setPhase(t.to, ['proposals_open', 'voting_open'].includes(t.to) ? minutes.value : null),
  })
}

function confirmReopen() {
  ask({
    title: 'Reopen proposals',
    body: 'Attendees can add topics again. Useful when the mic queue is longer than you planned.',
    confirmLabel: 'Reopen',
    run: () => session.setPhase('proposals_open', minutes.value),
  })
}

async function showRound(round) {
  error.value = null
  try {
    await session.setDisplayRound(round)
  } catch (e) {
    error.value = e
  }
}

async function submitMic() {
  const clean = micTitle.value.trim()
  if (clean.length < 3) return
  error.value = null
  try {
    await topics.propose(clean, 'mic')
    micTitle.value = ''
  } catch (e) {
    error.value = e
  }
}
</script>

<template>
  <div>
    <BrandHeader subtitle="Run the room" />
    <AdminNav />

    <main class="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-navy">{{ session.row?.name }}</h2>
        <ConnectionBadge :status="status" />
      </div>

      <ErrorNote :error="error" />

      <!-- Live numbers -->
      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-xl bg-white p-4 shadow-sm">
          <p class="text-3xl font-extrabold tabular-nums text-navy">
            {{ topics.activeList.length }}
          </p>
          <p class="text-xs uppercase tracking-wide text-slate-500">topics</p>
        </div>
        <div class="rounded-xl bg-white p-4 shadow-sm">
          <p class="text-3xl font-extrabold tabular-nums text-teal">
            {{ session.stats.ballotCount }}
          </p>
          <p class="text-xs uppercase tracking-wide text-slate-500">ballots</p>
        </div>
        <div class="rounded-xl bg-white p-4 shadow-sm">
          <CountdownTimer v-if="session.deadline" label="remaining" />
          <template v-else>
            <p class="text-3xl font-extrabold text-slate-300">—</p>
            <p class="text-xs uppercase tracking-wide text-slate-500">no timer</p>
          </template>
        </div>
      </div>

      <!-- Phase controls -->
      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h3 class="font-bold text-navy">Phase</h3>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <label class="flex items-center gap-2 text-sm text-slate-600">
            Minutes
            <input
              v-model.number="minutes"
              type="number"
              min="1"
              max="60"
              class="w-20 rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>

          <button
            v-if="next"
            class="rounded-xl bg-teal px-5 py-2.5 font-semibold text-white"
            @click="confirmNext"
          >
            {{ next.label }}
          </button>

          <button
            v-if="session.deadline"
            class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy"
            @click="session.extendDeadline(2).catch((e) => (error = e))"
          >
            +2 min
          </button>

          <button
            v-if="session.phase === 'proposals_closed'"
            class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy"
            @click="confirmReopen"
          >
            Reopen proposals
          </button>

          <RouterLink
            v-if="session.phase === 'voting_closed'"
            :to="{ name: 'admin-schedule' }"
            class="rounded-xl bg-pink px-5 py-2.5 font-semibold text-white"
          >
            Build the schedule →
          </RouterLink>
        </div>
      </section>

      <!-- Mic submissions -->
      <section
        v-if="['proposals_open', 'proposals_closed'].includes(session.phase)"
        class="rounded-xl bg-white p-5 shadow-sm"
      >
        <h3 class="font-bold text-navy">🎤 Add from the mic</h3>
        <p class="mt-1 text-sm text-slate-500">
          For someone who proposed out loud instead of typing.
        </p>
        <form class="mt-3 flex gap-2" @submit.prevent="submitMic">
          <input
            v-model="micTitle"
            maxlength="120"
            placeholder="Topic as they said it"
            class="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2.5"
          />
          <button
            type="submit"
            :disabled="micTitle.trim().length < 3"
            class="rounded-xl bg-navy px-5 py-2.5 font-semibold text-white disabled:opacity-40"
          >
            Add
          </button>
        </form>
      </section>

      <!--
        Drive the projector from here. The display laptop is usually plugged in
        behind the stage, so nobody should have to walk to it to change what the
        room is looking at.
      -->
      <section v-if="session.phase === 'scheduled'" class="rounded-xl bg-white p-5 shadow-sm">
        <h3 class="font-bold text-navy">On the big screen</h3>
        <p class="mt-1 text-sm text-slate-500">
          Show everything at once, or put one round up large as it starts.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="rounded-xl px-4 py-2 text-sm font-semibold transition"
            :class="
              session.row?.display_round === null || session.row?.display_round === undefined
                ? 'bg-navy text-white'
                : 'border border-slate-300 text-navy'
            "
            @click="showRound(null)"
          >
            Overview
          </button>
          <button
            v-for="i in (session.row?.rounds ?? 0)"
            :key="i"
            class="rounded-xl px-4 py-2 text-sm font-semibold transition"
            :class="
              session.row?.display_round === i - 1
                ? 'bg-teal text-white'
                : 'border border-slate-300 text-navy'
            "
            @click="showRound(i - 1)"
          >
            {{ roundLabel(session.row, i - 1) }}
          </button>
        </div>
      </section>

      <!-- Live tallies: admin only, by RLS. -->
      <section
        v-if="['voting_open', 'voting_closed', 'scheduled'].includes(session.phase)"
        class="rounded-xl bg-white p-5 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-navy">Live tallies</h3>
          <button class="text-sm text-teal hover:underline" @click="results.fetchRankings()">
            Refresh
          </button>
        </div>
        <p v-if="session.phase === 'voting_open'" class="mt-1 text-xs text-slate-500">
          Only you can see these — attendees and the big screen cannot.
        </p>
        <ol class="mt-3 space-y-1">
          <li
            v-for="r in results.rankings"
            :key="r.id"
            class="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-slate-50"
          >
            <span class="w-6 font-bold text-slate-400">{{ r.rank }}</span>
            <span class="flex-1 text-navy">{{ r.title }}</span>
            <span class="font-bold tabular-nums text-teal">{{ r.votes }}</span>
          </li>
        </ol>
      </section>
    </main>

    <ConfirmDialog
      :open="!!dialog"
      :title="dialog?.title"
      :body="dialog?.body"
      :confirm-label="dialog?.confirmLabel"
      :danger="dialog?.danger"
      @confirm="run"
      @cancel="dialog = null"
    />
  </div>
</template>
