<script setup>
import { ref } from 'vue'
import { useTopicsStore } from '@/stores/topics'
import ErrorNote from '@/components/shared/ErrorNote.vue'

const topics = useTopicsStore()
const title = ref('')
const error = ref(null)
const busy = ref(false)
const justSent = ref(false)

async function submit() {
  const clean = title.value.trim()
  if (clean.length < 3 || busy.value) return
  busy.value = true
  error.value = null
  try {
    await topics.propose(clean)
    title.value = ''
    justSent.value = true
    setTimeout(() => (justSent.value = false), 2500)
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="space-y-2" @submit.prevent="submit">
    <label for="topic-title" class="block text-sm font-semibold text-navy">
      Propose a topic
    </label>
    <div class="flex gap-2">
      <input
        id="topic-title"
        v-model="title"
        maxlength="120"
        placeholder="What should we talk about?"
        class="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
        autocomplete="off"
      />
      <button
        type="submit"
        :disabled="title.trim().length < 3 || busy"
        class="shrink-0 rounded-xl bg-teal px-5 py-3 font-semibold text-white disabled:opacity-40"
      >
        Add
      </button>
    </div>

    <div class="flex items-center justify-between text-xs">
      <!-- No name field anywhere: proposals are anonymous by design. Saying so
           lowers the barrier for the nervous first-time proposer. -->
      <span class="text-slate-500">Anonymous · propose as many as you like</span>
      <span class="tabular-nums text-slate-400">{{ title.length }}/120</span>
    </div>

    <p v-if="justSent" class="text-sm font-medium text-teal">Added — it's on the big screen.</p>
    <ErrorNote :error="error" />
  </form>
</template>
