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
const resetting = ref(null)
const error = ref(null)

/**
 * Ordered least to most destructive. Each says exactly what disappears, because
 * unlike merge and remove -- which are soft and reversible -- these delete.
 */
const RESET_SCOPES = [
  {
    scope: 'schedule',
    label: 'Clear the schedule',
    blurb: 'Removes the generated round/room grid. Votes and topics are kept, so you can regenerate with different numbers.',
    lands: 'voting closed',
  },
  {
    scope: 'votes',
    label: 'Clear all votes',
    blurb: 'Deletes every ballot and resets the tallies to zero. Topics are kept, and everyone can vote again from scratch.',
    lands: 'proposals closed',
  },
  {
    scope: 'topics',
    label: 'Clear all topics',
    blurb: 'Deletes every proposed topic, and with them the votes and the schedule.',
    lands: 'proposals open',
  },
  {
    scope: 'all',
    label: 'Reset everything',
    blurb: 'Empties the session completely — topics, votes and schedule — and returns it to the holding screen.',
    lands: 'draft',
  },
]

async function loadPast() {
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  past.value = data ?? []
}

async function doReset() {
  const item = resetting.value
  resetting.value = null
  error.value = null
  try {
    await session.reset(item.scope)
    await topics.fetch()
    await resync()
  } catch (e) {
    error.value = e
  }
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

      <!--
        Kept visually distinct and below archiving: archiving is the safe,
        lossless way to start again, and should be the obvious first choice.
      -->
      <section class="rounded-xl border-2 border-pink/30 bg-white p-5 shadow-sm">
        <h3 class="font-bold text-pink">Reset this session</h3>
        <p class="mt-1 text-sm text-slate-600">
          These <strong>delete data permanently</strong> — there is no undo, and nothing is kept
          the way archiving keeps it. Useful for rehearsals, or for putting the session back a
          step if something went wrong live.
        </p>

        <ul class="mt-4 space-y-2">
          <li
            v-for="item in RESET_SCOPES"
            :key="item.scope"
            class="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-navy">{{ item.label }}</p>
              <p class="text-xs text-slate-500">{{ item.blurb }}</p>
            </div>
            <span class="shrink-0 text-xs text-slate-400">→ {{ item.lands }}</span>
            <button
              class="shrink-0 rounded-lg border border-pink px-3 py-1.5 text-xs font-semibold text-pink hover:bg-pink/10"
              @click="resetting = item"
            >
              {{ item.label }}
            </button>
          </li>
        </ul>
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
      :open="!!resetting"
      :title="resetting?.label"
      :body="`${resetting?.blurb} This cannot be undone. The session will be left at: ${resetting?.lands}.`"
      :confirm-label="resetting?.label"
      danger
      :type-to-confirm="resetting?.scope === 'all' ? session.row?.name : null"
      @confirm="doReset"
      @cancel="resetting = null"
    />

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
