<script setup>
import { useResultsStore } from '@/stores/results'
import TopicCard from '@/components/shared/TopicCard.vue'
import EmptyState from '@/components/shared/EmptyState.vue'

const results = useResultsStore()
</script>

<template>
  <div class="space-y-2">
    <EmptyState v-if="!results.rankings.length" title="No results yet" />
    <TopicCard
      v-for="r in results.rankings"
      :key="r.id"
      :topic="r"
      :rank="r.rank"
      :votes="r.votes"
    />
  </div>
</template>
