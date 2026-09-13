<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/stores/session'
import { useTopicsStore } from '@/stores/topics'
import { useSessionChannel } from '@/composables/useSessionChannel'
import BrandHeader from '@/components/shared/BrandHeader.vue'
import AdminNav from '@/components/admin/AdminNav.vue'
import ErrorNote from '@/components/shared/ErrorNote.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const session = useSessionStore()
const topics = useTopicsStore()
const { resync } = useSessionChannel()

const past = ref([])
const newName = ref('')
const confirming = ref(false)
const error = ref(null)

async function loadPast() {
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  past.value = data ?? []
}

async function archive() {
  confirming.value = false
  error.value = null
  try {
    await session.archiveAndStartNew(newName.value.trim() || 'New Open Spaces session')
    newName.value = ''
    await topics.fetch()
    await resync()
    await loadPast()
  } catch (e) {
    error.value = e
  }
}

onMounted(loadPast)
</script>

<template>
  <div>
    <BrandHeader subtitle="Sessions" />
    <AdminNav />

    <main class="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <ErrorNote :error="error" />

      <section class="rounded-xl bg-white p-5 shadow-sm">
        <h3 class="font-bold text-navy">Current session</h3>
        <p class="mt-1 text-sm text-slate-600">
          {{ session.row?.name }} — <code>{{ session.phase }}</code> ·
          {{ topics.activeList.length }} topics
        </p>

        <div class="mt-4 border-t border-slate-200 pt-4">
          <h4 class="font-semibold text-navy">Archive and start fresh</h4>
          <p class="mt-1 text-sm text-slate-500">
            Nothing is deleted — the current topics, votes and schedule stay in the database and
            remain visible here.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <input
              v-model="newName"
              placeholder="Name for the new session, e.g. Day 2 Open Spaces"
              class="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2.5"
            />
            <button class="rounded-xl bg-pink px-5 py-2.5 font-semibold text-white" @click="confirming = true">
              Archive
            </button>
          </div>
        </div>
      </section>

      <section v-if="past.length">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Archived sessions
        </h3>
        <ul class="mt-2 space-y-2">
          <li v-for="s in past" :key="s.id" class="rounded-xl bg-white p-4 text-sm shadow-sm">
            <p class="font-semibold text-navy">{{ s.name }}</p>
            <p class="text-slate-500">
              archived {{ new Date(s.archived_at).toLocaleString() }}
              <span v-if="s.rounds">· {{ s.rounds }} rounds × {{ s.rooms }} rooms</span>
            </p>
          </li>
        </ul>
      </section>
    </main>

    <!-- The one genuinely irreversible action, so it asks you to type the name. -->
    <ConfirmDialog
      :open="confirming"
      title="Archive this session"
      :body="`Freezes ${session.row?.name} with its ${topics.activeList.length} topics and starts a blank one. Every attendee's screen resets. The old data stays queryable.`"
      confirm-label="Archive and start fresh"
      danger
      :type-to-confirm="session.row?.name"
      @confirm="archive"
      @cancel="confirming = false"
    />
  </div>
</template>
