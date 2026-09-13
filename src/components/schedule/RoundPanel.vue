<script setup>
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { roomName, roundLabel } from '@/lib/schedule'

/**
 * One round: every room, stacked.
 *
 * The schedule used to be a single dense table of rounds x rooms, which is
 * unreadable on a phone and barely better on a projector. An attendee only ever
 * needs to answer "where do I go next", and that is one round at a time.
 *
 * `tone` switches between the light attendee pages and the dark projector
 * instead of forking the component -- the layout is identical, only the palette
 * differs.
 */
const props = defineProps({
  round: { type: Number, required: true },
  tone: { type: String, default: 'light' }, // 'light' | 'dark'
  size: { type: String, default: 'md' }, // 'md' | 'xl'
  highlightTopicIds: { type: Array, default: () => [] },
})

const session = useSessionStore()
const results = useResultsStore()

const rooms = computed(() => session.row?.rooms ?? 0)
const label = computed(() => roundLabel(session.row, props.round))

const rowsForRound = computed(() =>
  Array.from({ length: rooms.value }, (_, room) => ({
    room,
    name: roomName(session.row, room),
    assignment: results.assignments.find(
      (a) => a.round_index === props.round && a.room_index === room,
    ),
  })),
)

const dark = computed(() => props.tone === 'dark')
const xl = computed(() => props.size === 'xl')
</script>

<template>
  <section class="space-y-3">
    <h3
      class="font-bold"
      :class="[dark ? 'text-teal' : 'text-teal', xl ? 'text-5xl' : 'text-lg']"
    >
      {{ label }}
    </h3>

    <ul :class="xl ? 'space-y-4' : 'space-y-2'">
      <li
        v-for="row in rowsForRound"
        :key="row.room"
        class="rounded-2xl"
        :class="[
          dark ? 'bg-white/10' : 'border border-slate-200 bg-white shadow-sm',
          highlightTopicIds.includes(row.assignment?.topic_id)
            ? dark
              ? 'ring-2 ring-pink'
              : 'border-pink ring-2 ring-pink/40'
            : '',
          xl ? 'px-8 py-6' : 'px-4 py-3',
        ]"
      >
        <!-- Room first: the attendee already knows the time, they need the door. -->
        <p
          class="font-semibold tracking-wide uppercase"
          :class="[dark ? 'text-light-pink' : 'text-pink', xl ? 'text-2xl' : 'text-xs']"
        >
          {{ row.name }}
        </p>
        <p
          v-if="row.assignment"
          class="font-semibold"
          :class="[dark ? 'text-white' : 'text-navy', xl ? 'mt-2 text-4xl' : 'mt-0.5 text-lg']"
        >
          {{ row.assignment.topics?.title }}
        </p>
        <p
          v-else
          class="italic"
          :class="[dark ? 'text-white/40' : 'text-slate-400', xl ? 'mt-2 text-3xl' : 'mt-0.5 text-sm']"
        >
          open — grab it
        </p>
      </li>
    </ul>
  </section>
</template>
