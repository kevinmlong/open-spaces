<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { useSessionChannel } from '@/composables/useSessionChannel'
import { buildGrid, roomName, roundLabel } from '@/lib/schedule'
import BrandHeader from '@/components/shared/BrandHeader.vue'
import AdminNav from '@/components/admin/AdminNav.vue'
import ErrorNote from '@/components/shared/ErrorNote.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const session = useSessionStore()
const results = useResultsStore()
useSessionChannel()

const rounds = ref(3)
const rooms = ref(5)
const roomNames = ref([])
const roundLabels = ref([])
const error = ref(null)
const confirming = ref(false)

/**
 * The preview uses the SAME pure function the server's generate_schedule()
 * mirrors, so what the organizer approves is what gets published. Previewing
 * before committing matters -- you do not want to discover the grid is wrong
 * once it is already on the projector.
 */
const preview = computed(() => buildGrid(results.rankings, rounds.value, rooms.value))
const placed = computed(() => Math.min(results.rankings.length, rounds.value * rooms.value))
const leftOut = computed(() => Math.max(0, results.rankings.length - placed.value))

function syncLabels() {
  roomNames.value = Array.from(
    { length: rooms.value },
    (_, i) => roomNames.value[i] ?? session.row?.room_names?.[i] ?? roomName(null, i),
  ).slice(0, rooms.value)
  roundLabels.value = Array.from(
    { length: rounds.value },
    (_, i) => roundLabels.value[i] ?? session.row?.round_labels?.[i] ?? roundLabel(null, i),
  ).slice(0, rounds.value)
}

watch([rounds, rooms], syncLabels)
onMounted(async () => {
  if (session.row?.rounds) rounds.value = session.row.rounds
  if (session.row?.rooms) rooms.value = session.row.rooms
  syncLabels()
  await results.fetchRankings().catch(() => {})
})

async function publish() {
  confirming.value = false
  error.value = null
  try {
    await results.generate(rounds.value, rooms.value, roomNames.value, roundLabels.value)
  } catch (e) {
    error.value = e
  }
}
</script>

<template>
  <div>
    <BrandHeader subtitle="Schedule" />
    <AdminNav />

    <main class="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <ErrorNote :error="error" />

      <div
        v-if="!['voting_closed', 'scheduled'].includes(session.phase)"
        class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        Close voting first — the schedule is built from the final vote counts.
      </div>

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-end gap-4">
          <label class="text-sm font-semibold text-navy">
            Rounds
            <input
              v-model.number="rounds"
              type="number"
              min="1"
              max="12"
              class="mt-1 block w-24 rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label class="text-sm font-semibold text-navy">
            Rooms per round
            <input
              v-model.number="rooms"
              type="number"
              min="1"
              max="12"
              class="mt-1 block w-24 rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <p class="text-sm text-slate-500">
            {{ placed }} of {{ results.rankings.length }} topics scheduled
            <span v-if="leftOut" class="text-pink">· {{ leftOut }} won't fit</span>
          </p>
        </div>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Room names</p>
            <input
              v-for="(_, i) in roomNames"
              :key="i"
              v-model="roomNames[i]"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Round labels</p>
            <input
              v-for="(_, i) in roundLabels"
              :key="i"
              v-model="roundLabels[i]"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      </section>

      <!-- Preview -->
      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h3 class="font-bold text-navy">Preview</h3>
        <p class="mt-1 text-sm text-slate-500">
          The top {{ rounds }} topics go in the first room of each round, so they never clash.
        </p>

        <div class="mt-4 overflow-x-auto">
          <table class="w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th class="w-32" />
                <th
                  v-for="(name, i) in roomNames"
                  :key="i"
                  class="rounded-lg bg-navy px-3 py-2 text-left text-xs font-semibold text-white"
                >
                  {{ name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, r) in preview" :key="r">
                <th class="rounded-lg bg-teal px-3 py-2 text-left text-xs font-semibold text-white">
                  {{ roundLabels[r] }}
                </th>
                <td
                  v-for="(topic, c) in row"
                  :key="c"
                  class="rounded-lg p-2 align-top text-sm"
                  :class="topic ? 'bg-slate-50' : 'bg-slate-100'"
                >
                  <template v-if="topic">
                    <p class="font-medium text-navy">{{ topic.title }}</p>
                    <p class="text-xs text-slate-400">#{{ topic.rank }} · {{ topic.votes }} votes</p>
                  </template>
                  <p v-else class="text-xs italic text-slate-400">open</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          class="mt-5 rounded-xl bg-pink px-6 py-3 font-semibold text-white disabled:opacity-40"
          :disabled="!['voting_closed', 'scheduled'].includes(session.phase)"
          @click="confirming = true"
        >
          {{ session.phase === 'scheduled' ? 'Republish schedule' : 'Publish schedule' }}
        </button>
      </section>
    </main>

    <ConfirmDialog
      :open="confirming"
      title="Publish the schedule"
      :body="`Puts ${placed} topics on the big screen and every attendee's phone${leftOut ? `, leaving ${leftOut} unscheduled` : ''}. You can regenerate afterwards.`"
      confirm-label="Publish"
      @confirm="publish"
      @cancel="confirming = false"
    />
  </div>
</template>
