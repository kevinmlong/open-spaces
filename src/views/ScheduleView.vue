<script setup>
import { useSessionStore } from '@/stores/session'
import { useSessionChannel } from '@/composables/useSessionChannel'
import BrandHeader from '@/components/shared/BrandHeader.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ScheduleGrid from '@/components/attendee/ScheduleGrid.vue'

const session = useSessionStore()
useSessionChannel({ trackPresence: true })
</script>

<template>
  <div>
    <BrandHeader subtitle="Schedule" />
    <main class="mx-auto max-w-4xl px-4 py-6">
      <ScheduleGrid v-if="session.showSchedule" />
      <EmptyState v-else title="The schedule isn't out yet" body="Check back after voting." />
    </main>
  </div>
</template>
