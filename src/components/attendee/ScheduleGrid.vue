<script setup>
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useResultsStore } from '@/stores/results'
import { roomName, roundLabel } from '@/lib/schedule'

const props = defineProps({
  big: { type: Boolean, default: false },
  highlightTopicIds: { type: Array, default: () => [] },
})

const session = useSessionStore()
const results = useResultsStore()

const rounds = computed(() => session.row?.rounds ?? 0)
const rooms = computed(() => session.row?.rooms ?? 0)

function cell(round, room) {
  return results.assignments.find((a) => a.round_index === round && a.room_index === room)
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full border-separate border-spacing-1">
      <thead>
        <tr>
          <th class="w-24" />
          <th
            v-for="room in rooms"
            :key="room"
            class="rounded-lg bg-navy px-3 py-2 text-left font-semibold text-white"
            :class="big ? 'text-2xl' : 'text-xs'"
          >
            {{ roomName(session.row, room - 1) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="round in rounds" :key="round">
          <th
            class="rounded-lg bg-teal px-3 py-2 text-left align-top font-semibold text-white"
            :class="big ? 'text-xl' : 'text-xs'"
          >
            {{ roundLabel(session.row, round - 1) }}
          </th>
          <td
            v-for="room in rooms"
            :key="room"
            class="rounded-lg align-top"
            :class="[
              cell(round - 1, room - 1) ? 'bg-white' : 'bg-slate-100',
              highlightTopicIds.includes(cell(round - 1, room - 1)?.topic_id)
                ? 'ring-2 ring-pink'
                : '',
              big ? 'p-4' : 'p-3',
            ]"
          >
            <p
              v-if="cell(round - 1, room - 1)"
              class="font-semibold text-navy"
              :class="big ? 'text-xl' : 'text-sm'"
            >
              {{ cell(round - 1, room - 1).topics?.title }}
            </p>
            <p v-else class="text-xs italic text-slate-400">open</p>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
