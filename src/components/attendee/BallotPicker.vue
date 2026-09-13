<script setup>
import { ref } from 'vue'
import { useTopicsStore } from '@/stores/topics'
import { useBallotStore } from '@/stores/ballot'
import ErrorNote from '@/components/shared/ErrorNote.vue'

const topics = useTopicsStore()
const ballot = useBallotStore()
const error = ref(null)

async function submit() {
  error.value = null
  try {
    await ballot.submit()
  } catch (e) {
    error.value = e
  }
}
</script>

<template>
  <div v-if="ballot.hasVoted" class="rounded-xl bg-teal/10 p-6 text-center">
    <p class="text-lg font-bold text-teal">Your vote is in 🎉</p>
    <p class="mt-1 text-sm text-slate-600">
      Results appear here as soon as voting closes.
    </p>
  </div>

  <div v-else class="space-y-4">
    <div class="rounded-xl bg-navy p-4 text-white">
      <p class="font-semibold">Pick your top {{ ballot.MAX_PICKS }}</p>
      <p class="text-sm text-white/70">
        {{ ballot.remaining }} pick{{ ballot.remaining === 1 ? '' : 's' }} left · you can only vote once
      </p>
    </div>

    <ul class="space-y-2">
      <li v-for="topic in topics.ballotList" :key="topic.id">
        <!-- Whole row is the tap target: phones, one hand, crowded room. -->
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition"
          :class="
            ballot.isSelected(topic.id)
              ? 'border-teal bg-teal/5'
              : ballot.isFull
                ? 'border-slate-200 bg-white opacity-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
          "
          :aria-pressed="ballot.isSelected(topic.id)"
          :disabled="ballot.isFull && !ballot.isSelected(topic.id)"
          @click="ballot.toggle(topic.id)"
        >
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-md border-2"
            :class="ballot.isSelected(topic.id) ? 'border-teal bg-teal text-white' : 'border-slate-300'"
          >
            <svg v-if="ballot.isSelected(topic.id)" viewBox="0 0 20 20" class="size-4" fill="currentColor">
              <path d="M7.6 14.2 3.8 10.4l1.4-1.4 2.4 2.4 6-6 1.4 1.4z" />
            </svg>
          </span>
          <span class="min-w-0 flex-1 font-medium text-navy">{{ topic.title }}</span>
        </button>
      </li>
    </ul>

    <ErrorNote :error="error" />

    <!-- Sticky so the submit button is always reachable on a long list. -->
    <div class="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <button
        class="w-full rounded-xl bg-pink py-4 text-lg font-bold text-white disabled:opacity-40"
        :disabled="ballot.selected.length === 0 || ballot.submitting"
        @click="submit"
      >
        {{ ballot.submitting ? 'Submitting…' : `Submit ${ballot.selected.length} vote${ballot.selected.length === 1 ? '' : 's'}` }}
      </button>
      <p class="mt-1.5 text-center text-xs text-slate-500">This can't be changed afterwards.</p>
    </div>
  </div>
</template>
