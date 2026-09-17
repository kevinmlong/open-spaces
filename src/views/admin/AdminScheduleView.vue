<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { useTopicsStore } from '@/stores/topics'
import { useSessionChannel } from '@/composables/useSessionChannel'
import { buildGrid, outOfRangePins, roomName, roundLabel } from '@/lib/schedule'
import BrandHeader from '@/components/shared/BrandHeader.vue'
import AdminNav from '@/components/admin/AdminNav.vue'
import ErrorNote from '@/components/shared/ErrorNote.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const session = useSessionStore()
const results = useResultsStore()
const topics = useTopicsStore()
useSessionChannel()

const rounds = ref(3)
const rooms = ref(5)
const roomNames = ref([])
const roundLabels = ref([])
const error = ref(null)
const confirming = ref(false)

/**
 * The organizer's overrides: [{ topic_id, round, room }]. Seeded from the
 * published schedule so a republish keeps what was pinned last time.
 */
const pins = ref([])
const picking = ref(null) // { round, room } while the picker is open
const pickFilter = ref('')
const newTitle = ref('')
const adding = ref(false)

/**
 * The preview uses the SAME pure function the server's generate_schedule()
 * mirrors, so what the organizer approves is what gets published. Previewing
 * before committing matters -- you do not want to discover the grid is wrong
 * once it is already on the projector.
 */
const preview = computed(() =>
  buildGrid(results.rankings, rounds.value, rooms.value, pins.value),
)
const placed = computed(() => preview.value.flat().filter(Boolean).length)
const strandedPins = computed(() => outOfRangePins(pins.value, rounds.value, rooms.value))
const canPublish = computed(
  () => ['voting_closed', 'scheduled'].includes(session.phase) && !strandedPins.value.length,
)

const pickerTopics = computed(() => {
  const q = pickFilter.value.trim().toLowerCase()
  return q ? results.rankings.filter((t) => t.title.toLowerCase().includes(q)) : results.rankings
})

function titleFor(topicId) {
  return results.rankings.find((t) => t.id === topicId)?.title ?? 'Unknown topic'
}

function openPicker(round, room) {
  picking.value = { round, room }
  pickFilter.value = ''
  newTitle.value = ''
}

/** One topic per cell and one cell per topic -- pinning moves, never duplicates. */
function pin(topicId) {
  const { round, room } = picking.value
  pins.value = [
    ...pins.value.filter(
      (p) => p.topic_id !== topicId && !(p.round === round && p.room === room),
    ),
    { topic_id: topicId, round, room },
  ]
  picking.value = null
}

function unpin(round, room) {
  pins.value = pins.value.filter((p) => !(p.round === round && p.room === room))
}

/** A topic nobody proposed: add it as a mic topic, then pin it straight in. */
async function addAndPin() {
  const title = newTitle.value.trim()
  if (title.length < 3) return
  adding.value = true
  error.value = null
  try {
    const topic = await topics.propose(title, 'mic')
    await results.fetchRankings()
    pin(topic.id)
  } catch (e) {
    error.value = e
  } finally {
    adding.value = false
  }
}
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
  await Promise.all([
    results.fetchRankings().catch(() => {}),
    results.fetchAssignments().catch(() => {}),
  ])
  // A pinned topic merged or removed since the last publish has nothing left to pin.
  pins.value = results.assignments
    .filter((a) => a.pinned && results.rankings.some((t) => t.id === a.topic_id))
    .map((a) => ({ topic_id: a.topic_id, round: a.round_index, room: a.room_index }))
})

