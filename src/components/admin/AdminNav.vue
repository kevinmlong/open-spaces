<script setup>
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'

const auth = useAuthStore()
const session = useSessionStore()

const LINKS = [
  { name: 'admin-run', label: 'Run' },
  { name: 'admin-curate', label: 'Curate' },
  { name: 'admin-schedule', label: 'Schedule' },
  { name: 'admin-sessions', label: 'Sessions' },
]
</script>

<template>
  <div class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-4xl items-center gap-1 px-4 py-2">
      <RouterLink
        v-for="l in LINKS"
        :key="l.name"
        :to="{ name: l.name }"
        class="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        active-class="bg-navy text-white hover:bg-navy"
      >
        {{ l.label }}
      </RouterLink>
      <span class="ml-auto flex items-center gap-3">
        <code class="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-navy">
          {{ session.phase }}
        </code>
        <button class="text-sm text-slate-500 hover:underline" @click="auth.signOut()">
          Sign out
        </button>
      </span>
    </div>
  </div>
</template>
