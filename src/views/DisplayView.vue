<script setup>
import { ref, computed, onMounted } from 'vue'
import QRCode from 'qrcode'
import { useSessionStore } from '@/stores/session'
import { useTopicsStore } from '@/stores/topics'
import { useResultsStore } from '@/stores/results'
import { useSessionChannel } from '@/composables/useSessionChannel'
import { useCountdown } from '@/composables/useCountdown'
import DisplaySchedule from '@/components/display/DisplaySchedule.vue'
import TopicWall from '@/components/display/TopicWall.vue'
import { publicUrl, publicHost } from '@/lib/publicUrl'

const session = useSessionStore()
const topics = useTopicsStore()
const results = useResultsStore()

// Presence gives the room a live headcount; stats give a ballot ticker that
// shows progress WITHOUT revealing who is winning.
const { status, lastSyncAt } = useSessionChannel({ observePresence: true, pollStats: true })
const { text: countdown, urgent, expired } = useCountdown()

const qr = ref(null)
const joinHost = publicHost
onMounted(async () => {
  qr.value = await QRCode.toDataURL(publicUrl, {
    // Generated well above its rendered size so it stays crisp on a projector,
    // which is usually scaling the page up rather than down.
    width: 720,
    margin: 1,
    // High error correction: a projector screen is a hostile scanning target
    // (glare, keystone, people's heads), and this survives a partly obscured code.
    errorCorrectionLevel: 'H',
    color: { dark: '#1a2744', light: '#ffffff' },
  })
})

// If the projector has seen nothing at all for a while, say so rather than
// quietly showing stale content to a room of 300 people.
const stale = computed(() => {
  void session.tick
  return status.value !== 'live' && lastSyncAt.value && Date.now() - lastSyncAt.value > 60000
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-navy text-white">
    <!-- Header -->
    <header class="flex shrink-0 items-center justify-between px-10 pt-8">
      <div>
        <p class="text-sm font-semibold tracking-[0.3em] text-light-pink uppercase">
          DC State of the Stack
        </p>
        <h1 class="text-5xl font-extrabold">Open Spaces</h1>
      </div>
      <div class="flex items-center gap-8">
        <div v-if="session.presenceCount" class="text-right">
          <p class="text-4xl font-extrabold tabular-nums text-teal">
            {{ session.presenceCount }}
          </p>
          <p class="text-xs tracking-widest text-white/50 uppercase">in the room</p>
        </div>
        <div v-if="countdown" class="text-right">
          <p
            data-test="countdown"
            class="font-extrabold"
            :class="[
              expired ? 'text-5xl text-teal' : 'text-6xl tabular-nums',
              urgent ? 'text-pink' : expired ? '' : 'text-white',
            ]"
          >
            {{ countdown }}
          </p>
          <p v-if="!expired" class="text-xs tracking-widest text-white/50 uppercase">remaining</p>
        </div>
      </div>
    </header>

    <div class="mx-10 mt-4 h-1 shrink-0 rounded bg-gradient-to-r from-teal to-pink" />

    <p
      v-if="stale"
      class="mx-10 mt-4 shrink-0 rounded-lg bg-pink px-4 py-2 text-center text-lg font-bold"
    >
      Connection lost — this screen may be out of date
    </p>

    <!--
      Body gets the FULL width. The join panel used to sit here as a flex sibling,
      which stole ~300px and quietly pushed every centred thing off-centre; it now
      lives in the footer below.
    -->
    <main class="flex min-h-0 flex-1 flex-col px-10 py-8">
      <!-- draft -->
      <div v-if="session.phase === 'draft' || !session.phase" class="flex flex-1 items-center justify-center">
        <div class="text-center">
          <p class="text-display-lg font-extrabold leading-tight">Starting soon</p>
          <p class="mt-4 text-3xl text-white/60">Scan the code to join from your phone.</p>
        </div>
      </div>

      <!-- proposals -->
      <template v-else-if="['proposals_open', 'proposals_closed'].includes(session.phase)">
        <h2 class="mb-4 shrink-0 text-3xl font-bold text-teal">
          {{ session.phase === 'proposals_open' ? 'Proposed Topics:' : 'Proposals Closed:' }}
          <span class="ml-2 text-white/40">{{ topics.activeList.length }}</span>
        </h2>
        <TopicWall
          v-if="topics.activeList.length"
          class="min-h-0 flex-1"
          :topics="topics.activeList"
        />
        <div v-else class="flex flex-1 items-center justify-center">
          <p class="text-display-md font-extrabold text-white/40">Waiting for the first topic…</p>
        </div>
      </template>

      <!-- voting: progress, never a leaderboard -->
      <div
        v-else-if="session.phase === 'voting_open'"
        class="flex flex-1 flex-col items-center justify-center text-center"
      >
        <p class="text-display-lg font-extrabold text-pink">Vote now</p>
        <p class="mt-2 text-3xl text-white/70">Pick your top 3 on your phone.</p>
        <div class="mt-10">
          <p class="text-display-xl font-extrabold tabular-nums text-teal">
            {{ session.stats.ballotCount }}
          </p>
          <p class="text-2xl tracking-widest text-white/50 uppercase">ballots cast</p>
        </div>
      </div>

      <!-- results reveal -->
      <template v-else-if="session.phase === 'voting_closed'">
        <h2 class="mb-6 shrink-0 text-4xl font-bold text-teal">Results</h2>
        <ol class="min-h-0 flex-1 space-y-3 overflow-y-hidden">
          <li
            v-for="r in results.rankings.slice(0, 12)"
            :key="r.id"
            class="flex items-center gap-6 rounded-xl bg-white/5 px-6 py-4"
          >
            <span class="w-12 text-3xl font-extrabold text-pink">{{ r.rank }}</span>
            <span class="flex-1 text-3xl font-semibold">{{ r.title }}</span>
            <span class="text-3xl font-extrabold tabular-nums text-teal">{{ r.votes }}</span>
          </li>
        </ol>
      </template>

      <!-- schedule -->
      <template v-else-if="session.phase === 'scheduled'">
        <h2 class="mb-4 shrink-0 text-3xl font-bold text-teal">
          {{ session.row?.display_round === null || session.row?.display_round === undefined
            ? 'The schedule'
            : 'Up next' }}
        </h2>
        <DisplaySchedule />
      </template>

      <!-- archived -->
      <div v-else class="flex flex-1 items-center justify-center">
        <p class="text-display-lg font-extrabold">Thanks for joining us 👋</p>
      </div>
    </main>

    <!--
      Join panel as a slim footer: always visible for latecomers, but it takes
      only vertical space, so it cannot push the content sideways.
    -->
    <footer class="flex shrink-0 items-center justify-center gap-8 px-10 pb-8">
      <!-- Sized to be scannable from the back of the room, not just the front row. -->
      <img v-if="qr" :src="qr" alt="" class="size-48 rounded-xl bg-white p-2" />
      <p class="text-4xl font-semibold text-white/70">
        Join at <span class="font-extrabold text-white">{{ joinHost }}</span>
      </p>
    </footer>
  </div>
</template>
