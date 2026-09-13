<script setup>
defineProps({
  topic: { type: Object, required: true },
  pending: { type: Boolean, default: false },
  votes: { type: Number, default: null },
  rank: { type: Number, default: null },
})
</script>

<template>
  <article
    class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    :class="pending && 'opacity-60'"
  >
    <span
      v-if="rank !== null"
      class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white"
    >
      {{ rank }}
    </span>

    <div class="min-w-0 flex-1">
      <p class="font-semibold text-navy">{{ topic.title }}</p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <span
          v-if="topic.source === 'mic'"
          class="rounded-full bg-pink/10 px-2 py-0.5 text-xs font-semibold text-pink"
          >🎤 from the mic</span
        >
        <span v-if="pending" class="text-xs text-slate-400">sending…</span>
      </div>
    </div>

    <span v-if="votes !== null" class="shrink-0 text-right">
      <span class="block text-xl font-extrabold tabular-nums text-teal">{{ votes }}</span>
      <span class="text-xs text-slate-400">{{ votes === 1 ? 'vote' : 'votes' }}</span>
    </span>
  </article>
</template>