async function publish() {
  confirming.value = false
  error.value = null
  try {
    await results.generate(
      rounds.value,
      rooms.value,
      roomNames.value,
      roundLabels.value,
      pins.value,
    )
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
          Override a slot to put any topic there, whatever the votes — everything else fills in around it.
        </p>

        <div
          v-if="strandedPins.length"
          class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {{ strandedPins.length }}
          {{ strandedPins.length === 1 ? 'override falls' : 'overrides fall' }} outside the grid —
          add rounds/rooms or clear:
          <span v-for="p in strandedPins" :key="p.topic_id" class="ml-1 inline-flex items-center gap-1">
            “{{ titleFor(p.topic_id) }}”
            <button class="font-semibold underline" @click="unpin(p.round, p.room)">clear</button>
          </span>
        </div>

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
                  :class="[
                    topic?.pinned ? 'bg-pink/5 ring-2 ring-pink/40' : topic ? 'bg-slate-50' : 'bg-slate-100',
                    picking?.round === r && picking?.room === c ? 'outline outline-2 outline-teal' : '',
                  ]"
                >
                  <template v-if="topic">
                    <p class="font-medium text-navy">
                      <span
                        v-if="topic.pinned"
                        class="mr-1 rounded bg-pink px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-white"
                        >Override</span
                      >{{ topic.title }}
                    </p>
                    <p class="text-xs text-slate-400">#{{ topic.rank }} · {{ topic.votes }} votes</p>
                  </template>
                  <p v-else class="text-xs italic text-slate-400">open</p>
                  <div class="mt-1 flex gap-2 text-xs font-semibold">
                    <button class="text-teal hover:underline" @click="openPicker(r, c)">
                      {{ topic?.pinned ? 'Change' : 'Override' }}
                    </button>
                    <button
                      v-if="topic?.pinned"
                      class="text-pink hover:underline"
                      @click="unpin(r, c)"
                    >
                      Clear
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Picker: which topic goes in the selected cell -->
        <div v-if="picking" class="mt-4 rounded-xl border border-teal/40 bg-slate-50 p-4">
          <div class="flex items-center justify-between gap-2">
            <h4 class="font-semibold text-navy">
              Override {{ roundLabels[picking.round] }} · {{ roomNames[picking.room] }}
            </h4>
            <button class="text-sm text-slate-500 hover:underline" @click="picking = null">
              Cancel
            </button>
          </div>

          <input
            v-model="pickFilter"
            placeholder="Filter topics…"
            class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <ul class="mt-2 max-h-64 divide-y divide-slate-200 overflow-y-auto rounded-lg bg-white">
            <li v-for="t in pickerTopics" :key="t.id">
              <button
                class="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-teal/10"
                @click="pin(t.id)"
              >
                <span class="text-navy">
                  {{ t.title }}<span v-if="t.source === 'mic'" class="ml-1 text-xs">🎤</span>
                </span>
                <span class="shrink-0 text-xs text-slate-400">#{{ t.rank }} · {{ t.votes }} votes</span>
              </button>
            </li>
            <li v-if="!pickerTopics.length" class="px-3 py-2 text-sm italic text-slate-400">
              No matching topics
            </li>
          </ul>

          <form class="mt-3 flex gap-2" @submit.prevent="addAndPin">
            <input
              v-model="newTitle"
              maxlength="120"
              placeholder="…or type a new topic"
              class="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              class="rounded-lg bg-teal px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              :disabled="adding || newTitle.trim().length < 3"
            >
              Add to slot
            </button>
          </form>
        </div>

        <button
          class="mt-5 rounded-xl bg-pink px-6 py-3 font-semibold text-white disabled:opacity-40"
          :disabled="!canPublish"
          @click="confirming = true"
        >
          {{ session.phase === 'scheduled' ? 'Republish schedule' : 'Publish schedule' }}
        </button>
      </section>
    </main>

    <ConfirmDialog
      :open="confirming"
      title="Publish the schedule"
      :body="`Puts ${placed} topics on the big screen and every attendee's phone${pins.length ? ` (${pins.length} overridden)` : ''}${leftOut ? `, leaving ${leftOut} unscheduled` : ''}. You can regenerate afterwards.`"
      confirm-label="Publish"
      @confirm="publish"
      @cancel="confirming = false"
    />
  </div>
</template>
